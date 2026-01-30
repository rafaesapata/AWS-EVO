/**
 * Lambda handler for Disable Cognito User
 * Desabilita um usuário no Cognito e atualiza status no banco
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, badRequest, forbidden, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';
import { 
  CognitoIdentityProviderClient, 
  AdminDisableUserCommand,
  AdminGetUserCommand
} from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({});

// Zod schema for disable cognito user request
const disableCognitoUserSchema = z.object({
  userId: z.string().optional(),
  email: z.string().email().optional(),
}).refine(data => data.userId || data.email, {
  message: 'Either userId or email is required',
});

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const adminUserId = user.sub || user.id || 'unknown';

    const prisma = getPrismaClient();

    // Verificar se é admin
    const adminProfile = await prisma.profile.findFirst({
      where: { 
        user_id: adminUserId,
        organization_id: organizationId
      }
    });

    if (!adminProfile || !adminProfile.role || !['ADMIN', 'SUPER_ADMIN'].includes(adminProfile.role)) {
      return forbidden('Admin access required', origin);
    }

    const validation = parseAndValidateBody(disableCognitoUserSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { userId, email } = validation.data;

    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    if (!userPoolId) {
      return error('Cognito not configured', 500, undefined, origin);
    }

    // Buscar usuário no banco para obter email se necessário
    let targetEmail = email;
    let targetUserId = userId;
    
    if (!targetEmail && userId) {
      const dbUser = await prisma.user.findUnique({
        where: { id: userId }
      });
      if (dbUser) {
        targetEmail = dbUser.email;
      }
    }

    if (!targetEmail) {
      return badRequest('User not found', undefined, origin);
    }

    // Buscar usuário pelo email
    const targetUser = await prisma.user.findUnique({
      where: { email: targetEmail }
    });

    if (!targetUser) {
      return badRequest('User not found', undefined, origin);
    }

    // Verificar se o usuário tem profile na mesma organização
    const targetProfile = await prisma.profile.findFirst({
      where: {
        user_id: targetUser.id,
        organization_id: organizationId
      }
    });

    if (!targetProfile) {
      return forbidden('Cannot disable user from another organization', origin);
    }

    // Desabilitar no Cognito
    try {
      await cognitoClient.send(new AdminDisableUserCommand({
        UserPoolId: userPoolId,
        Username: targetEmail
      }));
    } catch (cognitoError: any) {
      if (cognitoError.name !== 'UserNotFoundException') {
        throw cognitoError;
      }
      logger.warn(`User ${targetEmail} not found in Cognito, continuing with DB update`);
    }

    // Atualizar status no banco
    await prisma.user.update({
      where: { email: targetEmail },
      data: { is_active: false }
    });

    // Registrar auditoria
    await prisma.auditLog.create({
      data: {
        organization_id: organizationId,
        user_id: adminUserId,
        action: 'DISABLE_USER',
        resource_type: 'USER',
        resource_id: targetUser.id,
        details: { 
          email: targetEmail, 
          disabledBy: adminUserId 
        },
        ip_address: event.requestContext?.identity?.sourceIp || 
                    event.headers?.['x-forwarded-for']?.split(',')[0],
        user_agent: event.headers?.['user-agent']
      }
    });

    logger.info(`✅ User disabled: ${targetEmail}`);

    return success({
      success: true,
      message: 'User disabled successfully',
      userId: targetUser.id
    }, 200, origin);

  } catch (err) {
    logger.error('❌ Disable user error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
  }
}
