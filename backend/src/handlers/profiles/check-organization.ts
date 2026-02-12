import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Check Organization Binding Handler
 * Verifica se um usuário tem vínculo com uma organização
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';

interface CheckOrganizationRequest {
  userId: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.['origin'] || event.headers?.['Origin'] || '*';
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const user = getUserFromEvent(event);
    
    logger.info('Check organization binding started', { 
      userId: user.sub,
      requestId: context.awsRequestId 
    });

    // Get organization ID from the authenticated user's token
    const organizationId = getOrganizationId(user);
    const organizationName = user['custom:organization_name'] || `Organization ${organizationId.substring(0, 8)}`;
    
    logger.info('Organization check completed', { 
      userId: user.sub,
      hasOrganization: true,
      organizationId,
    });

    return success({
      hasOrganization: true,
      organizationId,
      organizationName,
    }, 200, origin);
  } catch (err: any) {
    logger.error('Check organization error', err, { 
      requestId: context.awsRequestId,
      errorMessage: err.message,
    });
    
    // Return specific error for organization not found
    if (err.message?.includes('Organization not found') || err.message?.includes('Invalid organization ID')) {
      return error('Organization not found. Please logout and login again to refresh your session.', 401, undefined, origin);
    }
    
    return error('Erro ao verificar vínculo de organização', 500, undefined, origin);
  }
}
