/**
 * Lambda handler para gerenciar usuários (admin)
 * AWS Lambda Handler for admin-manage-user
 * 
 * Uses centralized middleware for validation, auth, and rate limiting
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, badRequest, forbidden, corsOptions } from '../../lib/response.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation, requireRole } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { manageUserSchema } from '../../lib/schemas.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { 
  CognitoIdentityProviderClient, 
  AdminCreateUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminDeleteUserCommand,
  AdminEnableUserCommand,
  AdminDisableUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('👤 Admin manage user started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    // Apenas admins podem gerenciar usuários
    requireRole(user, 'admin');
    
    // Validar input com Zod usando parseAndValidateBody
    const validation = parseAndValidateBody(manageUserSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { action, email, attributes, password } = validation.data;
    
    const userPoolId = process.env.USER_POOL_ID;
    if (!userPoolId) {
      throw new Error('USER_POOL_ID not configured');
    }
    
    const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const prisma = getPrismaClient();
    
    logger.info(`🔧 Action: ${action} for user: ${email}`);
    
    switch (action) {
      case 'update': {
        // Verificar que o usuário pertence à mesma organização (segurança multi-tenant)
        const targetProfile = await prisma.profile.findFirst({
          where: {
            email: email,
            organization_id: organizationId,
          },
        });
        
        if (!targetProfile) {
          return forbidden('Cannot update user from another organization');
        }
        
        // Atualizar atributos do usuário
        const updateAttributes = [];
        
        if (attributes?.full_name) {
          updateAttributes.push({ Name: 'name', Value: attributes.full_name });
        }
        
        // SEGURANÇA: Admin não pode mudar organization_id de usuário
        if (attributes?.organization_id && attributes.organization_id !== organizationId) {
          return forbidden('Cannot change user organization');
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
        
        // Registrar auditoria
        await prisma.auditLog.create({
          data: {
            organization_id: organizationId,
            user_id: user.sub,
            action: 'UPDATE_USER',
            resource_type: 'user',
            resource_id: email,
            details: { attributes },
          },
        });
        
        return success({ message: 'User updated successfully', email });
      }
      
      case 'delete': {
        // Verificar que o usuário pertence à mesma organização (segurança multi-tenant)
        const targetProfile = await prisma.profile.findFirst({
          where: {
            email: email,
            organization_id: organizationId,
          },
        });
        
        if (!targetProfile) {
          return forbidden('Cannot delete user from another organization');
        }
        
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
            email: email,
            organization_id: organizationId,
          },
        });
        
        // Registrar auditoria
        await prisma.auditLog.create({
          data: {
            organization_id: organizationId,
            user_id: user.sub,
            action: 'DELETE_USER',
            resource_type: 'user',
            resource_id: email,
          },
        });
        
        return success({ message: 'User deleted successfully', email });
      }
      
      case 'enable': {
        // Verificar que o usuário pertence à mesma organização
        const enableProfile = await prisma.profile.findFirst({
          where: { email, organization_id: organizationId },
        });
        if (!enableProfile) {
          return forbidden('Cannot enable user from another organization');
        }
        
        await cognitoClient.send(
          new AdminEnableUserCommand({
            UserPoolId: userPoolId,
            Username: email,
          })
        );
        
        return success({ message: 'User enabled successfully', email });
      }
      
      case 'disable': {
        // Verificar que o usuário pertence à mesma organização
        const disableProfile = await prisma.profile.findFirst({
          where: { email, organization_id: organizationId },
        });
        if (!disableProfile) {
          return forbidden('Cannot disable user from another organization');
        }
        
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
        
        // Verificar que o usuário pertence à mesma organização
        const resetProfile = await prisma.profile.findFirst({
          where: { email, organization_id: organizationId },
        });
        if (!resetProfile) {
          return forbidden('Cannot reset password for user from another organization');
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
      
      case 'update_organization': {
        // SUPER ADMIN ONLY: Update user's organization in Cognito
        const userRolesStr = user['custom:roles'] || '[]';
        let userRoles: string[] = [];
        try {
          userRoles = JSON.parse(userRolesStr);
        } catch {
          userRoles = [];
        }
        
        if (!userRoles.includes('super_admin')) {
          return forbidden('Only super admins can change user organization');
        }
        
        if (!attributes?.organization_id || !attributes?.organization_name) {
          return badRequest('organization_id and organization_name are required');
        }
        
        // Verify the target organization exists
        const targetOrg = await prisma.organization.findUnique({
          where: { id: attributes.organization_id },
        });
        
        if (!targetOrg) {
          return badRequest('Target organization not found');
        }
        
        // Update Cognito user attributes
        const updateAttributes = [
          { Name: 'custom:organization_id', Value: attributes.organization_id },
          { Name: 'custom:organization_name', Value: attributes.organization_name },
        ];
        
        if (attributes.roles) {
          updateAttributes.push({ 
            Name: 'custom:roles', 
            Value: JSON.stringify(attributes.roles) 
          });
        }
        
        await cognitoClient.send(
          new AdminUpdateUserAttributesCommand({
            UserPoolId: userPoolId,
            Username: email,
            UserAttributes: updateAttributes,
          })
        );
        
        // Registrar auditoria
        await prisma.auditLog.create({
          data: {
            organization_id: organizationId,
            user_id: user.sub,
            action: 'UPDATE_USER_ORGANIZATION',
            resource_type: 'user',
            resource_id: email,
            details: { 
              new_organization_id: attributes.organization_id,
              new_organization_name: attributes.organization_name,
            },
          },
        });
        
        logger.info(`✅ User ${email} organization updated to ${attributes.organization_name}`);
        
        return success({ 
          message: 'User organization updated successfully', 
          email,
          organization_id: attributes.organization_id,
          organization_name: attributes.organization_name,
        });
      }
      
      default:
        return badRequest(`Invalid action: ${action}`);
    }
    
  } catch (err) {
    logger.error('❌ Manage user error:', err);
    return error('Failed to manage user. Please try again.', 500);
  }
}
