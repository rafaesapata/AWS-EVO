import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Get Communication Logs
 * AWS Lambda Handler for get-communication-logs
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logger.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

// Zod schema for communication logs query
const getCommunicationLogsSchema = z.object({
  channel: z.enum(['email', 'sms', 'webhook', 'slack', 'sns']).optional(),
  status: z.enum(['sent', 'failed', 'pending', 'delivered']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  accountId: z.string().optional(),
});

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Get Communication Logs started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  const origin = event.headers?.['origin'] || event.headers?.['Origin'] || '*';
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    // Validate input with Zod
    const validation = parseAndValidateBody(getCommunicationLogsSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { channel, status, search, page = 1, pageSize = 25 } = validation.data;
    const offset = ((page ?? 1) - 1) * (pageSize ?? 25);
    
    const prisma = getPrismaClient();
    
    const whereClause: any = {
      organization_id: organizationId,
      ...(channel && { channel }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { recipient: { contains: search, mode: 'insensitive' } },
          { subject: { contains: search, mode: 'insensitive' } },
          { message: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    
    const [logs, total, byChannelRaw, byStatusRaw] = await Promise.all([
      prisma.communicationLog.findMany({
        where: whereClause,
        orderBy: { sent_at: 'desc' },
        take: pageSize,
        skip: offset,
      }),
      prisma.communicationLog.count({ where: whereClause }),
      prisma.communicationLog.groupBy({
        by: ['channel'],
        where: { organization_id: organizationId },
        _count: true,
      }),
      prisma.communicationLog.groupBy({
        by: ['status'],
        where: { organization_id: organizationId },
        _count: true,
      }),
    ]);
    
    const byChannel: Record<string, number> = {};
    for (const row of byChannelRaw) byChannel[row.channel] = row._count;
    const byStatus: Record<string, number> = {};
    for (const row of byStatusRaw) byStatus[row.status] = row._count;
    
    logger.info(`✅ Retrieved ${logs.length} communication logs`);
    
    return success({
      data: logs,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / (pageSize ?? 25)),
      },
      stats: {
        total,
        byChannel,
        byStatus,
      },
    });
    
  } catch (err) {
    logger.error('❌ Get Communication Logs error:', err);
    return error('An unexpected error occurred. Please try again.', 500, undefined, origin);
  }
}
