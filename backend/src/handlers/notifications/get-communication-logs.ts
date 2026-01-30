import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Get Communication Logs
 * AWS Lambda Handler for get-communication-logs
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

// Zod schema for communication logs query
const getCommunicationLogsSchema = z.object({
  channel: z.enum(['email', 'sms', 'webhook', 'slack', 'sns']).optional(),
  status: z.enum(['sent', 'failed', 'pending', 'delivered']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Get Communication Logs started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    // Validate input with Zod
    const validation = parseAndValidateBody(getCommunicationLogsSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { channel, status, limit, offset } = validation.data;
    
    const prisma = getPrismaClient();
    
    const logs = await prisma.communicationLog.findMany({
      where: {
        organization_id: organizationId,
        ...(channel && { channel }),
        ...(status && { status }),
      },
      orderBy: { sent_at: 'desc' },
      take: limit,
      skip: offset,
    });
    
    const total = await prisma.communicationLog.count({
      where: {
        organization_id: organizationId,
        ...(channel && { channel }),
        ...(status && { status }),
      },
    });
    
    logger.info(`✅ Retrieved ${logs.length} communication logs`);
    
    return success({
      success: true,
      logs,
      pagination: {
        total,
        limit,
        offset,
        hasMore: (offset ?? 0) + logs.length < total,
      },
    });
    
  } catch (err) {
    logger.error('❌ Get Communication Logs error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
