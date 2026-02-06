import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Process Events
 * AWS Lambda Handler for process-events
 * 
 * SECURITY NOTE: This handler processes events from ALL organizations.
 * It should ONLY be triggered by EventBridge or internal invocation,
 * NOT exposed via API Gateway to end users.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, unauthorized } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  // Only allow EventBridge or internal invocations
  const isEventBridge = (event as any)['detail-type'] || (event as any).source === 'aws.events';
  const isInternalInvocation = !event.requestContext?.apiId;
  
  if (!isEventBridge && !isInternalInvocation) {
    // If called via API Gateway, require super_admin
    try {
      const { getUserFromEvent, isSuperAdmin } = await import('../../lib/auth.js');
      const user = getUserFromEvent(event);
      if (!isSuperAdmin(user)) {
        logger.warn('Unauthorized process-events attempt via API', { userId: user.sub });
        return unauthorized('Only system or super_admin can trigger event processing');
      }
    } catch {
      return unauthorized('Authentication required');
    }
  }
  
  logger.info('Process Events started', { requestId: context.awsRequestId });
  
  try {
    const prisma = getPrismaClient();
    
    // Buscar eventos pendentes
    const pendingEvents = await prisma.systemEvent.findMany({
      where: {
        processed: false,
      },
      orderBy: { created_at: 'asc' },
      take: 50,
    });
    
    logger.info('Found pending events', { count: pendingEvents.length });
    
    const results = [];
    
    for (const evt of pendingEvents) {
      try {
        // Processar evento baseado no tipo
        await processEvent(prisma, evt);
        
        // Marcar como processado
        await prisma.systemEvent.update({
          where: { id: evt.id },
          data: {
            processed: true,
            processed_at: new Date(),
          },
        });
        
        results.push({
          eventId: evt.id,
          eventType: evt.event_type,
          status: 'processed',
        });
        
      } catch (err) {
        logger.error('Error processing event', err as Error, { eventId: evt.id, eventType: evt.event_type });
        
        results.push({
          eventId: evt.id,
          eventType: evt.event_type,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
    
    logger.info('Events processing completed', { processedCount: results.length });
    
    return success({
      success: true,
      eventsProcessed: results.length,
      results,
    });
    
  } catch (err) {
    logger.error('Process Events error', err as Error, { requestId: context.awsRequestId });
    return error('An unexpected error occurred. Please try again.', 500);
  }
}

async function processEvent(prisma: any, event: any) {
  const { event_type: eventType, payload } = event;
  
  switch (eventType) {
    case 'user_created':
      await handleUserCreated(prisma, payload);
      break;
    
    case 'alert_triggered':
      await handleAlertTriggered(prisma, payload);
      break;
    
    case 'scan_completed':
      await handleScanCompleted(prisma, payload);
      break;
    
    case 'cost_threshold_exceeded':
      await handleCostThreshold(prisma, payload);
      break;
    
    default:
      logger.warn('Unknown event type', { eventType });
  }
}

async function handleUserCreated(prisma: any, payload: any) {
  logger.info('Processing user_created event', { userId: payload?.userId });
}

async function handleAlertTriggered(prisma: any, payload: any) {
  logger.info('Processing alert_triggered event', { alertId: payload?.alertId });
}

async function handleScanCompleted(prisma: any, payload: any) {
  logger.info('Processing scan_completed event', { scanId: payload?.scanId });
}

async function handleCostThreshold(prisma: any, payload: any) {
  logger.info('Processing cost_threshold_exceeded event', { threshold: payload?.threshold });
}
