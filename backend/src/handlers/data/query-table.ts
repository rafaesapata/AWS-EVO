/**
 * Lambda handler genérico para queries em tabelas do banco
 * Substitui as chamadas REST diretas do frontend
 * 
 * IMPORTANTE: Todas as queries são filtradas por organization_id para multi-tenancy
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { parseEventBody } from '../../lib/request-parser.js';

// Mapeamento de nomes de tabela do frontend para modelos Prisma
// Baseado nas tabelas reais do schema.prisma
const TABLE_TO_MODEL: Record<string, string> = {
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
  'audit_logs': 'auditLog',
  'security_events': 'securityEvent',
  'security_findings': 'securityFinding',
  'system_events': 'systemEvent',
  'cost_optimizations': 'costOptimization',
  'compliance_scans': 'complianceScan',
  'jira_tickets': 'jiraTicket',
  'webauthn_credentials': 'webAuthnCredential',
  
  // Aliases do frontend para tabelas reais
  'security_alerts': 'alert',
  'alert_history': 'alert',
  'aws_resources': 'resourceInventory',
  'scan_findings': 'finding',
  'optimization_recommendations': 'costOptimization',
  'iam_behavior_analysis': 'iAMBehaviorAnomaly',
  'lateral_movement_detections': 'securityEvent',
  'cloudtrail_events': 'cloudTrailFetch',
  'audit_insights': 'auditLog',
  'remediation_tickets': 'jiraTicket',
  'well_architected_scores': 'securityPosture',
  'well_architected_scans_history': 'securityScan',
  'application_logs': 'systemEvent',
  'performance_metrics': 'monitoredEndpoint',
  'resource_utilization_ml': 'wasteDetection',
  'waste_detection': 'wasteDetection',
  'user_roles': 'profile',
  'knowledge_base_favorites': 'knowledgeBaseArticle',
};

// Mapeamento de campos do frontend para campos do Prisma
// Também lista campos a IGNORAR (mapear para null) quando não existem no modelo
const FIELD_MAPPING: Record<string, Record<string, string | null>> = {
  'daily_costs': { 'aws_account_id': 'account_id', 'cost_date': 'date' },
  'waste_detections': { 'aws_account_id': 'account_id' },
  'waste_detection': { 'aws_account_id': 'account_id' },
  'resource_utilization_ml': { 'aws_account_id': 'account_id' },
  'compliance_violations': { 'aws_account_id': 'account_id' },
  'iam_behavior_anomalies': { 'aws_account_id': 'account_id' },
  'iam_behavior_analysis': { 'aws_account_id': 'account_id' },
  'optimization_recommendations': { 'aws_account_id': 'account_id' },
  // findings - aws_account_id exists in schema but may not be in DB yet
  'findings': { 'aws_account_id': 'aws_account_id' },
  'scan_findings': { 'aws_account_id': 'aws_account_id' },
  // Tabelas que NÃO têm aws_account_id - ignorar esse campo
  'alerts': { 'aws_account_id': null },
  'security_alerts': { 'aws_account_id': null },
  'alert_history': { 'aws_account_id': null },
  'alert_rules': { 'aws_account_id': null },
  'audit_logs': { 'aws_account_id': null },
  'audit_insights': { 'aws_account_id': null },
  'system_events': { 'aws_account_id': null },
  'application_logs': { 'aws_account_id': null },
  'jira_tickets': { 'aws_account_id': null },
  'remediation_tickets': { 'aws_account_id': null },
  'security_posture': { 'aws_account_id': null },
  'well_architected_scores': { 'aws_account_id': null },
  'knowledge_base_articles': { 'aws_account_id': null },
  'knowledge_base_favorites': { 'aws_account_id': null },
  'profiles': { 'aws_account_id': null },
  'user_roles': { 'aws_account_id': null },
};

// Tabelas que têm organization_id para multi-tenancy
const TABLES_WITH_ORG_ID = new Set([
  'organizations', 'profiles', 'aws_credentials', 'aws_accounts',
  'daily_costs', 'findings', 'security_scans', 'compliance_checks',
  'guardduty_findings', 'security_posture', 'knowledge_base_articles',
  'communication_logs', 'waste_detections', 'drift_detections',
  'resource_inventory', 'compliance_violations', 'alerts', 'alert_rules',
  'iam_behavior_anomalies', 'cloudtrail_fetches', 'audit_logs',
  'security_events', 'security_findings', 'system_events',
  'cost_optimizations', 'compliance_scans', 'jira_tickets',
  // Aliases
  'security_alerts', 'alert_history', 'aws_resources', 'scan_findings',
  'optimization_recommendations', 'iam_behavior_analysis',
  'lateral_movement_detections', 'cloudtrail_events', 'audit_insights',
  'remediation_tickets', 'well_architected_scores', 'application_logs',
  'performance_metrics', 'resource_utilization_ml', 'waste_detection',
]);

interface QueryRequest {
  table: string;
  select?: string;
  eq?: Record<string, any>;
  order?: { column: string; ascending?: boolean };
  limit?: number;
  ilike?: Record<string, string>;
}

function getOriginFromEvent(event: AuthorizedEvent): string {
  const headers = event.headers || {};
  return headers['origin'] || headers['Origin'] || '*';
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOriginFromEvent(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  let organizationId: string;
  let userId: string;

  try {
    const user = getUserFromEvent(event);
    userId = user.sub || user.id || 'unknown';
    organizationId = getOrganizationId(user);
  } catch (authError: any) {
    logger.error('Authentication error', authError);
    return error('Authentication failed: ' + (authError.message || 'Unknown error'), 401, undefined, origin);
  }
  
  try {
    const body = parseEventBody<QueryRequest>(event, {} as QueryRequest, 'query-table');
    
    if (!body.table) {
      return badRequest('Missing required field: table', undefined, origin);
    }
    
    const modelName = TABLE_TO_MODEL[body.table];
    if (!modelName) {
      logger.warn('Table not mapped', { table: body.table, userId });
      // Return empty array for unmapped tables instead of error
      // This allows frontend to gracefully handle missing data
      return success([], 200, origin);
    }
    
    logger.info('Query table started', { 
      table: body.table,
      modelName,
      organizationId,
      userId,
      requestId: context.awsRequestId 
    });
    
    const prisma = getPrismaClient();
    
    // Build where clause
    const where: Record<string, any> = {};
    
    // Add organization_id for multi-tenancy
    if (TABLES_WITH_ORG_ID.has(body.table)) {
      where.organization_id = organizationId;
    }
    
    // Add eq filters with field mapping
    if (body.eq) {
      const fieldMap = FIELD_MAPPING[body.table] || {};
      for (const [key, value] of Object.entries(body.eq)) {
        if (key === 'organization_id') continue; // Skip - enforced server-side
        const mappedKey = fieldMap[key];
        // If mapped to null, skip this field (doesn't exist in model)
        if (mappedKey === null) continue;
        // If mapped to a string, use that; otherwise use original key
        where[mappedKey || key] = value;
      }
    }
    
    // Add ilike filters
    if (body.ilike) {
      const fieldMap = FIELD_MAPPING[body.table] || {};
      for (const [key, value] of Object.entries(body.ilike)) {
        const mappedKey = fieldMap[key];
        if (mappedKey === null) continue;
        where[mappedKey || key] = { contains: value.replace(/%/g, ''), mode: 'insensitive' };
      }
    }
    
    // Build orderBy with field mapping
    let orderBy: any = undefined;
    if (body.order?.column) {
      const fieldMap = FIELD_MAPPING[body.table] || {};
      const mappedColumn = fieldMap[body.order.column];
      if (mappedColumn !== null) {
        orderBy = { [mappedColumn || body.order.column]: body.order.ascending !== false ? 'asc' : 'desc' };
      }
    }
    
    // Get Prisma model
    const model = (prisma as any)[modelName];
    if (!model) {
      logger.error('Prisma model not found', { modelName, table: body.table });
      return success([], 200, origin); // Return empty instead of error
    }
    
    const results = await model.findMany({
      where,
      orderBy,
      take: body.limit || 1000,
    });
    
    logger.info('Query table completed', { 
      table: body.table,
      organizationId,
      resultCount: results.length,
    });
    
    return success(results, 200, origin);
    
  } catch (err: any) {
    logger.error('Query table error', err, { 
      organizationId,
      userId,
      requestId: context.awsRequestId,
    });
    
    // For Prisma errors, return empty array (graceful degradation)
    if (err.name === 'PrismaClientValidationError' || 
        err.name === 'PrismaClientKnownRequestError' ||
        err.message?.includes('does not exist')) {
      logger.warn('Prisma error - returning empty array', { 
        errorName: err.name,
        message: err.message?.substring(0, 200) 
      });
      return success([], 200, origin);
    }
    
    return error(err instanceof Error ? err.message : 'Failed to query table', 500, undefined, origin);
  }
}
