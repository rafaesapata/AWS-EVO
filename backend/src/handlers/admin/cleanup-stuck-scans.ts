/**
 * Lambda handler para limpeza manual de scans travados via API
 * Permite que administradores executem a limpeza sob demanda
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, unauthorized } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { parseEventBody } from '../../lib/request-parser.js';

interface CleanupRequest {
  thresholdMinutes?: number; // Opcional: customizar tempo limite (padrão: 30 min)
  dryRun?: boolean; // Opcional: apenas simular sem fazer alterações
  organizationId?: string; // Opcional: limitar a uma organização específica
}

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  let user: ReturnType<typeof getUserFromEvent>;
  let userOrganizationId: string;
  
  try {
    user = getUserFromEvent(event);
    userOrganizationId = getOrganizationIdWithImpersonation(event, user);
  } catch (authError) {
    return unauthorized('Authentication required for manual cleanup');
  }

  // Verificar se o usuário tem permissão de admin
  let userRoles: string[] = [];
  try {
    userRoles = user['custom:roles'] ? JSON.parse(user['custom:roles']) : [];
  } catch {
    userRoles = [];
  }
  const isAdmin = userRoles.includes('admin') || userRoles.includes('org_admin') || userRoles.includes('super_admin');
  
  if (!isAdmin) {
    return unauthorized('Admin permission required for cleanup operations');
  }

  const prisma = getPrismaClient();
  
  try {
    // Parse do body da requisição
    const body = parseEventBody<CleanupRequest>(event, {}, 'cleanup-stuck-scans');
    
    const thresholdMinutes = body.thresholdMinutes || 30;
    const dryRun = body.dryRun || false;
    const targetOrganizationId = body.organizationId || userOrganizationId;
    
    // Super admins podem limpar qualquer organização, outros apenas a própria
    const isSuperAdmin = userRoles.includes('super_admin');
    if (!isSuperAdmin && targetOrganizationId !== userOrganizationId) {
      return unauthorized('Cannot cleanup scans from other organizations');
    }

    const stuckThreshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);

    logger.info('Manual cleanup initiated', {
      userId: user.sub,
      userOrganizationId,
      targetOrganizationId,
      thresholdMinutes,
      dryRun,
      isSuperAdmin
    });

    // Buscar scans travados
    const whereClause: any = {
      status: 'running',
      started_at: {
        lt: stuckThreshold
      }
    };

    // Filtrar por organização se especificado
    if (targetOrganizationId) {
      whereClause.organization_id = targetOrganizationId;
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

    const stats = {
      totalScansFound: stuckScans.length,
      scansUpdated: 0,
      errors: [] as string[],
      dryRun,
      thresholdMinutes
    };

    if (stuckScans.length === 0) {
      return success({
        message: 'No stuck scans found',
        stats,
        scans: []
      });
    }

    const scanDetails = stuckScans.map(scan => {
      const durationMinutes = Math.floor((Date.now() - new Date(scan.started_at).getTime()) / (1000 * 60));
      return {
        id: scan.id,
        organizationId: scan.organization_id,
        scanType: scan.scan_type,
        startedAt: scan.started_at,
        durationMinutes
      };
    });

    // Se for dry run, apenas retornar os scans que seriam afetados
    if (dryRun) {
      return success({
        message: `Dry run: Found ${stuckScans.length} stuck scans that would be cleaned up`,
        stats,
        scans: scanDetails
      });
    }

    // Executar a limpeza real
    for (const scan of stuckScans) {
      try {
        const durationMinutes = Math.floor((Date.now() - new Date(scan.started_at).getTime()) / (1000 * 60));
        
        await prisma.securityScan.update({
          where: { id: scan.id },
          data: {
            status: 'failed',
            completed_at: new Date(),
            results: {
              error: 'Manual cleanup: Process was stuck and manually cleaned up',
              duration_minutes: durationMinutes,
              cleanup_timestamp: new Date().toISOString(),
              cleanup_user: user.sub,
              cleanup_reason: 'manual_admin_cleanup',
              original_started_at: scan.started_at
            }
          }
        });

        stats.scansUpdated++;
        
        logger.info('Manually cleaned up stuck scan', {
          scanId: scan.id,
          userId: user.sub,
          durationMinutes
        });

      } catch (scanError) {
        const errorMsg = `Failed to update scan ${scan.id}: ${scanError instanceof Error ? scanError.message : 'Unknown error'}`;
        stats.errors.push(errorMsg);
        logger.error('Error in manual cleanup', {
          scanId: scan.id,
          userId: user.sub,
          error: errorMsg
        });
      }
    }

    logger.info('Manual cleanup completed', {
      userId: user.sub,
      targetOrganizationId,
      totalFound: stats.totalScansFound,
      updated: stats.scansUpdated,
      errors: stats.errors.length
    });

    return success({
      message: `Manual cleanup completed: ${stats.scansUpdated} stuck scans cleaned up`,
      stats,
      scans: scanDetails
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error during manual cleanup';
    logger.error('Manual cleanup failed', {
      error: errorMessage,
      userId: user.sub,
      userOrganizationId
    });

    return error(`Manual cleanup failed: ${errorMessage}`, 500);
  }
}