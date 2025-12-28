import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { getPrismaClient } from '../../lib/database.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { success, error, badRequest, notFound, forbidden, corsOptions } from '../../lib/response.js';
import { safeParseJSON } from '../../lib/request-parser.js';
import { getOrigin } from '../../lib/middleware.js';
import * as crypto from 'crypto';
import { 
  CognitoIdentityProviderClient, 
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminSetUserPasswordCommand
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
  
  try {
    const user = getUserFromEvent(event);
    adminUserId = user.sub || user.id || 'unknown';
    authOrganizationId = getOrganizationId(user);
  } catch (authError) {
    logger.error('Authentication error', authError);
    return error('Unauthorized', 401, undefined, origin);
  }


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

    const body = safeParseJSON<CreateUserRequest>(event.body, {} as CreateUserRequest, 'create-user');
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

    // Verificar se email já existe
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return badRequest('User with this email already exists', undefined, origin);
    }

    // Verificar limite de usuários
    const userCount = await prisma.profile.count({ where: { organization_id: organizationId } });
    const license = await prisma.license.findFirst({
      where: { organization_id: organizationId, is_active: true }
    });

    if (license && userCount >= license.max_users) {
      return forbidden('User limit reached for this organization', origin);
    }

    // Criar usuário no Cognito
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    if (!userPoolId) {
      return error('Cognito not configured', 500, undefined, origin);
    }

    const password = temporaryPassword || generateSecurePassword();

    const cognitoResponse = await cognitoClient.send(new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'name', Value: name },
        { Name: 'custom:organizationId', Value: organizationId },
        { Name: 'custom:role', Value: role }
      ],
      TemporaryPassword: password,
      MessageAction: sendInvite ? 'RESEND' : 'SUPPRESS'
    }));

    const cognitoId = cognitoResponse.User?.Username;

    if (!sendInvite && temporaryPassword) {
      await cognitoClient.send(new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: email,
        Password: temporaryPassword,
        Permanent: true
      }));
    }

    // Adicionar ao grupo do Cognito
    const groupName = `${organizationId}-${role.toLowerCase()}`;
    try {
      await cognitoClient.send(new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: email,
        GroupName: groupName
      }));
    } catch {
      logger.info(`Group ${groupName} may not exist, skipping`);
    }

    // Criar usuário no banco
    const newUser = await prisma.user.create({
      data: { email, full_name: name, is_active: true }
    });

    // Criar profile
    await prisma.profile.create({
      data: {
        user_id: newUser.id,
        organization_id: organizationId,
        role: role
      }
    });

    // Registrar auditoria
    await prisma.auditLog.create({
      data: {
        organization_id: organizationId,
        user_id: adminUserId,
        action: 'CREATE_USER',
        resource_type: 'USER',
        resource_id: newUser.id,
        details: { email, role, createdBy: adminUserId },
        ip_address: event.requestContext?.identity?.sourceIp || event.headers?.['x-forwarded-for']?.split(',')[0],
        user_agent: event.headers?.['user-agent']
      }
    });

    return success({
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.full_name,
        isActive: newUser.is_active
      },
      inviteSent: sendInvite
    }, 201, origin);
  } catch (err) {
    logger.error('Create user error:', err);
    return error('Internal server error', 500, undefined, origin);
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
