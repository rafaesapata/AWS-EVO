/**
 * Lambda handler for Cleanup Expired External IDs
 * AWS Lambda Handler for cleanup-expired-external-ids
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('Cleanup Expired External IDs started', { requestId: context.awsRequestId });
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const prisma = getPrismaClient();
    
    // Buscar external IDs expirados (mais de 30 dias)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const expiredIds = await prisma.externalId.findMany({
      where: {
        created_at: {
          lt: thirtyDaysAgo,
        },
        used: false,
      },
    });
    
    logger.info('Found expired external IDs', { expiredCount: expiredIds.length });
    
    // Deletar IDs expirados
    const deleted = await prisma.externalId.deleteMany({
      where: {
        id: {
          in: expiredIds.map(e => e.id),
        },
      },
    });
    
    logger.info('Cleanup completed successfully', { deletedCount: deleted.count });
    
    return success({
      success: true,
      deletedCount: deleted.count,
      expiredIds: expiredIds.map(e => e.id),
    });
    
  } catch (err) {
    logger.error('Cleanup Expired External IDs error', err as Error, { requestId: context.awsRequestId });
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
