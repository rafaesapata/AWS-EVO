"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const aws_helpers_js_1 = require("../../lib/aws-helpers.js");
const client_cloudtrail_1 = require("@aws-sdk/client-cloudtrail");
const client_iam_1 = require("@aws-sdk/client-iam");
async function handler(event, context) {
    logging_js_1.logger.info('🚀 IAM Behavior Analysis started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { accountId, region: requestedRegion, lookbackDays = 7 } = body;
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
        // Usar região solicitada, ou primeira região da conta, ou padrão
        const accountRegions = account.regions;
        const region = requestedRegion ||
            (accountRegions && accountRegions.length > 0 ? accountRegions[0] : 'us-east-1');
        const resolvedCreds = await (0, aws_helpers_js_1.resolveAwsCredentials)(account, region);
        // Listar usuários IAM
        const iamClient = new client_iam_1.IAMClient({
            region: 'us-east-1', // IAM é global
            credentials: (0, aws_helpers_js_1.toAwsCredentials)(resolvedCreds),
        });
        const usersResponse = await iamClient.send(new client_iam_1.ListUsersCommand({}));
        const users = usersResponse.Users || [];
        // Buscar eventos do CloudTrail
        const ctClient = new client_cloudtrail_1.CloudTrailClient({
            region,
            credentials: (0, aws_helpers_js_1.toAwsCredentials)(resolvedCreds),
        });
        const startTime = new Date();
        startTime.setDate(startTime.getDate() - lookbackDays);
        const eventsResponse = await ctClient.send(new client_cloudtrail_1.LookupEventsCommand({
            StartTime: startTime,
            EndTime: new Date(),
            MaxResults: 50,
        }));
        const events = eventsResponse.Events || [];
        // Analisar comportamento
        const anomalies = [];
        for (const iamUser of users) {
            const userName = iamUser.UserName;
            const userEvents = events.filter(e => e.Username === userName);
            // 1. Detectar login fora do horário normal
            const afterHoursLogins = userEvents.filter(e => {
                if (e.EventName !== 'ConsoleLogin')
                    return false;
                const hour = new Date(e.EventTime).getHours();
                return hour < 6 || hour > 22; // Fora do horário 6h-22h
            });
            if (afterHoursLogins.length > 0) {
                anomalies.push({
                    userName,
                    anomalyType: 'after_hours_login',
                    severity: 'medium',
                    description: `User logged in ${afterHoursLogins.length} times outside normal hours`,
                    evidence: {
                        count: afterHoursLogins.length,
                        events: afterHoursLogins.slice(0, 3),
                    },
                });
            }
            // 2. Detectar múltiplas falhas de login
            const failedLogins = userEvents.filter(e => e.EventName === 'ConsoleLogin' &&
                e.ErrorCode);
            if (failedLogins.length >= 3) {
                anomalies.push({
                    userName,
                    anomalyType: 'multiple_failed_logins',
                    severity: 'high',
                    description: `User had ${failedLogins.length} failed login attempts`,
                    evidence: {
                        count: failedLogins.length,
                        events: failedLogins.slice(0, 3),
                    },
                });
            }
            // 3. Detectar ações administrativas incomuns
            const adminActions = userEvents.filter(e => e.EventName?.includes('Delete') ||
                e.EventName?.includes('Terminate') ||
                e.EventName?.includes('Detach'));
            if (adminActions.length > 5) {
                anomalies.push({
                    userName,
                    anomalyType: 'excessive_admin_actions',
                    severity: 'high',
                    description: `User performed ${adminActions.length} administrative actions`,
                    evidence: {
                        count: adminActions.length,
                        actions: adminActions.map(e => e.EventName).slice(0, 5),
                    },
                });
            }
            // 4. Detectar acesso de múltiplas localizações
            const ipAddresses = new Set(userEvents
                .map(e => e.CloudTrailEvent ? JSON.parse(e.CloudTrailEvent).sourceIPAddress : null)
                .filter(Boolean));
            if (ipAddresses.size > 3) {
                anomalies.push({
                    userName,
                    anomalyType: 'multiple_locations',
                    severity: 'medium',
                    description: `User accessed from ${ipAddresses.size} different IP addresses`,
                    evidence: {
                        ipCount: ipAddresses.size,
                        ips: Array.from(ipAddresses).slice(0, 5),
                    },
                });
            }
        }
        // Salvar anomalias no banco
        for (const anomaly of anomalies) {
            await prisma.iAMBehaviorAnomaly.create({
                data: {
                    organization_id: organizationId,
                    aws_account_id: accountId,
                    user_name: anomaly.userName,
                    anomaly_type: anomaly.anomalyType,
                    severity: anomaly.severity,
                    description: anomaly.description,
                    evidence: anomaly.evidence,
                    detected_at: new Date(),
                },
            });
        }
        const criticalCount = anomalies.filter(a => a.severity === 'critical').length;
        const highCount = anomalies.filter(a => a.severity === 'high').length;
        logging_js_1.logger.info(`✅ Analyzed ${users.length} users, found ${anomalies.length} anomalies`);
        return (0, response_js_1.success)({
            success: true,
            usersAnalyzed: users.length,
            eventsAnalyzed: events.length,
            anomaliesDetected: anomalies.length,
            summary: {
                critical: criticalCount,
                high: highCount,
                medium: anomalies.filter(a => a.severity === 'medium').length,
                low: anomalies.filter(a => a.severity === 'low').length,
            },
            anomalies,
        });
    }
    catch (err) {
        logging_js_1.logger.error('❌ IAM Behavior Analysis error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=iam-behavior-analysis.js.map