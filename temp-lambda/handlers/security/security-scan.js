"use strict";
/**
 * Lambda handler para security scan - Security Engine V3
 * 23 scanners de serviços AWS com 170+ verificações de segurança
 * Suporte a 6 frameworks de compliance: CIS, Well-Architected, PCI-DSS, NIST, LGPD, SOC2
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const validation_js_1 = require("../../lib/validation.js");
const aws_helpers_js_1 = require("../../lib/aws-helpers.js");
const circuit_breaker_js_1 = require("../../lib/circuit-breaker.js");
const logging_js_1 = require("../../lib/logging.js");
const metrics_js_1 = require("../../lib/metrics.js");
const middleware_js_1 = require("../../lib/middleware.js");
const index_js_1 = require("../../lib/security-engine/index.js");
async function securityScanHandler(event, _context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    let user;
    let organizationId;
    try {
        user = (0, auth_js_1.getUserFromEvent)(event);
    }
    catch (authError) {
        return (0, response_js_1.error)('Unauthorized - user not found', 401, undefined, origin);
    }
    try {
        organizationId = (0, auth_js_1.getOrganizationId)(user);
    }
    catch (orgError) {
        return (0, response_js_1.error)('Unauthorized - organization not found', 401, undefined, origin);
    }
    const prisma = (0, database_js_1.getPrismaClient)();
    // Ensure database connection is established with retry logic
    let connectionAttempts = 0;
    const maxAttempts = 3;
    while (connectionAttempts < maxAttempts) {
        try {
            await prisma.$connect();
            // Test the connection with a simple query
            await prisma.$queryRaw `SELECT 1`;
            break;
        }
        catch (dbError) {
            connectionAttempts++;
            logging_js_1.logger.warn(`Database connection attempt ${connectionAttempts} failed`, {
                error: dbError.message,
                attempt: connectionAttempts,
                maxAttempts
            });
            if (connectionAttempts >= maxAttempts) {
                logging_js_1.logger.error('Database connection failed after all attempts', dbError);
                return (0, response_js_1.error)('Database connection failed', 500, undefined, origin);
            }
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, connectionAttempts) * 1000));
        }
    }
    const startTime = Date.now();
    logging_js_1.logger.info('Security scan started', { organizationId, userId: user.sub });
    try {
        const bodyValidation = (0, validation_js_1.parseAndValidateBody)(validation_js_1.securityScanSchema, event.body || null);
        if (!bodyValidation.success)
            return bodyValidation.error;
        const { accountId, scanLevel, scanId } = bodyValidation.data;
        const credential = await prisma.awsCredential.findFirst({
            where: {
                organization_id: organizationId,
                is_active: true,
                ...(accountId && { id: accountId })
            },
            orderBy: { created_at: 'desc' },
        });
        if (!credential) {
            return (0, response_js_1.badRequest)('AWS credentials not found', undefined, origin);
        }
        const regions = credential.regions?.length ? credential.regions : ['us-east-1'];
        // Obter AWS Account ID de forma segura
        let awsAccountId = credential.account_id || '';
        if (!awsAccountId || awsAccountId === '000000000000') {
            // Tentar obter via STS se não tiver account_id válido
            try {
                const { STSClient, GetCallerIdentityCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-sts')));
                const resolvedCredsForSts = await (0, aws_helpers_js_1.resolveAwsCredentials)(credential, 'us-east-1');
                const stsClient = new STSClient({
                    region: 'us-east-1',
                    credentials: {
                        accessKeyId: resolvedCredsForSts.accessKeyId,
                        secretAccessKey: resolvedCredsForSts.secretAccessKey,
                        sessionToken: resolvedCredsForSts.sessionToken,
                    }
                });
                const identity = await stsClient.send(new GetCallerIdentityCommand({}));
                if (identity.Account) {
                    awsAccountId = identity.Account;
                    // Atualizar no banco para próximas consultas
                    await prisma.awsCredential.update({
                        where: { id: credential.id },
                        data: { account_id: identity.Account }
                    });
                    logging_js_1.logger.info('AWS Account ID obtained via STS', { accountId: awsAccountId });
                }
            }
            catch (stsError) {
                logging_js_1.logger.warn('Could not obtain AWS Account ID via STS', { error: stsError });
                awsAccountId = 'unknown';
            }
        }
        // Create or update scan record
        let scan;
        if (scanId) {
            // Update existing scan record
            scan = await prisma.securityScan.update({
                where: { id: scanId },
                data: {
                    status: 'running',
                    started_at: new Date(),
                },
            });
            logging_js_1.logger.info('Updated existing scan record', { scanId });
        }
        else {
            // Create new scan record (fallback for backward compatibility)
            scan = await prisma.securityScan.create({
                data: {
                    organization_id: organizationId,
                    aws_account_id: credential.id,
                    scan_type: `${scanLevel}-security-scan`,
                    status: 'running',
                    scan_config: { regions, level: scanLevel, engine: 'v3' },
                },
            });
            logging_js_1.logger.info('Created new scan record', { scanId: scan.id });
        }
        // Resolve AWS credentials
        const resolvedCreds = await (0, aws_helpers_js_1.resolveAwsCredentials)(credential, 'us-east-1');
        // IMPORTANT: Reset global cache to avoid mixing findings from previous scans (Lambda warm start)
        (0, index_js_1.resetGlobalCache)();
        logging_js_1.logger.info('Global cache reset for new scan');
        // Build scan context
        const scanContext = {
            organizationId,
            awsAccountId,
            regions,
            credentials: {
                accessKeyId: resolvedCreds.accessKeyId,
                secretAccessKey: resolvedCreds.secretAccessKey,
                sessionToken: resolvedCreds.sessionToken,
                roleArn: credential.role_arn || undefined,
                externalId: credential.external_id || undefined,
            },
            scanLevel: scanLevel,
        };
        // Run the security scan using Security Engine V3
        logging_js_1.logger.info('Running Security Engine', { regions, scanLevel, scanId: scan.id });
        const scanResult = await (0, index_js_1.runSecurityScan)(scanContext);
        // Save findings to database using batch insert for efficiency
        // Strategy: Delete old pending findings from this scan source and create new ones
        // This ensures we don't accumulate duplicate findings across scans
        // Delete old pending findings from security-engine for this account
        const deletedCount = await prisma.finding.deleteMany({
            where: {
                organization_id: organizationId,
                aws_account_id: credential.id,
                source: 'security-engine',
                status: 'pending',
            },
        });
        logging_js_1.logger.info('Deleted old pending findings', { deletedCount: deletedCount.count });
        // Prepare findings data for batch insert
        const findingsData = scanResult.findings.map(finding => ({
            organization_id: organizationId,
            aws_account_id: credential.id,
            severity: finding.severity,
            description: `${finding.title}\n\n${finding.description}\n\n${finding.analysis}`,
            details: {
                title: finding.title,
                analysis: finding.analysis,
                region: finding.region,
                risk_score: finding.risk_score,
                attack_vectors: finding.attack_vectors,
                business_impact: finding.business_impact,
            },
            resource_id: finding.resource_id,
            resource_arn: finding.resource_arn,
            service: finding.service,
            category: finding.category,
            scan_type: finding.scan_type,
            compliance: finding.compliance?.map(c => `${c.framework} ${c.control_id}: ${c.control_title}`) || [],
            remediation: finding.remediation ? JSON.stringify(finding.remediation) : undefined,
            evidence: finding.evidence,
            risk_vector: finding.risk_vector,
            source: 'security-engine',
            status: 'pending',
        }));
        // Batch insert - much more efficient than individual creates
        let savedFindingsCount = 0;
        if (findingsData.length > 0) {
            const batchResult = await prisma.finding.createMany({
                data: findingsData,
                skipDuplicates: true,
            });
            savedFindingsCount = batchResult.count;
            logging_js_1.logger.info('Batch inserted findings', { count: savedFindingsCount });
        }
        // Fetch the saved findings for the response
        const savedFindings = await prisma.finding.findMany({
            where: {
                organization_id: organizationId,
                aws_account_id: credential.id,
                source: 'security-engine',
                status: 'pending',
            },
            orderBy: { created_at: 'desc' },
            take: findingsData.length,
        });
        // Update scan status
        const duration = Date.now() - startTime;
        await prisma.securityScan.update({
            where: { id: scan.id },
            data: {
                status: 'completed',
                completed_at: new Date(),
                findings_count: savedFindingsCount,
                critical_count: scanResult.summary.critical,
                high_count: scanResult.summary.high,
                medium_count: scanResult.summary.medium,
                low_count: scanResult.summary.low,
                results: {
                    duration_ms: duration,
                    services_scanned: scanResult.metrics.servicesScanned,
                    regions_scanned: scanResult.metrics.regionsScanned,
                    by_service: scanResult.summary.byService,
                    by_category: scanResult.summary.byCategory,
                },
            },
        });
        // Log metrics
        await metrics_js_1.businessMetrics.securityScanCompleted(duration, savedFindings.length, organizationId, scan.scan_type);
        logging_js_1.logger.info('Security scan completed', {
            organizationId,
            scanId: scan.id,
            duration,
            totalFindings: savedFindings.length,
            summary: scanResult.summary,
        });
        return (0, response_js_1.success)({
            scan_id: scan.id,
            status: 'completed',
            duration_ms: duration,
            findings_count: savedFindings.length,
            critical: scanResult.summary.critical,
            high: scanResult.summary.high,
            medium: scanResult.summary.medium,
            low: scanResult.summary.low,
            summary: {
                total: savedFindings.length,
                critical: scanResult.summary.critical,
                high: scanResult.summary.high,
                medium: scanResult.summary.medium,
                low: scanResult.summary.low,
                info: scanResult.summary.info,
                by_service: scanResult.summary.byService,
                by_category: scanResult.summary.byCategory,
            },
            metrics: {
                services_scanned: scanResult.metrics.servicesScanned,
                regions_scanned: scanResult.metrics.regionsScanned,
                total_duration: scanResult.metrics.totalDuration,
            },
            findings: savedFindings,
        }, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Security scan failed', { error: err.message, stack: err.stack });
        return (0, response_js_1.error)('Security scan failed: ' + err.message, 500, undefined, origin);
    }
}
const handler = async (event, context) => {
    return (0, circuit_breaker_js_1.withAwsCircuitBreaker)('security-scan', () => securityScanHandler(event, context));
};
exports.handler = handler;
//# sourceMappingURL=security-scan.js.map