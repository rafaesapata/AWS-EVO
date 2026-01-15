/**
 * Auto-cleanup stuck scans handler
 * This handler can be invoked directly (without API Gateway auth) to cleanup stuck scans
 * Designed to be called by EventBridge scheduler or manually via AWS CLI
 */

import type { LambdaContext } from '../../types/lambda.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

interface CleanupEvent {
  thresholdMinutes?: number;
  organizationId?: string;
}

interface CleanupResult {
  success: boolean;
  message: string;
  stats: {
    totalFound: number;
    cleaned: number;
    errors: string[];
  };
  scans?: Array<{
    id: string;
    organizationId: string;
    scanType: string;
    startedAt: Date;
    durationMinutes: number;
  }>;
}

export async function handler(
  event: CleanupEvent,
  _context: LambdaContext
): Promise<CleanupResult> {
  const thresholdMinutes = event.thresholdMinutes || 60; // Default: 60 minutes
  const targetOrganizationId = event.organizationId;
  
  logger.info('Auto-cleanup stuck scans started', { thresholdMinutes, targetOrganizationId });
  
  const prisma = getPrismaClient();
  
  try {
    const stuckThreshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);
    
    // Build where clause
    const whereClause: any = {
      status: { in: ['running', 'pending', 'starting'] },
      started_at: { lt: stuckThreshold }
    };
    
    if (targetOrganizationId) {
      whereClause.organization_id = targetOrganizationId;
    }
    
    // Find stuck scans
    const stuckScans = await prisma.securityScan.findMany({
      where: whereClause,
      select: {
        id: true,
        organization_id: true,
        scan_type: true,
        started_at: true,
      },
      orderBy: { started_at: 'asc' }
    });
    
    const stats = {
      totalFound: stuckScans.length,
      cleaned: 0,
      errors: [] as string[]
    };
    
    if (stuckScans.length === 0) {
      logger.info('No stuck scans found');
      return {
        success: true,
        message: 'No stuck scans found',
        stats
      };
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
    
    // Cleanup stuck scans
    for (const scan of stuckScans) {
      try {
        const durationMinutes = Math.floor((Date.now() - new Date(scan.started_at).getTime()) / (1000 * 60));
        
        await prisma.securityScan.update({
          where: { id: scan.id },
          data: {
            status: 'failed',
            completed_at: new Date(),
            results: {
              error: `Auto-cleanup: Scan was stuck for ${durationMinutes} minutes (threshold: ${thresholdMinutes} min)`,
              cleanup_reason: 'automatic_stuck_scan_cleanup',
              cleanup_timestamp: new Date().toISOString(),
              original_started_at: scan.started_at
            }
          }
        });
        
        stats.cleaned++;
        logger.info('Cleaned up stuck scan', { scanId: scan.id, durationMinutes });
        
      } catch (scanError) {
        const errorMsg = `Failed to cleanup scan ${scan.id}: ${scanError instanceof Error ? scanError.message : 'Unknown error'}`;
        stats.errors.push(errorMsg);
        logger.error('Error cleaning up scan', { scanId: scan.id, error: errorMsg });
      }
    }
    
    logger.info('Auto-cleanup completed', stats);
    
    return {
      success: true,
      message: `Cleaned up ${stats.cleaned} stuck scan(s)`,
      stats,
      scans: scanDetails
    };
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Auto-cleanup failed', { error: errorMessage });
    
    return {
      success: false,
      message: `Cleanup failed: ${errorMessage}`,
      stats: {
        totalFound: 0,
        cleaned: 0,
        errors: [errorMessage]
      }
    };
  }
}
