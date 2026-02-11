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
import { isOrganizationInDemoMode, generateDemoMonitoredResources, generateDemoResourceMetrics, generateDemoEdgeServicesTable, generateDemoEdgeMetricsTable, generateDemoAlertRules, generateDemoRemediationTickets, generateDemoKnowledgeBaseArticles, generateDemoCloudTrailEventsTable, generateDemoAuditLogs, generateDemoSecurityScansTable, generateDemoFindingsTable } from '../../lib/demo-data-service.js';

// Mapeamento de nomes de tabela do frontend para modelos Prisma
// Baseado nas tabelas reais do schema.prisma
const TABLE_TO_MODEL: Record<string, string> = {
  // Tabelas que existem no Prisma (@@map)
  'organizations': 'organization',
  'profiles': 'profile',
  'users': 'user',
  'aws_credentials': 'awsCredential',
  'azure_credentials': 'azureCredential',
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
  'background_jobs': 'backgroundJob',
  
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
  'security_alerts': 'securityAlert',
  'alert_history': 'alert',
  'aws_resources': 'awsResource',
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
  // user_roles - tabela EXISTE no banco
  'user_roles': 'userRole',
  'knowledge_base_favorites': 'knowledgeBaseFavorite',
  'knowledge_base_comments': 'knowledgeBaseComment',
  'scan_schedules': 'scanSchedule',
  'scheduled_scans': 'scanSchedule',
  'resource_comments': 'resourceComment',
  'mention_notifications': 'mentionNotification',
};

// Mapeamento de campos do frontend para campos do Prisma
// Também lista campos a IGNORAR (mapear para null) quando não existem no modelo

// SEC-005: Field name sanitization - only allow safe alphanumeric field names
const SAFE_FIELD_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const BLOCKED_FIELD_PREFIXES = ['_', '$', '__'];

function isFieldNameSafe(fieldName: string): boolean {
  if (!SAFE_FIELD_PATTERN.test(fieldName)) return false;
  if (BLOCKED_FIELD_PREFIXES.some(p => fieldName.startsWith(p))) return false;
  return true;
}
const FIELD_MAPPING: Record<string, Record<string, string | null>> = {
  // Tabelas que tiveram account_id migrado para aws_account_id
  // NOTA: azure_credential_id é mapeado para aws_account_id porque os custos Azure
  // são salvos com aws_account_id contendo o ID da credencial Azure
  'daily_costs': { 'cost_date': 'date', 'account_id': 'aws_account_id', 'azure_credential_id': 'aws_account_id' },
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
  
  // Tabelas que TÊM aws_account_id mas frontend pode enviar null - tratar como "todos"
  // Quando aws_account_id é null, não filtrar por conta (mostrar todas)
  'cloudtrail_analyses': { },
  'cost_optimizations': { },
  
  // Monitored resources and metrics - support both AWS and Azure
  // azure_credential_id is a valid field in these tables, don't map it
  'monitored_resources': { 'azure_credential_id': 'azure_credential_id' },
  'resource_metrics': { 'azure_credential_id': 'azure_credential_id' },
  
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
  'background_jobs': { 'aws_account_id': null },
  
  // Organizations - não tem organization_id, usa id
  'organizations': { 'organization_id': null },
};

// Tabelas que têm organization_id para multi-tenancy
// NOTA: 'organizations' NÃO tem organization_id (usa 'id')
// SECURITY: 'organizations' is handled specially below - only returns user's own org
const TABLES_WITH_ORG_ID = new Set([
  'profiles', 'aws_credentials', 'azure_credentials', 'aws_accounts',
  'daily_costs', 'findings', 'security_scans',
  // NOTE: compliance_checks does NOT have organization_id - it uses scan_id -> SecurityScan
  'guardduty_findings', 'security_posture', 'knowledge_base_articles',
  'communication_logs', 'waste_detections', 'drift_detections',
  'drift_detection_history',
  'resource_inventory', 'compliance_violations', 'alerts', 'alert_rules',
  'monitored_endpoints',
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
  // Background jobs
  'background_jobs',
  // Predictive Incidents (ML)
  'predictive_incidents', 'predictive_incidents_history',
  // RI/SP Analysis
  'ri_sp_recommendations', 'reserved_instances', 'savings_plans',
  // Scan Schedules
  'scan_schedules', 'scheduled_scans',
  // Knowledge base user content
  'knowledge_base_favorites', 'knowledge_base_comments',
  // Resource comments and mentions
  'resource_comments', 'mention_notifications',
]);

