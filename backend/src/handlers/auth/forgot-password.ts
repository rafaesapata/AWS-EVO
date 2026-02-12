import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logger.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getOrigin } from '../../lib/middleware.js';
import { safeParseJSON } from '../../lib/request-parser.js';
import { getPrismaClient } from '../../lib/database.js';
import { 
  CognitoIdentityProviderClient, 
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand
} from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({ region: 'us-east-1' });

interface ForgotPasswordRequest {
  action: 'request' | 'confirm';
  email: string;
  confirmationCode?: string;
  newPassword?: string;
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPassword(password: string): boolean {
  // Cognito password requirements: min 8 chars, uppercase, lowercase, number, special char
  const minLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  
  return minLength && hasUpper && hasLower && hasNumber && hasSpecial;
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

  try {
    const body = safeParseJSON<ForgotPasswordRequest>(
      event.body, 
      {} as ForgotPasswordRequest, 
      'forgot-password'
    );

    const { action, email, confirmationCode, newPassword } = body;

    if (!action || !email) {
      return badRequest('Missing required fields: action and email', undefined, origin);
    }

    if (!isValidEmail(email)) {
      return badRequest('Invalid email format', undefined, origin);
    }

    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    const clientId = process.env.COGNITO_CLIENT_ID;

    if (!userPoolId || !clientId) {
      logger.error('Cognito configuration missing', { userPoolId: !!userPoolId, clientId: !!clientId });
      return error('Authentication service not configured', 500, undefined, origin);
    }

    const prisma = getPrismaClient();

    logger.info('🔐 Forgot password request', { action, email });

    if (action === 'request') {
      // Verificar se o usuário existe no banco de dados (profiles table)
      const profile = await prisma.profile.findFirst({
        where: { email },
        include: {
          organization: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      if (!profile) {
        // SECURITY: Add random delay to prevent timing-based user enumeration
        // Existing users trigger DB + Cognito calls (~200-500ms), so we simulate similar latency
        const randomDelay = 200 + Math.floor(Math.random() * 300);
        await new Promise(resolve => setTimeout(resolve, randomDelay));
        
        logger.info('🔐 Password reset requested for non-existent user', { email });
        return success({
          message: 'Se o email existir em nosso sistema, você receberá instruções para redefinir sua senha.'
        }, 200, origin);
      }

      try {
        // Solicitar reset de senha no Cognito
        await cognitoClient.send(new ForgotPasswordCommand({
          ClientId: clientId,
          Username: email
        }));

        // Registrar evento de segurança
        const organizationId = profile.organization_id || process.env.SYSTEM_ORGANIZATION_ID || '00000000-0000-0000-0000-000000000000';
        
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

        logger.info('✅ Password reset email sent', { email, userId: profile.user_id });

        return success({
          message: 'Se o email existir em nosso sistema, você receberá instruções para redefinir sua senha.'
        }, 200, origin);

      } catch (cognitoError: any) {
        logger.error('❌ Cognito forgot password error', { email, error: cognitoError });

        // Tratar erros específicos do Cognito
        if (cognitoError.name === 'UserNotFoundException') {
          // Mesmo assim, não revelamos que o usuário não existe
          return success({
            message: 'Se o email existir em nosso sistema, você receberá instruções para redefinir sua senha.'
          }, 200, origin);
        }

        if (cognitoError.name === 'LimitExceededException') {
          return error('Muitas tentativas. Tente novamente mais tarde.', 429, undefined, origin);
        }

        if (cognitoError.name === 'InvalidParameterException') {
          return badRequest('Parâmetros inválidos', undefined, origin);
        }

        return error('Erro interno do servidor', 500, undefined, origin);
      }

    } else if (action === 'confirm') {
      if (!confirmationCode || !newPassword) {
        return badRequest('Missing required fields: confirmationCode and newPassword', undefined, origin);
      }

      if (!isValidPassword(newPassword)) {
        return badRequest(
          'A senha deve ter pelo menos 8 caracteres e incluir: maiúscula, minúscula, número e caractere especial',
          undefined,
          origin
        );
      }

      try {
        // Confirmar reset de senha no Cognito
        await cognitoClient.send(new ConfirmForgotPasswordCommand({
          ClientId: clientId,
          Username: email,
          ConfirmationCode: confirmationCode,
          Password: newPassword
        }));

        // Buscar usuário para logging (profiles table)
        const profile = await prisma.profile.findFirst({
          where: { email },
          include: {
            organization: true
          }
        });

        if (profile) {
          const organizationId = profile.organization_id || process.env.SYSTEM_ORGANIZATION_ID || '00000000-0000-0000-0000-000000000000';
          
          // Registrar evento de segurança
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

        logger.info('✅ Password reset completed', { email });

        return success({
          message: 'Senha redefinida com sucesso. Você pode fazer login com sua nova senha.'
        }, 200, origin);

      } catch (cognitoError: any) {
        logger.error('❌ Cognito confirm forgot password error', { email, error: cognitoError });

        if (cognitoError.name === 'CodeMismatchException') {
          return badRequest('Código de confirmação inválido', undefined, origin);
        }

        if (cognitoError.name === 'ExpiredCodeException') {
          return badRequest('Código de confirmação expirado. Solicite um novo código.', undefined, origin);
        }

        if (cognitoError.name === 'InvalidPasswordException') {
          return badRequest('Senha não atende aos requisitos de segurança', undefined, origin);
        }

        if (cognitoError.name === 'LimitExceededException') {
          return error('Muitas tentativas. Tente novamente mais tarde.', 429, undefined, origin);
        }

        return error('Erro ao redefinir senha', 500, undefined, origin);
      }

    } else {
      return badRequest('Invalid action. Must be "request" or "confirm"', undefined, origin);
    }

  } catch (err) {
    logger.error('❌ Forgot password handler error', err);
    return error('Internal server error', 500, undefined, origin);
  }
}