/**
 * Get Recent Errors - Real-time from CloudWatch Logs
 * 
 * Busca erros recentes de TODAS as fontes:
 * - ALL 121 Lambda functions
 * - API Gateway
 * - Frontend
 * 
 * OPTIMIZED v2:
 * - Reduced batch size to 10 (faster parallel queries)
 * - Limit 3 events per Lambda (reduces processing time)
 * - Early exit on limit reached
 * - Cached error patterns
 * - Faster message parsing
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { logger } from '../../lib/logging.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { z } from 'zod';

const cloudwatchLogs = new CloudWatchLogsClient({ region: 'us-east-1' });

const querySchema = z.object({
  limit: z.number().optional().default(100),
  hours: z.number().optional().default(24),
  source: z.enum(['all', 'backend', 'frontend', 'api-gateway']).optional().default('all'),
});

// OTIMIZAÇÃO: Priorizar Lambdas críticas (verificar primeiro)
const CRITICAL_LAMBDAS = [
  'save-aws-credentials', 'validate-aws-credentials', 'security-scan', 'compliance-scan',
  'mfa-enroll', 'mfa-verify-login', 'webauthn-register', 'bedrock-chat',
  'get-executive-dashboard', 'fetch-daily-costs', 'query-table',
];

// ALL 121 Lambda functions (menos críticas verificadas depois)
const OTHER_LAMBDAS = [
  // Auth & MFA (restantes)
  'mfa-check', 'mfa-challenge-verify', 'mfa-list-factors', 'mfa-unenroll',
  'webauthn-authenticate', 'webauthn-check', 'delete-webauthn-credential', 'verify-tv-token',
  
  // Admin (5)
  'admin-manage-user', 'create-cognito-user', 'disable-cognito-user', 'manage-organizations', 'log-audit',
  
  // Security (restantes)
  'start-security-scan', 'start-compliance-scan', 'get-compliance-scan-status',
  'get-compliance-history', 'well-architected-scan', 'guardduty-scan', 'get-findings', 'get-security-posture',
  'validate-permissions', 'iam-deep-analysis', 'lateral-movement-detection',
  'drift-detection', 'analyze-cloudtrail', 'start-cloudtrail-analysis', 'fetch-cloudtrail',
  
  // WAF (2)
  'waf-setup-monitoring', 'waf-dashboard-api',
  
  // Cost & FinOps (restantes)
  'ri-sp-analyzer', 'get-ri-sp-data', 'cost-optimization', 'budget-forecast', 
  'generate-cost-forecast', 'finops-copilot', 'ml-waste-detection',
  
  // AI & ML (restantes)
  'intelligent-alerts-analyzer', 'predict-incidents', 'detect-anomalies', 'anomaly-detection',
  
  // Dashboard & Monitoring (restantes)
  'get-executive-dashboard-public', 'manage-tv-tokens', 'alerts', 'auto-alerts',
  'check-alert-rules', 'aws-realtime-metrics', 'fetch-cloudwatch-metrics', 'fetch-edge-services', 'endpoint-monitor-check',
  'generate-error-fix-prompt', 'get-platform-metrics', 'get-recent-errors', 'get-lambda-health',
  
  // AWS Credentials (restantes)
  'list-aws-credentials', 'update-aws-credentials',
  
  // Azure Multi-Cloud (21)
  'azure-oauth-initiate', 'azure-oauth-callback', 'azure-oauth-refresh', 'azure-oauth-revoke',
  'validate-azure-credentials', 'save-azure-credentials', 'list-azure-credentials', 'delete-azure-credentials',
  'azure-security-scan', 'start-azure-security-scan', 'azure-defender-scan', 'azure-compliance-scan',
  'azure-well-architected-scan', 'azure-cost-optimization', 'azure-reservations-analyzer', 'azure-fetch-costs',
  'azure-resource-inventory', 'azure-activity-logs', 'azure-fetch-monitor-metrics', 'azure-detect-anomalies',
  'list-cloud-credentials',
  
  // License (6)
  'validate-license', 'configure-license', 'sync-license', 'admin-sync-license', 'manage-seats', 'daily-license-validation',
  
  // Knowledge Base (6)
  'kb-analytics-dashboard', 'kb-ai-suggestions', 'kb-export-pdf', 'increment-article-views',
  'increment-article-helpful', 'track-article-view-detailed',
  
  // Reports (5)
  'generate-pdf-report', 'generate-excel-report', 'generate-security-pdf', 'security-scan-pdf-export', 'generate-remediation-script',
  
  // Data (restantes)
  'mutate-table',
  
  // Organizations (5)
  'create-organization-account', 'sync-organization-accounts', 'check-organization', 'create-with-organization', 'get-user-organization',
  
  // Notifications (3)
  'send-email', 'send-notification', 'get-communication-logs',
  
  // Storage (3)
  'storage-download', 'storage-delete', 'upload-attachment',
  
  // Jobs & System (4)
  'process-background-jobs', 'list-background-jobs', 'execute-scheduled-job', 'scheduled-scan-executor',
  
  // Integrations (1)
  'create-jira-ticket',
  
  // Frontend Error Logging (1)
  'log-frontend-error',
];

// OTIMIZAÇÃO: Cache de padrões de erro (evita recompilar regex)
const ERROR_PATTERNS = {
  errorType: [
    /Error: ([A-Za-z]+Error)/,
    /ERROR: ([A-Za-z\s]+)/,
    /Exception: ([A-Za-z]+Exception)/,
    /"errorType":"([^"]+)"/,
  ],
  statusCode: /\b(4\d{2}|5\d{2})\b/,
  requestId: /RequestId: ([a-f0-9-]+)/i,
};

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  try {
    // Get user and organization ID - use safe extraction for monitoring endpoints
    const claims = event.requestContext.authorizer?.claims || 
                   event.requestContext.authorizer?.jwt?.claims;
    
    if (!claims || !claims.sub) {
      return error('Unauthorized', 401);
    }
    
    const organizationId = claims['custom:organization_id'];
    if (!organizationId) {
      return error('Organization not found', 400);
    }

    // Parse and validate body using centralized validation
    const validation = parseAndValidateBody(querySchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const { limit = 50, hours = 24, source = 'all' } = validation.data;
    const effectiveLimit = limit ?? 50;
    const effectiveHours = hours ?? 24;

    logger.info('Fetching recent errors (OPTIMIZED)', { 
      organizationId, 
      limit: effectiveLimit, 
      hours: effectiveHours, 
      source,
      criticalLambdas: CRITICAL_LAMBDAS.length,
      otherLambdas: OTHER_LAMBDAS.length,
    });

    const now = new Date();
    const startTime = new Date(now.getTime() - effectiveHours * 60 * 60 * 1000);

    const allErrors: any[] = [];

    // Fetch backend errors (Lambda) - priorizar críticas
    if (source === 'all' || source === 'backend') {
      const lambdaErrors = await getLambdaErrorsOptimized(startTime, now, effectiveLimit);
      allErrors.push(...lambdaErrors);
    }

    // Fetch frontend errors
    if (source === 'all' || source === 'frontend') {
      const frontendErrors = await getFrontendErrors(startTime, now, effectiveLimit);
      allErrors.push(...frontendErrors);
    }

    // Sort by timestamp (most recent first) - use numeric comparison for accuracy
    allErrors.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });

    // Limit results
    const limitedErrors = allErrors.slice(0, limit);

    logger.info('Recent errors fetched', { 
      totalFound: allErrors.length, 
      returned: limitedErrors.length,
      mostRecent: limitedErrors[0]?.timestamp,
    });

    return success({
      errors: limitedErrors,
      total: allErrors.length,
      timestamp: now.toISOString(),
    });

  } catch (err) {
    logger.error('Error fetching recent errors', err as Error);
    return error('Failed to fetch recent errors');
  }
}

/**
 * OTIMIZAÇÃO v2: Fetch Lambda errors com priorização e early exit
 */
