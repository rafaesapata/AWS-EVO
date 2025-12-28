import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Anomaly Detection
 * AWS Lambda Handler for anomaly-detection
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import type { PrismaClient } from '@prisma/client';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Anomaly Detection started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const prisma = getPrismaClient();
    
    const anomalies: AnomalyResult[] = [];
    
    // Detectar anomalias de custo
    const costAnomalies = await detectCostAnomalies(prisma, organizationId);
    anomalies.push(...costAnomalies);
    
    // Detectar anomalias de segurança
    const securityAnomalies = await detectSecurityAnomalies(prisma, organizationId);
    anomalies.push(...securityAnomalies);
    
    // Detectar anomalias de performance
    const performanceAnomalies = await detectPerformanceAnomalies(prisma, organizationId);
    anomalies.push(...performanceAnomalies);
    
    logger.info(`✅ Detected ${anomalies.length} anomalies`);
    
    return success({
      success: true,
      anomalies,
      summary: {
        total: anomalies.length,
        cost: costAnomalies.length,
        security: securityAnomalies.length,
        performance: performanceAnomalies.length,
      },
    });
    
  } catch (err) {
    logger.error('❌ Anomaly Detection error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

// Type definitions for anomaly results
interface CostAnomaly {
  type: 'cost';
  severity: string;
  date: Date;
  value: number;
  expected: number;
  deviation: string;
}

interface SecurityAnomaly {
  type: 'security';
  severity: string;
  category: string;
  userId?: string;
  value: number;
  message: string;
}

interface PerformanceAnomaly {
  type: 'performance';
  severity: string;
  category: string;
  endpointId: string;
  endpointUrl?: string;
  value: number;
  expected?: number;
  message: string;
}

type AnomalyResult = CostAnomaly | SecurityAnomaly | PerformanceAnomaly;

async function detectCostAnomalies(
  prisma: PrismaClient,
  organizationId: string
): Promise<CostAnomaly[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const costs = await prisma.dailyCost.groupBy({
    by: ['date'],
    where: { organization_id: organizationId, date: { gte: sevenDaysAgo } },
    _sum: { cost: true },
  });
  
  const anomalies: CostAnomaly[] = [];
  const values = costs.map((c: { _sum: { cost: number | null } }) => c._sum.cost || 0);
  
  if (values.length === 0) return anomalies;
  
  const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((sum: number, val: number) => sum + Math.pow(val - avg, 2), 0) / values.length);
  
  for (let i = 0; i < costs.length; i++) {
    const costEntry = costs[i] as { date: Date; _sum: { cost: number | null } };
    const cost = costEntry._sum.cost || 0;
    if (cost > avg + (2 * stdDev)) {
      anomalies.push({
        type: 'cost',
        severity: 'high',
        date: costEntry.date,
        value: cost,
        expected: avg,
        deviation: ((cost - avg) / avg * 100).toFixed(1) + '%',
      });
    }
  }
  
  return anomalies;
}

async function detectSecurityAnomalies(
  prisma: PrismaClient,
  organizationId: string
): Promise<SecurityAnomaly[]> {
  const anomalies: SecurityAnomaly[] = [];
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  
  try {
    // Detect unusual login patterns
    const recentLogins = await prisma.auditLog.findMany({
      where: {
        organization_id: organizationId,
        action: 'login',
        created_at: { gte: oneDayAgo }
      },
      orderBy: { created_at: 'desc' }
    });
    
    // Group by IP and detect multiple IPs per user
    const userIps: Record<string, Set<string>> = {};
    for (const login of recentLogins) {
      const userId = login.user_id;
      if (!userId) continue; // Skip entries without user_id
      const details = login.details as Record<string, any> | null;
      const ip = details?.ip || login.ip_address || 'unknown';
      if (!userIps[userId]) userIps[userId] = new Set();
      userIps[userId].add(ip);
    }
    
    for (const [userId, ips] of Object.entries(userIps)) {
      if (ips.size > 5) {
        anomalies.push({
          type: 'security',
          severity: 'high',
          category: 'suspicious_login',
          userId,
          value: ips.size,
          message: `User logged in from ${ips.size} different IPs in 24h`,
        });
      }
    }
    
    // Detect spike in failed logins
    const failedLogins = await prisma.auditLog.count({
      where: {
        organization_id: organizationId,
        action: 'login_failed',
        created_at: { gte: oneDayAgo }
      }
    });
    
    if (failedLogins > 50) {
      anomalies.push({
        type: 'security',
        severity: 'critical',
        category: 'brute_force_attempt',
        value: failedLogins,
        message: `${failedLogins} failed login attempts in 24h - possible brute force attack`,
      });
    }
    
    // Detect new critical findings
    const newCriticalFindings = await prisma.finding.count({
      where: {
        organization_id: organizationId,
        severity: 'critical',
        created_at: { gte: oneDayAgo }
      }
    });
    
    if (newCriticalFindings > 0) {
      anomalies.push({
        type: 'security',
        severity: 'critical',
        category: 'new_critical_findings',
        value: newCriticalFindings,
        message: `${newCriticalFindings} new critical security findings detected`,
      });
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn('Error detecting security anomalies:', { error: errMsg });
  }
  
  return anomalies;
}

async function detectPerformanceAnomalies(
  prisma: PrismaClient,
  organizationId: string
): Promise<PerformanceAnomaly[]> {
  const anomalies: PerformanceAnomaly[] = [];
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);
  
  try {
    // Detect endpoint response time anomalies using EndpointCheckHistory
    const endpointResults = await prisma.endpointCheckHistory.findMany({
      where: {
        endpoint: { organization_id: organizationId },
        checked_at: { gte: oneHourAgo }
      },
      include: { endpoint: true }
    });
    
    // Group by endpoint and calculate stats
    const endpointStats: Record<string, number[]> = {};
    for (const result of endpointResults) {
      const endpointId = result.endpoint_id;
      if (!endpointStats[endpointId]) endpointStats[endpointId] = [];
      endpointStats[endpointId].push(result.response_time || 0);
    }
    
    for (const [endpointId, times] of Object.entries(endpointStats)) {
      if (times.length < 5) continue;
      
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const stdDev = Math.sqrt(times.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / times.length);
      const maxTime = Math.max(...times);
      
      // Detect if max response time is > 3 standard deviations from mean
      if (maxTime > avg + (3 * stdDev) && maxTime > 5000) {
        anomalies.push({
          type: 'performance',
          severity: 'high',
          category: 'slow_response',
          endpointId,
          value: maxTime,
          expected: avg,
          message: `Endpoint response time spike: ${maxTime}ms (avg: ${avg.toFixed(0)}ms)`,
        });
      }
    }
    
    // Detect endpoint failures using MonitoredEndpoint
    const failedEndpoints = await prisma.monitoredEndpoint.findMany({
      where: {
        organization_id: organizationId,
        last_status: 'error'
      }
    });
    
    for (const endpoint of failedEndpoints) {
      anomalies.push({
        type: 'performance',
        severity: 'critical',
        category: 'endpoint_down',
        endpointId: endpoint.id,
        endpointUrl: endpoint.url,
        value: 1,
        message: `Endpoint ${endpoint.name || endpoint.url} is down`,
      });
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn('Error detecting performance anomalies:', { error: errMsg });
  }
  
  return anomalies;
}
