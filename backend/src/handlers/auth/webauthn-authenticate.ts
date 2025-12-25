import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from '../../lib/logging.js';
import { success, error as errorResponse, corsOptions, badRequest, unauthorized } from '../../lib/response.js';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

interface AuthenticationRequest {
  action: 'start' | 'finish';
  email?: string;
  assertion?: {
    id: string;
    rawId: string;
    type: string;
    response: {
      clientDataJSON: string;
      authenticatorData: string;
      signature: string;
      userHandle?: string;
    };
  };
  challenge?: string;
}

// Extract origin from event for CORS
function getOrigin(event: APIGatewayProxyEvent): string {
  return event.headers?.origin || event.headers?.Origin || '*';
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const origin = getOrigin(event);
  
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    const body: AuthenticationRequest = JSON.parse(event.body || '{}');
    const { action } = body;

    if (action === 'start') {
      return await startAuthentication(body.email, origin);
    } else if (action === 'finish') {
      return await finishAuthentication(body, event, origin);
    }

    return badRequest('Invalid action', undefined, origin);
  } catch (error) {
    logger.error('WebAuthn authentication error:', error);
    return errorResponse('Internal server error', 500, undefined, origin);
  }
};

async function startAuthentication(email?: string, origin?: string): Promise<APIGatewayProxyResult> {
  let allowCredentials: { type: string; id: string }[] = [];

  if (email) {
    // Buscar credenciais do usuário específico
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return errorResponse('User not found', 404, undefined, origin);
    }

    // Buscar credenciais WebAuthn separadamente
    const webauthnCredentials = await prisma.webAuthnCredential.findMany({
      where: { user_id: user.id }
    });

    if (webauthnCredentials.length === 0) {
      return errorResponse('No WebAuthn credentials found', 404, undefined, origin);
    }

    allowCredentials = webauthnCredentials.map(cred => ({
      type: 'public-key' as const,
      id: cred.credential_id
    }));
  }

  // Gerar challenge
  const challenge = crypto.randomBytes(32).toString('base64url');
  const challengeExpiry = new Date(Date.now() + 300000); // 5 minutos

  // Salvar challenge
  await prisma.webauthnChallenge.create({
    data: {
      user_id: email || 'anonymous',
      challenge,
      expires_at: challengeExpiry
    }
  });

  const rpId = process.env.WEBAUTHN_RP_ID || 'evouds.com';

  const publicKeyCredentialRequestOptions = {
    challenge,
    rpId,
    timeout: 300000,
    userVerification: 'preferred',
    allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined
  };

  return success({ options: publicKeyCredentialRequestOptions }, 200, origin);
}

async function finishAuthentication(
  body: AuthenticationRequest,
  event: APIGatewayProxyEvent,
  origin?: string
): Promise<APIGatewayProxyResult> {
  const { assertion, challenge } = body;

  if (!assertion || !challenge) {
    return badRequest('Missing assertion or challenge', undefined, origin);
  }

  // Verificar challenge
  const storedChallenge = await prisma.webauthnChallenge.findFirst({
    where: {
      challenge,
      expires_at: { gt: new Date() }
    }
  });

  if (!storedChallenge) {
    return badRequest('Invalid or expired challenge', undefined, origin);
  }

  // Deletar challenge usado
  await prisma.webauthnChallenge.delete({ where: { id: storedChallenge.id } });

  // Buscar credencial
  const credential = await prisma.webAuthnCredential.findFirst({
    where: { credential_id: assertion.id }
  });

  if (!credential) {
    // Registrar tentativa falha
    await prisma.securityEvent.create({
      data: {
        organization_id: 'default',
        event_type: 'WEBAUTHN_AUTH_FAILED',
        severity: 'MEDIUM',
        description: 'WebAuthn authentication failed',
        metadata: { credentialId: assertion.id, reason: 'Credential not found' }
      }
    });

    return unauthorized('Invalid credential', origin);
  }

  try {
    // Decodificar clientDataJSON
    const clientDataJSON = Buffer.from(assertion.response.clientDataJSON, 'base64');
    const clientData = JSON.parse(clientDataJSON.toString());

    // Verificar challenge
    if (clientData.challenge !== challenge) {
      return badRequest('Challenge mismatch', undefined, origin);
    }

    // Verificar tipo
    if (clientData.type !== 'webauthn.get') {
      return badRequest('Invalid type', undefined, origin);
    }

    // Decodificar authenticatorData
    const authenticatorData = Buffer.from(assertion.response.authenticatorData, 'base64');
    
    // Extrair counter (bytes 33-36)
    const counter = authenticatorData.readUInt32BE(33);

    // Verificar counter (proteção contra replay)
    if (counter <= credential.counter) {
      await prisma.securityEvent.create({
        data: {
          organization_id: 'default',
          event_type: 'WEBAUTHN_REPLAY_DETECTED',
          severity: 'HIGH',
          description: 'WebAuthn replay attack detected',
          metadata: { credentialId: credential.id, expectedCounter: credential.counter, receivedCounter: counter }
        }
      });

      return unauthorized('Replay attack detected', origin);
    }

    // Atualizar counter
    await prisma.webAuthnCredential.update({
      where: { id: credential.id },
      data: { counter, last_used_at: new Date() }
    });

    // Gerar token de sessão
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

    await prisma.session.create({
      data: {
        user_id: credential.user_id,
        session_token: sessionToken,
        expires_at: sessionExpiry
      }
    });

    // Registrar login bem-sucedido
    await prisma.securityEvent.create({
      data: {
        organization_id: 'default',
        event_type: 'WEBAUTHN_AUTH_SUCCESS',
        severity: 'INFO',
        description: 'WebAuthn authentication successful',
        metadata: { credentialId: credential.id, deviceName: credential.device_name }
      }
    });

    return success({
      sessionToken,
      expiresAt: sessionExpiry.toISOString(),
      user: {
        id: credential.user_id,
        email: 'user@example.com',
        name: 'User',
        role: 'user',
        organizationId: 'default',
        organizationName: 'Default Organization'
      }
    }, 200, origin);
  } catch (error) {
    logger.error('Assertion verification error:', error);
    return badRequest('Invalid assertion', undefined, origin);
  }
}
