/**
 * Email Delivery Status Handler
 * Query email delivery events for tracking individual email status
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';

export async function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') return corsOptions();

  const user = getUserFromEvent(event);
  const organizationId = getOrganizationId(user);
  const prisma = getPrismaClient();

  try {
    const params = event.queryStringParameters || {};
    const messageId = params.messageId;
    const recipient = params.recipient;
    const eventType = params.eventType;
    const limit = Math.min(parseInt(params.limit || '50'), 200);
    const offset = parseInt(params.offset || '0');
    const days = parseInt(params.days || '7');

    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: any = {
      timestamp: { gte: since },
    };

    // Filter by org if not super admin
    if (organizationId) {
      where.organization_id = organizationId;
    }

    if (messageId) where.message_id = messageId;
    if (recipient) where.recipient = { contains: recipient, mode: 'insensitive' };
    if (eventType) where.event_type = eventType;

    const [events, total] = await Promise.all([
      prisma.emailEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          message_id: true,
          event_type: true,
          recipient: true,
          sender: true,
          subject: true,
          bounce_type: true,
          bounce_sub_type: true,
          complaint_type: true,
          diagnostic: true,
          timestamp: true,
          created_at: true,
        },
      }),
      prisma.emailEvent.count({ where }),
    ]);

    // Aggregate stats
    const stats = await prisma.emailEvent.groupBy({
      by: ['event_type'],
      where: {
        timestamp: { gte: since },
        ...(organizationId ? { organization_id: organizationId } : {}),
      },
      _count: { event_type: true },
    });

    const statsMap: Record<string, number> = {};
    for (const s of stats) {
      statsMap[s.event_type] = s._count.event_type;
    }

    return success({
      events,
      total,
      limit,
      offset,
      stats: {
        sent: statsMap['Send'] || 0,
        delivered: statsMap['Delivery'] || 0,
        bounced: statsMap['Bounce'] || 0,
        complaints: statsMap['Complaint'] || 0,
        rejected: statsMap['Reject'] || 0,
        opened: statsMap['Open'] || 0,
        clicked: statsMap['Click'] || 0,
        deliveryRate: statsMap['Send'] ? Math.round(((statsMap['Delivery'] || 0) / statsMap['Send']) * 100) : 0,
      },
    });
  } catch (err) {
    logger.error('Failed to fetch email delivery status', err as Error);
    return error('Failed to fetch email delivery status', 500);
  }
}
