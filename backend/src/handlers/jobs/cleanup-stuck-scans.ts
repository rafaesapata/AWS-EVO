/**
 * Lambda handler para limpeza de scans travados
 * Identifica e corrige scans que ficaram em status "running" por muito tempo
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';

interface CleanupStats {
  totalScansChecked: number;
  stuckScansFound: number;
  scansUpdated: number;
  errors: string[];
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  let organizationId: string | null = null;
  let isAdminExecution = false;

  // Verificar se é execução administrativa (sem autenticação) ou por usuário
  try {
    const user = getUserFromEvent(event);
    organizationId = getOrganizationIdWithImpersonation(event, user);
    logger.info('Cleanup initiated by user', { userId: user.sub, organizationId });
  } catch (authError) {
    // Execução administrativa (via CloudWatch Events, etc.)
    isAdminExecution = true;
    logger.info('Cleanup initiated administratively');
  }

  const prisma = getPrismaClient();
  const stats: CleanupStats = {
    totalScansChecked: 0,
    stuckScansFound: 0,
    scansUpdated: 0,
    errors: []
  };

  try {
    // Definir tempo limite para considerar um scan como travado (30 minutos)
    const stuckThresholdMinutes = 30;
    const stuckThreshold = new Date(Date.now() - stuckThresholdMinutes * 60 * 1000);

    logger.info('Starting cleanup of stuck scans', { 
      stuckThresholdMinutes,
      stuckThreshold: stuckThreshold.toISOString(),
      organizationId,
      isAdminExecution
    });

    // Buscar scans em status "running" que começaram há mais de 30 minutos
    const whereClause: any = {
      status: 'running',
      started_at: {
        lt: stuckThreshold
      }
    };

    // Se não for execução administrativa, filtrar por organização
    if (!isAdminExecution && organizationId) {
      whereClause.organization_id = organizationId;
    }

    const stuckScans = await prisma.securityScan.findMany({
      where: whereClause,
      select: {
        id: true,
        organization_id: true,
        aws_account_id: true,
        scan_type: true,
        started_at: true,
        created_at: true
      },
      orderBy: {
        started_at: 'asc'
      }
    });

    stats.totalScansChecked = stuckScans.length;
    stats.stuckScansFound = stuckScans.length;

    logger.info('Found stuck scans', { count: stuckScans.length });

    if (stuckScans.length === 0) {
      return success({
        message: 'No stuck scans found',
        stats
      });
    }

    // Processar cada scan travado
    for (const scan of stuckScans) {
      try {
        const durationMinutes = Math.floor((Date.now() - new Date(scan.started_at).getTime()) / (1000 * 60));
        
        logger.info('Processing stuck scan', {
          scanId: scan.id,
          scanType: scan.scan_type,
          organizationId: scan.organization_id,
          durationMinutes,
          startedAt: scan.started_at
        });

        // Atualizar o scan para status "failed" com informações sobre o problema
        await prisma.securityScan.update({
          where: { id: scan.id },
          data: {
            status: 'failed',
            completed_at: new Date(),
            results: {
              error: 'Scan cleanup: Process was stuck for more than 30 minutes',
              duration_minutes: durationMinutes,
              cleanup_timestamp: new Date().toISOString(),
              original_started_at: scan.started_at,
              cleanup_reason: 'automatic_stuck_scan_cleanup'
            }
          }
        });

        stats.scansUpdated++;
        
        logger.info('Updated stuck scan to failed status', {
          scanId: scan.id,
          durationMinutes
        });

      } catch (scanError) {
        const errorMsg = `Failed to update scan ${scan.id}: ${scanError instanceof Error ? scanError.message : 'Unknown error'}`;
        stats.errors.push(errorMsg);
        logger.error('Error updating stuck scan', {
          scanId: scan.id,
          error: errorMsg
        });
      }
    }

    // Log final da operação
    logger.info('Cleanup completed', {
      totalScansChecked: stats.totalScansChecked,
      stuckScansFound: stats.stuckScansFound,
      scansUpdated: stats.scansUpdated,
      errorsCount: stats.errors.length,
      organizationId,
      isAdminExecution
    });

    return success({
      message: `Cleanup completed: ${stats.scansUpdated} stuck scans updated`,
      stats,
      details: {
        stuckThresholdMinutes,
        processedAt: new Date().toISOString(),
        organizationId: isAdminExecution ? 'ALL' : organizationId
      }
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error during cleanup';
    logger.error('Cleanup job failed', {
      error: errorMessage,
      stack: err instanceof Error ? err.stack : undefined,
      organizationId,
      isAdminExecution
    });

    return error('Cleanup failed. Check logs for details.', 500);
  }
}