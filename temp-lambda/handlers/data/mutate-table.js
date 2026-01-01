"use strict";
/**
 * Lambda handler genérico para mutações (INSERT/UPDATE/DELETE) em tabelas do banco
 * Substitui as chamadas REST diretas do frontend
 *
 * IMPORTANTE: Todas as operações são filtradas por organization_id para multi-tenancy
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
const request_parser_js_1 = require("../../lib/request-parser.js");
// Mapeamento de nomes de tabela do frontend para modelos Prisma
const TABLE_TO_MODEL = {
    'organizations': 'organization',
    'profiles': 'profile',
    'users': 'user',
    'aws_credentials': 'awsCredential',
    'aws_accounts': 'awsAccount',
    'daily_costs': 'dailyCost',
    'findings': 'finding',
    'security_scans': 'securityScan',
    'compliance_checks': 'complianceCheck',
    'guardduty_findings': 'guardDutyFinding',
    'security_posture': 'securityPosture',
    'knowledge_base_articles': 'knowledgeBaseArticle',
    'knowledge_base_comments': 'knowledgeBaseComment',
    'knowledge_base_attachments': 'knowledgeBaseAttachment',
    'knowledge_base_templates': 'knowledgeBaseTemplate',
    'knowledge_base_article_permissions': 'knowledgeBaseArticlePermission',
    'knowledge_base_analytics': 'knowledgeBaseAnalytic',
    'communication_logs': 'communicationLog',
    'waste_detections': 'wasteDetection',
    'drift_detections': 'driftDetection',
    'drift_detection_history': 'driftDetectionHistory',
    'resource_inventory': 'resourceInventory',
    'compliance_violations': 'complianceViolation',
    'alerts': 'alert',
    'alert_rules': 'alertRule',
    'monitored_endpoints': 'monitoredEndpoint',
    'endpoint_monitors': 'monitoredEndpoint',
    'endpoint_check_history': 'endpointCheckHistory',
    'iam_behavior_anomalies': 'iAMBehaviorAnomaly',
    'cloudtrail_fetches': 'cloudTrailFetch',
    'cloudtrail_events': 'cloudTrailEvent',
    'cloudtrail_analyses': 'cloudTrailAnalysis',
    'audit_logs': 'auditLog',
    'security_events': 'securityEvent',
    'security_findings': 'securityFinding',
    'system_events': 'systemEvent',
    'cost_optimizations': 'costOptimization',
    'compliance_scans': 'complianceScan',
    'jira_tickets': 'jiraTicket',
    'remediation_tickets': 'jiraTicket',
    'tickets': 'jiraTicket',
    'webauthn_credentials': 'webAuthnCredential',
    'monitored_resources': 'monitoredResource',
    'resource_metrics': 'resourceMetric',
    'resource_utilization_ml': 'resourceUtilizationML',
    'ml_analysis_history': 'mLAnalysisHistory',
    'edge_services': 'edgeService',
    'edge_metrics': 'edgeMetric',
    'scheduled_scans': 'scheduledScan',
    'saved_filters': 'savedFilter',
    'tv_dashboards': 'tvDashboard',
    'dashboard_metrics_targets': 'dashboardMetricTarget',
    'resource_comments': 'resourceComment',
    'mention_notifications': 'mentionNotification',
    // License management
    'licenses': 'license',
    'license_seat_assignments': 'licenseSeatAssignment',
    'organization_license_configs': 'organizationLicenseConfig',
};
// Tabelas que têm organization_id para multi-tenancy
const TABLES_WITH_ORG_ID = new Set([
    'profiles', 'aws_credentials', 'aws_accounts',
    'daily_costs', 'findings', 'security_scans', 'compliance_checks',
    'guardduty_findings', 'security_posture', 'knowledge_base_articles',
    'knowledge_base_comments', 'knowledge_base_attachments', 'knowledge_base_templates',
    'knowledge_base_article_permissions', 'knowledge_base_analytics',
    'communication_logs', 'waste_detections', 'drift_detections',
    'resource_inventory', 'compliance_violations', 'alerts', 'alert_rules',
    'iam_behavior_anomalies', 'cloudtrail_fetches', 'cloudtrail_analyses', 'audit_logs',
    'security_events', 'security_findings', 'system_events',
    'cost_optimizations', 'compliance_scans', 'jira_tickets', 'remediation_tickets', 'tickets',
    'monitored_resources', 'resource_metrics', 'resource_utilization_ml',
    'ml_analysis_history', 'edge_services', 'edge_metrics',
    'scheduled_scans', 'saved_filters', 'tv_dashboards', 'dashboard_metrics_targets',
    'resource_comments', 'mention_notifications', 'monitored_endpoints', 'endpoint_monitors',
    // License management
    'licenses',
]);
// Tabelas que requerem permissão de admin para modificar
const ADMIN_ONLY_TABLES = new Set([
    'organizations', 'users', 'profiles',
]);
function getOriginFromEvent(event) {
    const headers = event.headers || {};
    return headers['origin'] || headers['Origin'] || '*';
}
async function handler(event, context) {
    const origin = getOriginFromEvent(event);
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    if (httpMethod === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    let organizationId;
    let userId;
    let userRoles = [];
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        userId = user.sub || user.id || 'unknown';
        organizationId = (0, auth_js_1.getOrganizationId)(user);
        // Parse roles from user claims
        const rolesStr = user['custom:roles'] || user.roles || '[]';
        try {
            userRoles = typeof rolesStr === 'string' ? JSON.parse(rolesStr) : rolesStr;
        }
        catch {
            userRoles = [];
        }
    }
    catch (authError) {
        logging_js_1.logger.error('Authentication error', authError);
        return (0, response_js_1.error)('Authentication failed: ' + (authError.message || 'Unknown error'), 401, undefined, origin);
    }
    try {
        const body = (0, request_parser_js_1.parseEventBody)(event, {}, 'mutate-table');
        if (!body.table) {
            return (0, response_js_1.badRequest)('Missing required field: table', undefined, origin);
        }
        if (!body.operation) {
            return (0, response_js_1.badRequest)('Missing required field: operation', undefined, origin);
        }
        const modelName = TABLE_TO_MODEL[body.table];
        if (!modelName) {
            logging_js_1.logger.warn('Table not mapped for mutation', { table: body.table, userId });
            return (0, response_js_1.badRequest)(`Table '${body.table}' is not supported for mutations`, undefined, origin);
        }
        // Check admin permission for restricted tables
        const isAdmin = userRoles.includes('admin') || userRoles.includes('org_admin') || userRoles.includes('super_admin');
        if (ADMIN_ONLY_TABLES.has(body.table) && !isAdmin) {
            logging_js_1.logger.warn('Unauthorized mutation attempt', { table: body.table, userId, userRoles });
            return (0, response_js_1.unauthorized)('Admin permission required for this operation', origin);
        }
        logging_js_1.logger.info('Mutate table started', {
            table: body.table,
            modelName,
            operation: body.operation,
            organizationId,
            userId,
            requestId: context.awsRequestId
        });
        const prisma = (0, database_js_1.getPrismaClient)();
        const model = prisma[modelName];
        if (!model) {
            logging_js_1.logger.error('Prisma model not found', { modelName, table: body.table });
            return (0, response_js_1.badRequest)(`Model '${modelName}' not found`, undefined, origin);
        }
        let result;
        switch (body.operation) {
            case 'insert': {
                if (!body.data) {
                    return (0, response_js_1.badRequest)('Missing required field: data for insert operation', undefined, origin);
                }
                // Handle batch insert
                if (Array.isArray(body.data)) {
                    const dataWithOrg = body.data.map(item => {
                        const record = { ...item };
                        if (TABLES_WITH_ORG_ID.has(body.table)) {
                            record.organization_id = organizationId;
                        }
                        // Special handling for knowledge_base_articles - add author_id
                        if (body.table === 'knowledge_base_articles' && (!record.author_id || record.author_id === 'undefined')) {
                            record.author_id = userId;
                        }
                        return record;
                    });
                    result = await model.createMany({
                        data: dataWithOrg,
                        skipDuplicates: true,
                    });
                    // Return the count for batch operations
                    result = { count: result.count, success: true };
                }
                else {
                    // Single insert
                    const dataWithOrg = { ...body.data };
                    if (TABLES_WITH_ORG_ID.has(body.table)) {
                        dataWithOrg.organization_id = organizationId;
                    }
                    // Special handling for knowledge_base_articles - add author_id
                    if (body.table === 'knowledge_base_articles' && (!dataWithOrg.author_id || dataWithOrg.author_id === 'undefined')) {
                        dataWithOrg.author_id = userId;
                    }
                    result = await model.create({
                        data: dataWithOrg,
                    });
                }
                break;
            }
            case 'update': {
                if (!body.data) {
                    return (0, response_js_1.badRequest)('Missing required field: data for update operation', undefined, origin);
                }
                if (!body.where) {
                    return (0, response_js_1.badRequest)('Missing required field: where for update operation', undefined, origin);
                }
                // Enforce organization_id in where clause
                const where = { ...body.where };
                if (TABLES_WITH_ORG_ID.has(body.table)) {
                    where.organization_id = organizationId;
                }
                result = await model.updateMany({
                    where,
                    data: body.data,
                });
                break;
            }
            case 'delete': {
                if (!body.where) {
                    return (0, response_js_1.badRequest)('Missing required field: where for delete operation', undefined, origin);
                }
                // Enforce organization_id in where clause
                const where = { ...body.where };
                if (TABLES_WITH_ORG_ID.has(body.table)) {
                    where.organization_id = organizationId;
                }
                result = await model.deleteMany({
                    where,
                });
                break;
            }
            case 'upsert': {
                if (!body.data) {
                    return (0, response_js_1.badRequest)('Missing required field: data for upsert operation', undefined, origin);
                }
                if (!body.where) {
                    return (0, response_js_1.badRequest)('Missing required field: where for upsert operation', undefined, origin);
                }
                // Enforce organization_id
                const where = { ...body.where };
                const createData = { ...body.data };
                const updateData = { ...body.data };
                if (TABLES_WITH_ORG_ID.has(body.table)) {
                    where.organization_id = organizationId;
                    createData.organization_id = organizationId;
                }
                result = await model.upsert({
                    where,
                    create: createData,
                    update: updateData,
                });
                break;
            }
            default:
                return (0, response_js_1.badRequest)(`Invalid operation: ${body.operation}. Use insert, update, delete, or upsert`, undefined, origin);
        }
        logging_js_1.logger.info('Mutate table completed', {
            table: body.table,
            operation: body.operation,
            organizationId,
            resultId: result?.id,
        });
        return (0, response_js_1.success)(result, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Mutate table error', err, {
            organizationId,
            userId,
            requestId: context.awsRequestId,
        });
        // Handle Prisma errors
        if (err.code === 'P2002') {
            return (0, response_js_1.badRequest)('Record already exists (unique constraint violation)', undefined, origin);
        }
        if (err.code === 'P2025') {
            return (0, response_js_1.badRequest)('Record not found', undefined, origin);
        }
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Failed to mutate table', 500, undefined, origin);
    }
}
//# sourceMappingURL=mutate-table.js.map