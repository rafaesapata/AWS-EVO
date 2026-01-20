/**
 * Lambda handler genérico para queries em tabelas do banco
 * Substitui as chamadas REST diretas do frontend
 * 
 * IMPORTANTE: Todas as queries são filtradas por organization_id para multi-tenancy
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
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
  
  // Predictive Incidents (ML)
  'predictive_incidents': 'predictiveIncident',
  'predictive_incidents_history': 'predictiveIncidentsHistory',
  
  // License management tables
  'licenses': 'license',
  'license_seat_assignments': 'licenseSeatAssignment',
  'organization_license_configs': 'organizationLicenseConfig',
  
  // RI/SP Analysis tables
  'ri_sp_recommendations': 'riSpRecommendation',
  'reserved_instances': 'reservedInstance',
  'savings_plans': 'savingsPlan',
  
  // Aliases do frontend para tabelas reais
  'security_alerts': 'alert',
  'alert_history': 'alert',
  'aws_resources': 'resourceInventory',
  'scan_findings': 'finding',
  'optimization_recommendations': 'costOptimization',
  'iam_behavior_analysis': 'iAMBehaviorAnomaly',
  'lateral_movement_detections': 'securityEvent',
  'audit_insights': 'auditLog',
  'remediation_tickets': 'remediationTicket',
  'well_architected_scores': 'wellArchitectedScore',
  'well_architected_scans_history': 'securityScan',
  'security_scans_history': 'securityScan',
  'security_scan_history': 'securityScan',
  'application_logs': 'systemEvent',
  'performance_metrics': 'monitoredEndpoint',
  'waste_detection': 'wasteDetection',
  'waste_detection_history': 'mLAnalysisHistory',
  // user_roles não existe no banco - retornar vazio
  // 'user_roles': 'userRole',  // REMOVIDO - tabela não existe
  'knowledge_base_favorites': 'knowledgeBaseFavorite',
  'knowledge_base_comments': 'knowledgeBaseComment',
  'scan_schedules': 'scanSchedule',
  'scheduled_scans': 'scanSchedule',
};

// Mapeamento de campos do frontend para campos do Prisma
// Também lista campos a IGNORAR (mapear para null) quando não existem no modelo
const FIELD_MAPPING: Record<string, Record<string, string | null>> = {
  // Tabelas que tiveram account_id migrado para aws_account_id
  'daily_costs': { 'cost_date': 'date', 'account_id': 'aws_account_id' },
  'waste_detections': { 'account_id': 'aws_account_id' },
  'waste_detection': { 'account_id': 'aws_account_id' },
  'compliance_violations': { 'account_id': 'aws_account_id' },
  'iam_behavior_anomalies': { 'account_id': 'aws_account_id' },
  'iam_behavior_analysis': { 'account_id': 'aws_account_id' },
  
  // Tabelas com aws_account_id existente
  'resource_utilization_ml': { },
  'optimization_recommendations': { },
  'findings': { },
  'scan_findings': { },
  'cloudtrail_events': { },
  
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
  'remediation_tickets': { },
  'security_posture': { 'aws_account_id': null },
  'well_architected_scores': { 'aws_account_id': null },
  'knowledge_base_articles': { 'aws_account_id': null },
  'knowledge_base_favorites': { 'aws_account_id': null },
  'knowledge_base_comments': { 'aws_account_id': null },
  'profiles': { 'aws_account_id': null },
  'user_roles': { 'aws_account_id': null },
  
  // Organizations - não tem organization_id, usa id
  'organizations': { 'organization_id': null },
};

// Tabelas que têm organization_id para multi-tenancy
// NOTA: 'organizations' NÃO tem organization_id (usa 'id')
const TABLES_WITH_ORG_ID = new Set([
  'profiles', 'aws_credentials', 'aws_accounts',
  'daily_costs', 'findings', 'security_scans',
  // NOTE: compliance_checks does NOT have organization_id - it uses scan_id -> SecurityScan
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
  // Predictive Incidents (ML)
  'predictive_incidents', 'predictive_incidents_history',
  // RI/SP Analysis
  'ri_sp_recommendations', 'reserved_instances', 'savings_plans',
  // Scan Schedules
  'scan_schedules', 'scheduled_scans',
]);

interface QueryRequest {
  table: string;
  select?: string;
  eq?: Record<string, any>;
  order?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;  // For pagination
  ilike?: Record<string, string>;
  gte?: Record<string, any>;  // Greater than or equal
  lte?: Record<string, any>;  // Less than or equal
  gt?: Record<string, any>;   // Greater than
  lt?: Record<string, any>;   // Less than
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

  // Parse body first to check for special actions
  const body = parseEventBody<QueryRequest & { action?: string; email?: string }>(event, {} as QueryRequest, 'query-table');
  
  // Special case: WebAuthn check without authentication
  if (body.action === 'check-webauthn' && body.email) {
    return await handleWebAuthnCheck(body.email, origin);
  }

  let organizationId: string;
  let userId: string;

  try {
    const user = getUserFromEvent(event);
    userId = user.sub || user.id || 'unknown';
    // Use impersonation-aware function for super admins
    organizationId = getOrganizationIdWithImpersonation(event, user);
  } catch (authError: any) {
    logger.error('Authentication error', authError);
    return error('Authentication failed: ' + (authError.message || 'Unknown error'), 401, undefined, origin);
  }
  
  try {
    
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
    
    // Add gte filters (greater than or equal)
    if (body.gte) {
      const fieldMap = FIELD_MAPPING[body.table] || {};
      for (const [key, value] of Object.entries(body.gte)) {
        const mappedKey = fieldMap[key];
        if (mappedKey === null) continue;
        const fieldName = mappedKey || key;
        // Convert date strings to Date objects for Prisma
        const filterValue = (fieldName === 'date' || fieldName.endsWith('_at') || fieldName.endsWith('_date')) 
          ? new Date(value as string) 
          : value;
        where[fieldName] = { ...where[fieldName], gte: filterValue };
      }
    }
    
    // Add lte filters (less than or equal)
    if (body.lte) {
      const fieldMap = FIELD_MAPPING[body.table] || {};
      for (const [key, value] of Object.entries(body.lte)) {
        const mappedKey = fieldMap[key];
        if (mappedKey === null) continue;
        const fieldName = mappedKey || key;
        // Convert date strings to Date objects for Prisma
        const filterValue = (fieldName === 'date' || fieldName.endsWith('_at') || fieldName.endsWith('_date')) 
          ? new Date(value as string) 
          : value;
        where[fieldName] = { ...where[fieldName], lte: filterValue };
      }
    }
    
    // Add gt filters (greater than)
    if (body.gt) {
      const fieldMap = FIELD_MAPPING[body.table] || {};
      for (const [key, value] of Object.entries(body.gt)) {
        const mappedKey = fieldMap[key];
        if (mappedKey === null) continue;
        const fieldName = mappedKey || key;
        // Convert date strings to Date objects for Prisma
        const filterValue = (fieldName === 'date' || fieldName.endsWith('_at') || fieldName.endsWith('_date')) 
          ? new Date(value as string) 
          : value;
        where[fieldName] = { ...where[fieldName], gt: filterValue };
      }
    }
    
    // Add lt filters (less than)
    if (body.lt) {
      const fieldMap = FIELD_MAPPING[body.table] || {};
      for (const [key, value] of Object.entries(body.lt)) {
        const mappedKey = fieldMap[key];
        if (mappedKey === null) continue;
        const fieldName = mappedKey || key;
        // Convert date strings to Date objects for Prisma
        const filterValue = (fieldName === 'date' || fieldName.endsWith('_at') || fieldName.endsWith('_date')) 
          ? new Date(value as string) 
          : value;
        where[fieldName] = { ...where[fieldName], lt: filterValue };
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
      take: body.limit || 10000, // Increased default limit for export functionality
      skip: body.offset || 0,  // Add offset support for pagination
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
/**
 * Handle WebAuthn check without authentication
 * This is a special case that allows checking if a user has WebAuthn credentials
 * before they authenticate, which is needed for the login flow
 */
