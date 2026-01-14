import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { getPrismaClient } from '../../lib/database.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { success, error, badRequest, notFound, forbidden, corsOptions } from '../../lib/response.js';
import { safeParseJSON } from '../../lib/request-parser.js';
import { getOrigin } from '../../lib/middleware.js';
import * as crypto from 'crypto';
import { 
  CognitoIdentityProviderClient, 
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminSetUserPasswordCommand,
  AdminDeleteUserCommand
} from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({});

interface CreateUserRequest {
  email: string;
  name: string;
  organizationId?: string; // Optional - will use auth org if not provided
  role: 'ADMIN' | 'USER' | 'VIEWER' | 'AUDITOR';
  temporaryPassword?: string;
  sendInvite?: boolean;
  metadata?: Record<string, string>;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  let adminUserId: string;
  let authOrganizationId: string;
  let body: CreateUserRequest;
  
  try {
    const user = getUserFromEvent(event);
    adminUserId = user.sub || user.id || 'unknown';
    authOrganizationId = getOrganizationIdWithImpersonation(event, user);
  } catch (authError) {
    logger.error('Authentication error', authError);
    return error('Unauthorized', 401, undefined, origin);
  }

  // Parse body outside try-catch for rollback access
  try {
    body = safeParseJSON<CreateUserRequest>(event.body, {} as CreateUserRequest, 'create-user');
  } catch (parseError) {
    logger.error('Failed to parse request body', parseError);
    return badRequest('Invalid request body', undefined, origin);
  }

  // Variables to track what needs rollback
  let cognitoUserCreated = false;
  let cognitoUserId: string | undefined;
  let databaseUserCreated = false;
  let databaseUserId: string | undefined;
  let profileCreated = false;

