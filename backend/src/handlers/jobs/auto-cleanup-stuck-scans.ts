/**
 * Lambda handler for Auto Cleanup Stuck Scans
 * AWS Lambda Handler for auto-cleanup-stuck-scans
 * 
 * Automatically cleans up scans that have been stuck in "running" status
 * for too long. Triggered by EventBridge every 2 hours.
 * 
 * SECURITY NOTE: This handler processes scans from ALL organizations.
 * This is intentional because:
 * 1. It's a system-level maintenance task triggered by EventBridge
 * 2. Each scan has its own organization_id
 * 3. No sensitive data is exposed - only stuck scans are cleaned up
 * 
 * @schedule rate(2 hours)
 */

import type { LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

// EventBridge scheduled event type
interface ScheduledEvent {
  'detail-type'?: string;
  source?: string;
  time?: string;
  detail?: {
    thresholdMinutes?: number;
    maxScansToCleanup?: number;
  };
  requestContext?: {
    http?: { method: string };
  };
}

interface CleanupStats {
  totalScansChecked: number;
  stuckScansFound: number;
  scansUpdated: number;
  backgroundJobsCleaned: number;
  errors: string[];
}

export async function handler(
  event: ScheduledEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  const startTime = Date.now();
  
  // Get configuration from event or use defaults
  const thresholdMinutes = event.detail?.thresholdMinutes || 30;
  const maxScansToCleanup = event.detail?.maxScansToCleanup || 100;
  
  logger.info('Auto Cleanup Stuck Scans started', { 
    requestId: context.awsRequestId,
    source: event.source || 'api-gateway',
    thresholdMinutes,
    maxScansToCleanup
  });

  const prisma = getPrismaClient();
  const stats: CleanupStats = {
    totalScansChecked: 0,
    stuckScansFound: 0,
    scansUpdated: 0,
    backgroundJobsCleaned: 0,
    errors: []
  };

  try {
    const stuckThreshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);

    // 1. Clean up stuck security scans
    const stuckScans = await prisma.securityScan.findMany({
      where: {
        status: { in: ['running', 'pending', 'starting'] },
        started_at: { lt: stuckThreshold }
      },
      select: {
        id: true,
        organization_id: true,
        aws_account_id: true,
        scan_type: true,
        started_at: true,
        created_at: true
      },
      orderBy: { started_at: 'asc' },
      take: maxScansToCleanup
    });

    stats.totalScansChecked = stuckScans.length;
    stats.stuckScansFound = stuckScans.length;

    logger.info('Found stuck security scans', { count: stuckScans.length });

    for (const scan of stuckScans) {
      try {
        const durationMinutes = Math.floor(
          (Date.now() - new Date(scan.started_at!).getTime()) / (1000 * 60)
        );
        
        await prisma.securityScan.update({
          where: { id: scan.id },
          data: {
            status: 'failed',
            completed_at: new Date(),
            results: {
              error: `Scan cleanup: Process was stuck for more than ${thresholdMinutes} minutes`,
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
          scanType: scan.scan_type,
          durationMinutes,
          organizationId: scan.organization_id
        });

      } catch (scanError) {
        const errorMsg = `Failed to update scan ${scan.id}: ${scanError instanceof Error ? scanError.message : 'Unknown error'}`;
        stats.errors.push(errorMsg);
        logger.error('Error updating stuck scan', { scanId: scan.id, error: errorMsg });
      }
    }

    // 2. Clean up stuck background jobs
    const stuckJobs = await prisma.backgroundJob.findMany({
      where: {
        status: { in: ['running', 'pending'] },
        started_at: { lt: stuckThreshold }
      },
      select: {
        id: true,
        organization_id: true,
        job_type: true,
        started_at: true
      },
      take: maxScansToCleanup
    });

    logger.info('Found stuck background jobs', { count: stuckJobs.length });

    for (const job of stuckJobs) {
      try {
        const durationMinutes = Math.floor(
          (Date.now() - new Date(job.started_at!).getTime()) / (1000 * 60)
        );
        
        await prisma.backgroundJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            completed_at: new Date(),
            error: `Job cleanup: Process was stuck for more than ${thresholdMinutes} minutes (${durationMinutes} min)`
          }
        });

        stats.backgroundJobsCleaned++;
        
        logger.info('Updated stuck job to failed status', {
          jobId: job.id,
          jobType: job.job_type,
          durationMinutes,
          organizationId: job.organization_id
        });

      } catch (jobError) {
        const errorMsg = `Failed to update job ${job.id}: ${jobError instanceof Error ? jobError.message : 'Unknown error'}`;
        stats.errors.push(errorMsg);
        logger.error('Error updating stuck job', { jobId: job.id, error: errorMsg });
      }
    }

    // 3. Clean up old completed/failed jobs (older than 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const oldJobsDeleted = await prisma.backgroundJob.deleteMany({
      where: {
        status: { in: ['completed', 'failed'] },
        completed_at: { lt: thirtyDaysAgo }
      }
    });

    logger.info('Deleted old completed/failed jobs', { count: oldJobsDeleted.count });

    const durationMs = Date.now() - startTime;

    logger.info('Auto Cleanup completed', {
      ...stats,
      oldJobsDeleted: oldJobsDeleted.count,
      durationMs
    });

    return success({
      success: true,
      message: `Cleanup completed: ${stats.scansUpdated} scans, ${stats.backgroundJobsCleaned} jobs updated`,
      stats: {
        ...stats,
        oldJobsDeleted: oldJobsDeleted.count
      },
      config: {
        thresholdMinutes,
        maxScansToCleanup
      },
      durationMs
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error during cleanup';
    logger.error('Auto Cleanup job failed', {
      error: errorMessage,
      stack: err instanceof Error ? err.stack : undefined
    });

    return error('Cleanup failed. Check logs for details.', 500);
  }
}
