/**
 * Azure Detect Anomalies Handler
 * 
 * Detects cost and usage anomalies in Azure subscriptions using statistical analysis.
 */

// Ensure crypto is available globally for Azure SDK
import * as crypto from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = crypto.webcrypto || crypto;
}

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { getAzureCredentialWithToken } from '../../lib/azure-helpers.js';
import { z } from 'zod';
import { parseAndValidateBody } from '../../lib/validation.js';

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
    const validation = parseAndValidateBody(azureDetectAnomaliesSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const { credentialId, lookbackDays = 30, sensitivityLevel = 'medium' } = validation.data;
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
      rows?: Array<any[]>;
      columns?: Array<{ name: string; type: string }>;
    };
  };

  const rows = data.properties?.rows || [];
  const columns = data.properties?.columns || [];
  const costData: CostDataPoint[] = [];

  // Find column indices dynamically
  const costIndex = columns.findIndex(c => c.name === 'Cost' || c.name === 'PreTaxCost');
  const serviceIndex = columns.findIndex(c => c.name === 'ServiceName');
  const dateIndex = columns.findIndex(c => c.name === 'UsageDate' || c.name === 'BillingPeriod');

  logger.info('Azure Cost API response structure', {
    columns: columns.map(c => c.name),
    rowCount: rows.length,
    sampleRow: rows[0],
    costIndex,
    serviceIndex,
    dateIndex,
  });

  for (const row of rows) {
    // Azure returns cost as first column, service as second, date as third (YYYYMMDD format)
    const cost = typeof row[costIndex !== -1 ? costIndex : 0] === 'number' ? row[costIndex !== -1 ? costIndex : 0] : parseFloat(row[0]) || 0;
    const service = row[serviceIndex !== -1 ? serviceIndex : 1] || 'Unknown';
    const dateValue = row[dateIndex !== -1 ? dateIndex : 2];
    
    // Parse date - Azure returns as YYYYMMDD number or string
    let dateStr: string;
    if (typeof dateValue === 'number') {
      // Convert YYYYMMDD to YYYY-MM-DD
      const dateNum = dateValue.toString();
      if (dateNum.length === 8) {
        dateStr = `${dateNum.slice(0, 4)}-${dateNum.slice(4, 6)}-${dateNum.slice(6, 8)}`;
      } else {
        // Fallback: treat as days offset from start
        const date = new Date(startDate);
        date.setDate(date.getDate() + dateValue);
        dateStr = date.toISOString().split('T')[0];
      }
    } else if (typeof dateValue === 'string') {
      dateStr = dateValue.includes('-') ? dateValue : `${dateValue.slice(0, 4)}-${dateValue.slice(4, 6)}-${dateValue.slice(6, 8)}`;
    } else {
      dateStr = startDate;
    }

    costData.push({
      date: dateStr,
      cost,
      service: String(service),
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

  // Sort each service's data by date
  for (const [, points] of serviceData) {
    points.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  // Calculate total cost to understand scale
  const totalCost = costData.reduce((sum, p) => sum + p.cost, 0);
  const avgCostPerService = totalCost / serviceData.size;
  
  logger.info('Analyzing services for anomalies', {
    totalServices: serviceData.size,
    totalCost: totalCost.toFixed(4),
    avgCostPerService: avgCostPerService.toFixed(4),
    services: Array.from(serviceData.keys()).slice(0, 10),
  });

  // Analyze each service
  for (const [service, points] of serviceData) {
    // Need at least 3 days of data for basic analysis
    if (points.length < 3) continue;

    // Calculate statistics
    const costs = points.map(p => p.cost);
    const mean = costs.reduce((a, b) => a + b, 0) / costs.length;
    const maxCost = Math.max(...costs);
    const minCost = Math.min(...costs);
    
    // Skip services with zero or near-zero costs
    if (mean === 0 || maxCost === 0) continue;
    
    const variance = costs.reduce((sum, cost) => sum + Math.pow(cost - mean, 2), 0) / costs.length;
    const stdDev = Math.sqrt(variance);

    // For services with no variation, check for new services
    if (stdDev === 0 || stdDev / mean < 0.001) {
      // Check if this is a new service (appeared recently)
      const firstDate = new Date(points[0].date);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Only flag as new if it's significant (top 20% of services by cost)
      if (firstDate > thirtyDaysAgo && mean > avgCostPerService * 0.2) {
        anomalies.push({
          id: `new-${service}-${points[0].date}`,
          type: 'new_resource',
          severity: mean > avgCostPerService ? 'high' : mean > avgCostPerService * 0.5 ? 'medium' : 'low',
          title: `Novo serviço detectado: ${service}`,
          description: `Serviço ${service} apareceu recentemente com custo médio de ${formatCurrency(mean)}/dia`,
          service,
          date: points[0].date,
          expectedValue: 0,
          actualValue: Math.round(mean * 10000) / 10000,
          deviation: mean,
          deviationPercent: 100,
          recommendation: `Verifique se o serviço ${service} foi provisionado intencionalmente e se está configurado corretamente.`,
        });
      }
      continue;
    }

    // Check each point for anomalies using z-score
    for (const point of points) {
      const zScore = (point.cost - mean) / stdDev;
      const deviation = point.cost - mean;
      const deviationPercent = mean > 0 ? (deviation / mean) * 100 : 0;
      
      // Use relative threshold - at least 20% deviation from mean
      if (Math.abs(deviationPercent) < 20) continue;

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
            ? `Custo ${deviationPercent.toFixed(0)}% acima da média (${formatCurrency(point.cost)} vs ${formatCurrency(mean)} esperado)`
            : `Custo ${Math.abs(deviationPercent).toFixed(0)}% abaixo da média (${formatCurrency(point.cost)} vs ${formatCurrency(mean)} esperado)`,
          service,
          date: point.date,
          expectedValue: Math.round(mean * 10000) / 10000,
          actualValue: Math.round(point.cost * 10000) / 10000,
          deviation: Math.round(deviation * 10000) / 10000,
          deviationPercent: Math.round(deviationPercent * 10) / 10,
          recommendation: isSpike
            ? `Investigue o aumento de uso em ${service}. Verifique se há recursos não utilizados ou configurações incorretas.`
            : `Verifique se a redução é esperada. Pode indicar recursos desligados ou problemas de serviço.`,
        });
      }
    }

    // Check for unusual patterns (week-over-week comparison)
    if (points.length >= 14) {
      const recentWeek = points.slice(-7);
      const previousWeek = points.slice(-14, -7);
      
      const recentAvg = recentWeek.reduce((sum, p) => sum + p.cost, 0) / 7;
      const previousAvg = previousWeek.reduce((sum, p) => sum + p.cost, 0) / 7;
      
      if (previousAvg > 0) {
        const weekChange = ((recentAvg - previousAvg) / previousAvg) * 100;
        
        // Flag if change is more than 30%
        if (Math.abs(weekChange) > 30) {
          const isIncrease = weekChange > 0;
          anomalies.push({
            id: `trend-${service}-${points[points.length - 1].date}`,
            type: 'usage_pattern',
            severity: Math.abs(weekChange) > 100 ? 'high' : Math.abs(weekChange) > 50 ? 'medium' : 'low',
            title: isIncrease 
              ? `Tendência de aumento em ${service}` 
              : `Tendência de queda em ${service}`,
            description: `Custo semanal ${isIncrease ? 'aumentou' : 'diminuiu'} ${Math.abs(weekChange).toFixed(0)}% (${formatCurrency(previousAvg)}/dia → ${formatCurrency(recentAvg)}/dia)`,
            service,
            date: points[points.length - 1].date,
            expectedValue: Math.round(previousAvg * 10000) / 10000,
            actualValue: Math.round(recentAvg * 10000) / 10000,
            deviation: Math.round((recentAvg - previousAvg) * 10000) / 10000,
            deviationPercent: Math.round(weekChange * 10) / 10,
            recommendation: isIncrease
              ? `Analise o crescimento de uso em ${service}. Considere otimizações ou ajustes de capacidade.`
              : `Verifique se a redução em ${service} é esperada ou indica problemas.`,
          });
        }
      }
    }
  }

  // Remove duplicates (same service/date)
  const uniqueAnomalies = new Map<string, Anomaly>();
  for (const anomaly of anomalies) {
    const key = `${anomaly.service}-${anomaly.date}-${anomaly.type}`;
    if (!uniqueAnomalies.has(key) || 
        getSeverityOrder(anomaly.severity) < getSeverityOrder(uniqueAnomalies.get(key)!.severity)) {
      uniqueAnomalies.set(key, anomaly);
    }
  }

  // Sort by severity and date
  const result = Array.from(uniqueAnomalies.values());
  result.sort((a, b) => {
    const severityDiff = getSeverityOrder(a.severity) - getSeverityOrder(b.severity);
    if (severityDiff !== 0) return severityDiff;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  logger.info('Anomaly detection results', {
    totalAnomalies: result.length,
    byType: {
      cost_spike: result.filter(a => a.type === 'cost_spike').length,
      cost_drop: result.filter(a => a.type === 'cost_drop').length,
      new_resource: result.filter(a => a.type === 'new_resource').length,
      usage_pattern: result.filter(a => a.type === 'usage_pattern').length,
    },
  });

  return result;
}

/**
 * Format currency value for display
 */
function formatCurrency(value: number): string {
  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  } else if (value >= 0.01) {
    return `$${value.toFixed(4)}`;
  } else {
    return `$${value.toFixed(6)}`;
  }
}

function getSeverityOrder(severity: string): number {
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return order[severity] ?? 4;
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