  try {
    const prisma = getPrismaClient();

    // Verificar se é admin
    const adminProfile = await prisma.profile.findFirst({
      where: { 
        user_id: adminUserId,
        organization_id: authOrganizationId
      }
    });

    if (!adminProfile || !adminProfile.role || !['ADMIN', 'SUPER_ADMIN'].includes(adminProfile.role)) {
      return forbidden('Admin access required', origin);
    }

    const { email, name, role, temporaryPassword, sendInvite = true } = body;
    
    // Use auth organization - CRITICAL: Multi-tenancy enforcement
    const organizationId = authOrganizationId;

    if (!email || !name || !role) {
      return badRequest('Missing required fields: email, name, role', undefined, origin);
    }

    if (!isValidEmail(email)) {
      return badRequest('Invalid email format', undefined, origin);
    }

    // Verificar se organização existe
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId }
    });

    if (!organization) {
      return notFound('Organization not found', origin);
    }

    // Verificar se email já existe no banco
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return badRequest('User with this email already exists in database', undefined, origin);
    }

    // Verificar limite de usuários
    const userCount = await prisma.profile.count({ where: { organization_id: organizationId } });
    const license = await prisma.license.findFirst({
      where: { organization_id: organizationId, is_active: true }
    });

    if (license && userCount >= license.max_users) {
      return forbidden('User limit reached for this organization', origin);
    }

    // Configuração do Cognito
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    if (!userPoolId) {
      return error('Cognito not configured', 500, undefined, origin);
    }

    const password = temporaryPassword || generateSecurePassword();

    logger.info('🔐 Starting user creation process', { email, organizationId, role });

    // STEP 1: Criar usuário no Cognito
    try {
      logger.info('🔐 Creating Cognito user', { email });
      const cognitoResponse = await cognitoClient.send(new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: name },
          { Name: 'custom:organization_id', Value: organizationId },
          { Name: 'custom:organization_name', Value: organization.name },
          { Name: 'custom:roles', Value: JSON.stringify([role]) },
          { Name: 'custom:tenant_id', Value: organizationId }
        ],
        TemporaryPassword: password,
        MessageAction: sendInvite ? 'RESEND' : 'SUPPRESS'
      }));

      cognitoUserId = cognitoResponse.User?.Username;
      cognitoUserCreated = true;
      logger.info('✅ Cognito user created successfully', { email, cognitoUserId });

      // Set permanent password if needed
      if (!sendInvite && temporaryPassword) {
        await cognitoClient.send(new AdminSetUserPasswordCommand({
          UserPoolId: userPoolId,
          Username: email,
          Password: temporaryPassword,
          Permanent: true
        }));
        logger.info('✅ Permanent password set', { email });
      }

      // Adicionar ao grupo do Cognito (optional - não falha se grupo não existir)
      const groupName = `${organizationId}-${role.toLowerCase()}`;
      try {
        await cognitoClient.send(new AdminAddUserToGroupCommand({
          UserPoolId: userPoolId,
          Username: email,
          GroupName: groupName
        }));
        logger.info('✅ User added to Cognito group', { email, groupName });
      } catch (groupError) {
        logger.warn('⚠️ Could not add user to Cognito group (group may not exist)', { 
          email, 
          groupName, 
          error: groupError 
        });
        // Continue - group assignment is optional
      }

    } catch (cognitoError) {
      logger.error('❌ Failed to create Cognito user', { email, error: cognitoError });
      throw new Error(`Failed to create user in Cognito: ${cognitoError instanceof Error ? cognitoError.message : String(cognitoError)}`);
    }

    // STEP 2: Criar usuário no banco PostgreSQL usando transação
    try {
      logger.info('🔐 Creating database user and profile', { email });
      
      const result = await prisma.$transaction(async (tx) => {
        // Criar usuário no banco
        const newUser = await tx.user.create({
          data: { 
            email, 
            full_name: name, 
            is_active: true 
          }
        });
        
        logger.info('✅ Database user created', { email, userId: newUser.id });
        databaseUserId = newUser.id;
        databaseUserCreated = true;

        // Criar profile
        const newProfile = await tx.profile.create({
          data: {
            user_id: newUser.id,
            organization_id: organizationId,
            role: role
          }
        });
        
        logger.info('✅ User profile created', { email, userId: newUser.id, profileId: newProfile.id });
        profileCreated = true;

        // Registrar auditoria
        await tx.auditLog.create({
          data: {
            organization_id: organizationId,
            user_id: adminUserId,
            action: 'CREATE_USER',
            resource_type: 'USER',
            resource_id: newUser.id,
            details: { email, role, createdBy: adminUserId, cognitoUserId },
            ip_address: event.requestContext?.identity?.sourceIp || event.headers?.['x-forwarded-for']?.split(',')[0],
            user_agent: event.headers?.['user-agent']
          }
        });

        logger.info('✅ Audit log created', { email, userId: newUser.id });

        return {
          user: newUser,
          profile: newProfile
        };
      });

      logger.info('🎉 User creation completed successfully', { 
        email, 
        userId: result.user.id, 
        cognitoUserId,
        organizationId 
      });

      return success({
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.full_name,
          isActive: result.user.is_active,
          role: role,
          organizationId: organizationId
        },
        inviteSent: sendInvite,
        cognitoUserId: cognitoUserId
      }, 201, origin);

    } catch (dbError) {
      logger.error('❌ Failed to create database user/profile', { email, error: dbError });
      throw new Error(`Failed to create user in database: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
    }

  } catch (err) {
    logger.error('❌ User creation failed, starting rollback', { 
      email: body?.email, 
      error: err,
      cognitoUserCreated,
      databaseUserCreated,
      profileCreated
    });

    // ROLLBACK: Limpar tudo que foi criado
    await performRollback({
      cognitoUserCreated,
      cognitoUserId,
      databaseUserCreated,
      databaseUserId,
      email: body?.email,
      userPoolId: process.env.COGNITO_USER_POOL_ID
    });

    // Return user-friendly error
    const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
    if (errorMessage.includes('Cognito')) {
      return error('Failed to create user account. Please try again.', 500, undefined, origin);
    } else if (errorMessage.includes('database')) {
      return error('Failed to save user data. Please try again.', 500, undefined, origin);
    } else {
      return error('Failed to create user. Please try again.', 500, undefined, origin);
    }
  }
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function generateSecurePassword(): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*';
  const all = upper + lower + numbers + special;
  
  // Garantir pelo menos um de cada tipo
  let password = '';
  password += upper[crypto.randomInt(upper.length)];
  password += lower[crypto.randomInt(lower.length)];
  password += numbers[crypto.randomInt(numbers.length)];
  password += special[crypto.randomInt(special.length)];
  
  // Completar com caracteres aleatórios
  for (let i = 4; i < 16; i++) {
    password += all[crypto.randomInt(all.length)];
  }
  
  // Embaralhar (Fisher-Yates)
  const arr = password.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  
  return arr.join('');
}

/**
 * Perform rollback operations to clean up partially created resources
 */
async function performRollback(rollbackData: {
  cognitoUserCreated: boolean;
  cognitoUserId?: string;
  databaseUserCreated: boolean;
  databaseUserId?: string;
  email?: string;
  userPoolId?: string;
}): Promise<void> {
  const { 
    cognitoUserCreated, 
    cognitoUserId, 
    databaseUserCreated, 
    databaseUserId, 
    email, 
    userPoolId 
  } = rollbackData;

  logger.info('🔄 Starting rollback operations', rollbackData);

  // Rollback database operations first (faster)
  if (databaseUserCreated && databaseUserId) {
    try {
      const prisma = getPrismaClient();
      
      // Use transaction to ensure all database cleanup happens atomically
      await prisma.$transaction(async (tx) => {
        // Delete profile first (foreign key constraint)
        await tx.profile.deleteMany({
          where: { user_id: databaseUserId }
        });
        
        // Delete audit logs
        await tx.auditLog.deleteMany({
          where: { resource_id: databaseUserId, resource_type: 'USER' }
        });
        
        // Delete user
        await tx.user.delete({
          where: { id: databaseUserId }
        });
      });
      
      logger.info('✅ Database rollback completed', { userId: databaseUserId });
    } catch (dbRollbackError) {
      logger.error('❌ Database rollback failed', { 
        userId: databaseUserId, 
        error: dbRollbackError 
      });
      // Continue with Cognito rollback even if database rollback fails
    }
  }

  // Rollback Cognito user
  if (cognitoUserCreated && email && userPoolId) {
    try {
      const { AdminDeleteUserCommand } = await import('@aws-sdk/client-cognito-identity-provider');
      
      await cognitoClient.send(new AdminDeleteUserCommand({
        UserPoolId: userPoolId,
        Username: email
      }));
      
      logger.info('✅ Cognito rollback completed', { email, cognitoUserId });
    } catch (cognitoRollbackError) {
      logger.error('❌ Cognito rollback failed', { 
        email, 
        cognitoUserId, 
        error: cognitoRollbackError 
      });
      
      // Log critical error - manual cleanup may be needed
      logger.error('🚨 CRITICAL: Manual cleanup required for Cognito user', {
        email,
        cognitoUserId,
        userPoolId,
        action: 'DELETE_USER_MANUALLY'
      });
    }
  }

  logger.info('🔄 Rollback operations completed', { 
    email, 
    cognitoRollbackAttempted: cognitoUserCreated,
    databaseRollbackAttempted: databaseUserCreated 
  });
}
