/**
 * Lambda handler for Get Communication Logs
 * AWS Lambda Handler for get-communication-logs
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';

interface GetCommunicationLogsRequest {
  channel?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Get Communication Logs started');
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: GetCommunicationLogsRequest = event.body ? JSON.parse(event.body) : {};
    const { channel, status, limit = 50, offset = 0 } = body;
    
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
        hasMore: offset + logs.length < total,
      },
    });
    
  } catch (err) {
    logger.error('❌ Get Communication Logs error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
