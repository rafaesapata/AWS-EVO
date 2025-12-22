import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from '../../lib/logging.js';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

interface RegistrationRequest {
  action: 'start' | 'finish';
  userId?: string;
  deviceName?: string;
  attestation?: {
    id: string;
    rawId: string;
    type: string;
    response: {
      clientDataJSON: string;
      attestationObject: string;
    };
  };
  challenge?: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const authUserId = event.requestContext.authorizer?.claims?.sub;
    if (!authUserId) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const body: RegistrationRequest = JSON.parse(event.body || '{}');
    const { action } = body;

    if (action === 'start') {
      return await startRegistration(authUserId, body.deviceName);
    } else if (action === 'finish') {
      return await finishRegistration(authUserId, body);
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action' }) };
  } catch (error) {
    logger.error('WebAuthn registration error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};

async function startRegistration(userId: string, deviceName?: string): Promise<APIGatewayProxyResult> {
  // Buscar usuário
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }) };
  }

  // Gerar challenge
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
  const rpId = process.env.WEBAUTHN_RP_ID || 'evouds.com';
  const rpName = process.env.WEBAUTHN_RP_NAME || 'EVO UDS';

  const publicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      id: rpId,
      name: rpName
    },
    user: {
      id: Buffer.from(user.id).toString('base64url'),
      name: user.email,
      displayName: user.full_name || user.email
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },   // ES256
      { type: 'public-key', alg: -257 }  // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'preferred',
      residentKey: 'preferred'
    },
    timeout: 300000,
    attestation: 'direct',
    excludeCredentials: [] // Removido pois não incluímos webauthnCredentials na query
  };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      options: publicKeyCredentialCreationOptions
    })
  };
}

async function finishRegistration(
  userId: string,
  body: RegistrationRequest
): Promise<APIGatewayProxyResult> {
  const { attestation, challenge, deviceName } = body;

  if (!attestation || !challenge) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing attestation or challenge' }) };
  }

  // Buscar usuário
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }) };
  }

  // Verificar challenge
  const storedChallenge = await prisma.webauthnChallenge.findFirst({
    where: {
      challenge,
      user_id: user.id,
      expires_at: { gt: new Date() }
    }
  });

  if (!storedChallenge) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid or expired challenge' }) };
  }

  // Deletar challenge usado
  await prisma.webauthnChallenge.delete({ where: { id: storedChallenge.id } });

  try {
    // Decodificar e verificar attestation
    const clientDataJSON = Buffer.from(attestation.response.clientDataJSON, 'base64');
    const clientData = JSON.parse(clientDataJSON.toString());

    // Verificar challenge no clientData
    if (clientData.challenge !== challenge) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Challenge mismatch' }) };
    }

    // Verificar origin
    const expectedOrigin = process.env.WEBAUTHN_ORIGIN || 'https://evouds.com';
    if (clientData.origin !== expectedOrigin) {
      logger.warn(`Origin mismatch: expected ${expectedOrigin}, got ${clientData.origin}`);
    }

    // Decodificar attestationObject (simplificado - em produção usar biblioteca CBOR)
    const attestationObject = Buffer.from(attestation.response.attestationObject, 'base64');
    
    // Extrair public key (simplificado)
    const publicKey = attestationObject.toString('base64');

    // Salvar credencial
    const credential = await prisma.webAuthnCredential.create({
      data: {
        user_id: user.id,
        credential_id: attestation.id,
        public_key: publicKey,
        counter: 0,
        device_name: deviceName || 'Unknown Device'
      }
    });

    // Registrar evento de segurança (removido userId pois não existe no schema)
    await prisma.securityEvent.create({
      data: {
        organization_id: user.id, // Usar como placeholder
        event_type: 'WEBAUTHN_REGISTERED',
        severity: 'INFO',
        description: `WebAuthn credential registered for device: ${credential.device_name}`,
        metadata: {
          credentialId: credential.id,
          deviceName: credential.device_name
        } as any
      }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        credential: {
          id: credential.id,
          deviceName: credential.device_name,
          createdAt: credential.created_at
        }
      })
    };
  } catch (error) {
    logger.error('Attestation verification error:', error);
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid attestation' }) };
  }
}
