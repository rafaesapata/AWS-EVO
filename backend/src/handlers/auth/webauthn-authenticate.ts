import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from '../../lib/logging.js';
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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body: AuthenticationRequest = JSON.parse(event.body || '{}');
    const { action } = body;

    if (action === 'start') {
      return await startAuthentication(body.email);
    } else if (action === 'finish') {
      return await finishAuthentication(body, event);
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action' }) };
  } catch (error) {
    logger.error('WebAuthn authentication error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};

async function startAuthentication(email?: string): Promise<APIGatewayProxyResult> {
  let allowCredentials: { type: string; id: string }[] = [];

  if (email) {
    // Buscar credenciais do usuário específico
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }) };
    }

    // Buscar credenciais WebAuthn separadamente
    const webauthnCredentials = await prisma.webAuthnCredential.findMany({
      where: { user_id: user.id }
    });

    if (webauthnCredentials.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'No WebAuthn credentials found' }) };
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

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      options: publicKeyCredentialRequestOptions
    })
  };
}

async function finishAuthentication(
  body: AuthenticationRequest,
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const { assertion, challenge } = body;

  if (!assertion || !challenge) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing assertion or challenge' }) };
  }

  // Verificar challenge
  const storedChallenge = await prisma.webauthnChallenge.findFirst({
    where: {
      challenge,
      expires_at: { gt: new Date() }
    }
  });

  if (!storedChallenge) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid or expired challenge' }) };
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

    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid credential' }) };
  }

  try {
    // Decodificar clientDataJSON
    const clientDataJSON = Buffer.from(assertion.response.clientDataJSON, 'base64');
    const clientData = JSON.parse(clientDataJSON.toString());

    // Verificar challenge
    if (clientData.challenge !== challenge) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Challenge mismatch' }) };
    }

    // Verificar tipo
    if (clientData.type !== 'webauthn.get') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid type' }) };
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

      return { statusCode: 401, body: JSON.stringify({ error: 'Replay attack detected' }) };
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

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
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
      })
    };
  } catch (error) {
    logger.error('Assertion verification error:', error);
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid assertion' }) };
  }
}
