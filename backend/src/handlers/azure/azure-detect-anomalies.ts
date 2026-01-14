/**
 * Azure Detect Anomalies Handler
 * 
 * Detects cost and usage anomalies in Azure subscriptions using statistical analysis.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { getAzureCredentialWithToken } from '../../lib/azure-helpers.js';
import { z } from 'zod';

// Validation schema
const azureDetectAnomaliesSchema = z.object({
  credentialId: z.string().uuid('Invalid credential ID'),
  lookbackDays: z.number().min(7).max(90).optional().default(30),
  sensitivityLevel: z.enum(['low', 'medium', 'high']).optional().default('medium'),
});

interface CostDataPoint {
  date: string;
  cost: number;
  service: string;
}

interface Anomaly {
  id: string;
  type: 'cost_spike' | 'cost_drop' | 'unusual_service' | 'new_resource' | 'usage_pattern';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  service: string;
  date: string;
  expectedValue: number;
  actualValue: number;
  deviation: number;
  deviationPercent: number;
  recommendation: string;
}

// Sensitivity thresholds (standard deviations)
const SENSITIVITY_THRESHOLDS = {
  low: 3.0,
  medium: 2.0,
  high: 1.5,
};

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  // Handle CORS preflight
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    logger.info('Detecting Azure anomalies', { organizationId });

    // Parse and validate request body
    let body: any;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return error('Invalid JSON in request body', 400);
    }

    const validation = azureDetectAnomaliesSchema.safeParse(body);
    if (!validation.success) {
      return error(`Validation error: ${validation.error.errors.map(e => e.message).join(', ')}`, 400);
    }

    const { credentialId, lookbackDays, sensitivityLevel } = validation.data;
    const threshold = SENSITIVITY_THRESHOLDS[sensitivityLevel];

    // Get Azure credential with valid token
    const credentialResult = await getAzureCredentialWithToken(prisma, credentialId, organizationId);
    if (!credentialResult.success) {
      return error(credentialResult.error || 'Failed to get Azure credential', 400);
    }

    const { credential, accessToken } = credentialResult;
    const subscriptionId = credential.subscription_id;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);

    // Fetch cost data from Azure Cost Management API
    const costData = await fetchAzureCostData(
      accessToken,
      subscriptionId,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );

    logger.info('Fetched Azure cost data', {
      organizationId,
      dataPoints: costData.length,
    });

    // Detect anomalies
    const anomalies = detectAnomalies(costData, threshold);

    // Calculate summary statistics
    const totalCost = costData.reduce((sum, d) => sum + d.cost, 0);
    const avgDailyCost = totalCost / lookbackDays;
    const recentCost = costData
      .filter(d => new Date(d.date) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .reduce((sum, d) => sum + d.cost, 0);
    const recentAvg = recentCost / 7;
    const trend = avgDailyCost > 0 ? ((recentAvg - avgDailyCost) / avgDailyCost) * 100 : 0;

    // Group anomalies by severity
    const summary = {
      total: anomalies.length,
      bySeverity: {
        critical: anomalies.filter(a => a.severity === 'critical').length,
        high: anomalies.filter(a => a.severity === 'high').length,
        medium: anomalies.filter(a => a.severity === 'medium').length,
        low: anomalies.filter(a => a.severity === 'low').length,
      },
      byType: {
        cost_spike: anomalies.filter(a => a.type === 'cost_spike').length,
        cost_drop: anomalies.filter(a => a.type === 'cost_drop').length,
        unusual_service: anomalies.filter(a => a.type === 'unusual_service').length,
        new_resource: anomalies.filter(a => a.type === 'new_resource').length,
        usage_pattern: anomalies.filter(a => a.type === 'usage_pattern').length,
      },
      costMetrics: {
        totalCost: Math.round(totalCost * 100) / 100,
        avgDailyCost: Math.round(avgDailyCost * 100) / 100,
        recentAvgDailyCost: Math.round(recentAvg * 100) / 100,
        trendPercent: Math.round(trend * 10) / 10,
      },
    };

    logger.info('Azure anomaly detection complete', {
      organizationId,
      anomaliesFound: anomalies.length,
    });

    return success({
      subscriptionId,
      subscriptionName: credential.subscription_name,
      period: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        lookbackDays,
      },
      sensitivityLevel,
      summary,
      anomalies: anomalies.slice(0, 100), // Return top 100
    });
  } catch (err: any) {
    logger.error('Error detecting Azure anomalies', { error: err.message, stack: err.stack });
    return error(err.message || 'Failed to detect anomalies', 500);
  }
}

/**
 * Fetch cost data from Azure Cost Management API
 */