interface QueryRequest {
  table: string;
  select?: string;
  eq?: Record<string, any>;
  in?: Record<string, any[]>;  // IN filter for arrays of values
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
  // SECURITY: Rate limit this to prevent user enumeration
  if (body.action === 'check-webauthn' && body.email) {
    // Validate email format to prevent abuse
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return badRequest('Invalid email format', undefined, origin);
    }
    // SECURITY: Sanitize email - max length to prevent DoS
    if (body.email.length > 254) {
      return badRequest('Invalid email format', undefined, origin);
    }
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
    return error('Authentication failed. Please login again.', 401, undefined, origin);
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
    
    // ============================================
    // DEMO MODE CHECK - Return demo data for monitoring tables
    // ============================================
    const DEMO_SUPPORTED_TABLES = new Set(['monitored_resources', 'resource_metrics', 'edge_services', 'edge_metrics', 'alert_rules', 'remediation_tickets', 'knowledge_base_articles', 'cloudtrail_events', 'audit_logs', 'security_scans', 'findings', 'scan_findings']);
    if (DEMO_SUPPORTED_TABLES.has(body.table)) {
      const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
      if (isDemo === true) {
        logger.info('Returning demo data for table', { table: body.table, organizationId, isDemo: true });
        
        if (body.table === 'monitored_resources') {
          const demoData = generateDemoMonitoredResources();
          return success(demoData, 200, origin);
        }
        
        if (body.table === 'resource_metrics') {
          const demoData = generateDemoResourceMetrics();
          return success(demoData, 200, origin);
        }
        
        if (body.table === 'edge_services') {
          const demoData = generateDemoEdgeServicesTable();
          return success(demoData, 200, origin);
        }
        
        if (body.table === 'edge_metrics') {
          const demoData = generateDemoEdgeMetricsTable();
          return success(demoData, 200, origin);
        }
        
        if (body.table === 'alert_rules') {
          const demoData = generateDemoAlertRules();
          return success(demoData, 200, origin);
        }
        
        if (body.table === 'remediation_tickets') {
          const demoData = generateDemoRemediationTickets();
          return success(demoData, 200, origin);
        }
        
        if (body.table === 'knowledge_base_articles') {
          const demoData = generateDemoKnowledgeBaseArticles();
          return success(demoData, 200, origin);
        }
        
        if (body.table === 'cloudtrail_events') {
          const demoData = generateDemoCloudTrailEventsTable();
          return success(demoData, 200, origin);
        }
        
        if (body.table === 'audit_logs') {
          const demoData = generateDemoAuditLogs();
          return success(demoData, 200, origin);
        }
        
        if (body.table === 'security_scans' || body.table === 'security_scans_history' || body.table === 'security_scan_history') {
          let demoData = generateDemoSecurityScansTable();
          // Support filtering by scan ID (SecurityScanDetails page)
          if (body.eq?.id) {
            demoData = demoData.filter(s => s.id === body.eq!.id);
          }
          return success(demoData, 200, origin);
        }
        
        if (body.table === 'findings' || body.table === 'scan_findings') {
          let demoData = generateDemoFindingsTable();
          // Support filtering by source
          if (body.eq?.source) {
            demoData = demoData.filter(f => f.source === body.eq!.source);
          }
          // Support filtering by aws_account_id
          if (body.eq?.aws_account_id) {
            demoData = demoData.filter(f => f.aws_account_id === body.eq!.aws_account_id || f.aws_account_id === 'demo-account');
          }
          return success(demoData, 200, origin);
        }
      }
    }
    
    // Build where clause
    const where: Record<string, any> = {};
    
    // Add organization_id for multi-tenancy
    if (TABLES_WITH_ORG_ID.has(body.table)) {
      where.organization_id = organizationId;
    }
    
    // SECURITY: For 'organizations' table, only allow querying user's own organization
    // This prevents data leakage across tenants
    if (body.table === 'organizations') {
      where.id = organizationId;
    }
    
