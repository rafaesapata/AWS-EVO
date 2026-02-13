/**
 * Lambda handler para criar usuário no Cognito
 * Endpoint: POST /api/functions/create-cognito-user
 * 
 * Super admins podem criar usuários em qualquer organização
 * Admins regulares só podem criar usuários na própria organização
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, forbidden, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation, isSuperAdmin, isAdmin } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { withErrorMonitoring } from '../../lib/error-middleware.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import { parseEventBody } from '../../lib/request-parser.js';
import { 
  CognitoIdentityProviderClient, 
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand
} from '@aws-sdk/client-cognito-identity-provider';
import { randomBytes } from 'crypto';

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' });

interface CreateCognitoUserRequest {
  email: string;
  name: string;
  temporaryPassword?: string;
  sendInvite?: boolean;
  role?: string;
  organizationId?: string; // Super admin can specify target organization
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generate cryptographically secure temporary password
 * Meets Cognito requirements: uppercase, lowercase, number, special char, min 12 chars
 */
function generateTemporaryPassword(): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*';
  const allChars = uppercase + lowercase + numbers + special;
  
  // Use crypto.randomBytes for secure randomness
  const bytes = randomBytes(16);
  let password = '';
  
  // Ensure at least one of each required type
  password += uppercase[bytes[0] % uppercase.length];
  password += lowercase[bytes[1] % lowercase.length];
  password += numbers[bytes[2] % numbers.length];
  password += special[bytes[3] % special.length];
  
  // Fill remaining with random chars
  for (let i = 4; i < 16; i++) {
    password += allChars[bytes[i] % allChars.length];
  }
  
  // Shuffle the password using Fisher-Yates
  const shuffleBytes = randomBytes(password.length);
  const arr = password.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = shuffleBytes[i] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  
  return arr.join('');
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Create profile in database, tolerating duplicates */
async function createProfile(
  prisma: ReturnType<typeof getPrismaClient>,
  cognitoSub: string,
  email: string,
  organizationId: string,
  name: string,
  role: string
): Promise<void> {
  try {
    await prisma.profile.create({
      data: {
        user_id: cognitoSub,
        email,
        organization_id: organizationId,
        full_name: name,
        role,
      }
    });
    logger.info('Profile created for new user', { cognitoSub, email, organizationId, role });
  } catch (err: any) {
    if (err.code === 'P2002') {
      logger.info('Profile already exists, skipping creation', { cognitoSub, email });
    } else {
      logger.warn('Failed to create profile', { error: err.message, cognitoSub });
    }
  }
}

/** Auto-allocate seat on the primary active license */
async function allocateLicenseSeat(
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string,
  cognitoSub: string,
  adminSub: string
): Promise<void> {
  try {
    const primaryLicense = await prisma.license.findFirst({
      where: { organization_id: organizationId, is_active: true },
      orderBy: { created_at: 'desc' },
    });

    if (!primaryLicense) return;

    const existingSeat = await prisma.licenseSeatAssignment.findFirst({
      where: { license_id: primaryLicense.id, user_id: cognitoSub }
    });

    if (existingSeat) return;

    const assignedBy = adminSub && UUID_REGEX.test(adminSub) ? adminSub : undefined;

    await prisma.licenseSeatAssignment.create({
      data: {
        license_id: primaryLicense.id,
        user_id: cognitoSub,
        assigned_by: assignedBy,
      }
    });

    const seatCount = await prisma.licenseSeatAssignment.count({
      where: { license_id: primaryLicense.id }
    });
    await prisma.license.update({
      where: { id: primaryLicense.id },
      data: {
        used_seats: seatCount,
        available_seats: (primaryLicense.max_users ?? 0) - seatCount,
      }
    });

    logger.info('Seat allocated for new user', { cognitoSub, licenseId: primaryLicense.id });
  } catch (err: any) {
    logger.warn('Failed to allocate seat', { error: err.message, cognitoSub });
  }
}

