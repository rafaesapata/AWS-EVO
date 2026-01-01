import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error as errorResponse, corsOptions, badRequest } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getOrigin } from '../../lib/middleware.js';
import * as crypto from 'crypto';

interface RegistrationRequest {
  action: 'generate-challenge' | 'verify-registration';
  userId?: string;
  deviceName?: string;
  credential?: {
    id: string;
    publicKey: string;
    transports?: string[];
  };
  challengeId?: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  // Handle CORS preflight
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    let authUser: any;
    let organizationId: string;
    
    try {
      authUser = getUserFromEvent(event);
      organizationId = getOrganizationId(authUser);
    } catch (authError) {
      logger.error('Authentication error:', authError);
      return errorResponse('Authentication required', 401, undefined, origin);
    }

    if (!authUser?.sub && !authUser?.id) {
      return errorResponse('Invalid user data', 401, undefined, origin);
    }

    const userId = authUser.sub || authUser.id;
    const body: RegistrationRequest = event.body ? JSON.parse(event.body) : {};
    const { action } = body;

    logger.info('WebAuthn registration request:', { action, userId, organizationId });

    if (action === 'generate-challenge') {
      return await generateChallenge(userId, organizationId, body.deviceName, origin);
    } else if (action === 'verify-registration') {
      return await verifyRegistration(userId, organizationId, body, origin);
    }

    return badRequest('Invalid action. Use "generate-challenge" or "verify-registration"', undefined, origin);
  } catch (err) {
    logger.error('WebAuthn registration error:', err);
    return errorResponse('Internal server error', 500, undefined, origin);
  }
}

async function generateChallenge(
  userId: string, 
  organizationId: string, 
  deviceName?: string, 
  origin?: string
): Promise<APIGatewayProxyResultV2> {
  const prisma = getPrismaClient();
  
  try {
    // Verificar se o usuário existe na tabela users
    let user = await prisma.user.findUnique({
      where: { id: userId }
    });

    // Se não existir, criar o usuário
    if (!user) {
      // Buscar dados do perfil para obter email
      const profile = await prisma.profile.findFirst({
        where: { user_id: userId }
      });

      if (!profile) {
        return errorResponse('User profile not found', 404, undefined, origin);
      }

      user = await prisma.user.create({
        data: {
          id: userId,
          email: profile.full_name || `user-${userId}@example.com`, // Fallback email
          full_name: profile.full_name,
          is_active: true
        }
      });
    }

    // Gerar challenge com crypto seguro
    const challenge = crypto.randomBytes(32).toString('base64url');
    const challengeExpiry = new Date(Date.now() + 300000); // 5 minutos

    // Salvar challenge
    await prisma.webauthnChallenge.create({
      data: {
        challenge,
        user_id: user.id,
        expires_at: challengeExpiry
      }
    });

    // Gerar opções de registro
    const rpId = process.env.WEBAUTHN_RP_ID || 'evo.ai.udstec.io';
    const rpName = process.env.WEBAUTHN_RP_NAME || 'EVO UDS Platform';

    const registrationOptions = {
      challenge,
      rpName,
      rpId,
      userId: user.id,
      userEmail: user.email,
      userDisplayName: user.full_name || user.email
    };

    logger.info('Challenge generated successfully:', { userId, challenge: challenge.substring(0, 10) + '...' });

    return success(registrationOptions, 200, origin);
  } catch (error) {
    logger.error('Error generating challenge:', error);
    return errorResponse('Failed to generate challenge', 500, undefined, origin);
  }
}

async function verifyRegistration(
  userId: string,
  organizationId: string,
  body: RegistrationRequest,
  origin?: string
): Promise<APIGatewayProxyResultV2> {
  const prisma = getPrismaClient();
  const { credential, challengeId } = body;

  if (!credential || !challengeId) {
    return badRequest('Missing credential or challengeId', undefined, origin);
  }

  try {
    // Verificar se o usuário existe
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return errorResponse('User not found', 404, undefined, origin);
    }

    // Verificar challenge
    const storedChallenge = await prisma.webauthnChallenge.findFirst({
      where: {
        challenge: challengeId,
        user_id: user.id,
        expires_at: { gt: new Date() }
      }
    });

    if (!storedChallenge) {
      return badRequest('Invalid or expired challenge', undefined, origin);
    }

    // Deletar challenge usado
    await prisma.webauthnChallenge.delete({ 
      where: { id: storedChallenge.id } 
    });

    // Salvar credencial WebAuthn
    const webauthnCredential = await prisma.webAuthnCredential.create({
      data: {
        user_id: user.id,
        credential_id: credential.id,
        public_key: credential.publicKey,
        counter: 0,
        device_name: body.deviceName || 'Security Key'
      }
    });

    // Registrar evento de segurança
    await prisma.securityEvent.create({
      data: {
        organization_id: organizationId,
        event_type: 'WEBAUTHN_REGISTERED',
        severity: 'INFO',
        description: `WebAuthn credential registered for device: ${webauthnCredential.device_name}`,
        metadata: {
          userId: user.id,
          credentialId: webauthnCredential.id,
          deviceName: webauthnCredential.device_name
        } as any
      }
    });

    logger.info('WebAuthn credential registered successfully:', { 
      userId, 
      credentialId: webauthnCredential.id,
      deviceName: webauthnCredential.device_name 
    });

    return success({
      success: true,
      credential: {
        id: webauthnCredential.id,
        deviceName: webauthnCredential.device_name,
        createdAt: webauthnCredential.created_at
      }
    }, 200, origin);
  } catch (error) {
    logger.error('Error verifying registration:', error);
    return errorResponse('Failed to verify registration', 500, undefined, origin);
  }
}