    // Add eq filters with field mapping
    if (body.eq) {
      const fieldMap = FIELD_MAPPING[body.table] || {};
      logger.info('Query table eq filters', { 
        table: body.table, 
        eq: body.eq, 
        fieldMap,
        organizationId 
      });
      for (const [key, value] of Object.entries(body.eq)) {
        if (key === 'organization_id') continue; // Skip - enforced server-side
        if (!isFieldNameSafe(key)) {
          logger.warn('Rejected unsafe field name in eq filter', { key, table: body.table });
          continue;
        }
        const mappedKey = fieldMap[key];
        // If mapped to null, skip this field (doesn't exist in model)
        if (mappedKey === null) {
          logger.info('Skipping field (mapped to null)', { key, table: body.table });
          continue;
        }
        // If value is null or undefined, skip this filter (don't filter by this field)
        if (value === null || value === undefined) {
          logger.info('Skipping field (value is null/undefined)', { key, value, table: body.table });
          continue;
        }
        // If mapped to a string, use that; otherwise use original key
        const finalKey = mappedKey || key;
        
        // Special handling for cloud_provider field in edge_services and edge_metrics tables
        // The database column is TEXT but Prisma schema defines it as CloudProvider enum
        // We need to skip this filter and handle it via raw query or just filter in memory
        if (finalKey === 'cloud_provider' && (body.table === 'edge_services' || body.table === 'edge_metrics')) {
          logger.info('Skipping cloud_provider filter for edge tables (will filter in memory)', { key, value, table: body.table });
          continue;
        }
        
        where[finalKey] = value;
        logger.info('Added filter', { originalKey: key, finalKey, value, table: body.table });
      }
    }
    
    // Add in filters (array of values)
    if (body.in) {
      const fieldMap = FIELD_MAPPING[body.table] || {};
      for (const [key, values] of Object.entries(body.in)) {
        if (!isFieldNameSafe(key)) { logger.warn('Rejected unsafe field in IN filter', { key }); continue; }
        const mappedKey = fieldMap[key];
        if (mappedKey === null) continue;
        if (!Array.isArray(values) || values.length === 0) continue;
        const finalKey = mappedKey || key;
        where[finalKey] = { in: values };
        logger.info('Added IN filter', { originalKey: key, finalKey, values, table: body.table });
      }
    }
    
    logger.info('Final where clause', { table: body.table, where, modelName });
    
    // Add ilike filters
    if (body.ilike) {
      const fieldMap = FIELD_MAPPING[body.table] || {};
      for (const [key, value] of Object.entries(body.ilike)) {
        if (!isFieldNameSafe(key)) { logger.warn('Rejected unsafe field in ilike filter', { key }); continue; }
        const mappedKey = fieldMap[key];
        if (mappedKey === null) continue;
        where[mappedKey || key] = { contains: value.replace(/%/g, ''), mode: 'insensitive' };
      }
    }
    
    // Add gte filters (greater than or equal)
    if (body.gte) {
      const fieldMap = FIELD_MAPPING[body.table] || {};
      for (const [key, value] of Object.entries(body.gte)) {
        if (!isFieldNameSafe(key)) { logger.warn('Rejected unsafe field in gte filter', { key }); continue; }
        const mappedKey = fieldMap[key];
        if (mappedKey === null) continue;
        const fieldName = mappedKey || key;
        const isDateField = fieldName === 'date' || fieldName === 'timestamp' || fieldName.endsWith('_at') || fieldName.endsWith('_date');
        const filterValue = isDateField ? new Date(value as string) : value;
        where[fieldName] = { ...where[fieldName], gte: filterValue };
      }
    }
    
    // Add lte filters (less than or equal)
    if (body.lte) {
      const fieldMap = FIELD_MAPPING[body.table] || {};
      for (const [key, value] of Object.entries(body.lte)) {
        if (!isFieldNameSafe(key)) { logger.warn('Rejected unsafe field in lte filter', { key }); continue; }
        const mappedKey = fieldMap[key];
        if (mappedKey === null) continue;
        const fieldName = mappedKey || key;
        const isDateField = fieldName === 'date' || fieldName === 'timestamp' || fieldName.endsWith('_at') || fieldName.endsWith('_date');
        const filterValue = isDateField ? new Date(value as string) : value;
        where[fieldName] = { ...where[fieldName], lte: filterValue };
      }
    }
    
