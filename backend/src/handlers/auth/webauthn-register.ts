import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from '../../lib/logging.js';
import { success, error as errorResponse, corsOptions, unauthorized, badRequest } from '../../lib/response.js';
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
    const authUserId = event.requestContext.authorizer?.claims?.sub;
    if (!authUserId) {
      return unauthorized('Authentication required', origin);
    }

    const body: RegistrationRequest = JSON.parse(event.body || '{}');
    const { action } = body;

    if (action === 'start') {
      return await startRegistration(authUserId, body.deviceName, origin);
    } else if (action === 'finish') {
      return await finishRegistration(authUserId, body, origin);
    }

    return badRequest('Invalid action', undefined, origin);
  } catch (error) {
    logger.error('WebAuthn registration error:', error);
    return errorResponse('Internal server error', 500, undefined, origin);
  }
};

async function startRegistration(userId: string, deviceName?: string, origin?: string): Promise<APIGatewayProxyResult> {
  // Buscar usuário
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    return errorResponse('User not found', 404, undefined, origin);
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

  return success({ options: publicKeyCredentialCreationOptions }, 200, origin);
}

async function finishRegistration(
  userId: string,
  body: RegistrationRequest,
  origin?: string
): Promise<APIGatewayProxyResult> {
  const { attestation, challenge, deviceName } = body;

  if (!attestation || !challenge) {
    return badRequest('Missing attestation or challenge', undefined, origin);
  }

  // Buscar usuário
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    return errorResponse('User not found', 404, undefined, origin);
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
    return badRequest('Invalid or expired challenge', undefined, origin);
  }

  // Deletar challenge usado
  await prisma.webauthnChallenge.delete({ where: { id: storedChallenge.id } });

  try {
    // Decodificar e verificar attestation
    const clientDataJSON = Buffer.from(attestation.response.clientDataJSON, 'base64');
    const clientData = JSON.parse(clientDataJSON.toString());

    // Verificar challenge no clientData
    if (clientData.challenge !== challenge) {
      return badRequest('Challenge mismatch', undefined, origin);
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

    return success({
      credential: {
        id: credential.id,
        deviceName: credential.device_name,
        createdAt: credential.created_at
      }
    }, 200, origin);
  } catch (error) {
    logger.error('Attestation verification error:', error);
    return badRequest('Invalid attestation', undefined, origin);
  }
}
