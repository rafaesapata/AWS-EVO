"use strict";
/**
 * Lambda handler genérico para queries em tabelas do banco
 * Substitui as chamadas REST diretas do frontend
 *
 * IMPORTANTE: Todas as queries são filtradas por organization_id para multi-tenancy
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
const request_parser_js_1 = require("../../lib/request-parser.js");
// Mapeamento de nomes de tabela do frontend para modelos Prisma
// Baseado nas tabelas reais do schema.prisma
const TABLE_TO_MODEL = {
    // Tabelas que existem no Prisma (@@map)
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
    'communication_logs': 'communicationLog',
    'waste_detections': 'wasteDetection',
    'drift_detections': 'driftDetection',
    'drift_detection_history': 'driftDetectionHistory',
    'resource_inventory': 'resourceInventory',
    'compliance_violations': 'complianceViolation',
    'alerts': 'alert',
    'alert_rules': 'alertRule',
    'monitored_endpoints': 'monitoredEndpoint',
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
    'webauthn_credentials': 'webAuthnCredential',
    'monitored_resources': 'monitoredResource',
    'resource_metrics': 'resourceMetric',
    'resource_utilization_ml': 'resourceUtilizationML',
    'ml_analysis_history': 'mLAnalysisHistory',
    'edge_services': 'edgeService',
    'edge_metrics': 'edgeMetric',
    // License management tables
    'licenses': 'license',
    'license_seat_assignments': 'licenseSeatAssignment',
    'organization_license_configs': 'organizationLicenseConfig',
    // Aliases do frontend para tabelas reais
    'security_alerts': 'alert',
    'alert_history': 'alert',
    'aws_resources': 'resourceInventory',
    'scan_findings': 'finding',
    'optimization_recommendations': 'costOptimization',
    'iam_behavior_analysis': 'iAMBehaviorAnomaly',
    'lateral_movement_detections': 'securityEvent',
    'audit_insights': 'auditLog',
    'remediation_tickets': 'jiraTicket',
    'well_architected_scores': 'securityPosture',
    'well_architected_scans_history': 'securityScan',
    'security_scans_history': 'securityScan',
    'security_scan_history': 'securityScan',
    'application_logs': 'systemEvent',
    'performance_metrics': 'monitoredEndpoint',
    'waste_detection': 'wasteDetection',
    'waste_detection_history': 'mLAnalysisHistory',
    // user_roles não existe no banco - retornar vazio
    // 'user_roles': 'userRole',  // REMOVIDO - tabela não existe
    'knowledge_base_favorites': 'knowledgeBaseArticle',
};
// Mapeamento de campos do frontend para campos do Prisma
// Também lista campos a IGNORAR (mapear para null) quando não existem no modelo
const FIELD_MAPPING = {
    // Tabelas que tiveram account_id migrado para aws_account_id
    'daily_costs': { 'cost_date': 'date', 'account_id': 'aws_account_id' },
    'waste_detections': { 'account_id': 'aws_account_id' },
    'waste_detection': { 'account_id': 'aws_account_id' },
    'compliance_violations': { 'account_id': 'aws_account_id' },
    'iam_behavior_anomalies': { 'account_id': 'aws_account_id' },
    'iam_behavior_analysis': { 'account_id': 'aws_account_id' },
    // Tabelas com aws_account_id existente
    'resource_utilization_ml': {},
    'optimization_recommendations': {},
    'findings': {},
    'scan_findings': {},
    'cloudtrail_events': {},
    // Alerts - is_resolved não existe, usar resolved_at IS NULL/NOT NULL
    'alerts': { 'aws_account_id': null, 'is_resolved': null },
    'security_alerts': { 'aws_account_id': null, 'is_resolved': null },
    'alert_history': { 'aws_account_id': null, 'is_resolved': null },
    'alert_rules': { 'aws_account_id': null },
    // Tabelas que NÃO têm aws_account_id - ignorar esse campo
    'audit_logs': { 'aws_account_id': null },
    'audit_insights': { 'aws_account_id': null },
    'system_events': { 'aws_account_id': null },
    'application_logs': { 'aws_account_id': null },
    'jira_tickets': { 'aws_account_id': null },
    'remediation_tickets': { 'aws_account_id': null },
    'security_posture': { 'aws_account_id': null, 'scan_id': null },
    'well_architected_scores': { 'aws_account_id': null, 'scan_id': null },
    'knowledge_base_articles': { 'aws_account_id': null },
    'knowledge_base_favorites': { 'aws_account_id': null },
    'profiles': { 'aws_account_id': null },
    'user_roles': { 'aws_account_id': null },
    // Organizations - não tem organization_id, usa id
    'organizations': { 'organization_id': null },
};
// Tabelas que têm organization_id para multi-tenancy
// NOTA: 'organizations' NÃO tem organization_id (usa 'id')
const TABLES_WITH_ORG_ID = new Set([
    'profiles', 'aws_credentials', 'aws_accounts',
    'daily_costs', 'findings', 'security_scans', 'compliance_checks',
    'guardduty_findings', 'security_posture', 'knowledge_base_articles',
    'communication_logs', 'waste_detections', 'drift_detections',
    'resource_inventory', 'compliance_violations', 'alerts', 'alert_rules',
    'iam_behavior_anomalies', 'cloudtrail_fetches', 'cloudtrail_analyses', 'audit_logs',
    'security_events', 'security_findings', 'system_events',
    'cost_optimizations', 'compliance_scans', 'jira_tickets',
    'monitored_resources', 'resource_metrics', 'resource_utilization_ml',
    'ml_analysis_history', 'waste_detection_history',
    // License management
    'licenses',
    // Aliases
    'security_alerts', 'alert_history', 'aws_resources', 'scan_findings',
    'optimization_recommendations', 'iam_behavior_analysis',
    'lateral_movement_detections', 'cloudtrail_events', 'audit_insights',
    'remediation_tickets', 'well_architected_scores', 'application_logs',
    'performance_metrics', 'waste_detection',
    'security_scans_history', 'security_scan_history', 'well_architected_scans_history',
    // Edge services
    'edge_services', 'edge_metrics',
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
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        userId = user.sub || user.id || 'unknown';
        organizationId = (0, auth_js_1.getOrganizationId)(user);
    }
    catch (authError) {
        logging_js_1.logger.error('Authentication error', authError);
        return (0, response_js_1.error)('Authentication failed: ' + (authError.message || 'Unknown error'), 401, undefined, origin);
    }
    try {
        const body = (0, request_parser_js_1.parseEventBody)(event, {}, 'query-table');
        if (!body.table) {
            return (0, response_js_1.badRequest)('Missing required field: table', undefined, origin);
        }
        const modelName = TABLE_TO_MODEL[body.table];
        if (!modelName) {
            logging_js_1.logger.warn('Table not mapped', { table: body.table, userId });
            // Return empty array for unmapped tables instead of error
            // This allows frontend to gracefully handle missing data
            return (0, response_js_1.success)([], 200, origin);
        }
        logging_js_1.logger.info('Query table started', {
            table: body.table,
            modelName,
            organizationId,
            userId,
            requestId: context.awsRequestId
        });
        const prisma = (0, database_js_1.getPrismaClient)();
        // Build where clause
        const where = {};
        // Add organization_id for multi-tenancy
        if (TABLES_WITH_ORG_ID.has(body.table)) {
            where.organization_id = organizationId;
        }
        // Add eq filters with field mapping
        if (body.eq) {
            const fieldMap = FIELD_MAPPING[body.table] || {};
            for (const [key, value] of Object.entries(body.eq)) {
                if (key === 'organization_id')
                    continue; // Skip - enforced server-side
                const mappedKey = fieldMap[key];
                // If mapped to null, skip this field (doesn't exist in model)
                if (mappedKey === null)
                    continue;
                // If mapped to a string, use that; otherwise use original key
                where[mappedKey || key] = value;
            }
        }
        // Add ilike filters
        if (body.ilike) {
            const fieldMap = FIELD_MAPPING[body.table] || {};
            for (const [key, value] of Object.entries(body.ilike)) {
                const mappedKey = fieldMap[key];
                if (mappedKey === null)
                    continue;
                where[mappedKey || key] = { contains: value.replace(/%/g, ''), mode: 'insensitive' };
            }
        }
        // Add gte filters (greater than or equal)
        if (body.gte) {
            const fieldMap = FIELD_MAPPING[body.table] || {};
            for (const [key, value] of Object.entries(body.gte)) {
                const mappedKey = fieldMap[key];
                if (mappedKey === null)
                    continue;
                const fieldName = mappedKey || key;
                // Convert date strings to Date objects for Prisma
                const filterValue = (fieldName === 'date' || fieldName.endsWith('_at') || fieldName.endsWith('_date'))
                    ? new Date(value)
                    : value;
                where[fieldName] = { ...where[fieldName], gte: filterValue };
            }
        }
        // Add lte filters (less than or equal)
        if (body.lte) {
            const fieldMap = FIELD_MAPPING[body.table] || {};
            for (const [key, value] of Object.entries(body.lte)) {
                const mappedKey = fieldMap[key];
                if (mappedKey === null)
                    continue;
                const fieldName = mappedKey || key;
                // Convert date strings to Date objects for Prisma
                const filterValue = (fieldName === 'date' || fieldName.endsWith('_at') || fieldName.endsWith('_date'))
                    ? new Date(value)
                    : value;
                where[fieldName] = { ...where[fieldName], lte: filterValue };
            }
        }
        // Add gt filters (greater than)
        if (body.gt) {
            const fieldMap = FIELD_MAPPING[body.table] || {};
            for (const [key, value] of Object.entries(body.gt)) {
                const mappedKey = fieldMap[key];
                if (mappedKey === null)
                    continue;
                const fieldName = mappedKey || key;
                // Convert date strings to Date objects for Prisma
                const filterValue = (fieldName === 'date' || fieldName.endsWith('_at') || fieldName.endsWith('_date'))
                    ? new Date(value)
                    : value;
                where[fieldName] = { ...where[fieldName], gt: filterValue };
            }
        }
        // Add lt filters (less than)
        if (body.lt) {
            const fieldMap = FIELD_MAPPING[body.table] || {};
            for (const [key, value] of Object.entries(body.lt)) {
                const mappedKey = fieldMap[key];
                if (mappedKey === null)
                    continue;
                const fieldName = mappedKey || key;
                // Convert date strings to Date objects for Prisma
                const filterValue = (fieldName === 'date' || fieldName.endsWith('_at') || fieldName.endsWith('_date'))
                    ? new Date(value)
                    : value;
                where[fieldName] = { ...where[fieldName], lt: filterValue };
            }
        }
        // Build orderBy with field mapping
        let orderBy = undefined;
        if (body.order?.column) {
            const fieldMap = FIELD_MAPPING[body.table] || {};
            const mappedColumn = fieldMap[body.order.column];
            if (mappedColumn !== null) {
                orderBy = { [mappedColumn || body.order.column]: body.order.ascending !== false ? 'asc' : 'desc' };
            }
        }
        // Get Prisma model
        const model = prisma[modelName];
        if (!model) {
            logging_js_1.logger.error('Prisma model not found', { modelName, table: body.table });
            return (0, response_js_1.success)([], 200, origin); // Return empty instead of error
        }
        const results = await model.findMany({
            where,
            orderBy,
            take: body.limit || 1000,
            skip: body.offset || 0, // Add offset support for pagination
        });
        logging_js_1.logger.info('Query table completed', {
            table: body.table,
            organizationId,
            resultCount: results.length,
        });
        return (0, response_js_1.success)(results, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Query table error', err, {
            organizationId,
            userId,
            requestId: context.awsRequestId,
        });
        // For Prisma errors, return empty array (graceful degradation)
        if (err.name === 'PrismaClientValidationError' ||
            err.name === 'PrismaClientKnownRequestError' ||
            err.message?.includes('does not exist')) {
            logging_js_1.logger.warn('Prisma error - returning empty array', {
                errorName: err.name,
                message: err.message?.substring(0, 200)
            });
            return (0, response_js_1.success)([], 200, origin);
        }
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Failed to query table', 500, undefined, origin);
    }
}
//# sourceMappingURL=query-table.js.map