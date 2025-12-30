/**
 * Lambda handler para limpar dados de custo antigos/incorretos
 * Remove todos os registros da tabela daily_costs para permitir re-fetch
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  logger.info('Cleanup Cost Data started', { requestId: context.awsRequestId });
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const prisma = getPrismaClient();
    
    // Contar registros antes da limpeza
    const countBefore = await prisma.dailyCost.count({
      where: {
        organization_id: organizationId,
      },
    });
    
    logger.info('Cleaning up cost data', { 
      organizationId,
      recordsToDelete: countBefore
    });
    
    // Deletar todos os registros de custo da organização
    const deleteResult = await prisma.dailyCost.deleteMany({
      where: {
        organization_id: organizationId,
      },
    });
    
    logger.info('Cost data cleanup completed', { 
      organizationId,
      deletedRecords: deleteResult.count
    });
    
    return success({
      success: true,
      message: `Deleted ${deleteResult.count} cost records`,
      deletedRecords: deleteResult.count,
      organizationId
    }, 200, origin);
    
  } catch (err: any) {
    logger.error('Cleanup cost data error', err, { 
      organizationId: 'unknown',
      requestId: context.awsRequestId,
    });
    
    return error(err instanceof Error ? err.message : 'Failed to cleanup cost data', 500, undefined, origin);
  }
}