export const handler = withErrorMonitoring('create-cognito-user', async (
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> => {
  const origin = getOrigin(event);
  const method = getHttpMethod(event);
  
  if (method === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  if (method !== 'POST') {
    return badRequest('Method not allowed. Use POST.', undefined, origin);
  }
  
  const user = getUserFromEvent(event);
  const userOrganizationId = getOrganizationIdWithImpersonation(event, user);
  
  // Fail fast: verificar permissões antes de qualquer processamento
  if (!isAdmin(user)) {
    logger.warn('Non-admin attempted to create user', {
      userId: user.sub,
      email: user.email
    });
    return forbidden('Only admins can create users', origin);
  }
  
  const userIsSuperAdmin = isSuperAdmin(user);
  
  logger.info('Create Cognito user started', { 
    organizationId: userOrganizationId,
    userId: user.sub,
    isSuperAdmin: userIsSuperAdmin,
    requestId: context.awsRequestId 
  });
  
  const body = parseEventBody<CreateCognitoUserRequest>(event, {} as CreateCognitoUserRequest, 'create-cognito-user');
  const { email, name, temporaryPassword, sendInvite = true, role, organizationId: targetOrgId } = body;
  
  // Validações de input
  if (!email || !name) {
    return badRequest('Missing required fields: email and name', undefined, origin);
  }
  
  if (!isValidEmail(email)) {
    return badRequest('Invalid email format', undefined, origin);
  }
  
  // Determinar organização alvo
  let organizationId = userOrganizationId;
  
  if (targetOrgId && targetOrgId !== userOrganizationId) {
    if (!userIsSuperAdmin) {
      logger.warn('Non-super-admin attempted to create user in different organization', {
        userId: user.sub,
        userOrg: userOrganizationId,
        targetOrg: targetOrgId
      });
      return forbidden('Only super admins can create users in other organizations', origin);
    }
    organizationId = targetOrgId;
  }
  
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) {
    logger.error('COGNITO_USER_POOL_ID not configured');
    return error('Cognito not configured', 500, undefined, origin);
  }
  
  const prisma = getPrismaClient();
  
  // Verificar se a organização alvo existe
  const targetOrg = await prisma.organization.findUnique({
    where: { id: organizationId }
  });
  
  if (!targetOrg) {
    return badRequest('Target organization not found', undefined, origin);
  }
  
  // Verificar se usuário já existe no banco (profiles table)
  const existingProfile = await prisma.profile.findFirst({ 
    where: { email } 
  });
  
  if (existingProfile) {
    return error('User with this email already exists', 409, undefined, origin);
  }
  
  // Gerar senha temporária se não fornecida
  const password = temporaryPassword || generateTemporaryPassword();
  
  // Criar usuário no Cognito com nome da organização sincronizado
  const userAttributes = [
    { Name: 'email', Value: email },
    { Name: 'email_verified', Value: 'true' },
    { Name: 'name', Value: name },
    { Name: 'custom:organization_id', Value: organizationId },
    { Name: 'custom:organization_name', Value: targetOrg.name }
  ];
  
  if (role) {
    userAttributes.push({ Name: 'custom:roles', Value: role });
  }
  
  logger.info('Creating Cognito user', { email, organizationId });
  
  const cognitoResponse = await cognitoClient.send(new AdminCreateUserCommand({
    UserPoolId: userPoolId,
    Username: email,
    UserAttributes: userAttributes,
    TemporaryPassword: password,
    MessageAction: sendInvite ? undefined : 'SUPPRESS',
    DesiredDeliveryMediums: sendInvite ? ['EMAIL'] : undefined
  }));
  
  const cognitoUserId = cognitoResponse.User?.Username;
  
  if (!cognitoUserId) {
    logger.error('Failed to get Cognito user ID');
    return error('Failed to create user in Cognito', 500, undefined, origin);
  }

  const cognitoSub = cognitoResponse.User?.Attributes?.find(a => a.Name === 'sub')?.Value || cognitoUserId;
  
  // Se não enviar invite, definir senha permanente
  if (!sendInvite && temporaryPassword) {
    await cognitoClient.send(new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: email,
      Password: temporaryPassword,
      Permanent: true
    }));
  }

  // Normalize role: 'admin' → 'org_admin'
  const normalizedRole = role === 'admin' ? 'org_admin' : (role || 'user');
  
  // Create profile in database
  await createProfile(prisma, cognitoSub, email, organizationId, name, normalizedRole);

  // Auto-allocate seat on the primary license
  await allocateLicenseSeat(prisma, organizationId, cognitoSub, user.sub);
  
  logger.info('Cognito user created successfully', { 
    email, 
    cognitoUserId,
    organizationId 
  });
  
  return success({
    userId: cognitoUserId,
    email,
    name,
    temporaryPassword: sendInvite ? undefined : password,
    inviteSent: sendInvite
  }, 201, origin);
});
