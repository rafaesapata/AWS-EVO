/**
 * Cleanup Expired OAuth States Handler
 * 
 * Scheduled job to clean up expired OAuth states from the database.
 * This prevents accumulation of stale state records and maintains database hygiene.
 * 
 * @endpoint N/A (scheduled job)
 * @schedule Every hour via EventBridge
 */

import type { LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';

// Cleanup thresholds
const EXPIRED_STATE_THRESHOLD_HOURS = 1; // Delete expired states older than 1 hour
const USED_STATE_THRESHOLD_HOURS = 24;   // Delete used states older than 24 hours

// EventBridge scheduled event type
interface ScheduledEvent {
  'detail-type': string;
  source: string;
  time: string;
  region: string;
  resources: string[];
  detail: Record<string, any>;
}

export async function handler(
  event: ScheduledEvent | Record<string, any>,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const startTime = Date.now();
  
  try {
    const prisma = getPrismaClient();
    
    logger.info('Starting OAuth states cleanup job');

    // Calculate thresholds
    const expiredThreshold = new Date(Date.now() - EXPIRED_STATE_THRESHOLD_HOURS * 60 * 60 * 1000);
    const usedThreshold = new Date(Date.now() - USED_STATE_THRESHOLD_HOURS * 60 * 60 * 1000);

    // Delete expired states (states that have passed their expiration time)
    const expiredDeleted = await prisma.oAuthState.deleteMany({
      where: {
        expires_at: { lt: expiredThreshold },
      },
    });

    // Delete used states older than threshold (already processed callbacks)
    const usedDeleted = await prisma.oAuthState.deleteMany({
      where: {
        used: true,
        created_at: { lt: usedThreshold },
      },
    });

    // Get count of remaining states for monitoring
    const remainingCount = await prisma.oAuthState.count();
    const pendingCount = await prisma.oAuthState.count({
      where: {
        used: false,
        expires_at: { gt: new Date() },
      },
    });

    const duration = Date.now() - startTime;

    logger.info('OAuth states cleanup completed', {
      expiredDeleted: expiredDeleted.count,
      usedDeleted: usedDeleted.count,
      totalDeleted: expiredDeleted.count + usedDeleted.count,
      remainingStates: remainingCount,
      pendingStates: pendingCount,
      durationMs: duration,
    });

    return success({
      success: true,
      cleanup: {
        expiredDeleted: expiredDeleted.count,
        usedDeleted: usedDeleted.count,
        totalDeleted: expiredDeleted.count + usedDeleted.count,
      },
      stats: {
        remainingStates: remainingCount,
        pendingStates: pendingCount,
      },
      durationMs: duration,
    });
  } catch (err: any) {
    logger.error('Error during OAuth states cleanup', {
      error: err.message,
      stack: err.stack,
    });
    
    return error('Failed to cleanup OAuth states', 500);
  }
}