async function getLambdaErrorsOptimized(startTime: Date, endTime: Date, limit: number): Promise<any[]> {
  const errors: any[] = [];
  const logGroupPrefix = '/aws/lambda/evo-uds-v3-production-';
  
  // OTIMIZAÇÃO: Verificar críticas primeiro, depois outras
  const allLambdas = [...CRITICAL_LAMBDAS, ...OTHER_LAMBDAS];
  
  // OTIMIZAÇÃO: Batch size menor = mais paralelismo = mais rápido
  const batchSize = 10; // Reduzido de 20 para 10
  const batches: string[][] = [];
  
  for (let i = 0; i < allLambdas.length; i += batchSize) {
    batches.push(allLambdas.slice(i, i + batchSize));
  }

  logger.info('Querying Lambda errors (OPTIMIZED)', { 
    totalLambdas: allLambdas.length, 
    batches: batches.length,
    batchSize,
  });

  for (const batch of batches) {
    // OTIMIZAÇÃO: Early exit se já temos erros suficientes
    if (errors.length >= limit) {
      logger.info('Early exit - limit reached', { errors: errors.length });
      break;
    }
    
    const batchPromises = batch.map(async (lambdaName) => {
      try {
        const command = new FilterLogEventsCommand({
          logGroupName: `${logGroupPrefix}${lambdaName}`,
          startTime: startTime.getTime(),
          endTime: endTime.getTime(),
          // Better filter pattern - only real errors, not warnings or info
          filterPattern: '?"[ERROR]" ?"Invoke Error" ?"Runtime.ImportModuleError" ?"PrismaClient" ?"AccessDenied" ?"Task timed out"',
          limit: 3, // OTIMIZAÇÃO: Reduzido de 10 para 3 (menos processamento)
        });

        const response = await cloudwatchLogs.send(command);
        const lambdaErrors: any[] = [];

        if (response.events && response.events.length > 0) {
          for (const event of response.events) {
            const message = event.message || '';
            
            // Skip non-error logs
            if (isNotRealError(message)) {
              continue;
            }
            
            // OTIMIZAÇÃO: Parse mais rápido com cache de patterns
            const errorType = extractErrorTypeFast(message);
            const statusCode = extractStatusCodeFast(message);
            const requestId = extractRequestIdFast(message);

            lambdaErrors.push({
              id: event.eventId || `${lambdaName}-${event.timestamp}`,
              timestamp: new Date(event.timestamp || Date.now()).toISOString(),
              source: 'backend',
              errorType,
              message: cleanErrorMessage(message),
              statusCode,
              lambdaName: `evo-uds-v3-production-${lambdaName}`,
              endpoint: `/api/functions/${lambdaName}`,
              requestId,
            });
          }
        }
        
        return lambdaErrors;
      } catch (err) {
        // Log group may not exist - skip silently
        return [];
      }
    });

    const batchResults = await Promise.all(batchPromises);
    for (const result of batchResults) {
      errors.push(...result);
    }
  }

  return errors;
}

