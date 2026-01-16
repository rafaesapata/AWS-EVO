/**
 * Get Recent Errors - Real-time from CloudWatch Logs
 * 
 * Busca erros recentes de todas as fontes:
 * - Lambda functions (114)
 * - API Gateway
 * - Frontend
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { logger } from '../../lib/logging.js';
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { z } from 'zod';

const cloudwatchLogs = new CloudWatchLogsClient({ region: 'us-east-1' });

const querySchema = z.object({
  limit: z.number().optional().default(50),
  hours: z.number().optional().default(24),
  source: z.enum(['all', 'backend', 'frontend', 'api-gateway']).optional().default('all'),
});

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  try {
    // Get user and organization ID - use safe extraction for monitoring endpoints
    // that don't need strict email validation
    const claims = event.requestContext.authorizer?.claims || 
                   event.requestContext.authorizer?.jwt?.claims;
    
    if (!claims || !claims.sub) {
      return error('Unauthorized', 401);
    }
    
    // Get organization ID from claims
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

    logger.info('Fetching recent errors', { organizationId, limit, hours, source });

    const now = new Date();
    const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);

    const errors: any[] = [];

    // Fetch backend errors (Lambda)
    if (source === 'all' || source === 'backend') {
      const lambdaErrors = await getLambdaErrors(startTime, now, limit);
      errors.push(...lambdaErrors);
    }

    // Fetch frontend errors
    if (source === 'all' || source === 'frontend') {
      const frontendErrors = await getFrontendErrors(startTime, now, limit);
      errors.push(...frontendErrors);
    }

    // Sort by timestamp (most recent first)
    errors.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Limit results
    const limitedErrors = errors.slice(0, limit);

    return success({
      errors: limitedErrors,
      total: errors.length,
      timestamp: now.toISOString(),
    });

  } catch (err) {
    logger.error('Error fetching recent errors', err as Error);
    return error('Failed to fetch recent errors');
  }
}

async function getLambdaErrors(startTime: Date, endTime: Date, limit: number) {
  const errors: any[] = [];

  try {
    // Query ALL Lambda log groups, not just critical ones
    const logGroupPrefix = '/aws/lambda/evo-uds-v3-production-';
    
    // Get list of all Lambda functions
    const allLambdas = [
      // Onboarding
      'save-aws-credentials',
      'validate-aws-credentials',
      'save-azure-credentials',
      'validate-azure-credentials',
      'update-aws-credentials',
      'list-aws-credentials',
      'list-azure-credentials',
      'delete-azure-credentials',
      'list-cloud-credentials',
      
      // Security
      'security-scan',
      'start-security-scan',
      'compliance-scan',
      'start-compliance-scan',
      'get-compliance-scan-status',
      'get-compliance-history',
      'well-architected-scan',
      'guardduty-scan',
      'get-findings',
      'get-security-posture',
      'validate-permissions',
      'iam-deep-analysis',
      'lateral-movement-detection',
      'drift-detection',
      'analyze-cloudtrail',
      'start-cloudtrail-analysis',
      'fetch-cloudtrail',
      
      // WAF
      'waf-setup-monitoring',
      'waf-dashboard-api',
      
      // Auth & MFA
      'mfa-enroll',
      'mfa-check',
      'mfa-challenge-verify',
      'mfa-verify-login',
      'mfa-list-factors',
      'mfa-unenroll',
      'webauthn-register',
      'webauthn-authenticate',
      'webauthn-check',
      'delete-webauthn-credential',
      'verify-tv-token',
      
      // Admin
      'admin-manage-user',
      'create-cognito-user',
      'disable-cognito-user',
      'manage-organizations',
      'log-audit',
      
      // Cost & FinOps
      'fetch-daily-costs',
      'ri-sp-analyzer',
      'analyze-ri-sp',
      'cost-optimization',
      'budget-forecast',
      'generate-cost-forecast',
      'finops-copilot',
      'ml-waste-detection',
      'get-ri-sp-analysis',
      
      // AI
      'bedrock-chat',
      'intelligent-alerts-analyzer',
      'predict-incidents',
      'detect-anomalies',
      'anomaly-detection',
      
      // Dashboard & Monitoring
      'get-executive-dashboard',
      'get-executive-dashboard-public',
      'manage-tv-tokens',
      'alerts',
      'auto-alerts',
      'check-alert-rules',
      'aws-realtime-metrics',
      'fetch-cloudwatch-metrics',
      'fetch-edge-services',
      'endpoint-monitor-check',
      'generate-error-fix-prompt',
      'get-platform-metrics',
      'get-recent-errors',
      'get-lambda-health',
      
      // Data
      'query-table',
      'mutate-table',
      
      // Organizations
      'create-organization-account',
      'sync-organization-accounts',
      'check-organization',
      'create-with-organization',
      'get-user-organization',
      
      // Notifications
      'send-email',
      'send-notification',
      'get-communication-logs',
      
      // Storage
      'storage-download',
      'storage-delete',
      'upload-attachment',
      
      // Jobs
      'process-background-jobs',
      'list-background-jobs',
      'execute-scheduled-job',
      'scheduled-scan-executor',
      
      // License
      'validate-license',
      'configure-license',
      'sync-license',
      'admin-sync-license',
      'manage-seats',
      'daily-license-validation',
      
      // Reports
      'generate-pdf-report',
      'generate-excel-report',
      'generate-security-pdf',
      'security-scan-pdf-export',
      'generate-remediation-script',
      
      // KB
      'kb-analytics-dashboard',
      'kb-ai-suggestions',
      'kb-export-pdf',
      'increment-article-views',
      'increment-article-helpful',
      'track-article-view-detailed',
      
      // Integrations
      'create-jira-ticket',
      
      // Azure Multi-Cloud
      'azure-oauth-initiate',
      'azure-oauth-callback',
      'azure-oauth-refresh',
      'azure-oauth-revoke',
      'azure-security-scan',
      'start-azure-security-scan',
      'azure-defender-scan',
      'azure-compliance-scan',
      'azure-well-architected-scan',
      'azure-cost-optimization',
      'azure-reservations-analyzer',
      'azure-fetch-costs',
      'azure-resource-inventory',
      'azure-activity-logs',
      'azure-fetch-monitor-metrics',
      'azure-detect-anomalies',
    ];

    // Query each Lambda (limit to prevent timeout)
    const lambdasToQuery = allLambdas.slice(0, 50); // Query first 50 to avoid timeout
    
    for (const lambdaName of lambdasToQuery) {
      try {
        const command = new FilterLogEventsCommand({
          logGroupName: `${logGroupPrefix}${lambdaName}`,
          startTime: startTime.getTime(),
          endTime: endTime.getTime(),
          filterPattern: '?ERROR ?Error ?error ?502 ?500 ?AccessDenied ?timeout',
          limit: 5, // Limit per Lambda to get variety
        });

        const response = await cloudwatchLogs.send(command);

        if (response.events && response.events.length > 0) {
          for (const event of response.events) {
            const message = event.message || '';
            
            // Skip INFO logs that contain "ERROR" in message
            if (message.includes('[INFO]') && !message.includes('[ERROR]')) {
              continue;
            }
            
            // Parse error details
            const errorType = extractErrorType(message);
            const statusCode = extractStatusCode(message);
            const requestId = extractRequestId(message);

            errors.push({
              id: event.eventId || `${lambdaName}-${event.timestamp}`,
              timestamp: new Date(event.timestamp || Date.now()).toISOString(),
              source: 'backend',
              errorType,
              message: message.substring(0, 500), // Limit message length
              statusCode,
              lambdaName: `evo-uds-v3-production-${lambdaName}`,
              endpoint: `/api/functions/${lambdaName}`,
              requestId,
            });
          }
        }
      } catch (err) {
        // Log group may not exist or no permissions - skip
        continue;
      }
    }
  } catch (err) {
    logger.error('Error fetching Lambda errors', err as Error);
  }

  return errors;
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
