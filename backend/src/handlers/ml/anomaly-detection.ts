/**
 * Lambda handler for Anomaly Detection
 * AWS Lambda Handler for anomaly-detection
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Anomaly Detection started');
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const prisma = getPrismaClient();
    
    const anomalies: any[] = [];
    
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

async function detectCostAnomalies(prisma: any, organizationId: string) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const costs = await prisma.dailyCost.groupBy({
    by: ['date'],
    where: { organizationId, date: { gte: sevenDaysAgo } },
    _sum: { cost: true },
  });
  
  const anomalies = [];
  const values = costs.map((c: any) => c._sum.cost || 0);
  const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((sum: number, val: number) => sum + Math.pow(val - avg, 2), 0) / values.length);
  
  for (let i = 0; i < costs.length; i++) {
    const cost = costs[i]._sum.cost || 0;
    if (cost > avg + (2 * stdDev)) {
      anomalies.push({
        type: 'cost',
        severity: 'high',
        date: costs[i].date,
        value: cost,
        expected: avg,
        deviation: ((cost - avg) / avg * 100).toFixed(1) + '%',
      });
    }
  }
  
  return anomalies;
}

async function detectSecurityAnomalies(prisma: any, organizationId: string) {
  const anomalies = [];
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  
  try {
    // Detect unusual login patterns
    const recentLogins = await prisma.auditLog.findMany({
      where: {
        organizationId,
        action: 'login',
        createdAt: { gte: oneDayAgo }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Group by IP and detect multiple IPs per user
    const userIps: Record<string, Set<string>> = {};
    for (const login of recentLogins) {
      const userId = login.userId;
      const ip = login.metadata?.ip || 'unknown';
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
        organizationId,
        action: 'login_failed',
        createdAt: { gte: oneDayAgo }
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
        organizationId,
        severity: 'critical',
        createdAt: { gte: oneDayAgo }
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
  } catch (err) {
    logger.warn('Error detecting security anomalies:', err);
  }
  
  return anomalies;
}

async function detectPerformanceAnomalies(prisma: any, organizationId: string) {
  const anomalies = [];
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);
  
  try {
    // Detect endpoint response time anomalies
    const endpointResults = await prisma.endpointMonitorResult.findMany({
      where: {
        endpointMonitor: { organizationId },
        createdAt: { gte: oneHourAgo }
      },
      include: { endpointMonitor: true }
    });
    
    // Group by endpoint and calculate stats
    const endpointStats: Record<string, number[]> = {};
    for (const result of endpointResults) {
      const endpointId = result.endpointMonitorId;
      if (!endpointStats[endpointId]) endpointStats[endpointId] = [];
      endpointStats[endpointId].push(result.responseTimeMs || 0);
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
    
    // Detect endpoint failures
    const failedEndpoints = await prisma.endpointMonitor.findMany({
      where: {
        organizationId,
        consecutiveFailures: { gte: 3 }
      }
    });
    
    for (const endpoint of failedEndpoints) {
      anomalies.push({
        type: 'performance',
        severity: 'critical',
        category: 'endpoint_down',
        endpointId: endpoint.id,
        endpointUrl: endpoint.url,
        value: endpoint.consecutiveFailures,
        message: `Endpoint ${endpoint.name || endpoint.url} has ${endpoint.consecutiveFailures} consecutive failures`,
      });
    }
  } catch (err) {
    logger.warn('Error detecting performance anomalies:', err);
  }
  
  return anomalies;
}