async function fetchAzureCostData(
  accessToken: string,
  subscriptionId: string,
  startDate: string,
  endDate: string
): Promise<CostDataPoint[]> {
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2023-03-01`;

  const requestBody = {
    type: 'ActualCost',
    timeframe: 'Custom',
    timePeriod: {
      from: startDate,
      to: endDate,
    },
    dataset: {
      granularity: 'Daily',
      aggregation: {
        totalCost: {
          name: 'Cost',
          function: 'Sum',
        },
      },
      grouping: [
        {
          type: 'Dimension',
          name: 'ServiceName',
        },
      ],
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Azure cost data: ${response.status} ${errorText}`);
  }

  const data = await response.json() as {
    properties?: {
      rows?: Array<[number, string, number]>; // [cost, service, dateIndex]
      columns?: Array<{ name: string; type: string }>;
    };
  };

  const rows = data.properties?.rows || [];
  const costData: CostDataPoint[] = [];

  for (const row of rows) {
    const cost = row[0] || 0;
    const service = row[1] || 'Unknown';
    const dateIndex = row[2];
    
    // Convert date index to actual date
    const date = new Date(startDate);
    date.setDate(date.getDate() + (typeof dateIndex === 'number' ? dateIndex : 0));

    costData.push({
      date: date.toISOString().split('T')[0],
      cost,
      service,
    });
  }

  return costData;
}

/**
 * Detect anomalies using statistical analysis
 */
function detectAnomalies(costData: CostDataPoint[], threshold: number): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // Group by service
  const serviceData = new Map<string, CostDataPoint[]>();
  for (const point of costData) {
    if (!serviceData.has(point.service)) {
      serviceData.set(point.service, []);
    }
    serviceData.get(point.service)!.push(point);
  }

  // Analyze each service
  for (const [service, points] of serviceData) {
    if (points.length < 7) continue; // Need at least 7 days of data

    // Calculate statistics
    const costs = points.map(p => p.cost);
    const mean = costs.reduce((a, b) => a + b, 0) / costs.length;
    const variance = costs.reduce((sum, cost) => sum + Math.pow(cost - mean, 2), 0) / costs.length;
    const stdDev = Math.sqrt(variance);

    // Skip if no variation
    if (stdDev === 0) continue;

    // Check each point for anomalies
    for (const point of points) {
      const zScore = (point.cost - mean) / stdDev;
      const deviation = point.cost - mean;
      const deviationPercent = mean > 0 ? (deviation / mean) * 100 : 0;

      if (Math.abs(zScore) > threshold) {
        const isSpike = zScore > 0;
        const severity = getSeverity(Math.abs(zScore), Math.abs(deviationPercent));

        anomalies.push({
          id: `${service}-${point.date}`,
          type: isSpike ? 'cost_spike' : 'cost_drop',
          severity,
          title: isSpike 
            ? `Pico de custo em ${service}` 
            : `Queda de custo em ${service}`,
          description: isSpike
            ? `Custo ${deviationPercent.toFixed(0)}% acima da média (${point.cost.toFixed(2)} vs ${mean.toFixed(2)} esperado)`
            : `Custo ${Math.abs(deviationPercent).toFixed(0)}% abaixo da média (${point.cost.toFixed(2)} vs ${mean.toFixed(2)} esperado)`,
          service,
          date: point.date,
          expectedValue: Math.round(mean * 100) / 100,
          actualValue: Math.round(point.cost * 100) / 100,
          deviation: Math.round(deviation * 100) / 100,
          deviationPercent: Math.round(deviationPercent * 10) / 10,
          recommendation: isSpike
            ? `Investigue o aumento de uso em ${service}. Verifique se há recursos não utilizados ou configurações incorretas.`
            : `Verifique se a redução é esperada. Pode indicar recursos desligados ou problemas de serviço.`,
        });
      }
    }
  }

  // Sort by severity and date
  anomalies.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return anomalies;
}

/**
 * Determine severity based on z-score and deviation percentage
 */
function getSeverity(zScore: number, deviationPercent: number): 'low' | 'medium' | 'high' | 'critical' {
  if (zScore > 4 || deviationPercent > 200) return 'critical';
  if (zScore > 3 || deviationPercent > 100) return 'high';
  if (zScore > 2 || deviationPercent > 50) return 'medium';
  return 'low';
}