/**
 * Check if message is not a real error (warnings, deprecation notices, etc.)
 */
function isNotRealError(message: string): boolean {
  // OTIMIZAÇÃO: Checks mais rápidos primeiro (indexOf é mais rápido que includes)
  
  // Skip INFO logs
  if (message.indexOf('[INFO]') !== -1 && message.indexOf('[ERROR]') === -1) {
    return true;
  }
  
  // Skip deprecation warnings
  if (message.indexOf('Deprecation') !== -1) {
    return true;
  }
  
  // Skip START/END/REPORT logs unless they contain error info
  const firstChar = message[0];
  if ((firstChar === 'S' || firstChar === 'E' || firstChar === 'R') 
      && message.indexOf('Error') === -1 && message.indexOf('error') === -1) {
    return true;
  }
  
  // Skip INIT_START logs
  if (message.indexOf('INIT_START') !== -1) {
    return true;
  }
  
  return false;
}

/**
 * OTIMIZAÇÃO: Clean error message mais rápido
 */
function cleanErrorMessage(message: string): string {
  // Remove timestamp prefix if present (indexOf é mais rápido que regex)
  let cleaned = message;
  
  const timestampEnd = message.indexOf('Z\t');
  if (timestampEnd !== -1) {
    cleaned = message.substring(timestampEnd + 2);
  }
  
  // Remove log level prefix
  if (cleaned.startsWith('ERROR ')) cleaned = cleaned.substring(6);
  else if (cleaned.startsWith('INFO ')) cleaned = cleaned.substring(5);
  else if (cleaned.startsWith('WARN ')) cleaned = cleaned.substring(5);
  
  // Limit length
  if (cleaned.length > 500) {
    cleaned = cleaned.substring(0, 500) + '...';
  }
  
  return cleaned.trim();
}

