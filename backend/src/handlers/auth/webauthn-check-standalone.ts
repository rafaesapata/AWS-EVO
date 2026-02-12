/**
 * Standalone Auth Handler
 * Handles WebAuthn check and forgot password functionality without requiring authentication
 */

import { getPrismaClient } from '../../lib/database.js';
import { SYSTEM_ORG_ID_FALLBACK } from '../../lib/app-domain.js';
import { 
  CognitoIdentityProviderClient, 
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand
} from '@aws-sdk/client-cognito-identity-provider';
import { corsOptions, success, error as errorResponse } from '../../lib/response.js';
import { logger } from '../../lib/logger.js';

interface CheckRequest {
  email: string;
}

interface ForgotPasswordRequest {
  action: 'request' | 'confirm';
  email: string;
  confirmationCode?: string;
  newPassword?: string;
}

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' });

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPassword(password: string): boolean {
  const minLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  
  return minLength && hasUpper && hasLower && hasNumber && hasSpecial;
}

export async function handler(event: any): Promise<any> {
  logger.info('Auth handler called', { 
    httpMethod: event.httpMethod
  });

  const origin = event.headers?.['origin'] || event.headers?.['Origin'] || '*';
  const method = event.httpMethod || event.requestContext?.http?.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    
    // Check if this is a forgot password request
    if (body.action === 'request' || body.action === 'confirm') {
      return await handleForgotPassword(body, event, origin);
    }
    
    // Otherwise, handle WebAuthn check
    return await handleWebAuthnCheck(body, origin);

  } catch (err: any) {
    logger.error('Auth handler error:', err);
    return errorResponse('Internal server error', 500, undefined, origin);
  }
}

async function handleWebAuthnCheck(body: CheckRequest, origin: string): Promise<any> {
  const { email } = body;

  logger.info('Checking WebAuthn for email', { email });

  if (!email) {
    return errorResponse('Email is required', 400, undefined, origin);
  }

  const prisma = getPrismaClient();

  // Find user by email in profiles table
  const profile = await prisma.profile.findFirst({
    where: { email }
  });

  logger.info('User lookup result', { 
    userFound: !!profile, 
    userId: profile?.user_id 
  });

  if (!profile) {
    return success({ hasWebAuthn: false, credentialsCount: 0 }, 200, origin);
  }

  // Check for WebAuthn credentials
  const webauthnCredentials = await prisma.webAuthnCredential.findMany({
    where: { user_id: profile.user_id }
  });

  logger.info('WebAuthn credentials found', {
    userId: profile.user_id,
    credentialsCount: webauthnCredentials.length,
  });

  return success({
    hasWebAuthn: webauthnCredentials.length > 0,
    credentialsCount: webauthnCredentials.length
  }, 200, origin);
}

async function handleForgotPassword(body: ForgotPasswordRequest, event: any, origin: string): Promise<any> {
  const { action, email, confirmationCode, newPassword } = body;

  logger.info('Forgot password request', { action });

  if (!action || !email) {
    return errorResponse('Missing required fields: action and email', 400, undefined, origin);
  }

  if (!isValidEmail(email)) {
    return errorResponse('Invalid email format', 400, undefined, origin);
  }

  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;

  if (!userPoolId || !clientId) {
    logger.error('Cognito configuration missing', { userPoolId: !!userPoolId, clientId: !!clientId });
    return errorResponse('Authentication service not configured', 500, undefined, origin);
  }

  const prisma = getPrismaClient();

  if (action === 'request') {
    const profile = await prisma.profile.findFirst({
      where: { email },
      include: { organization: { select: { id: true, name: true } } }
    });

    const safeMessage = 'Se o email existir em nosso sistema, você receberá instruções para redefinir sua senha.';

    if (!profile) {
      logger.info('Password reset requested for non-existent user');
      return success({ message: safeMessage }, 200, origin);
    }

    try {
      await cognitoClient.send(new ForgotPasswordCommand({ ClientId: clientId, Username: email }));

      const organizationId = profile.organization_id || process.env.SYSTEM_ORGANIZATION_ID || SYSTEM_ORG_ID_FALLBACK;
      
      await prisma.securityEvent.create({
        data: {
          organization_id: organizationId,
          event_type: 'PASSWORD_RESET_REQUESTED',
          severity: 'INFO',
          description: 'Password reset requested',
          metadata: { 
            email,
            userId: profile.user_id,
            requestIp: event.requestContext?.identity?.sourceIp || event.headers?.['x-forwarded-for']?.split(',')[0],
            userAgent: event.headers?.['user-agent']
          }
        }
      });

      logger.info('Password reset email sent', { userId: profile.user_id });
      return success({ message: safeMessage }, 200, origin);

    } catch (cognitoError: any) {
      logger.error('Cognito forgot password error:', cognitoError);

      if (cognitoError.name === 'UserNotFoundException') {
        return success({ message: safeMessage }, 200, origin);
      }
      if (cognitoError.name === 'LimitExceededException') {
        return errorResponse('Muitas tentativas. Tente novamente mais tarde.', 429, undefined, origin);
      }
      return errorResponse('Erro interno do servidor', 500, undefined, origin);
    }

  } else if (action === 'confirm') {
    if (!confirmationCode || !newPassword) {
      return errorResponse('Missing required fields: confirmationCode and newPassword', 400, undefined, origin);
    }

    if (!isValidPassword(newPassword)) {
      return errorResponse('A senha deve ter pelo menos 8 caracteres e incluir: maiúscula, minúscula, número e caractere especial', 400, undefined, origin);
    }

    try {
      await cognitoClient.send(new ConfirmForgotPasswordCommand({
        ClientId: clientId,
        Username: email,
        ConfirmationCode: confirmationCode,
        Password: newPassword
      }));

      const profile = await prisma.profile.findFirst({
        where: { email },
        include: { organization: true }
      });

      if (profile) {
        const organizationId = profile.organization_id || process.env.SYSTEM_ORGANIZATION_ID || SYSTEM_ORG_ID_FALLBACK;
        
        await prisma.securityEvent.create({
          data: {
            organization_id: organizationId,
            event_type: 'PASSWORD_RESET_COMPLETED',
            severity: 'INFO',
            description: 'Password reset completed successfully',
            metadata: { 
              email,
              userId: profile.user_id,
              requestIp: event.requestContext?.identity?.sourceIp || event.headers?.['x-forwarded-for']?.split(',')[0],
              userAgent: event.headers?.['user-agent']
            }
          }
        });
      }

      logger.info('Password reset completed');
      return success({ message: 'Senha redefinida com sucesso. Você pode fazer login com sua nova senha.' }, 200, origin);

    } catch (cognitoError: any) {
      logger.error('Cognito confirm forgot password error:', cognitoError);

      if (cognitoError.name === 'CodeMismatchException') {
        return errorResponse('Código de confirmação inválido', 400, undefined, origin);
      }
      if (cognitoError.name === 'ExpiredCodeException') {
        return errorResponse('Código de confirmação expirado. Solicite um novo código.', 400, undefined, origin);
      }
      if (cognitoError.name === 'InvalidPasswordException') {
        return errorResponse('Senha não atende aos requisitos de segurança', 400, undefined, origin);
      }
      if (cognitoError.name === 'LimitExceededException') {
        return errorResponse('Muitas tentativas. Tente novamente mais tarde.', 429, undefined, origin);
      }
      return errorResponse('Erro ao redefinir senha', 500, undefined, origin);
    }

  } else {
    return errorResponse('Invalid action. Must be "request" or "confirm"', 400, undefined, origin);
  }
}