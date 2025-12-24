import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from '../../lib/logging.js';
import { PrismaClient } from '@prisma/client';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';
import { success, error, badRequest, notFound, unauthorized, corsOptions } from '../../lib/response.js';

const prisma = new PrismaClient();
const stsClient = new STSClient({});

interface AnomalyRequest {
  awsAccountId: string;
  analysisType: 'cost' | 'security' | 'performance' | 'all';
  sensitivity?: 'low' | 'medium' | 'high';
  lookbackDays?: number;
}

interface Anomaly {
  id: string;
  type: string;
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  metric: string;
  expectedValue: number;
  actualValue: number;
  deviation: number;
  timestamp: Date;
  resourceId?: string;
  recommendation: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const origin = event.headers?.origin || event.headers?.Origin;
  
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return unauthorized('Unauthorized', origin);
    }

    const body: AnomalyRequest = JSON.parse(event.body || '{}');
    const { awsAccountId, analysisType = 'all', sensitivity = 'medium', lookbackDays = 30 } = body;

    if (!awsAccountId) {
      return badRequest('awsAccountId is required', undefined, origin);
    }

    // Buscar conta AWS
    const awsAccount = await prisma.awsAccount.findFirst({
      where: { id: awsAccountId },
      include: { organization: true }
    });

    if (!awsAccount) {
      return notFound('AWS Account not found', origin);
    }

    // Assume role (usando campos corretos do schema)
    const assumeRoleResponse = await stsClient.send(new AssumeRoleCommand({
      RoleArn: `arn:aws:iam::${awsAccount.account_id}:role/EvoUdsRole`,
      RoleSessionName: 'DetectAnomaliesSession',
      DurationSeconds: 3600
    }));

    const credentials = {
      accessKeyId: assumeRoleResponse.Credentials!.AccessKeyId!,
      secretAccessKey: assumeRoleResponse.Credentials!.SecretAccessKey!,
      sessionToken: assumeRoleResponse.Credentials!.SessionToken!
    };

    const anomalies: Anomaly[] = [];
    const thresholds = getThresholds(sensitivity);

    // Detectar anomalias de custo
    if (analysisType === 'cost' || analysisType === 'all') {
      const costAnomalies = await detectCostAnomalies(credentials, lookbackDays, thresholds);
      anomalies.push(...costAnomalies);
    }

    // Detectar anomalias de performance
    if (analysisType === 'performance' || analysisType === 'all') {
      const perfAnomalies = await detectPerformanceAnomalies(credentials, lookbackDays, thresholds);
      anomalies.push(...perfAnomalies);
    }

    // Detectar anomalias de segurança
    if (analysisType === 'security' || analysisType === 'all') {
      const secAnomalies = await detectSecurityAnomalies(awsAccountId, lookbackDays, thresholds);
      anomalies.push(...secAnomalies);
    }

    // Salvar anomalias detectadas
    for (const anomaly of anomalies) {
      await prisma.finding.create({
        data: {
          organization_id: awsAccount.organization_id,
          severity: anomaly.severity,
          description: anomaly.description,
          details: {
            type: anomaly.type,
            category: anomaly.category,
            title: anomaly.title,
            metric: anomaly.metric,
            expectedValue: anomaly.expectedValue,
            actualValue: anomaly.actualValue,
          },
          scan_type: 'anomaly_detection',
          service: 'ML',
          category: anomaly.category,
          resource_id: anomaly.resourceId,
          remediation: anomaly.recommendation,
          status: 'OPEN'
        }
      });
    }

    // Agrupar por categoria
    const byCategory = anomalies.reduce((acc, a) => {
      acc[a.category] = (acc[a.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Agrupar por severidade
    const bySeverity = anomalies.reduce((acc, a) => {
      acc[a.severity] = (acc[a.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return success({
      summary: {
        totalAnomalies: anomalies.length,
        byCategory,
        bySeverity,
        analysisType,
        sensitivity,
        lookbackDays
      },
      anomalies: anomalies.sort((a, b) => {
        const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      })
    }, 200, origin);
  } catch (err) {
    logger.error('Detect anomalies error:', err);
    return error('Internal server error', 500, undefined, origin);
  }
};

function getThresholds(sensitivity: string): { costDeviation: number; perfDeviation: number; securityThreshold: number } {
  switch (sensitivity) {
    case 'low': return { costDeviation: 0.5, perfDeviation: 0.4, securityThreshold: 10 };
    case 'high': return { costDeviation: 0.15, perfDeviation: 0.15, securityThreshold: 3 };
    default: return { costDeviation: 0.25, perfDeviation: 0.25, securityThreshold: 5 };
  }
}

async function detectCostAnomalies(
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string },
  lookbackDays: number,
  thresholds: { costDeviation: number }
): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = [];
  const ceClient = new CostExplorerClient({ region: 'us-east-1', credentials });

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lookbackDays);

  const response = await ceClient.send(new GetCostAndUsageCommand({
    TimePeriod: { Start: startDate.toISOString().split('T')[0], End: endDate.toISOString().split('T')[0] },
    Granularity: 'DAILY',
    Metrics: ['UnblendedCost'],
    GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }]
  }));

  // Calcular média e desvio padrão por serviço
  const serviceData: Record<string, number[]> = {};
  
  for (const result of response.ResultsByTime || []) {
    for (const group of result.Groups || []) {
      const service = group.Keys?.[0] || 'Unknown';
      const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
      if (!serviceData[service]) serviceData[service] = [];
      serviceData[service].push(cost);
    }
  }

  for (const [service, costs] of Object.entries(serviceData)) {
    if (costs.length < 7) continue;

    const mean = costs.reduce((a, b) => a + b, 0) / costs.length;
    const stdDev = Math.sqrt(costs.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / costs.length);
    const lastCost = costs[costs.length - 1];
    const deviation = Math.abs(lastCost - mean) / (stdDev || 1);

    if (deviation > 2 && Math.abs(lastCost - mean) / mean > thresholds.costDeviation) {
      anomalies.push({
        id: `cost-${service}-${Date.now()}`,
        type: 'COST_SPIKE',
        category: 'cost',
        severity: deviation > 3 ? 'HIGH' : 'MEDIUM',
        title: `Cost anomaly detected for ${service}`,
        description: `${service} cost deviated ${(deviation * 100).toFixed(1)}% from normal`,
        metric: 'UnblendedCost',
        expectedValue: mean,
        actualValue: lastCost,
        deviation,
        timestamp: new Date(),
        resourceId: service,
        recommendation: `Review ${service} usage and check for unexpected resources or configuration changes`
      });
    }
  }

  return anomalies;
}

async function detectPerformanceAnomalies(
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string },
  lookbackDays: number,
  thresholds: { perfDeviation: number }
): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = [];
  const cwClient = new CloudWatchClient({ region: 'us-east-1', credentials });

  const endTime = new Date();
  const startTime = new Date();
  startTime.setDate(startTime.getDate() - lookbackDays);

  // Verificar métricas de Lambda
  const lambdaMetrics = await cwClient.send(new GetMetricStatisticsCommand({
    Namespace: 'AWS/Lambda',
    MetricName: 'Errors',
    StartTime: startTime,
    EndTime: endTime,
    Period: 86400,
    Statistics: ['Sum']
  }));

  const errorCounts = (lambdaMetrics.Datapoints || []).map(d => d.Sum || 0);
  if (errorCounts.length > 7) {
    const mean = errorCounts.reduce((a, b) => a + b, 0) / errorCounts.length;
    const lastValue = errorCounts[errorCounts.length - 1];
    
    if (lastValue > mean * (1 + thresholds.perfDeviation) && lastValue > 10) {
      anomalies.push({
        id: `perf-lambda-errors-${Date.now()}`,
        type: 'ERROR_SPIKE',
        category: 'performance',
        severity: lastValue > mean * 2 ? 'HIGH' : 'MEDIUM',
        title: 'Lambda error rate anomaly',
        description: `Lambda errors increased to ${lastValue} (avg: ${mean.toFixed(1)})`,
        metric: 'Lambda/Errors',
        expectedValue: mean,
        actualValue: lastValue,
        deviation: (lastValue - mean) / mean,
        timestamp: new Date(),
        recommendation: 'Review Lambda function logs and recent deployments'
      });
    }
  }

  return anomalies;
}

