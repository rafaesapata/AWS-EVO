/**
 * Get Lambda Health - ALL Lambdas Health Check
 * 
 * Monitora a saúde de TODAS as 114 Lambdas do sistema organizadas por categoria
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { logger } from '../../lib/logging.js';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { LambdaClient, GetFunctionConfigurationCommand } from '@aws-sdk/client-lambda';

const cloudwatch = new CloudWatchClient({ region: 'us-east-1' });
const cloudwatchLogs = new CloudWatchLogsClient({ region: 'us-east-1' });
const lambdaClient = new LambdaClient({ region: 'us-east-1' });

// ALL Lambdas by category (114 total)
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
  ],
  core: [
    { name: 'query-table', displayName: 'Query Table' },
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
  ],
  admin: [
    { name: 'admin-manage-user', displayName: 'Admin Manage User' },
    { name: 'create-cognito-user', displayName: 'Create Cognito User' },
    { name: 'disable-cognito-user', displayName: 'Disable Cognito User' },
    { name: 'manage-organizations', displayName: 'Manage Organizations' },
    { name: 'log-audit', displayName: 'Log Audit' },
  ],
  dashboard: [
    { name: 'get-executive-dashboard', displayName: 'Executive Dashboard' },
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
  ],
  ai: [
    { name: 'intelligent-alerts-analyzer', displayName: 'Intelligent Alerts Analyzer' },
    { name: 'predict-incidents', displayName: 'Predict Incidents' },
    { name: 'detect-anomalies', displayName: 'Detect Anomalies' },
    { name: 'anomaly-detection', displayName: 'Anomaly Detection' },
  ],
  license: [
    { name: 'validate-license', displayName: 'Validate License' },
    { name: 'configure-license', displayName: 'Configure License' },
    { name: 'sync-license', displayName: 'Sync License' },
    { name: 'admin-sync-license', displayName: 'Admin Sync License' },
    { name: 'manage-seats', displayName: 'Manage Seats' },
    { name: 'daily-license-validation', displayName: 'Daily License Validation' },
  ],
  kb: [
    { name: 'kb-analytics-dashboard', displayName: 'KB Analytics Dashboard' },
    { name: 'kb-ai-suggestions', displayName: 'KB AI Suggestions' },
    { name: 'kb-export-pdf', displayName: 'KB Export PDF' },
    { name: 'increment-article-views', displayName: 'Increment Article Views' },
    { name: 'increment-article-helpful', displayName: 'Increment Article Helpful' },
    { name: 'track-article-view-detailed', displayName: 'Track Article View Detailed' },
  ],
  reports: [
    { name: 'generate-pdf-report', displayName: 'Generate PDF Report' },
    { name: 'generate-excel-report', displayName: 'Generate Excel Report' },
    { name: 'generate-security-pdf', displayName: 'Generate Security PDF' },
    { name: 'security-scan-pdf-export', displayName: 'Security Scan PDF Export' },
    { name: 'generate-remediation-script', displayName: 'Generate Remediation Script' },
  ],
  organizations: [
    { name: 'create-organization-account', displayName: 'Create Organization Account' },
    { name: 'sync-organization-accounts', displayName: 'Sync Organization Accounts' },
    { name: 'check-organization', displayName: 'Check Organization' },
    { name: 'create-with-organization', displayName: 'Create With Organization' },
    { name: 'get-user-organization', displayName: 'Get User Organization' },
  ],
  notifications: [
    { name: 'send-email', displayName: 'Send Email' },
    { name: 'send-notification', displayName: 'Send Notification' },
    { name: 'get-communication-logs', displayName: 'Get Communication Logs' },
  ],
  storage: [
    { name: 'storage-download', displayName: 'Storage Download' },
    { name: 'storage-delete', displayName: 'Storage Delete' },
    { name: 'upload-attachment', displayName: 'Upload Attachment' },
  ],
  jobs: [
    { name: 'process-background-jobs', displayName: 'Process Background Jobs' },
    { name: 'list-background-jobs', displayName: 'List Background Jobs' },
    { name: 'execute-scheduled-job', displayName: 'Execute Scheduled Job' },
    { name: 'scheduled-scan-executor', displayName: 'Scheduled Scan Executor' },
  ],
  integrations: [
    { name: 'create-jira-ticket', displayName: 'Create Jira Ticket' },
  ],
};

interface LambdaHealth {
  name: string;
  displayName: string;
  category: 'onboarding' | 'security' | 'auth' | 'core' | 'admin' | 'dashboard' | 'ai' | 'license' | 'kb' | 'reports' | 'organizations' | 'notifications' | 'storage' | 'jobs' | 'integrations';
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

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Check health for ALL Lambdas in parallel (batched)
    const allLambdas: LambdaHealth[] = [];
    const categories = Object.entries(ALL_LAMBDAS) as [CategoryType, { name: string; displayName: string }[]][];
    
    // Process all categories in parallel
    const categoryPromises = categories.map(async ([category, lambdas]) => {
      const lambdaPromises = lambdas.map(lambda => 
        checkLambdaHealth(
          lambda.name,
          lambda.displayName,
          category,
          oneHourAgo,
          now
        )
      );
      return Promise.all(lambdaPromises);
    });

    const categoryResults = await Promise.all(categoryPromises);
    for (const results of categoryResults) {
      allLambdas.push(...results);
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

    return success({
      summary,
      lambdas: allLambdas,
      byCategory,
    });

  } catch (err) {
    logger.error('Error fetching Lambda health', err as Error);
    return error('Failed to fetch Lambda health');
  }
}

async function checkLambdaHealth(
  lambdaName: string,
  displayName: string,
  category: CategoryType,
  startTime: Date,
  endTime: Date
): Promise<LambdaHealth> {
  const fullName = `evo-uds-v3-production-${lambdaName}`;
  const issues: string[] = [];
  
  try {
    // Get Lambda configuration
    const configResponse = await lambdaClient.send(
      new GetFunctionConfigurationCommand({
        FunctionName: fullName,
      })
    );

    const configuration = {
      handler: configResponse.Handler || 'unknown',
      runtime: configResponse.Runtime || 'unknown',
      memorySize: configResponse.MemorySize || 0,
      timeout: configResponse.Timeout || 0,
    };

    // Get error metrics
    const [errorsResponse, invocationsResponse] = await Promise.all([
      cloudwatch.send(new GetMetricStatisticsCommand({
        Namespace: 'AWS/Lambda',
        MetricName: 'Errors',
        Dimensions: [{ Name: 'FunctionName', Value: fullName }],
        StartTime: startTime,
        EndTime: endTime,
        Period: 3600,
        Statistics: ['Sum'],
      })),
      cloudwatch.send(new GetMetricStatisticsCommand({
        Namespace: 'AWS/Lambda',
        MetricName: 'Invocations',
        Dimensions: [{ Name: 'FunctionName', Value: fullName }],
        StartTime: startTime,
        EndTime: endTime,
        Period: 3600,
        Statistics: ['Sum'],
      })),
    ]);

    const totalErrors = errorsResponse.Datapoints?.reduce((sum, dp) => sum + (dp.Sum || 0), 0) || 0;
    const totalInvocations = invocationsResponse.Datapoints?.reduce((sum, dp) => sum + (dp.Sum || 0), 0) || 0;
    const errorRate = totalInvocations > 0 ? (totalErrors / totalInvocations) * 100 : 0;

    // Check for recent errors in logs
    let recentErrors = 0;
    try {
      const logsResponse = await cloudwatchLogs.send(
        new FilterLogEventsCommand({
          logGroupName: `/aws/lambda/${fullName}`,
          startTime: startTime.getTime(),
          endTime: endTime.getTime(),
          filterPattern: '"ERROR"',
          limit: 100,
        })
      );
      recentErrors = logsResponse.events?.length || 0;
    } catch (err) {
      // Log group may not exist or no permissions
    }

    // Detect issues
    if (totalErrors > 10) {
      issues.push(`${totalErrors} erros na última hora`);
    }
    
    if (errorRate > 5) {
      issues.push(`Taxa de erro alta: ${errorRate.toFixed(1)}%`);
    }

    if (configuration.handler.includes('handlers/')) {
      issues.push('Handler path incorreto - pode causar erro 502');
    }

    if (recentErrors > 0) {
      const errorTypes = await detectErrorTypes(fullName, startTime, endTime);
      if (errorTypes.includes('Cannot find module')) {
        issues.push('Deploy incorreto - faltam dependências');
      }
      if (errorTypes.includes('PrismaClientInitializationError')) {
        issues.push('DATABASE_URL incorreta');
      }
      if (errorTypes.includes('AuthValidationError')) {
        issues.push('Erro de autenticação');
      }
    }

    // Calculate health score (0-1)
    let health = 1.0;
    if (errorRate > 0) health -= errorRate / 100;
    if (totalErrors > 0) health -= Math.min(totalErrors / 100, 0.3);
    if (issues.length > 0) health -= issues.length * 0.1;
    health = Math.max(0, Math.min(1, health));

    // Determine status
    let status: 'healthy' | 'degraded' | 'critical' | 'unknown';
    if (health >= 0.9) {
      status = 'healthy';
    } else if (health >= 0.7) {
      status = 'degraded';
    } else if (health > 0) {
      status = 'critical';
    } else {
      status = 'unknown';
    }

    return {
      name: fullName,
      displayName,
      category,
      status,
      health,
      metrics: {
        errorRate,
        recentErrors: totalErrors,
        lastCheck: endTime.toISOString(),
      },
      configuration,
      issues,
    };

  } catch (err) {
    logger.error(`Failed to check health for ${fullName}`, err as Error);
    
    return {
      name: fullName,
      displayName,
      category,
      status: 'unknown',
      health: 0,
      metrics: {
        errorRate: 0,
        recentErrors: 0,
        lastCheck: endTime.toISOString(),
      },
      configuration: {
        handler: 'unknown',
        runtime: 'unknown',
        memorySize: 0,
        timeout: 0,
      },
      issues: ['Não foi possível verificar a saúde desta Lambda'],
    };
  }
}

async function detectErrorTypes(
  functionName: string,
  startTime: Date,
  endTime: Date
): Promise<string[]> {
  const errorTypes: string[] = [];
  
  try {
    const response = await cloudwatchLogs.send(
      new FilterLogEventsCommand({
        logGroupName: `/aws/lambda/${functionName}`,
        startTime: startTime.getTime(),
        endTime: endTime.getTime(),
        filterPattern: '"ERROR"',
        limit: 50,
      })
    );

    const messages = response.events?.map(e => e.message || '') || [];
    
    if (messages.some(m => m.includes('Cannot find module'))) {
      errorTypes.push('Cannot find module');
    }
    if (messages.some(m => m.includes('PrismaClientInitializationError'))) {
      errorTypes.push('PrismaClientInitializationError');
    }
    if (messages.some(m => m.includes('AuthValidationError'))) {
      errorTypes.push('AuthValidationError');
    }
    if (messages.some(m => m.includes('timeout') || m.includes('Task timed out'))) {
      errorTypes.push('Timeout');
    }
  } catch (err) {
    // Ignore errors
  }

  return errorTypes;
}
