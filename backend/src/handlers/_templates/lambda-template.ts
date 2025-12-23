import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Template para novas Lambdas
 * Copie este arquivo e adapte conforme necessário
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';

interface RequestBody {
  accountId?: string;
  // Adicionar outros parâmetros
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  console.log('🚀 Lambda started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: RequestBody = event.body ? JSON.parse(event.body) : {};
    const { accountId } = body;
    
    const prisma = getPrismaClient();
    
    // Sua lógica aqui
    
    console.log('✅ Lambda completed');
    
    return success({
      message: 'Success',
    });
    
  } catch (err) {
    console.error('❌ Lambda error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
