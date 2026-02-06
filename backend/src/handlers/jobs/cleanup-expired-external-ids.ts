import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Cleanup Expired External IDs
 * AWS Lambda Handler for cleanup-expired-external-ids
 * 
 * SECURITY NOTE: This handler intentionally does NOT filter by organization_id.
 * This is by design because:
 * 
 * 1. External IDs are temporary, globally unique identifiers used for AWS STS AssumeRole
 * 2. They are created during the AWS account connection flow and expire after 30 days
 * 3. Each External ID is cryptographically random and cannot be guessed
 * 4. The cleanup is a system-level maintenance task triggered by EventBridge
 * 5. No sensitive data is exposed - only expired, unused IDs are deleted
 * 
 * The External ID pattern follows AWS best practices for cross-account access:
 * https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-user_externalid.html
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
  
  if (getHttpMethod(event) === 'OPTIONS') {
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
    return error('An unexpected error occurred. Please try again.', 500);
  }
}
