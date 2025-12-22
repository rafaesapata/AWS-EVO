/**
 * Lambda handler for Scheduled View Refresh
 * AWS Lambda Handler for scheduled-view-refresh
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Scheduled View Refresh started');
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const prisma = getPrismaClient();
    
    const refreshedViews: string[] = [];
    
    // Refresh security posture para todas as organizações
    const organizations = await prisma.organization.findMany({
      select: { id: true },
    });
    
    for (const org of organizations) {
      // Calcular e atualizar security posture
      const criticalFindings = await prisma.finding.count({
        where: { organization_id: org.id, severity: 'CRITICAL', status: 'ACTIVE' },
      });
      
      const highFindings = await prisma.finding.count({
        where: { organization_id: org.id, severity: 'HIGH', status: 'ACTIVE' },
      });
      
      const mediumFindings = await prisma.finding.count({
        where: { organization_id: org.id, severity: 'MEDIUM', status: 'ACTIVE' },
      });
      
      const lowFindings = await prisma.finding.count({
        where: { organization_id: org.id, severity: 'LOW', status: 'ACTIVE' },
      });
      
      const totalFindings = criticalFindings + highFindings + mediumFindings + lowFindings;
      const weightedScore = (criticalFindings * 40) + (highFindings * 25) + (mediumFindings * 10) + (lowFindings * 5);
      const maxPossibleScore = totalFindings > 0 ? totalFindings * 40 : 1;
      const overallScore = Math.max(0, 100 - ((weightedScore / maxPossibleScore) * 100));
      
      let riskLevel: string;
      if (overallScore >= 80) riskLevel = 'low';
      else if (overallScore >= 60) riskLevel = 'medium';
      else if (overallScore >= 40) riskLevel = 'high';
      else riskLevel = 'critical';
      
      await prisma.securityPosture.create({
        data: {
          organization_id: org.id,
          overall_score: overallScore,
          critical_findings: criticalFindings,
          high_findings: highFindings,
          medium_findings: mediumFindings,
          low_findings: lowFindings,
          risk_level: riskLevel,
          calculated_at: new Date(),
        },
      });
      
      refreshedViews.push(`security_posture_${org.id}`);
    }
    
    logger.info(`✅ Refreshed ${refreshedViews.length} views`);
    
    return success({
      success: true,
      refreshedViews,
      organizationsProcessed: organizations.length,
    });
    
  } catch (err) {
    logger.error('❌ Scheduled View Refresh error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
