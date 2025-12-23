/**
 * Lambda handler para listar credenciais AWS da organização
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

/**
 * Get origin from event for CORS headers
 */
function getOriginFromEvent(event: AuthorizedEvent): string {
  const headers = event.headers || {};
  return headers['origin'] || headers['Origin'] || '*';
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOriginFromEvent(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  let organizationId: string;
  let userId: string;

  try {
    const user = getUserFromEvent(event);
    userId = user.sub || user.id || 'unknown';
    organizationId = getOrganizationId(user);
  } catch (authError: any) {
    logger.error('Authentication error', authError);
    return error('Authentication failed: ' + (authError.message || 'Unknown error'), 401, undefined, origin);
  }
  
  logger.info('List AWS credentials started', { 
    organizationId,
    userId,
    requestId: context.awsRequestId 
  });
  
  try {
    const prisma = getPrismaClient();
    
    // Get all active credentials for the organization
    const credentials = await prisma.awsCredential.findMany({
      where: {
        organization_id: organizationId,
        is_active: true,
      },
      orderBy: {
        created_at: 'desc',
      },
      select: {
        id: true,
        account_id: true,
        account_name: true,
        access_key_id: true,
        external_id: true,
        regions: true,
        is_active: true,
        created_at: true,
        updated_at: true,
        // Don't return secret_access_key for security
      },
    });
    
    logger.info('AWS credentials listed successfully', { 
      organizationId,
      count: credentials.length,
    });
    
    return success(credentials, 200, origin);
    
  } catch (err: any) {
    logger.error('List AWS credentials error', err, { 
      organizationId,
      userId,
      requestId: context.awsRequestId,
    });
    
    return error(err instanceof Error ? err.message : 'Failed to list AWS credentials', 500, undefined, origin);
  }
}
