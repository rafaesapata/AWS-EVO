/**
 * Handler temporário para verificar status das análises CloudTrail
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
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  let user: ReturnType<typeof getUserFromEvent>;
  let organizationId: string;
  
  try {
    user = getUserFromEvent(event);
    organizationId = getOrganizationId(user);
  } catch (authError) {
    return error('Unauthorized', 401);
  }

  const prisma = getPrismaClient();
  
  try {
    logger.info('Checking CloudTrail analysis status', { organizationId });

    // Buscar todas as análises CloudTrail da organização
    const analyses = await prisma.cloudTrailAnalysis.findMany({
      where: { organization_id: organizationId },
      orderBy: { created_at: 'desc' },
      take: 20,
      select: {
        id: true,
        status: true,
        aws_account_id: true,
        hours_back: true,
        events_processed: true,
        started_at: true,
        completed_at: true,
        created_at: true,
        period_start: true,
        period_end: true,
        critical_count: true,
        high_count: true,
        medium_count: true,
        low_count: true,
        error_message: true
      }
    });

    // Separar por status
    const runningAnalyses = analyses.filter(a => a.status === 'running');
    const completedAnalyses = analyses.filter(a => a.status === 'completed');
    const failedAnalyses = analyses.filter(a => a.status === 'failed');

    // Calcular tempo de execução para análises em andamento
    const runningWithDuration = runningAnalyses.map(analysis => {
      const startTime = analysis.started_at ? new Date(analysis.started_at) : new Date();
      const now = new Date();
      const runningMinutes = Math.floor((now.getTime() - startTime.getTime()) / (1000 * 60));
      
      return {
        ...analysis,
        runningMinutes,
        isStuck: runningMinutes > 30 // Considera travado se executando há mais de 30 minutos
      };
    });

    const statusSummary = {
      total: analyses.length,
      running: runningAnalyses.length,
      completed: completedAnalyses.length,
      failed: failedAnalyses.length,
      stuckAnalyses: runningWithDuration.filter(a => a.isStuck).length
    };

    const result = {
      organizationId,
      timestamp: new Date().toISOString(),
      summary: statusSummary,
      runningAnalyses: runningWithDuration,
      recentCompleted: completedAnalyses.slice(0, 5).map(a => ({
        id: a.id,
        aws_account_id: a.aws_account_id,
        completed_at: a.completed_at,
        events_processed: a.events_processed,
        critical_count: a.critical_count,
        high_count: a.high_count,
        medium_count: a.medium_count,
        low_count: a.low_count
      })),
      recentFailed: failedAnalyses.slice(0, 3).map(a => ({
        id: a.id,
        aws_account_id: a.aws_account_id,
        started_at: a.started_at,
        error_message: a.error_message
      }))
    };

    logger.info('CloudTrail status check completed', result);

    return success(result);

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error('CloudTrail status check failed', { error: errorMessage, organizationId });
    return error(`Status check failed: ${errorMessage}`, 500);
  }
}