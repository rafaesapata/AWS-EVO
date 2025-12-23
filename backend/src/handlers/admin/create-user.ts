import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from '../../lib/logging.js';
import { PrismaClient } from '@prisma/client';
import { safeParseJSON } from '../../lib/request-parser.js';
import { 
  CognitoIdentityProviderClient, 
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminSetUserPasswordCommand
} from '@aws-sdk/client-cognito-identity-provider';

const prisma = new PrismaClient();
const cognitoClient = new CognitoIdentityProviderClient({});

interface CreateUserRequest {
  email: string;
  name: string;
  organizationId: string;
  role: 'ADMIN' | 'USER' | 'VIEWER' | 'AUDITOR';
  temporaryPassword?: string;
  sendInvite?: boolean;
  metadata?: Record<string, string>;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const adminUserId = event.requestContext.authorizer?.claims?.sub;
    if (!adminUserId) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    // Verificar se é admin
    const adminUser = await prisma.user.findUnique({
      where: { id: adminUserId }
    });

    if (!adminUser || !adminUser.is_active) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Admin access required' }) };
    }

    const body = safeParseJSON<CreateUserRequest>(event.body, {} as CreateUserRequest, 'create-user');
    const { email, name, organizationId, role, temporaryPassword, sendInvite = true, metadata } = body;

    // Validações
    if (!email || !name || !organizationId || !role) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    if (!isValidEmail(email)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid email format' }) };
    }

    // Verificar se organização existe
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId }
    });

    if (!organization) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Organization not found' }) };
    }

    // Verificar se email já existe
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return { statusCode: 409, body: JSON.stringify({ error: 'User with this email already exists' }) };
    }

    // Verificar limite de usuários da organização
    const userCount = await prisma.user.count({ where: { id: organizationId } });
    const license = await prisma.license.findFirst({
      where: { organization_id: organizationId, is_active: true }
    });

    if (license && userCount >= license.max_users) {
      return { statusCode: 403, body: JSON.stringify({ error: 'User limit reached for this organization' }) };
    }

    // Criar usuário no Cognito
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    if (!userPoolId) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Cognito not configured' }) };
    }

    const password = temporaryPassword || generateTemporaryPassword();

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

    // Se não enviar invite, definir senha permanente
    if (!sendInvite && temporaryPassword) {
      await cognitoClient.send(new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: email,
        Password: temporaryPassword,
        Permanent: true
      }));
    }

    // Adicionar ao grupo do Cognito baseado no role
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
      data: {
        email,
        full_name: name,
        is_active: true
      }
    });

    // Registrar ação de auditoria
    await prisma.auditLog.create({
      data: {
        organization_id: organizationId,
        user_id: adminUserId,
        action: 'CREATE_USER',
        resource_type: 'USER',
        resource_id: newUser.id,
        details: { email, role, createdBy: adminUser.email },
        ip_address: event.requestContext.identity?.sourceIp,
        user_agent: event.headers['User-Agent']
      }
    });

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.full_name,
          isActive: newUser.is_active
        },
        inviteSent: sendInvite
      })
    };
  } catch (error) {
    logger.error('Create user error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', details: String(error) })
    };
  }
};

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}