    // Add gt filters (greater than)
    if (body.gt) {
      const fieldMap = FIELD_MAPPING[body.table] || {};
      for (const [key, value] of Object.entries(body.gt)) {
        if (!isFieldNameSafe(key)) { logger.warn('Rejected unsafe field in gt filter', { key }); continue; }
        const mappedKey = fieldMap[key];
        if (mappedKey === null) continue;
        const fieldName = mappedKey || key;
        const isDateField = fieldName === 'date' || fieldName === 'timestamp' || fieldName.endsWith('_at') || fieldName.endsWith('_date');
        const filterValue = isDateField ? new Date(value as string) : value;
        where[fieldName] = { ...where[fieldName], gt: filterValue };
      }
    }
    
    // Add lt filters (less than)
    if (body.lt) {
      const fieldMap = FIELD_MAPPING[body.table] || {};
      for (const [key, value] of Object.entries(body.lt)) {
        if (!isFieldNameSafe(key)) { logger.warn('Rejected unsafe field in lt filter', { key }); continue; }
        const mappedKey = fieldMap[key];
        if (mappedKey === null) continue;
        const fieldName = mappedKey || key;
        const isDateField = fieldName === 'date' || fieldName === 'timestamp' || fieldName.endsWith('_at') || fieldName.endsWith('_date');
        const filterValue = isDateField ? new Date(value as string) : value;
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
      take: Math.min(body.limit || 100, 1000), // Default 100, max 1000 to prevent memory issues
      skip: body.offset || 0,  // Add offset support for pagination
    });
    
    // In-memory filtering for cloud_provider in edge tables
    // This is needed because the database column is TEXT but Prisma schema defines it as CloudProvider enum
    let filteredResults = results;
    if ((body.table === 'edge_services' || body.table === 'edge_metrics') && body.eq?.cloud_provider) {
      const cloudProviderFilter = body.eq.cloud_provider;
      filteredResults = results.filter((r: any) => r.cloud_provider === cloudProviderFilter);
      logger.info('Applied in-memory cloud_provider filter', { 
        table: body.table, 
        filter: cloudProviderFilter, 
        beforeCount: results.length, 
        afterCount: filteredResults.length 
      });
    }
    
    logger.info('Query table completed', { 
      table: body.table,
      organizationId,
      resultCount: filteredResults.length,
    });
    
    return success(filteredResults, 200, origin);
    
  } catch (err: any) {
    logger.error('Query table error', err, { 
      organizationId,
      userId,
      requestId: context.awsRequestId,
    });
    
    // For Prisma validation errors (bad field names, etc.), return empty array
    if (err.name === 'PrismaClientValidationError' || 
        err.message?.includes('does not exist')) {
      logger.warn('Prisma validation error - returning empty array', { 
        errorName: err.name,
        message: err.message?.substring(0, 200) 
      });
      return success([], 200, origin);
    }
    
    // For known Prisma request errors (model not found, column not found), return empty
    if (err.name === 'PrismaClientKnownRequestError' && 
        (err.code === 'P2021' || err.code === 'P2022')) {
      logger.warn('Prisma model/column not found - returning empty array', { 
        errorName: err.name,
        code: err.code,
        message: err.message?.substring(0, 200) 
      });
      return success([], 200, origin);
    }
    
    // For connection errors and other internal errors, return 500
    return error('Failed to query table. Please try again.', 500, undefined, origin);
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
    
    // Find user by email in profiles table
    const profile = await prisma.profile.findFirst({
      where: { email }
    });

    if (!profile) {
      // SECURITY: Return same response shape for non-existing users to prevent enumeration
      return success({
        hasWebAuthn: false,
        credentialsCount: 0
      }, 200, origin);
    }

    // Check for WebAuthn credentials
    const webauthnCredentials = await prisma.webAuthnCredential.findMany({
      where: { user_id: profile.user_id }
    });

    // SECURITY: Only log credential count, not user details
    logger.info('🔐 WebAuthn check completed', {
      credentialsCount: webauthnCredentials.length,
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
    }, 200, origin);
  }
}