/**
 * Lambda handler for Get Security Posture
 * AWS Lambda Handler for get-security-posture
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationId(user);
  
  logger.info('Get Security Posture started', { 
    organizationId,
    userId: user.id,
    requestId: context.awsRequestId 
  });
  
  try {
    const prisma = getPrismaClient();
    
    // Contar findings por severidade
    const criticalFindings = await prisma.finding.count({
      where: { organization_id: organizationId, severity: 'CRITICAL', status: 'ACTIVE' },
    });
    
    const highFindings = await prisma.finding.count({
      where: { organization_id: organizationId, severity: 'HIGH', status: 'ACTIVE' },
    });
    
    const mediumFindings = await prisma.finding.count({
      where: { organization_id: organizationId, severity: 'MEDIUM', status: 'ACTIVE' },
    });
    
    const lowFindings = await prisma.finding.count({
      where: { organization_id: organizationId, severity: 'LOW', status: 'ACTIVE' },
    });
    
    // Calcular score (0-100)
    const totalFindings = criticalFindings + highFindings + mediumFindings + lowFindings;
    const weightedScore = (criticalFindings * 40) + (highFindings * 25) + (mediumFindings * 10) + (lowFindings * 5);
    const maxPossibleScore = totalFindings > 0 ? totalFindings * 40 : 1;
    const overallScore = Math.max(0, 100 - ((weightedScore / maxPossibleScore) * 100));
    
    // Determinar nível de risco
    let riskLevel: string;
    if (overallScore >= 80) riskLevel = 'low';
    else if (overallScore >= 60) riskLevel = 'medium';
    else if (overallScore >= 40) riskLevel = 'high';
    else riskLevel = 'critical';
    
    // Salvar postura
    await prisma.securityPosture.create({
      data: {
        organization_id: organizationId,
        overall_score: overallScore,
        critical_findings: criticalFindings,
        high_findings: highFindings,
        medium_findings: mediumFindings,
        low_findings: lowFindings,
        risk_level: riskLevel,
        calculated_at: new Date(),
      },
    });
    
    logger.info('Security posture calculated', { 
      organizationId,
      overallScore: parseFloat(overallScore.toFixed(1)),
      riskLevel,
      totalFindings
    });
    
    return success({
      success: true,
      posture: {
        overallScore: parseFloat(overallScore.toFixed(1)),
        riskLevel,
        findings: {
          critical: criticalFindings,
          high: highFindings,
          medium: mediumFindings,
          low: lowFindings,
          total: totalFindings,
        },
        calculatedAt: new Date().toISOString(),
      },
    });
    
  } catch (err) {
    logger.error('Get Security Posture error', err as Error, { 
      organizationId,
      userId: user.id,
      requestId: context.awsRequestId 
    });
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
