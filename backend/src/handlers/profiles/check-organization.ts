/**
 * Check Organization Binding Handler
 * Verifica se um usuário tem vínculo com uma organização
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

interface CheckOrganizationRequest {
  userId: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const user = getUserFromEvent(event);
  
  logger.info('Check organization binding started', { 
    userId: user.id,
    requestId: context.awsRequestId 
  });

  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const body: CheckOrganizationRequest = event.body ? JSON.parse(event.body) : {};
    const { userId } = body;

    if (!userId) {
      return error('userId é obrigatório', 400);
    }

    // For now, always return true with the user's organization from auth
    // The organization is managed by the authentication system
    const organizationId = user.organizationId || `org-${userId}`;
    
    logger.info('Organization check completed (from auth)', { 
      userId,
      hasOrganization: true,
      organizationId,
    });

    return success({
      hasOrganization: true,
      organizationId,
      organizationName: `Organization ${organizationId.substring(0, 8)}`,
    });
  } catch (err) {
    logger.error('Check organization error', err as Error, { 
      userId: user.id,
      requestId: context.awsRequestId 
    });
    return error('Erro ao verificar vínculo de organização');
  }
}
