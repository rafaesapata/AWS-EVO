/**
 * Get Lambda Health - Critical Lambdas Health Check
 * 
 * Monitora a saúde das Lambdas CRÍTICAS do sistema:
 * - Onboarding: save-aws-credentials, validate-aws-credentials, save-azure-credentials, validate-azure-credentials
 * - Security: security-scan, compliance-scan
 * - Auth: mfa-enroll, mfa-verify-login, webauthn-register, webauthn-authenticate
 * - Core: query-table, bedrock-chat, fetch-daily-costs
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

// Critical Lambdas by category
const CRITICAL_LAMBDAS = {
  onboarding: [
    { name: 'save-aws-credentials', displayName: 'Save AWS Credentials' },
    { name: 'validate-aws-credentials', displayName: 'Validate AWS Credentials' },
    { name: 'save-azure-credentials', displayName: 'Save Azure Credentials' },
    { name: 'validate-azure-credentials', displayName: 'Validate Azure Credentials' },
  ],
  security: [
    { name: 'security-scan', displayName: 'Security Scan' },
    { name: 'compliance-scan', displayName: 'Compliance Scan' },
    { name: 'start-security-scan', displayName: 'Start Security Scan' },
    { name: 'start-compliance-scan', displayName: 'Start Compliance Scan' },
  ],
  auth: [
    { name: 'mfa-enroll', displayName: 'MFA Enroll' },
    { name: 'mfa-check', displayName: 'MFA Check' },
    { name: 'webauthn-register', displayName: 'WebAuthn Register' },
    { name: 'webauthn-authenticate', displayName: 'WebAuthn Authenticate' },
  ],
  core: [
    { name: 'query-table', displayName: 'Query Table' },
    { name: 'bedrock-chat', displayName: 'Bedrock Chat' },
    { name: 'fetch-daily-costs', displayName: 'Fetch Daily Costs' },
    { name: 'get-executive-dashboard', displayName: 'Executive Dashboard' },
  ],
};

interface LambdaHealth {
  name: string;
  displayName: string;
  category: 'onboarding' | 'security' | 'auth' | 'core';
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

    logger.info('Fetching Lambda health', { organizationId });

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Check health for all critical Lambdas
    const allLambdas: LambdaHealth[] = [];
    
    for (const [category, lambdas] of Object.entries(CRITICAL_LAMBDAS)) {
      for (const lambda of lambdas) {
        const health = await checkLambdaHealth(
          lambda.name,
          lambda.displayName,
          category as 'onboarding' | 'security' | 'auth' | 'core',
          oneHourAgo,
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
    const byCategory = {
      onboarding: allLambdas.filter(l => l.category === 'onboarding'),
      security: allLambdas.filter(l => l.category === 'security'),
      auth: allLambdas.filter(l => l.category === 'auth'),
      core: allLambdas.filter(l => l.category === 'core'),
    };

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
  category: 'onboarding' | 'security' | 'auth' | 'core',
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
