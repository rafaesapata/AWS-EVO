import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for AI Prioritization
 * AWS Lambda Handler for ai-prioritization
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 AI Prioritization started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    const prisma = getPrismaClient();
    
    // Buscar findings ativos
    const findings = await prisma.finding.findMany({
      where: {
        organization_id: organizationId,
        status: 'ACTIVE',
      },
      take: 100,
    });
    
    // Calcular prioridade para cada finding
    const prioritizedFindings = findings.map(finding => {
      let priorityScore = 0;
      
      // Severidade
      switch (finding.severity) {
        case 'CRITICAL': priorityScore += 100; break;
        case 'HIGH': priorityScore += 75; break;
        case 'MEDIUM': priorityScore += 50; break;
        case 'LOW': priorityScore += 25; break;
      }
      
      // Idade (findings mais antigos têm maior prioridade)
      const ageInDays = Math.floor(
        (Date.now() - new Date(finding.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      priorityScore += Math.min(ageInDays * 2, 30);
      
      // Compliance (se afeta compliance, maior prioridade)
      if (finding.compliance && finding.compliance.length > 0) {
        priorityScore += 20;
      }
      
      return {
        id: finding.id,
        title: finding.description,
        severity: finding.severity,
        priorityScore,
        priorityRank: 0,
        factors: {
          severity: finding.severity,
          ageInDays,
          hasCompliance: finding.compliance && finding.compliance.length > 0,
        },
      };
    });
    
    // Ordenar por score e atribuir rank
    prioritizedFindings.sort((a, b) => b.priorityScore - a.priorityScore);
    prioritizedFindings.forEach((f, index) => {
      f.priorityRank = index + 1;
    });
    
    logger.info(`✅ Prioritized ${prioritizedFindings.length} findings`);
    
    return success({
      success: true,
      findings: prioritizedFindings,
      summary: {
        total: prioritizedFindings.length,
        critical: prioritizedFindings.filter(f => f.severity === 'CRITICAL').length,
        high: prioritizedFindings.filter(f => f.severity === 'HIGH').length,
      },
    });
    
  } catch (err) {
    logger.error('❌ AI Prioritization error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
