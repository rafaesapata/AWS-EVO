/**
 * Lambda handler temporário para debug das análises CloudTrail
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, safeHandler } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

export const handler = safeHandler(async (
  event: AuthorizedEvent,
  context: LambdaContext
) => {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  let user: ReturnType<typeof getUserFromEvent>;
  let organizationId: string;
  
  try {
    user = getUserFromEvent(event);
    organizationId = getOrganizationIdWithImpersonation(event, user);
  } catch (authError) {
    return error('Unauthorized', 401);
  }

  const prisma = getPrismaClient();
  
  try {
    logger.info('Debug CloudTrail - Starting analysis', { organizationId });

    // Buscar análises recentes
    const recentAnalyses = await prisma.cloudTrailAnalysis.findMany({
      where: { organization_id: organizationId },
      orderBy: { created_at: 'desc' },
      take: 10,
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

    // Verificar análises em execução
    const runningAnalyses = await prisma.cloudTrailAnalysis.findMany({
      where: { 
        organization_id: organizationId,
        status: 'running' 
      },
      select: {
        id: true,
        aws_account_id: true,
        started_at: true,
        hours_back: true
      }
    });

    // Verificar análises com falha
    const failedAnalyses = await prisma.cloudTrailAnalysis.findMany({
      where: { 
        organization_id: organizationId,
        status: 'failed' 
      },
      orderBy: { created_at: 'desc' },
      take: 5,
      select: {
        id: true,
        aws_account_id: true,
        started_at: true,
        error_message: true
      }
    });

    // Verificar contas AWS disponíveis
    const awsAccounts = await prisma.awsCredential.findMany({
      where: { 
        organization_id: organizationId,
        is_active: true 
      },
      select: {
        id: true,
        account_id: true,
        account_name: true
      }
    });

    const debugInfo = {
      organizationId,
      timestamp: new Date().toISOString(),
      summary: {
        totalAnalyses: recentAnalyses.length,
        runningAnalyses: runningAnalyses.length,
        failedAnalyses: failedAnalyses.length,
        activeAccounts: awsAccounts.length
      },
      recentAnalyses: recentAnalyses.map(analysis => {
        const duration = analysis.completed_at && analysis.started_at
          ? Math.round((new Date(analysis.completed_at).getTime() - new Date(analysis.started_at).getTime()) / 1000)
          : analysis.started_at 
            ? Math.round((new Date().getTime() - new Date(analysis.started_at).getTime()) / 1000)
            : 0;
        
        return {
          id: analysis.id,
          status: analysis.status,
          accountId: analysis.aws_account_id,
          hoursBack: analysis.hours_back,
          eventsProcessed: analysis.events_processed,
          startedAt: analysis.started_at,
          completedAt: analysis.completed_at,
          durationSeconds: duration,
          periodStart: analysis.period_start,
          periodEnd: analysis.period_end,
          criticalCount: analysis.critical_count,
          highCount: analysis.high_count,
          mediumCount: analysis.medium_count,
          lowCount: analysis.low_count,
          errorMessage: analysis.error_message
        };
      }),
      runningAnalyses: runningAnalyses.map(analysis => {
        const duration = analysis.started_at 
          ? Math.round((new Date().getTime() - new Date(analysis.started_at).getTime()) / 1000)
          : 0;
        return {
          id: analysis.id,
          accountId: analysis.aws_account_id,
          hoursBack: analysis.hours_back,
          runningSince: analysis.started_at,
          runningSeconds: duration
        };
      }),
      failedAnalyses: failedAnalyses.map(analysis => ({
        id: analysis.id,
        accountId: analysis.aws_account_id,
        startedAt: analysis.started_at,
        errorMessage: analysis.error_message
      })),
      awsAccounts: awsAccounts.map(account => ({
        id: account.id,
        accountId: account.account_id,
        accountName: account.account_name
      }))
    };

    logger.info('Debug CloudTrail - Analysis complete', debugInfo);

    return success(debugInfo);

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error during debug';
    logger.error('Debug CloudTrail failed', { error: errorMessage, organizationId });
    return error('Debug failed. Please check logs.', 500);
  }
});