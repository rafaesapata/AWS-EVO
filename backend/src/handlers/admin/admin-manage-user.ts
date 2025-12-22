/**
 * Lambda handler para gerenciar usuários (admin)
 * AWS Lambda Handler for admin-manage-user
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, badRequest, forbidden, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId, requireRole } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { 
  CognitoIdentityProviderClient, 
  AdminCreateUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminDeleteUserCommand,
  AdminEnableUserCommand,
  AdminDisableUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';

interface ManageUserRequest {
  action: 'create' | 'update' | 'delete' | 'enable' | 'disable' | 'reset_password';
  email: string;
  attributes?: {
    full_name?: string;
    organization_id?: string;
    roles?: string[];
  };
  password?: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('👤 Admin manage user started');
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    // Apenas admins podem gerenciar usuários
    requireRole(user, 'admin');
    
    const body: ManageUserRequest = event.body ? JSON.parse(event.body) : {};
    const { action, email, attributes, password } = body;
    
    if (!action || !email) {
      return badRequest('action and email are required');
    }
    
    const userPoolId = process.env.USER_POOL_ID;
    if (!userPoolId) {
      throw new Error('USER_POOL_ID not configured');
    }
    
    const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const prisma = getPrismaClient();
    
    logger.info(`🔧 Action: ${action} for user: ${email}`);
    
    switch (action) {
      case 'create': {
        // Criar usuário no Cognito
        const createResponse = await cognitoClient.send(
          new AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: email,
            UserAttributes: [
              { Name: 'email', Value: email },
              { Name: 'email_verified', Value: 'true' },
              ...(attributes?.full_name ? [{ Name: 'name', Value: attributes.full_name }] : []),
              { Name: 'custom:organization_id', Value: attributes?.organization_id || organizationId },
              ...(attributes?.roles ? [{ Name: 'custom:roles', Value: JSON.stringify(attributes.roles) }] : []),
            ],
            TemporaryPassword: password || generateTemporaryPassword(),
            MessageAction: 'SUPPRESS',
          })
        );
        
        // Criar profile no banco
        if (createResponse.User?.Username) {
          await prisma.profile.create({
            data: {
              user_id: createResponse.User.Username,
              organization_id: attributes?.organization_id || organizationId,
              full_name: attributes?.full_name,
              role: attributes?.roles?.[0] || 'user',
            },
          });
        }
        
        return success({ message: 'User created successfully', email });
      }
      
      case 'update': {
        // Atualizar atributos do usuário
        const updateAttributes = [];
        
        if (attributes?.full_name) {
          updateAttributes.push({ Name: 'name', Value: attributes.full_name });
        }
        
        if (attributes?.organization_id) {
          updateAttributes.push({ Name: 'custom:organization_id', Value: attributes.organization_id });
        }
        
        if (attributes?.roles) {
          updateAttributes.push({ Name: 'custom:roles', Value: JSON.stringify(attributes.roles) });
        }
        
        if (updateAttributes.length > 0) {
          await cognitoClient.send(
            new AdminUpdateUserAttributesCommand({
              UserPoolId: userPoolId,
              Username: email,
              UserAttributes: updateAttributes,
            })
          );
        }
        
        return success({ message: 'User updated successfully', email });
      }
      
      case 'delete': {
        // Deletar usuário
        await cognitoClient.send(
          new AdminDeleteUserCommand({
            UserPoolId: userPoolId,
            Username: email,
          })
        );
        
        // Deletar profile do banco
        await prisma.profile.deleteMany({
          where: {
            user_id: email,
            organization_id: organizationId,
          },
        });
        
        return success({ message: 'User deleted successfully', email });
      }
      
      case 'enable': {
        await cognitoClient.send(
          new AdminEnableUserCommand({
            UserPoolId: userPoolId,
            Username: email,
          })
        );
        
        return success({ message: 'User enabled successfully', email });
      }
      
      case 'disable': {
        await cognitoClient.send(
          new AdminDisableUserCommand({
            UserPoolId: userPoolId,
            Username: email,
          })
        );
        
        return success({ message: 'User disabled successfully', email });
      }
      
      case 'reset_password': {
        if (!password) {
          return badRequest('password is required for reset_password action');
        }
        
        await cognitoClient.send(
          new AdminSetUserPasswordCommand({
            UserPoolId: userPoolId,
            Username: email,
            Password: password,
            Permanent: true,
          })
        );
        
        return success({ message: 'Password reset successfully', email });
      }
      
      default:
        return badRequest(`Invalid action: ${action}`);
    }
    
  } catch (err) {
    logger.error('❌ Manage user error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

function generateTemporaryPassword(): string {
  const length = 16;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = 'Aa1!'; // Garantir requisitos mínimos
  
  for (let i = password.length; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  return password.split('').sort(() => Math.random() - 0.5).join('');
}
