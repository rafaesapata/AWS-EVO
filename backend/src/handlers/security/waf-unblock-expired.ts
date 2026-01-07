/**
 * WAF Unblock Expired IPs Lambda Handler
 * 
 * Scheduled Lambda that runs periodically to remove expired IP blocks.
 * Should be triggered by CloudWatch Events/EventBridge rule (e.g., every 5 minutes).
 */

import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { WAFV2Client } from '@aws-sdk/client-wafv2';
import { unblockExpiredIps, DEFAULT_AUTO_BLOCK_CONFIG } from '../../lib/waf/auto-blocker.js';
import type { LambdaContext } from '../../types/lambda.js';

interface ScheduledEvent {
  source: string;
  'detail-type': string;
  time: string;
}

interface UnblockResult {
  success: boolean;
  totalExpired: number;
  unblocked: number;
  errors: number;
  details: Array<{
    organizationId: string;
    unblocked: number;
    errors: number;
  }>;
}

export async function handler(
  event: ScheduledEvent,
  context: LambdaContext
): Promise<UnblockResult> {
  const startTime = Date.now();
  
  logger.info('WAF Unblock Expired started', {
    requestId: context.awsRequestId,
    eventTime: event.time,
  });
  
  const prisma = getPrismaClient();
  const result: UnblockResult = {
    success: true,
    totalExpired: 0,
    unblocked: 0,
    errors: 0,
    details: [],
  };
  
  try {
    // Find all expired blocks grouped by organization
    const expiredBlocks = await prisma.wafBlockedIp.findMany({
      where: {
        is_active: true,
        expires_at: {
          lte: new Date(),
        },
      },
    });
    
    result.totalExpired = expiredBlocks.length;
    
    if (expiredBlocks.length === 0) {
      logger.info('No expired blocks found');
      return result;
    }
    
    // Group by organization
    const blocksByOrg = expiredBlocks.reduce((acc, block) => {
      if (!acc[block.organization_id]) {
        acc[block.organization_id] = [];
      }
      acc[block.organization_id].push(block);
      return acc;
    }, {} as Record<string, typeof expiredBlocks>);
    
    // Process each organization
    for (const [orgId, blocks] of Object.entries(blocksByOrg)) {
      let orgUnblocked = 0;
      let orgErrors = 0;
      
      // Get AWS credentials for this organization
      const account = await prisma.awsCredential.findFirst({
        where: {
          organization_id: orgId,
          is_active: true,
        },
      });
      
      if (!account) {
        logger.warn('No active AWS credentials for organization', { orgId });
        // Still mark as inactive in database even if we can't update WAF
        for (const block of blocks) {
          await prisma.wafBlockedIp.update({
            where: { id: block.id },
            data: { is_active: false },
          });
          orgUnblocked++;
        }
        result.details.push({ organizationId: orgId, unblocked: orgUnblocked, errors: orgErrors });
        continue;
      }
      
      try {
        const resolvedCreds = await resolveAwsCredentials(account, 'us-east-1');
        const wafClient = new WAFV2Client({
          region: 'us-east-1',
          credentials: toAwsCredentials(resolvedCreds),
        });
        
        const unblockResult = await unblockExpiredIps(
          prisma,
          wafClient,
          DEFAULT_AUTO_BLOCK_CONFIG
        );
        
        orgUnblocked = unblockResult.unblocked;
        orgErrors = unblockResult.errors;
        
      } catch (err) {
        logger.error('Failed to process organization', err as Error, { orgId });
        orgErrors = blocks.length;
      }
      
      result.unblocked += orgUnblocked;
      result.errors += orgErrors;
      result.details.push({ organizationId: orgId, unblocked: orgUnblocked, errors: orgErrors });
    }
    
    result.success = result.errors === 0;
    
  } catch (err) {
    logger.error('WAF Unblock Expired error', err as Error, {
      requestId: context.awsRequestId,
    });
    result.success = false;
    result.errors++;
  }
  
  const processingTime = Date.now() - startTime;
  
  logger.info('WAF Unblock Expired completed', {
    requestId: context.awsRequestId,
    ...result,
    processingTimeMs: processingTime,
  });
  
  return result;
}