async function detectSecurityAnomalies(
  awsAccountId: string,
  lookbackDays: number,
  thresholds: { securityThreshold: number }
): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = [];

  // Buscar eventos de segurança recentes
  const recentEvents = await prisma.securityEvent.groupBy({
    by: ['event_type'],
    where: {
      created_at: { gte: new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000) }
    },
    _count: true
  });

  // Buscar baseline histórico
  const historicalEvents = await prisma.securityEvent.groupBy({
    by: ['event_type'],
    where: {
      created_at: {
        gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        lt: new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
      }
    },
    _count: true
  });

  const historicalBaseline: Record<string, number> = {};
  for (const h of historicalEvents) {
    historicalBaseline[h.event_type] = (h._count || 0) / (90 - lookbackDays);
  }

  for (const event of recentEvents) {
    const baseline = historicalBaseline[event.event_type] || 0;
    const current = (event._count || 0) / lookbackDays;

    if (current > baseline + thresholds.securityThreshold && current > 5) {
      anomalies.push({
        id: `sec-${event.event_type}-${Date.now()}`,
        type: 'SECURITY_EVENT_SPIKE',
        category: 'security',
        severity: current > baseline * 3 ? 'CRITICAL' : 'HIGH',
        title: `Unusual ${event.event_type} activity`,
        description: `${event.event_type} events increased from ${baseline.toFixed(1)}/day to ${current.toFixed(1)}/day`,
        metric: event.event_type,
        expectedValue: baseline,
        actualValue: current,
        deviation: (current - baseline) / (baseline || 1),
        timestamp: new Date(),
        recommendation: `Investigate ${event.event_type} events for potential security issues`
      });
    }
  }

  return anomalies;
}
