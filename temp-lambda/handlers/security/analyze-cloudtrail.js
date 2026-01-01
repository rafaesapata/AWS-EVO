"use strict";
/**
 * Lambda handler for Analyze CloudTrail
 * Busca eventos do CloudTrail, analisa riscos de segurança e salva no banco
 * Identifica usuários responsáveis por ações que resultaram em problemas de segurança
 *
 * OTIMIZADO COM PARALELISMO:
 * - Busca paralela de páginas do CloudTrail
 * - Processamento paralelo de eventos em batches
 * - Upsert em batch no banco de dados
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const aws_helpers_js_1 = require("../../lib/aws-helpers.js");
const logging_js_1 = require("../../lib/logging.js");
const client_cloudtrail_1 = require("@aws-sdk/client-cloudtrail");
// High-risk events that indicate security issues
const HIGH_RISK_EVENTS = new Set([
    // IAM - Critical
    'CreateUser', 'DeleteUser', 'CreateAccessKey', 'DeleteAccessKey',
    'CreateLoginProfile', 'UpdateLoginProfile', 'DeleteLoginProfile',
    'AttachUserPolicy', 'DetachUserPolicy', 'PutUserPolicy', 'DeleteUserPolicy',
    'AttachRolePolicy', 'DetachRolePolicy', 'PutRolePolicy', 'DeleteRolePolicy',
    'AttachGroupPolicy', 'DetachGroupPolicy', 'PutGroupPolicy', 'DeleteGroupPolicy',
    'CreateRole', 'DeleteRole', 'UpdateAssumeRolePolicy',
    'CreatePolicy', 'DeletePolicy', 'CreatePolicyVersion',
    'AddUserToGroup', 'RemoveUserFromGroup',
    'DeactivateMFADevice', 'DeleteVirtualMFADevice',
    'UpdateAccountPasswordPolicy', 'DeleteAccountPasswordPolicy',
    // S3 - High Risk
    'PutBucketPolicy', 'DeleteBucketPolicy', 'PutBucketAcl',
    'PutBucketPublicAccessBlock', 'DeleteBucketPublicAccessBlock',
    'PutBucketEncryption', 'DeleteBucketEncryption',
    'PutBucketVersioning', 'DeleteBucket',
    // EC2 - Security Groups
    'AuthorizeSecurityGroupIngress', 'AuthorizeSecurityGroupEgress',
    'RevokeSecurityGroupIngress', 'RevokeSecurityGroupEgress',
    'CreateSecurityGroup', 'DeleteSecurityGroup',
    'ModifyInstanceAttribute', 'RunInstances', 'TerminateInstances',
    // KMS
    'DisableKey', 'ScheduleKeyDeletion', 'PutKeyPolicy',
    'CreateGrant', 'RevokeGrant',
    // CloudTrail
    'StopLogging', 'DeleteTrail', 'UpdateTrail',
    // Config
    'StopConfigurationRecorder', 'DeleteConfigurationRecorder',
    'DeleteDeliveryChannel',
    // GuardDuty
    'DeleteDetector', 'DisassociateFromMasterAccount',
    // Organizations
    'LeaveOrganization', 'RemoveAccountFromOrganization',
    // Lambda
    'AddPermission', 'RemovePermission', 'UpdateFunctionConfiguration',
    // RDS
    'ModifyDBInstance', 'DeleteDBInstance', 'ModifyDBCluster',
    // Secrets Manager
    'DeleteSecret', 'PutSecretValue',
    // Console Login
    'ConsoleLogin',
]);
// Medium risk events
const MEDIUM_RISK_EVENTS = new Set([
    'CreateBucket', 'PutObject', 'DeleteObject',
    'CreateDBInstance', 'CreateDBCluster',
    'CreateFunction', 'UpdateFunctionCode',
    'CreateStack', 'UpdateStack', 'DeleteStack',
    'CreateVpc', 'DeleteVpc', 'CreateSubnet', 'DeleteSubnet',
    'CreateNetworkAcl', 'DeleteNetworkAcl',
    'CreateInternetGateway', 'DeleteInternetGateway',
    'CreateNatGateway', 'DeleteNatGateway',
    'AssumeRole', 'GetSessionToken',
]);
function analyzeEventRisk(eventName, errorCode, userIdentity) {
    const reasons = [];
    let level = 'low';
    if (HIGH_RISK_EVENTS.has(eventName)) {
        level = 'high';
        reasons.push(`Evento de alto risco: ${eventName}`);
    }
    else if (MEDIUM_RISK_EVENTS.has(eventName)) {
        level = 'medium';
        reasons.push(`Evento de risco médio: ${eventName}`);
    }
    if (userIdentity?.type === 'Root') {
        level = 'critical';
        reasons.push('Ação executada pelo usuário root');
    }
    if (errorCode === 'AccessDenied' || errorCode === 'UnauthorizedAccess') {
        if (level === 'low')
            level = 'medium';
        reasons.push(`Tentativa de acesso negada: ${errorCode}`);
    }
    if (eventName === 'ConsoleLogin' && errorCode) {
        level = 'high';
        reasons.push('Falha de login no console AWS');
    }
    if (eventName === 'ConsoleLogin' && !errorCode && userIdentity?.type === 'Root') {
        level = 'critical';
        reasons.push('Login do usuário root no console');
    }
    if (eventName.includes('Policy') && !errorCode) {
        if (level !== 'critical')
            level = 'high';
        reasons.push('Alteração de política IAM');
    }
    if (eventName.includes('SecurityGroup') && !errorCode) {
        if (level === 'low')
            level = 'medium';
        reasons.push('Modificação de Security Group');
    }
    if (eventName.includes('MFA') && eventName.includes('Deactivate')) {
        level = 'critical';
        reasons.push('MFA desativado');
    }
    if (eventName === 'StopLogging' || eventName === 'DeleteTrail') {
        level = 'critical';
        reasons.push('Logging do CloudTrail desativado');
    }
    return { level, reasons };
}
function extractUserInfo(userIdentity) {
    let userName = 'Unknown';
    let userType = userIdentity?.type || 'Unknown';
    let userArn = userIdentity?.arn || '';
    if (userIdentity) {
        if (userIdentity.userName) {
            userName = userIdentity.userName;
        }
        else if (userIdentity.sessionContext?.sessionIssuer?.userName) {
            userName = userIdentity.sessionContext.sessionIssuer.userName;
        }
        else if (userIdentity.principalId) {
            const parts = userIdentity.principalId.split(':');
            userName = parts.length > 1 ? parts[1] : parts[0];
        }
        else if (userIdentity.type === 'Root') {
            userName = 'root';
        }
        else if (userIdentity.invokedBy) {
            userName = userIdentity.invokedBy;
        }
    }
    return { userName, userType, userArn };
}
// Process a single CloudTrail event
function processEvent(ctEvent, organizationId, accountId, defaultRegion) {
    try {
        const eventData = ctEvent.CloudTrailEvent ? JSON.parse(ctEvent.CloudTrailEvent) : {};
        const eventName = ctEvent.EventName || eventData.eventName || 'Unknown';
        const eventSource = eventData.eventSource || 'unknown';
        const eventTime = ctEvent.EventTime || new Date(eventData.eventTime);
        const userIdentity = eventData.userIdentity || {};
        const errorCode = eventData.errorCode || null;
        const errorMessage = eventData.errorMessage || null;
        const { userName, userType, userArn } = extractUserInfo(userIdentity);
        const { level: riskLevel, reasons: riskReasons } = analyzeEventRisk(eventName, errorCode, userIdentity);
        const isSecurityEvent = HIGH_RISK_EVENTS.has(eventName) ||
            MEDIUM_RISK_EVENTS.has(eventName) ||
            riskLevel !== 'low';
        const resources = ctEvent.Resources?.map((r) => ({
            resourceType: r.ResourceType,
            resourceName: r.ResourceName,
        })) || [];
        return {
            organization_id: organizationId,
            aws_account_id: accountId,
            event_id: ctEvent.EventId || `${eventTime.getTime()}-${eventName}`,
            event_name: eventName,
            event_source: eventSource,
            event_time: eventTime,
            aws_region: eventData.awsRegion || defaultRegion,
            source_ip_address: eventData.sourceIPAddress || null,
            user_agent: eventData.userAgent || null,
            user_identity: userIdentity,
            user_name: userName,
            user_type: userType,
            user_arn: userArn,
            error_code: errorCode,
            error_message: errorMessage,
            request_parameters: eventData.requestParameters || null,
            response_elements: eventData.responseElements || null,
            resources: resources,
            risk_level: riskLevel,
            risk_reasons: riskReasons,
            is_security_event: isSecurityEvent,
        };
    }
    catch {
        return null;
    }
}
// Fetch events from a single region with pagination
async function fetchEventsFromRegion(credentials, region, startTime, endTime, maxResults) {
    const ctClient = new client_cloudtrail_1.CloudTrailClient({
        region,
        credentials,
    });
    const commandInput = {
        StartTime: startTime,
        EndTime: endTime,
        MaxResults: 50,
    };
    const allEvents = [];
    let nextToken;
    let paginationCount = 0;
    const maxPaginations = Math.ceil(maxResults / 50);
    do {
        if (nextToken) {
            commandInput.NextToken = nextToken;
        }
        const response = await ctClient.send(new client_cloudtrail_1.LookupEventsCommand(commandInput));
        if (response.Events) {
            allEvents.push(...response.Events);
        }
        nextToken = response.NextToken;
        paginationCount++;
        if (allEvents.length >= maxResults || paginationCount >= maxPaginations) {
            break;
        }
    } while (nextToken);
    return allEvents;
}
// Batch upsert events using raw SQL for performance
async function batchUpsertEvents(prisma, events) {
    if (events.length === 0)
        return 0;
    let savedCount = 0;
    const BATCH_SIZE = 100;
    for (let i = 0; i < events.length; i += BATCH_SIZE) {
        const batch = events.slice(i, i + BATCH_SIZE);
        // Use Promise.all for parallel upserts within batch
        const results = await Promise.all(batch.map(event => prisma.cloudTrailEvent.upsert({
            where: {
                organization_id_event_id: {
                    organization_id: event.organization_id,
                    event_id: event.event_id,
                },
            },
            update: {
                risk_level: event.risk_level,
                risk_reasons: event.risk_reasons,
                is_security_event: event.is_security_event,
            },
            create: event,
        }).catch(() => null) // Ignore individual failures
        ));
        savedCount += results.filter(r => r !== null).length;
    }
    return savedCount;
}
async function handler(event, context) {
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    const user = (0, auth_js_1.getUserFromEvent)(event);
    const organizationId = (0, auth_js_1.getOrganizationId)(user);
    logging_js_1.logger.info('Analyze CloudTrail started', {
        organizationId,
        userId: user.sub,
        requestId: context.awsRequestId
    });
    try {
        const body = event.body ? JSON.parse(event.body) : {};
        const { accountId, region = 'us-east-1', regions, hoursBack = 24, maxResults = 5000, } = body;
        if (!accountId) {
            return (0, response_js_1.error)('Missing required parameter: accountId');
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        const account = await prisma.awsCredential.findFirst({
            where: { id: accountId, organization_id: organizationId, is_active: true },
        });
        if (!account) {
            return (0, response_js_1.error)('AWS account not found');
        }
        const resolvedCreds = await (0, aws_helpers_js_1.resolveAwsCredentials)(account, region);
        const awsCreds = (0, aws_helpers_js_1.toAwsCredentials)(resolvedCreds);
        const startTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
        const endTime = new Date();
        // Determine regions to scan - use account's registered regions if available
        // Priority: 1) explicit regions param, 2) account's registered regions, 3) default region
        let regionsToScan;
        if (regions && regions.length > 0) {
            regionsToScan = regions;
        }
        else if (account.regions && account.regions.length > 0) {
            regionsToScan = account.regions;
        }
        else {
            regionsToScan = [region];
        }
        const maxResultsPerRegion = Math.ceil(maxResults / regionsToScan.length);
        logging_js_1.logger.info('Fetching CloudTrail events', {
            regions: regionsToScan,
            hoursBack,
            maxResultsPerRegion
        });
        // PARALLEL: Fetch events from all regions simultaneously
        const regionFetchPromises = regionsToScan.map(r => fetchEventsFromRegion(awsCreds, r, startTime, endTime, maxResultsPerRegion)
            .catch(err => {
            logging_js_1.logger.warn(`Failed to fetch from region ${r}`, { error: err.message });
            return [];
        }));
        const regionResults = await Promise.all(regionFetchPromises);
        const allEvents = regionResults.flat();
        logging_js_1.logger.info('CloudTrail events fetched', {
            totalCount: allEvents.length,
            regions: regionsToScan,
            hoursBack
        });
        // PARALLEL: Process events in parallel batches
        const PROCESS_BATCH_SIZE = 500;
        const processedEvents = [];
        for (let i = 0; i < allEvents.length; i += PROCESS_BATCH_SIZE) {
            const batch = allEvents.slice(i, i + PROCESS_BATCH_SIZE);
            const processed = batch
                .map(e => processEvent(e, organizationId, accountId, region))
                .filter((e) => e !== null);
            processedEvents.push(...processed);
        }
        logging_js_1.logger.info('Events processed', { processedCount: processedEvents.length });
        // PARALLEL: Batch upsert to database
        const savedCount = await batchUpsertEvents(prisma, processedEvents);
        // Calculate summary
        const summary = {
            total: processedEvents.length,
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            errors: 0,
            byUser: {},
            byEventName: {},
        };
        const savedEvents = [];
        for (const event of processedEvents) {
            summary[event.risk_level]++;
            if (event.error_code)
                summary.errors++;
            summary.byUser[event.user_name] = (summary.byUser[event.user_name] || 0) + 1;
            summary.byEventName[event.event_name] = (summary.byEventName[event.event_name] || 0) + 1;
            savedEvents.push({
                event_name: event.event_name,
                event_time: event.event_time,
                user_name: event.user_name,
                user_type: event.user_type,
                risk_level: event.risk_level,
                risk_reasons: event.risk_reasons,
                error_code: event.error_code,
                source_ip_address: event.source_ip_address,
                aws_region: event.aws_region,
            });
        }
        const topUsers = Object.entries(summary.byUser)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([user, count]) => ({ user, count }));
        const topEvents = Object.entries(summary.byEventName)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([event, count]) => ({ event, count }));
        logging_js_1.logger.info('CloudTrail analysis completed', {
            organizationId,
            accountId,
            regions: regionsToScan,
            savedCount,
            summary: {
                total: summary.total,
                critical: summary.critical,
                high: summary.high,
                medium: summary.medium,
                low: summary.low,
            }
        });
        // Update analysis status if analysisId was provided (async invocation)
        if (body.analysisId) {
            try {
                await prisma.cloudTrailAnalysis.update({
                    where: { id: body.analysisId },
                    data: {
                        status: 'completed',
                        events_processed: processedEvents.length,
                        events_saved: savedCount,
                        critical_count: summary.critical,
                        high_count: summary.high,
                        medium_count: summary.medium,
                        low_count: summary.low,
                        completed_at: new Date(),
                    },
                });
                logging_js_1.logger.info('Analysis status updated to completed', { analysisId: body.analysisId });
            }
            catch (updateErr) {
                logging_js_1.logger.warn('Failed to update analysis status', { analysisId: body.analysisId, error: updateErr.message });
            }
        }
        return (0, response_js_1.success)({
            success: true,
            events: savedEvents,
            summary: {
                total: summary.total,
                critical: summary.critical,
                high: summary.high,
                medium: summary.medium,
                low: summary.low,
                errors: summary.errors,
                topUsers,
                topEvents,
                timeRange: {
                    start: startTime.toISOString(),
                    end: endTime.toISOString(),
                    hoursBack,
                },
                regionsScanned: regionsToScan,
            },
        });
    }
    catch (err) {
        logging_js_1.logger.error('Analyze CloudTrail error', err, {
            organizationId,
            userId: user.sub,
            requestId: context.awsRequestId
        });
        // Update analysis status to failed if analysisId was provided
        const body = event.body ? JSON.parse(event.body) : {};
        if (body.analysisId) {
            try {
                const prisma = (0, database_js_1.getPrismaClient)();
                await prisma.cloudTrailAnalysis.update({
                    where: { id: body.analysisId },
                    data: {
                        status: 'failed',
                        error_message: err instanceof Error ? err.message : 'Unknown error',
                        completed_at: new Date(),
                    },
                });
            }
            catch (updateErr) {
                logging_js_1.logger.warn('Failed to update analysis status to failed', { analysisId: body.analysisId });
            }
        }
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=analyze-cloudtrail.js.map