async function getFrontendErrors(startTime: Date, endTime: Date, limit: number) {
  const errors: any[] = [];

  try {
    const command = new FilterLogEventsCommand({
      logGroupName: '/aws/lambda/evo-uds-v3-production-log-frontend-error',
      startTime: startTime.getTime(),
      endTime: endTime.getTime(),
      filterPattern: '"errorType"',
      limit: Math.min(limit, 50), // OTIMIZAÇÃO: Limitar frontend errors
    });

    const response = await cloudwatchLogs.send(command);

    if (response.events && response.events.length > 0) {
      for (const event of response.events) {
        try {
          const message = event.message || '';
          const parsed = JSON.parse(message);

          errors.push({
            id: event.eventId || `frontend-${event.timestamp}`,
            timestamp: new Date(event.timestamp || Date.now()).toISOString(),
            source: 'frontend',
            errorType: parsed.errorType || 'Unknown',
            message: parsed.message || parsed.errorMessage || message.substring(0, 500),
            statusCode: parsed.statusCode,
            userId: parsed.userId,
            organizationId: parsed.organizationId,
            userAgent: parsed.userAgent,
            ipAddress: parsed.ipAddress,
            url: parsed.url,
          });
        } catch (parseErr) {
          // If not JSON, use raw message
          errors.push({
            id: event.eventId || `frontend-${event.timestamp}`,
            timestamp: new Date(event.timestamp || Date.now()).toISOString(),
            source: 'frontend',
            errorType: 'Parse Error',
            message: event.message?.substring(0, 500) || 'Unknown error',
          });
        }
      }
    }
  } catch (err) {
    logger.error('Error fetching frontend errors', err as Error);
  }

  return errors;
}

/**
 * OTIMIZAÇÃO: Extract error type usando cache de patterns
 */
function extractErrorTypeFast(message: string): string {
  // Try cached patterns
  for (const pattern of ERROR_PATTERNS.errorType) {
    const match = message.match(pattern);
    if (match) {
      return match[1];
    }
  }

  // Fast string checks (indexOf é mais rápido que includes)
  if (message.indexOf('Cannot find module') !== -1) return 'Runtime.ImportModuleError';
  if (message.indexOf('PrismaClient') !== -1) return 'PrismaClientInitializationError';
  if (message.indexOf('timeout') !== -1) return 'Lambda Timeout';
  if (message.indexOf('502') !== -1) return 'Bad Gateway';
  if (message.indexOf('500') !== -1) return 'Internal Server Error';

  return 'Unknown Error';
}

/**
 * OTIMIZAÇÃO: Extract status code usando cache de pattern
 */
function extractStatusCodeFast(message: string): number | undefined {
  const match = message.match(ERROR_PATTERNS.statusCode);
  return match ? parseInt(match[1]) : undefined;
}

/**
 * OTIMIZAÇÃO: Extract request ID usando cache de pattern
 */
function extractRequestIdFast(message: string): string | undefined {
  const match = message.match(ERROR_PATTERNS.requestId);
  return match ? match[1] : undefined;
}