async function handleWebAuthnCheck(email: string, origin: string): Promise<APIGatewayProxyResultV2> {
  try {
    logger.info('🔐 WebAuthn check requested', { email });
    
    const prisma = getPrismaClient();
    
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email }
    });

    logger.info('🔐 User lookup result', { 
      email, 
      userFound: !!user, 
      userId: user?.id 
    });

    if (!user) {
      // User not found - no WebAuthn
      return success({
        hasWebAuthn: false,
        credentialsCount: 0
      }, 200, origin);
    }

    // Check for WebAuthn credentials
    const webauthnCredentials = await prisma.webAuthnCredential.findMany({
      where: { user_id: user.id }
    });

    logger.info('🔐 WebAuthn credentials found', {
      userId: user.id,
      credentialsCount: webauthnCredentials.length,
      credentials: webauthnCredentials.map(c => ({
        id: c.id,
        device_name: c.device_name,
        created_at: c.created_at
      }))
    });

    return success({
      hasWebAuthn: webauthnCredentials.length > 0,
      credentialsCount: webauthnCredentials.length
    }, 200, origin);

  } catch (error: any) {
    logger.error('🔐 WebAuthn check error', error);
    
    return success({
      hasWebAuthn: false,
      credentialsCount: 0,
      error: 'Failed to check WebAuthn credentials'
    }, 200, origin); // Return 200 with error info instead of 500 to not break login flow
  }
}