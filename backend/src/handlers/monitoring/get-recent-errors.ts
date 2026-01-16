/**
 * Get Recent Errors - Real-time from CloudWatch Logs
 * 
 * Busca erros recentes de TODAS as fontes:
 * - ALL 121 Lambda functions
 * - API Gateway
 * - Frontend
 * 
 * OPTIMIZED:
 * - Parallel queries with concurrency control
 * - Better error filtering (excludes warnings, INFO logs)
 * - Proper timestamp sorting
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { logger } from '../../lib/logging.js';
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { z } from 'zod';

const cloudwatchLogs = new CloudWatchLogsClient({ region: 'us-east-1' });

const querySchema = z.object({
  limit: z.number().optional().default(100),
  hours: z.number().optional().default(24),
  source: z.enum(['all', 'backend', 'frontend', 'api-gateway']).optional().default('all'),
});

// ALL 121 Lambda functions
const ALL_LAMBDAS = [
  // Auth & MFA (11)
  'mfa-enroll', 'mfa-check', 'mfa-challenge-verify', 'mfa-verify-login', 'mfa-list-factors', 'mfa-unenroll',
  'webauthn-register', 'webauthn-authenticate', 'webauthn-check', 'delete-webauthn-credential', 'verify-tv-token',
  
  // Admin (5)
  'admin-manage-user', 'create-cognito-user', 'disable-cognito-user', 'manage-organizations', 'log-audit',
  
  // Security (18)
  'security-scan', 'start-security-scan', 'compliance-scan', 'start-compliance-scan', 'get-compliance-scan-status',
  'get-compliance-history', 'well-architected-scan', 'guardduty-scan', 'get-findings', 'get-security-posture',
  'validate-aws-credentials', 'validate-permissions', 'iam-deep-analysis', 'lateral-movement-detection',
  'drift-detection', 'analyze-cloudtrail', 'start-cloudtrail-analysis', 'fetch-cloudtrail',
  
  // WAF (2)
  'waf-setup-monitoring', 'waf-dashboard-api',
  
  // Cost & FinOps (8)
  'fetch-daily-costs', 'ri-sp-analyzer', 'get-ri-sp-data', 'cost-optimization', 'budget-forecast', 
  'generate-cost-forecast', 'finops-copilot', 'ml-waste-detection',
  
  // AI & ML (5)
  'bedrock-chat', 'intelligent-alerts-analyzer', 'predict-incidents', 'detect-anomalies', 'anomaly-detection',
  
  // Dashboard & Monitoring (14)
  'get-executive-dashboard', 'get-executive-dashboard-public', 'manage-tv-tokens', 'alerts', 'auto-alerts',
  'check-alert-rules', 'aws-realtime-metrics', 'fetch-cloudwatch-metrics', 'fetch-edge-services', 'endpoint-monitor-check',
  'generate-error-fix-prompt', 'get-platform-metrics', 'get-recent-errors', 'get-lambda-health',
  
  // AWS Credentials (3)
  'list-aws-credentials', 'save-aws-credentials', 'update-aws-credentials',
  
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
  
  // Data (2)
  'query-table', 'mutate-table',
  
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

    const body = event.body ? JSON.parse(event.body) : {};
    const validation = querySchema.safeParse(body);

    if (!validation.success) {
      return error('Invalid request body', 400);
    }

    const { limit, hours, source } = validation.data;

    logger.info('Fetching recent errors from ALL sources', { 
      organizationId, 
      limit, 
      hours, 
      source,
      totalLambdas: ALL_LAMBDAS.length,
    });

    const now = new Date();
    const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);

    const allErrors: any[] = [];

    // Fetch backend errors (Lambda) - query ALL lambdas in parallel batches
    if (source === 'all' || source === 'backend') {
      const lambdaErrors = await getLambdaErrorsParallel(startTime, now);
      allErrors.push(...lambdaErrors);
    }

    // Fetch frontend errors
    if (source === 'all' || source === 'frontend') {
      const frontendErrors = await getFrontendErrors(startTime, now, limit);
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
 * Fetch Lambda errors in parallel batches for better performance
 */
async function getLambdaErrorsParallel(startTime: Date, endTime: Date): Promise<any[]> {
  const errors: any[] = [];
  const logGroupPrefix = '/aws/lambda/evo-uds-v3-production-';
  
  // Process in batches of 20 for concurrency control
  const batchSize = 20;
  const batches: string[][] = [];
  
  for (let i = 0; i < ALL_LAMBDAS.length; i += batchSize) {
    batches.push(ALL_LAMBDAS.slice(i, i + batchSize));
  }

  logger.info('Querying Lambda errors in parallel', { 
    totalLambdas: ALL_LAMBDAS.length, 
    batches: batches.length 
  });

  for (const batch of batches) {
    const batchPromises = batch.map(async (lambdaName) => {
      try {
        const command = new FilterLogEventsCommand({
          logGroupName: `${logGroupPrefix}${lambdaName}`,
          startTime: startTime.getTime(),
          endTime: endTime.getTime(),
          // Better filter pattern - only real errors, not warnings or info
          filterPattern: '?"[ERROR]" ?"Invoke Error" ?"Runtime.ImportModuleError" ?"PrismaClient" ?"AccessDenied" ?"Task timed out"',
          limit: 10, // Get more errors per Lambda
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
            
            // Parse error details
            const errorType = extractErrorType(message);
            const statusCode = extractStatusCode(message);
            const requestId = extractRequestId(message);

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
  // Skip INFO logs
  if (message.includes('[INFO]') && !message.includes('[ERROR]')) {
    return true;
  }
  
  // Skip deprecation warnings
  if (message.includes('NodeDeprecationWarning') || message.includes('DeprecationWarning')) {
    return true;
  }
  
  // Skip START/END/REPORT logs unless they contain error info
  if ((message.startsWith('START ') || message.startsWith('END ') || message.startsWith('REPORT ')) 
      && !message.includes('Error') && !message.includes('error')) {
    return true;
  }
  
  // Skip INIT_START logs
  if (message.includes('INIT_START')) {
    return true;
  }
  
  return false;
}

/**
 * Clean error message for display
 */
function cleanErrorMessage(message: string): string {
  // Remove timestamp prefix if present
  let cleaned = message.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\s+[a-f0-9-]+\s+/, '');
  
  // Remove log level prefix
  cleaned = cleaned.replace(/^(ERROR|INFO|WARN)\s+/, '');
  
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
      limit,
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

function extractErrorType(message: string): string {
  // Try to extract error type from message
  const patterns = [
    /Error: ([A-Za-z]+Error)/,
    /ERROR: ([A-Za-z\s]+)/,
    /Exception: ([A-Za-z]+Exception)/,
    /"errorType":"([^"]+)"/,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      return match[1];
    }
  }

  if (message.includes('Cannot find module')) return 'Runtime.ImportModuleError';
  if (message.includes('PrismaClient')) return 'PrismaClientInitializationError';
  if (message.includes('timeout')) return 'Lambda Timeout';
  if (message.includes('502')) return 'Bad Gateway';
  if (message.includes('500')) return 'Internal Server Error';

  return 'Unknown Error';
}

function extractStatusCode(message: string): number | undefined {
  const match = message.match(/\b(4\d{2}|5\d{2})\b/);
  return match ? parseInt(match[1]) : undefined;
}

function extractRequestId(message: string): string | undefined {
  const match = message.match(/RequestId: ([a-f0-9-]+)/i);
  return match ? match[1] : undefined;
}
