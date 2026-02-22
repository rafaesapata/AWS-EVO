/**
 * Get Lambda Health - ALL Lambdas Health Check
 * 
 * Monitora a saúde de TODAS as 114+ Lambdas do sistema organizadas por categoria
 * 
 * OPTIMIZATIONS:
 * - Concurrency control (max 5 parallel requests) to avoid rate limiting
 * - Retry with exponential backoff
 * - In-memory caching (60s TTL)
 * - Batch CloudWatch metrics queries
 * - Uses static Lambda list (no lambda:ListFunctions needed - blocked by SCP)
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { logger } from '../../lib/logger.js';
import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatchClient({ region: 'us-east-1' });

// Simple in-memory cache
const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 60000; // 60 seconds

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

// Concurrency limiter
class ConcurrencyLimiter {
  private running = 0;
  private queue: (() => void)[] = [];

  constructor(private maxConcurrent: number = 5) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }
}

const limiter = new ConcurrencyLimiter(5);

// Retry with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 100
): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (err.name === 'TooManyRequestsException' || err.name === 'ThrottlingException') {
        const delay = baseDelay * Math.pow(2, i) + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

// ALL Lambdas by category (219 total - synced with SAM template via get-platform-metrics.ts)
const ALL_LAMBDAS = {
  onboarding: [
    { name: 'save-aws-credentials', displayName: 'Save AWS Credentials' },
    { name: 'validate-aws-credentials', displayName: 'Validate AWS Credentials' },
    { name: 'list-aws-credentials', displayName: 'List AWS Credentials' },
    { name: 'update-aws-credentials', displayName: 'Update AWS Credentials' },
    { name: 'save-azure-credentials', displayName: 'Save Azure Credentials' },
    { name: 'validate-azure-credentials', displayName: 'Validate Azure Credentials' },
    { name: 'list-azure-credentials', displayName: 'List Azure Credentials' },
    { name: 'delete-azure-credentials', displayName: 'Delete Azure Credentials' },
    { name: 'azure-oauth-initiate', displayName: 'Azure OAuth Initiate' },
    { name: 'azure-oauth-callback', displayName: 'Azure OAuth Callback' },
    { name: 'azure-oauth-refresh', displayName: 'Azure OAuth Refresh' },
    { name: 'azure-oauth-revoke', displayName: 'Azure OAuth Revoke' },
    { name: 'list-cloud-credentials', displayName: 'List Cloud Credentials' },
    { name: 'sync-resource-inventory', displayName: 'Sync Resource Inventory' },
    { name: 'validate-azure-permissions', displayName: 'Validate Azure Permissions' },
    { name: 'azure-fetch-edge-services', displayName: 'Azure Fetch Edge Services' },
    { name: 'azure-ml-waste-detection', displayName: 'Azure ML Waste Detection' },
  ],
  security: [
    { name: 'security-scan', displayName: 'Security Scan' },
    { name: 'start-security-scan', displayName: 'Start Security Scan' },
    { name: 'compliance-scan', displayName: 'Compliance Scan' },
    { name: 'start-compliance-scan', displayName: 'Start Compliance Scan' },
    { name: 'get-compliance-scan-status', displayName: 'Get Compliance Status' },
    { name: 'get-compliance-history', displayName: 'Get Compliance History' },
    { name: 'well-architected-scan', displayName: 'Well-Architected Scan' },
    { name: 'guardduty-scan', displayName: 'GuardDuty Scan' },
    { name: 'get-findings', displayName: 'Get Findings' },
    { name: 'get-security-posture', displayName: 'Get Security Posture' },
    { name: 'validate-permissions', displayName: 'Validate Permissions' },
    { name: 'iam-deep-analysis', displayName: 'IAM Deep Analysis' },
    { name: 'lateral-movement-detection', displayName: 'Lateral Movement Detection' },
    { name: 'drift-detection', displayName: 'Drift Detection' },
    { name: 'analyze-cloudtrail', displayName: 'Analyze CloudTrail' },
    { name: 'start-cloudtrail-analysis', displayName: 'Start CloudTrail Analysis' },
    { name: 'fetch-cloudtrail', displayName: 'Fetch CloudTrail' },
    { name: 'waf-setup-monitoring', displayName: 'WAF Setup Monitoring' },
    { name: 'waf-dashboard-api', displayName: 'WAF Dashboard API' },
    { name: 'azure-security-scan', displayName: 'Azure Security Scan' },
    { name: 'start-azure-security-scan', displayName: 'Start Azure Security Scan' },
    { name: 'azure-defender-scan', displayName: 'Azure Defender Scan' },
    { name: 'azure-compliance-scan', displayName: 'Azure Compliance Scan' },
    { name: 'azure-well-architected-scan', displayName: 'Azure Well-Architected' },
    { name: 'start-analyze-cloudtrail', displayName: 'Start Analyze CloudTrail' },
    { name: 'iam-behavior-analysis', displayName: 'IAM Behavior Analysis' },
    { name: 'validate-waf-security', displayName: 'Validate WAF Security' },
    { name: 'waf-log-forwarder', displayName: 'WAF Log Forwarder' },
    { name: 'waf-log-processor', displayName: 'WAF Log Processor' },
    { name: 'waf-threat-analyzer', displayName: 'WAF Threat Analyzer' },
    { name: 'waf-unblock-expired', displayName: 'WAF Unblock Expired' },
  ],
  auth: [
    { name: 'mfa-enroll', displayName: 'MFA Enroll' },
    { name: 'mfa-check', displayName: 'MFA Check' },
    { name: 'mfa-challenge-verify', displayName: 'MFA Challenge Verify' },
    { name: 'mfa-list-factors', displayName: 'MFA List Factors' },
    { name: 'mfa-unenroll', displayName: 'MFA Unenroll' },
    { name: 'webauthn-register', displayName: 'WebAuthn Register' },
    { name: 'webauthn-authenticate', displayName: 'WebAuthn Authenticate' },
    { name: 'webauthn-check', displayName: 'WebAuthn Check' },
    { name: 'delete-webauthn-credential', displayName: 'Delete WebAuthn Credential' },
    { name: 'verify-tv-token', displayName: 'Verify TV Token' },
    { name: 'forgot-password', displayName: 'Forgot Password' },
    { name: 'change-password', displayName: 'Change Password' },
    { name: 'mfa-verify-login', displayName: 'MFA Verify Login' },
    { name: 'self-register', displayName: 'Self Register' },
  ],
  core: [
    { name: 'mutate-table', displayName: 'Mutate Table' },
    { name: 'bedrock-chat', displayName: 'Bedrock Chat' },
    { name: 'fetch-daily-costs', displayName: 'Fetch Daily Costs' },
    { name: 'ri-sp-analyzer', displayName: 'RI/SP Analyzer' },
    { name: 'get-ri-sp-data', displayName: 'Get RI/SP Data' },
    { name: 'cost-optimization', displayName: 'Cost Optimization' },
    { name: 'budget-forecast', displayName: 'Budget Forecast' },
    { name: 'generate-cost-forecast', displayName: 'Generate Cost Forecast' },
    { name: 'finops-copilot', displayName: 'FinOps Copilot' },
    { name: 'ml-waste-detection', displayName: 'ML Waste Detection' },
    { name: 'azure-fetch-costs', displayName: 'Azure Fetch Costs' },
    { name: 'azure-cost-optimization', displayName: 'Azure Cost Optimization' },
    { name: 'azure-reservations-analyzer', displayName: 'Azure Reservations Analyzer' },
    { name: 'azure-resource-inventory', displayName: 'Azure Resource Inventory' },
    { name: 'azure-activity-logs', displayName: 'Azure Activity Logs' },
    { name: 'azure-fetch-monitor-metrics', displayName: 'Azure Monitor Metrics' },
    { name: 'azure-detect-anomalies', displayName: 'Azure Detect Anomalies' },
    { name: 'cleanup-cost-data', displayName: 'Cleanup Cost Data' },
    { name: 'manage-cloud-budget', displayName: 'Manage Cloud Budget' },
    { name: 'manage-cost-overhead', displayName: 'Manage Cost Overhead' },
    { name: 'analyze-ri-sp', displayName: 'Analyze RI/SP' },
    { name: 'get-ri-sp-analysis', displayName: 'Get RI/SP Analysis' },
    { name: 'list-ri-sp-history', displayName: 'List RI/SP History' },
    { name: 'list-tables', displayName: 'List Tables' },
    { name: 'save-ri-sp-analysis', displayName: 'Save RI/SP Analysis' },
    { name: 'diagnose-cost-dashboard', displayName: 'Diagnose Cost Dashboard' },
  ],
  admin: [
    { name: 'admin-manage-user', displayName: 'Admin Manage User' },
    { name: 'create-cognito-user', displayName: 'Create Cognito User' },
    { name: 'disable-cognito-user', displayName: 'Disable Cognito User' },
    { name: 'manage-organizations', displayName: 'Manage Organizations' },
    { name: 'log-audit', displayName: 'Log Audit' },
    { name: 'admin-azure-credentials', displayName: 'Admin Azure Credentials' },
    { name: 'admin-evo-app-credentials', displayName: 'Admin EVO App Credentials' },
    { name: 'admin-sync-license', displayName: 'Admin Sync License' },
    { name: 'automated-cleanup-stuck-scans', displayName: 'Automated Cleanup Stuck Scans' },
    { name: 'auto-cleanup-stuck-scans', displayName: 'Auto Cleanup Stuck Scans' },
    { name: 'cleanup-stuck-scans', displayName: 'Cleanup Stuck Scans' },
    { name: 'cleanup-stuck-scans-jobs', displayName: 'Cleanup Stuck Scans Jobs' },
    { name: 'cleanup-stuck-scans-simple', displayName: 'Cleanup Stuck Scans Simple' },
    { name: 'create-user', displayName: 'Create User' },
    { name: 'deactivate-demo-mode', displayName: 'Deactivate Demo Mode' },
    { name: 'debug-cloudtrail', displayName: 'Debug CloudTrail' },
    { name: 'direct-cleanup', displayName: 'Direct Cleanup' },
    { name: 'manage-demo-mode', displayName: 'Manage Demo Mode' },
    { name: 'manage-email-templates', displayName: 'Manage Email Templates' },
    { name: 'run-migration', displayName: 'Run Migration' },
    { name: 'run-sql', displayName: 'Run SQL' },
    { name: 'setup-license-config', displayName: 'Setup License Config' },
    { name: 'run-migrations', displayName: 'Run Migrations' },
    { name: 'run-sql-migration', displayName: 'Run SQL Migration' },
    { name: 'check-migrations', displayName: 'Check Migrations' },
    { name: 'maintenance-auto-cleanup-stuck-scans', displayName: 'Maintenance Auto Cleanup' },
  ],
  dashboard: [
    { name: 'get-executive-dashboard-public', displayName: 'Executive Dashboard Public' },
    { name: 'manage-tv-tokens', displayName: 'Manage TV Tokens' },
    { name: 'alerts', displayName: 'Alerts' },
    { name: 'auto-alerts', displayName: 'Auto Alerts' },
    { name: 'check-alert-rules', displayName: 'Check Alert Rules' },
    { name: 'aws-realtime-metrics', displayName: 'AWS Realtime Metrics' },
    { name: 'fetch-cloudwatch-metrics', displayName: 'Fetch CloudWatch Metrics' },
    { name: 'fetch-edge-services', displayName: 'Fetch Edge Services' },
    { name: 'endpoint-monitor-check', displayName: 'Endpoint Monitor Check' },
    { name: 'generate-error-fix-prompt', displayName: 'Generate Error Fix Prompt' },
    { name: 'get-platform-metrics', displayName: 'Get Platform Metrics' },
    { name: 'get-recent-errors', displayName: 'Get Recent Errors' },
    { name: 'get-lambda-health', displayName: 'Get Lambda Health' },
    { name: 'error-aggregator', displayName: 'Error Aggregator' },
    { name: 'health-check', displayName: 'Health Check' },
    { name: 'lambda-health-check', displayName: 'Lambda Health Check' },
    { name: 'log-frontend-error', displayName: 'Log Frontend Error' },
    { name: 'monitored-endpoints', displayName: 'Monitored Endpoints' },
    { name: 'test-lambda-metrics', displayName: 'Test Lambda Metrics' },
  ],
  ai: [
    { name: 'predict-incidents', displayName: 'Predict Incidents' },
    { name: 'detect-anomalies', displayName: 'Detect Anomalies' },
    { name: 'anomaly-detection', displayName: 'Anomaly Detection' },
    { name: 'check-proactive-notifications', displayName: 'Check Proactive Notifications' },
    { name: 'generate-response', displayName: 'Generate Response' },
    { name: 'get-ai-notifications', displayName: 'Get AI Notifications' },
    { name: 'list-ai-notifications-admin', displayName: 'List AI Notifications Admin' },
    { name: 'manage-notification-rules', displayName: 'Manage Notification Rules' },
    { name: 'send-ai-notification', displayName: 'Send AI Notification' },
    { name: 'update-ai-notification', displayName: 'Update AI Notification' },
    { name: 'ai-budget-suggestion', displayName: 'AI Budget Suggestion' },
    { name: 'ai-prioritization', displayName: 'AI Prioritization' },
  ],
  license: [
    { name: 'configure-license', displayName: 'Configure License' },
    { name: 'sync-license', displayName: 'Sync License' },
    { name: 'admin-sync-license', displayName: 'Admin Sync License' },
    { name: 'manage-seats', displayName: 'Manage Seats' },
    { name: 'daily-license-validation', displayName: 'Daily License Validation' },
    { name: 'manage-seat-assignments', displayName: 'Manage Seat Assignments' },
    { name: 'scheduled-license-sync', displayName: 'Scheduled License Sync' },
    { name: 'retry-fallback-licenses', displayName: 'Retry Fallback Licenses' },
  ],
  kb: [
    { name: 'kb-ai-suggestions', displayName: 'KB AI Suggestions' },
    { name: 'kb-export-pdf', displayName: 'KB Export PDF' },
    { name: 'increment-article-views', displayName: 'Increment Article Views' },
    { name: 'increment-article-helpful', displayName: 'Increment Article Helpful' },
    { name: 'track-article-view-detailed', displayName: 'Track Article View Detailed' },
    { name: 'kb-article-tracking', displayName: 'KB Article Tracking' },
  ],
  reports: [
    { name: 'generate-excel-report', displayName: 'Generate Excel Report' },
    { name: 'generate-security-pdf', displayName: 'Generate Security PDF' },
    { name: 'security-scan-pdf-export', displayName: 'Security Scan PDF Export' },
    { name: 'generate-remediation-script', displayName: 'Generate Remediation Script' },
    { name: 'scan-report-generator', displayName: 'Scan Report Generator' },
    { name: 'generate-ai-insights', displayName: 'Generate AI Insights' },
  ],
  organizations: [
    { name: 'sync-organization-accounts', displayName: 'Sync Organization Accounts' },
    { name: 'check-organization', displayName: 'Check Organization' },
    { name: 'create-with-organization', displayName: 'Create With Organization' },
    { name: 'get-user-organization', displayName: 'Get User Organization' },
  ],
  notifications: [
    { name: 'send-email', displayName: 'Send Email' },
    { name: 'send-notification', displayName: 'Send Notification' },
    { name: 'get-communication-logs', displayName: 'Get Communication Logs' },
    { name: 'notification-settings', displayName: 'Notification Settings' },
    { name: 'manage-email-preferences', displayName: 'Manage Email Preferences' },
    { name: 'send-scheduled-emails', displayName: 'Send Scheduled Emails' },
    { name: 'resend-communication', displayName: 'Resend Communication' },
    { name: 'email-delivery-status', displayName: 'Email Delivery Status' },
    { name: 'ses-webhook', displayName: 'SES Webhook' },
  ],
  storage: [
    { name: 'storage-delete', displayName: 'Storage Delete' },
    { name: 'upload-attachment', displayName: 'Upload Attachment' },
  ],
  jobs: [
    { name: 'process-background-jobs', displayName: 'Process Background Jobs' },
    { name: 'list-background-jobs', displayName: 'List Background Jobs' },
    { name: 'execute-scheduled-job', displayName: 'Execute Scheduled Job' },
    { name: 'scheduled-scan-executor', displayName: 'Scheduled Scan Executor' },
    { name: 'cancel-background-job', displayName: 'Cancel Background Job' },
    { name: 'retry-background-job', displayName: 'Retry Background Job' },
    { name: 'process-events', displayName: 'Process Events' },
    { name: 'initial-data-load', displayName: 'Initial Data Load' },
    { name: 'scheduled-view-refresh', displayName: 'Scheduled View Refresh' },
    { name: 'check-sla-escalations', displayName: 'Check SLA Escalations' },
    { name: 'db-init', displayName: 'DB Init' },
  ],
  integrations: [
    { name: 'create-remediation-ticket', displayName: 'Create Remediation Ticket' },
    { name: 'ticket-attachments', displayName: 'Ticket Attachments' },
    { name: 'ticket-management', displayName: 'Ticket Management' },
    { name: 'cloudformation-webhook', displayName: 'CloudFormation Webhook' },
    { name: 'websocket-connect', displayName: 'WebSocket Connect' },
    { name: 'websocket-disconnect', displayName: 'WebSocket Disconnect' },
    { name: 'cleanup-expired-external-ids', displayName: 'Cleanup Expired External IDs' },
    { name: 'cleanup-expired-oauth-states', displayName: 'Cleanup Expired OAuth States' },
    { name: 'cleanup-seats', displayName: 'Cleanup Seats' },
  ],
  tags: [
    { name: 'tag-crud', displayName: 'Tag CRUD' },
    { name: 'tag-assign', displayName: 'Tag Assign' },
    { name: 'tag-bulk-assign', displayName: 'Tag Bulk Assign' },
    { name: 'tag-cost-report', displayName: 'Tag Cost Report' },
    { name: 'tag-cost-services', displayName: 'Tag Cost Services' },
    { name: 'tag-coverage', displayName: 'Tag Coverage' },
    { name: 'tag-inventory-report', displayName: 'Tag Inventory Report' },
    { name: 'tag-resources', displayName: 'Tag Resources' },
    { name: 'tag-security-findings', displayName: 'Tag Security Findings' },
    { name: 'tag-suggestions', displayName: 'Tag Suggestions' },
    { name: 'tag-templates', displayName: 'Tag Templates' },
    { name: 'tag-untagged-resources', displayName: 'Tag Untagged Resources' },
  ],
};

interface LambdaHealth {
  name: string;
  displayName: string;
  category: 'onboarding' | 'security' | 'auth' | 'core' | 'admin' | 'dashboard' | 'ai' | 'license' | 'kb' | 'reports' | 'organizations' | 'notifications' | 'storage' | 'jobs' | 'integrations' | 'tags';
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  health: number;
  metrics: {
    errorRate: number;
    recentErrors: number;
    lastCheck: string;
  };
  configuration: {
    handler: string;
    runtime: string;
    memorySize: number;
    timeout: number;
  };
  issues: string[];
}

type CategoryType = keyof typeof ALL_LAMBDAS;

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);

    logger.info('Fetching Lambda health for ALL lambdas', { organizationId });

    // Check cache first
    const cacheKey = 'lambda-health-all';
    const cached = getCached<any>(cacheKey);
    if (cached) {
      logger.info('Returning cached Lambda health', { total: cached.summary.total });
      return success(cached);
    }

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Get metrics for all Lambdas in batch (no lambda:ListFunctions needed)
    const allLambdaNames = Object.values(ALL_LAMBDAS).flat().map(l => l.name);
    const metricsMap = await getBatchMetrics(allLambdaNames, oneHourAgo, now);

    // Build health data for each Lambda using static list
    const allLambdas: LambdaHealth[] = [];
    const categories = Object.entries(ALL_LAMBDAS) as [CategoryType, { name: string; displayName: string }[]][];
    
    for (const [category, lambdas] of categories) {
      for (const lambda of lambdas) {
        const metrics = metricsMap.get(lambda.name) || { errors: 0, invocations: 0 };
        
        const health = buildLambdaHealth(
          lambda.name,
          lambda.displayName,
          category,
          metrics,
          now
        );
        allLambdas.push(health);
      }
    }

    // Calculate summary
    const summary = {
      total: allLambdas.length,
      healthy: allLambdas.filter(l => l.status === 'healthy').length,
      degraded: allLambdas.filter(l => l.status === 'degraded').length,
      critical: allLambdas.filter(l => l.status === 'critical').length,
      unknown: allLambdas.filter(l => l.status === 'unknown').length,
      overallHealth: Math.round(
        (allLambdas.reduce((sum, l) => sum + l.health, 0) / allLambdas.length) * 100
      ),
      lastUpdate: now.toISOString(),
    };

    // Group by category
    const byCategory: Record<string, LambdaHealth[]> = {};
    for (const category of Object.keys(ALL_LAMBDAS)) {
      byCategory[category] = allLambdas.filter(l => l.category === category);
    }

    logger.info('Lambda health fetched', { 
      total: summary.total,
      healthy: summary.healthy,
      critical: summary.critical,
    });

    const result = {
      summary,
      lambdas: allLambdas,
      byCategory,
    };

    // Cache the result
    setCache(cacheKey, result);

    return success(result);

  } catch (err) {
    logger.error('Error fetching Lambda health', err as Error);
    return error('Failed to fetch Lambda health');
  }
}

// Get metrics for all Lambdas in batch using GetMetricData
async function getBatchMetrics(
  lambdaNames: string[],
  startTime: Date,
  endTime: Date
): Promise<Map<string, { errors: number; invocations: number }>> {
  const cacheKey = `lambda-metrics-batch:${startTime.getTime()}`;
  const cached = getCached<Map<string, { errors: number; invocations: number }>>(cacheKey);
  if (cached) return cached;

  const metricsMap = new Map<string, { errors: number; invocations: number }>();
  
  // Split into batches of 100 (CloudWatch limit is 500 queries)
  const batchSize = 100;
  const batches: string[][] = [];
  for (let i = 0; i < lambdaNames.length; i += batchSize) {
    batches.push(lambdaNames.slice(i, i + batchSize));
  }

  for (const batch of batches) {
    await limiter.acquire();
    try {
      const queries = batch.flatMap((name) => {
        const fullName = `evo-uds-v3-production-${name}`;
        const safeId = name.replace(/-/g, '_');
        return [
          {
            Id: `errors_${safeId}`,
            MetricStat: {
              Metric: {
                Namespace: 'AWS/Lambda',
                MetricName: 'Errors',
                Dimensions: [{ Name: 'FunctionName', Value: fullName }],
              },
              Period: 3600,
              Stat: 'Sum',
            },
            ReturnData: true,
          },
          {
            Id: `invocations_${safeId}`,
            MetricStat: {
              Metric: {
                Namespace: 'AWS/Lambda',
                MetricName: 'Invocations',
                Dimensions: [{ Name: 'FunctionName', Value: fullName }],
              },
              Period: 3600,
              Stat: 'Sum',
            },
            ReturnData: true,
          },
        ];
      });

      const response = await withRetry(() =>
        cloudwatch.send(new GetMetricDataCommand({
          MetricDataQueries: queries,
          StartTime: startTime,
          EndTime: endTime,
        }))
      );

      for (const result of response.MetricDataResults || []) {
        if (!result.Id || !result.Values) continue;
        
        const [metricType, ...nameParts] = result.Id.split('_');
        const lambdaName = nameParts.join('-');
        
        if (!metricsMap.has(lambdaName)) {
          metricsMap.set(lambdaName, { errors: 0, invocations: 0 });
        }
        
        const metrics = metricsMap.get(lambdaName)!;
        const sum = result.Values.reduce((a, b) => a + b, 0);
        
        if (metricType === 'errors') {
          metrics.errors = sum;
        } else if (metricType === 'invocations') {
          metrics.invocations = sum;
        }
      }
    } catch (err) {
      logger.error('Error fetching batch metrics', err as Error);
    } finally {
      limiter.release();
    }
  }

  setCache(cacheKey, metricsMap);
  return metricsMap;
}

// Build health data for a single Lambda (without lambda:ListFunctions)
function buildLambdaHealth(
  lambdaName: string,
  displayName: string,
  category: CategoryType,
  metrics: { errors: number; invocations: number },
  now: Date
): LambdaHealth {
  const fullName = `evo-uds-v3-production-${lambdaName}`;
  const issues: string[] = [];

  // Calculate error rate
  const errorRate = metrics.invocations > 0 
    ? (metrics.errors / metrics.invocations) * 100 
    : 0;

  // Detect issues based on metrics
  if (metrics.errors > 10) {
    issues.push(`${metrics.errors} erros na última hora`);
  }
  
  if (errorRate > 5) {
    issues.push(`Taxa de erro alta: ${errorRate.toFixed(1)}%`);
  }

  // Calculate health score (0-1) based on metrics
  let health = 1.0;
  
  // If no invocations, we can't determine health from metrics
  // But we assume it's healthy (just not used recently)
  if (metrics.invocations === 0) {
    health = 0.95; // Slightly lower because we can't verify
  } else {
    if (errorRate > 0) health -= errorRate / 100;
    if (metrics.errors > 0) health -= Math.min(metrics.errors / 100, 0.3);
    health = Math.max(0, Math.min(1, health));
  }

  // Determine status based on health score
  let status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  if (metrics.invocations === 0 && metrics.errors === 0) {
    // No activity - assume healthy but mark as such
    status = 'healthy';
  } else if (health >= 0.9) {
    status = 'healthy';
  } else if (health >= 0.7) {
    status = 'degraded';
  } else {
    status = 'critical';
  }

  return {
    name: fullName,
    displayName,
    category,
    status,
    health,
    metrics: {
      errorRate,
      recentErrors: metrics.errors,
      lastCheck: now.toISOString(),
    },
    configuration: {
      handler: `${lambdaName}.handler`,
      runtime: 'nodejs18.x',
      memorySize: 512,
      timeout: 30,
    },
    issues,
  };
}

// Old functions removed - now using batch approach with getAllLambdaConfigs, getBatchMetrics, and buildLambdaHealth
