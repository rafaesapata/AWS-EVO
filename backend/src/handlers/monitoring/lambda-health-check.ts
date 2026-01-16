/**
 * Lambda Health Check - Monitora saúde de Lambdas críticas
 * 
 * Executa periodicamente (a cada 5 minutos via EventBridge) para:
 * 1. Testar invocação OPTIONS de cada Lambda crítica
 * 2. Verificar logs de erro recentes
 * 3. Enviar alertas se detectar problemas
 * 4. Publicar métricas customizadas no CloudWatch
 */

import type { LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { LambdaClient, InvokeCommand, GetFunctionConfigurationCommand } from '@aws-sdk/client-lambda';
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { logger } from '../../lib/logging.js';

interface CriticalLambda {
  name: string;
  category: 'onboarding' | 'security' | 'auth' | 'core';
  description: string;
  maxErrorRate: number; // Percentage (0-100)
  alertOnError: boolean;
}

// Lista de Lambdas CRÍTICAS que não podem falhar
const CRITICAL_LAMBDAS: CriticalLambda[] = [
  // Onboarding - Bloqueiam novos clientes
  {
    name: 'save-aws-credentials',
    category: 'onboarding',
    description: 'Quick Connect AWS',
    maxErrorRate: 5,
    alertOnError: true
  },
  {
    name: 'validate-aws-credentials',
    category: 'onboarding',
    description: 'Validação AWS',
    maxErrorRate: 10,
    alertOnError: true
  },
  {
    name: 'save-azure-credentials',
    category: 'onboarding',
    description: 'Quick Connect Azure',
    maxErrorRate: 5,
    alertOnError: true
  },
  {
    name: 'validate-azure-credentials',
    category: 'onboarding',
    description: 'Validação Azure',
    maxErrorRate: 10,
    alertOnError: true
  },
  
  // Security - Funcionalidades core
  {
    name: 'security-scan',
    category: 'security',
    description: 'Security Engine V3',
    maxErrorRate: 10,
    alertOnError: true
  },
  {
    name: 'start-security-scan',
    category: 'security',
    description: 'Iniciar Security Scan',
    maxErrorRate: 5,
    alertOnError: true
  },
  {
    name: 'compliance-scan',
    category: 'security',
    description: 'Compliance v2.0',
    maxErrorRate: 10,
    alertOnError: true
  },
  {
    name: 'start-compliance-scan',
    category: 'security',
    description: 'Iniciar Compliance Scan',
    maxErrorRate: 5,
    alertOnError: true
  },
  
  // Auth - Autenticação crítica
  {
    name: 'mfa-enroll',
    category: 'auth',
    description: 'MFA Enrollment',
    maxErrorRate: 5,
    alertOnError: true
  },
  {
    name: 'mfa-verify-login',
    category: 'auth',
    description: 'MFA Login',
    maxErrorRate: 5,
    alertOnError: true
  },
  {
    name: 'webauthn-register',
    category: 'auth',
    description: 'Passkey Registration',
    maxErrorRate: 5,
    alertOnError: true
  },
  {
    name: 'webauthn-authenticate',
    category: 'auth',
    description: 'Passkey Login',
    maxErrorRate: 5,
    alertOnError: true
  },
  
  // Core - Funcionalidades essenciais
  {
    name: 'fetch-daily-costs',
    category: 'core',
    description: 'Cost Dashboard',
    maxErrorRate: 15,
    alertOnError: false
  },
  {
    name: 'bedrock-chat',
    category: 'core',
    description: 'FinOps Copilot',
    maxErrorRate: 15,
    alertOnError: false
  },
  {
    name: 'get-executive-dashboard',
    category: 'core',
    description: 'Executive Dashboard',
    maxErrorRate: 15,
    alertOnError: false
  }
];

const FUNCTION_PREFIX = 'evo-uds-v3-production-';
const REGION = process.env.AWS_REGION || 'us-east-1';
const SNS_TOPIC_ARN = process.env.ALERT_SNS_TOPIC_ARN;

interface HealthCheckResult {
  functionName: string;
  category: string;
  description: string;
  status: 'healthy' | 'degraded' | 'critical';
  checks: {
    invocation: { success: boolean; error?: string };
    recentErrors: { count: number; errorRate: number };
    configuration: { valid: boolean; handler?: string; error?: string };
  };
  timestamp: string;
}

export async function handler(
  event: any,
  context: LambdaContext
): Promise<void> {
  logger.info('Lambda Health Check started', { 
    lambdaCount: CRITICAL_LAMBDAS.length,
    requestId: context.awsRequestId 
  });

  const lambdaClient = new LambdaClient({ region: REGION });
  const logsClient = new CloudWatchLogsClient({ region: REGION });
  const cloudwatchClient = new CloudWatchClient({ region: REGION });
  const snsClient = SNSClient ? new SNSClient({ region: REGION }) : null;

  const results: HealthCheckResult[] = [];
  const criticalIssues: string[] = [];

  for (const lambda of CRITICAL_LAMBDAS) {
    const functionName = `${FUNCTION_PREFIX}${lambda.name}`;
    
    try {
      const result = await checkLambdaHealth(
        lambdaClient,
        logsClient,
        functionName,
        lambda
      );
      
      results.push(result);

      // Publicar métrica no CloudWatch
      await publishHealthMetric(cloudwatchClient, lambda.name, result.status);

      // Alertar se crítico
      if (result.status === 'critical' && lambda.alertOnError) {
        const issue = `🚨 CRITICAL: ${lambda.description} (${functionName}) is DOWN!\n` +
          `- Invocation: ${result.checks.invocation.success ? '✅' : '❌ ' + result.checks.invocation.error}\n` +
          `- Recent Errors: ${result.checks.recentErrors.count} (${result.checks.recentErrors.errorRate.toFixed(1)}%)\n` +
          `- Configuration: ${result.checks.configuration.valid ? '✅' : '❌ ' + result.checks.configuration.error}`;
        
        criticalIssues.push(issue);
        logger.error('Critical Lambda health issue', { functionName, result });
      } else if (result.status === 'degraded') {
        logger.warn('Lambda health degraded', { functionName, result });
      } else {
        logger.info('Lambda healthy', { functionName });
      }

    } catch (error) {
      logger.error('Failed to check Lambda health', { 
        functionName, 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      criticalIssues.push(
        `🚨 CRITICAL: Failed to check ${lambda.description} (${functionName}): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Enviar alerta consolidado se houver problemas críticos
  if (criticalIssues.length > 0 && snsClient && SNS_TOPIC_ARN) {
    await sendAlert(snsClient, criticalIssues);
  }

  // Publicar métrica geral de saúde
  const healthyCount = results.filter(r => r.status === 'healthy').length;
  const healthPercentage = (healthyCount / results.length) * 100;
  
  await cloudwatchClient.send(new PutMetricDataCommand({
    Namespace: 'EVO/LambdaHealth',
    MetricData: [{
      MetricName: 'OverallHealthPercentage',
      Value: healthPercentage,
      Unit: 'Percent',
      Timestamp: new Date()
    }]
  }));

  logger.info('Lambda Health Check completed', {
    total: results.length,
    healthy: healthyCount,
    degraded: results.filter(r => r.status === 'degraded').length,
    critical: results.filter(r => r.status === 'critical').length,
    healthPercentage: healthPercentage.toFixed(1)
  });
}

async function checkLambdaHealth(
  lambdaClient: LambdaClient,
  logsClient: CloudWatchLogsClient,
  functionName: string,
  lambda: CriticalLambda
): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    functionName,
    category: lambda.category,
    description: lambda.description,
    status: 'healthy',
    checks: {
      invocation: { success: false },
      recentErrors: { count: 0, errorRate: 0 },
      configuration: { valid: false }
    },
    timestamp: new Date().toISOString()
  };

  // Check 1: Test invocation (OPTIONS request)
  try {
    const invokeResponse = await lambdaClient.send(new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify({
        requestContext: { http: { method: 'OPTIONS' } }
      }))
    }));

    if (invokeResponse.StatusCode === 200) {
      const payload = JSON.parse(Buffer.from(invokeResponse.Payload!).toString());
      result.checks.invocation.success = payload.statusCode === 200;
      
      if (!result.checks.invocation.success) {
        result.checks.invocation.error = `Returned status ${payload.statusCode}`;
      }
    } else {
      result.checks.invocation.error = `Lambda returned status ${invokeResponse.StatusCode}`;
    }
  } catch (error) {
    result.checks.invocation.error = error instanceof Error ? error.message : String(error);
  }

  // Check 2: Recent errors (last 5 minutes)
  try {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    
    const errorEvents = await logsClient.send(new FilterLogEventsCommand({
      logGroupName: `/aws/lambda/${functionName}`,
      startTime: fiveMinutesAgo,
      filterPattern: 'ERROR'
    }));

    const allEvents = await logsClient.send(new FilterLogEventsCommand({
      logGroupName: `/aws/lambda/${functionName}`,
      startTime: fiveMinutesAgo
    }));

    const errorCount = errorEvents.events?.length || 0;
    const totalCount = allEvents.events?.length || 0;
    const errorRate = totalCount > 0 ? (errorCount / totalCount) * 100 : 0;

    result.checks.recentErrors = { count: errorCount, errorRate };
  } catch (error) {
    // Log group might not exist yet - not critical
    logger.warn('Could not check recent errors', { 
      functionName, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }

  // Check 3: Configuration validation
  try {
    const config = await lambdaClient.send(new GetFunctionConfigurationCommand({
      FunctionName: functionName
    }));

    result.checks.configuration.handler = config.Handler;
    
    // Validate handler path (should not contain "handlers/")
    if (config.Handler?.includes('handlers/')) {
      result.checks.configuration.valid = false;
      result.checks.configuration.error = `Invalid handler path: ${config.Handler}`;
    } else {
      result.checks.configuration.valid = true;
    }
  } catch (error) {
    result.checks.configuration.error = error instanceof Error ? error.message : String(error);
  }

  // Determine overall status
  if (!result.checks.invocation.success || !result.checks.configuration.valid) {
    result.status = 'critical';
  } else if (result.checks.recentErrors.errorRate > lambda.maxErrorRate) {
    result.status = 'degraded';
  } else {
    result.status = 'healthy';
  }

  return result;
}

async function publishHealthMetric(
  cloudwatchClient: CloudWatchClient,
  lambdaName: string,
  status: 'healthy' | 'degraded' | 'critical'
): Promise<void> {
  const value = status === 'healthy' ? 1 : status === 'degraded' ? 0.5 : 0;

  try {
    await cloudwatchClient.send(new PutMetricDataCommand({
      Namespace: 'EVO/LambdaHealth',
      MetricData: [{
        MetricName: 'LambdaHealth',
        Value: value,
        Unit: 'None',
        Dimensions: [
          { Name: 'FunctionName', Value: lambdaName }
        ],
        Timestamp: new Date()
      }]
    }));
  } catch (error) {
    logger.error('Failed to publish health metric', { 
      lambdaName, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

async function sendAlert(
  snsClient: SNSClient,
  issues: string[]
): Promise<void> {
  if (!SNS_TOPIC_ARN) {
    logger.warn('SNS_TOPIC_ARN not configured, skipping alert');
    return;
  }

  const message = `🚨 EVO Lambda Health Alert\n\n` +
    `${issues.length} critical issue(s) detected:\n\n` +
    issues.join('\n\n') +
    `\n\nTimestamp: ${new Date().toISOString()}\n` +
    `Action Required: Check CloudWatch logs and redeploy affected Lambdas.`;

  try {
    await snsClient.send(new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Subject: `🚨 EVO: ${issues.length} Critical Lambda Issue(s)`,
      Message: message
    }));
    
    logger.info('Alert sent successfully', { issueCount: issues.length });
  } catch (error) {
    logger.error('Failed to send alert', { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}
