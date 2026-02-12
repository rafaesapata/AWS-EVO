/**
 * Lambda handler para limpeza automática de scans travados via EventBridge
 * Executa periodicamente para manter o sistema limpo
 */

import type { EventBridgeEvent, Context } from 'aws-lambda';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';

interface CleanupEventDetail {
  thresholdMinutes?: number;
  maxScansToCleanup?: number;
  organizationId?: string;
}

export async function handler(
  event: EventBridgeEvent<'Scheduled Event', CleanupEventDetail>,
  _context: Context
): Promise<void> {
  const prisma = getPrismaClient();
  
  try {
    const detail = event.detail || {};
    const thresholdMinutes = detail.thresholdMinutes || 60; // Padrão: 1 hora para automático
    const maxScansToCleanup = detail.maxScansToCleanup || 50; // Limite de segurança
    const targetOrganizationId = detail.organizationId; // Opcional: limitar a uma org

    const stuckThreshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);

    logger.info('Automated cleanup started', {
      thresholdMinutes,
      maxScansToCleanup,
      targetOrganizationId,
      scheduledTime: event.time
    });

    // Buscar scans travados (running, pending, starting)
    const whereClause: any = {
      status: { in: ['running', 'pending', 'starting'] },
      OR: [
        { started_at: { lt: stuckThreshold } },
        // Pending scans that were never started - use created_at
        { status: 'pending', started_at: null, created_at: { lt: stuckThreshold } },
      ],
    };

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
      },
      take: maxScansToCleanup // Limitar para evitar sobrecarga
    });

    const stats = {
      totalScansFound: stuckScans.length,
      scansUpdated: 0,
      errors: [] as string[],
      thresholdMinutes,
      maxScansToCleanup
    };

    if (stuckScans.length === 0) {
      logger.info('Automated cleanup completed - no stuck scans found', stats);
      return;
    }

    logger.info(`Found ${stuckScans.length} stuck scans to cleanup`, {
      scans: stuckScans.map(s => ({
        id: s.id,
        organizationId: s.organization_id,
        scanType: s.scan_type,
        durationMinutes: Math.floor((Date.now() - new Date(s.started_at).getTime()) / (1000 * 60))
      }))
    });

    // Executar a limpeza
    for (const scan of stuckScans) {
      try {
        const durationMinutes = Math.floor((Date.now() - new Date(scan.started_at || scan.created_at).getTime()) / (1000 * 60));
        
        await prisma.securityScan.update({
          where: { id: scan.id },
          data: {
            status: 'failed',
            completed_at: new Date(),
            results: {
              error: 'Automated cleanup: Process was stuck and automatically cleaned up',
              duration_minutes: durationMinutes,
              cleanup_timestamp: new Date().toISOString(),
              cleanup_type: 'automated_scheduled_cleanup',
              cleanup_threshold_minutes: thresholdMinutes,
              original_started_at: scan.started_at
            }
          }
        });

        stats.scansUpdated++;
        
        logger.info('Automatically cleaned up stuck scan', {
          scanId: scan.id,
          organizationId: scan.organization_id,
          scanType: scan.scan_type,
          durationMinutes
        });

      } catch (scanError) {
        const errorMsg = `Failed to update scan ${scan.id}: ${scanError instanceof Error ? scanError.message : 'Unknown error'}`;
        stats.errors.push(errorMsg);
        logger.error('Error in automated cleanup', {
          scanId: scan.id,
          error: errorMsg
        });
      }
    }

    // Também limpar análises CloudTrail travadas
    try {
      const stuckCloudTrailAnalyses = await prisma.cloudTrailAnalysis.findMany({
        where: {
          status: 'running',
          started_at: {
            lt: stuckThreshold
          },
          ...(targetOrganizationId && { organization_id: targetOrganizationId })
        },
        select: {
          id: true,
          organization_id: true,
          aws_account_id: true,
          started_at: true
        },
        take: maxScansToCleanup
      });

      for (const analysis of stuckCloudTrailAnalyses) {
        try {
          const durationMinutes = analysis.started_at ? Math.floor((Date.now() - new Date(analysis.started_at).getTime()) / (1000 * 60)) : 0;
          
          await prisma.cloudTrailAnalysis.update({
            where: { id: analysis.id },
            data: {
              status: 'failed',
              completed_at: new Date(),
              error_message: 'Automated cleanup: CloudTrail analysis was stuck and automatically cleaned up'
            }
          });

          stats.scansUpdated++;
          
          logger.info('Automatically cleaned up stuck CloudTrail analysis', {
            analysisId: analysis.id,
            organizationId: analysis.organization_id,
            durationMinutes
          });

        } catch (analysisError) {
          const errorMsg = `Failed to update CloudTrail analysis ${analysis.id}: ${analysisError instanceof Error ? analysisError.message : 'Unknown error'}`;
          stats.errors.push(errorMsg);
          logger.error('Error cleaning up CloudTrail analysis', {
            analysisId: analysis.id,
            error: errorMsg
          });
        }
      }

    } catch (cloudTrailError) {
      logger.error('Error processing CloudTrail analyses cleanup', {
        error: cloudTrailError instanceof Error ? cloudTrailError.message : 'Unknown error'
      });
    }

    // Limpar background jobs travados (pending/running por muito tempo)
    try {
      const stuckJobs = await prisma.backgroundJob.findMany({
        where: {
          status: { in: ['running', 'pending'] },
          OR: [
            // Running jobs with started_at older than threshold
            { status: 'running', started_at: { lt: stuckThreshold } },
            // Pending jobs that were never started - use created_at
            { status: 'pending', created_at: { lt: stuckThreshold } },
          ],
          ...(targetOrganizationId && { organization_id: targetOrganizationId })
        },
        select: {
          id: true,
          organization_id: true,
          job_type: true,
          status: true,
          started_at: true,
          created_at: true,
          payload: true,
        },
        take: maxScansToCleanup
      });

      for (const job of stuckJobs) {
        try {
          const referenceTime = job.started_at || job.created_at;
          const durationMinutes = referenceTime ? Math.floor((Date.now() - new Date(referenceTime).getTime()) / (1000 * 60)) : 0;
          
          await prisma.backgroundJob.update({
            where: { id: job.id },
            data: {
              status: 'failed',
              completed_at: new Date(),
              error: `Automated cleanup: Job was stuck in '${job.status}' for ${durationMinutes} minutes (threshold: ${thresholdMinutes} min)`
            }
          });

          // Also mark associated scan as failed if payload contains scanId
          const payload = job.payload as any;
          if (payload?.scanId) {
            await prisma.securityScan.update({
              where: { id: payload.scanId },
              data: {
                status: 'failed',
                completed_at: new Date(),
                results: {
                  error: `Automated cleanup: Background job was stuck in '${job.status}'`,
                  cleanup_type: 'automated_scheduled_cleanup',
                  duration_minutes: durationMinutes,
                },
              },
            }).catch(() => {}); // Ignore if scan doesn't exist
          }

          stats.scansUpdated++;
          
          logger.info('Automatically cleaned up stuck background job', {
            jobId: job.id,
            jobType: job.job_type,
            organizationId: job.organization_id,
            durationMinutes
          });

        } catch (jobError) {
          const errorMsg = `Failed to update job ${job.id}: ${jobError instanceof Error ? jobError.message : 'Unknown error'}`;
          stats.errors.push(errorMsg);
          logger.error('Error cleaning up background job', {
            jobId: job.id,
            error: errorMsg
          });
        }
      }

      logger.info('Background jobs cleanup', { found: stuckJobs.length });

    } catch (jobsError) {
      logger.error('Error processing background jobs cleanup', {
        error: jobsError instanceof Error ? jobsError.message : 'Unknown error'
      });
    }

    logger.info('Automated cleanup completed', {
      totalFound: stats.totalScansFound,
      updated: stats.scansUpdated,
      errors: stats.errors.length,
      errorDetails: stats.errors
    });

    // Se houver muitos erros, logar como warning
    if (stats.errors.length > stats.scansUpdated * 0.1) { // Mais de 10% de erro
      logger.warn('High error rate in automated cleanup', {
        errorRate: (stats.errors.length / (stats.scansUpdated + stats.errors.length)) * 100,
        totalErrors: stats.errors.length
      });
    }

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error during automated cleanup';
    logger.error('Automated cleanup failed', {
      error: errorMessage,
      eventSource: event.source,
      eventTime: event.time
    });
    
    // Re-throw para que o EventBridge saiba que falhou
    throw new Error(`Automated cleanup failed: ${errorMessage}`);
  }
}