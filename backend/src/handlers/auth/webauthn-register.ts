import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logger.js';
import { success, error as errorResponse, corsOptions, badRequest } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getOrigin } from '../../lib/middleware.js';
import { getWebAuthnRpId, getWebAuthnOrigin, getWebAuthnRpName, WEBAUTHN_CHALLENGE_EXPIRY_MS } from '../../lib/app-domain.js';
import * as crypto from 'crypto';

interface RegistrationRequest {
  action: 'generate-challenge' | 'verify-registration';
  userId?: string;
  deviceName?: string;
  credential?: {
    id: string;
    rawId: string;
    publicKey: string; // base64 attestationObject
    clientDataJSON: string; // base64 clientDataJSON
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
    // Verificar se o usuário existe na tabela profiles
    const user = await prisma.profile.findFirst({
      where: { user_id: userId }
    });

    // Se não existir, retornar erro (usuário deve ser criado pelo self-register)
    if (!user) {
      return errorResponse('User profile not found', 404, undefined, origin);
    }

    // Gerar challenge com crypto seguro
    const challenge = crypto.randomBytes(32).toString('base64url');
    const challengeExpiry = new Date(Date.now() + WEBAUTHN_CHALLENGE_EXPIRY_MS);

    // Salvar challenge
    await prisma.webauthnChallenge.create({
      data: {
        challenge,
        user_id: user.user_id,
        expires_at: challengeExpiry
      }
    });

    // Gerar opções de registro
    const rpId = getWebAuthnRpId();
    const rpName = getWebAuthnRpName();

    const registrationOptions = {
      challenge,
      rpName,
      rpId,
      userId: user.user_id,
      userEmail: user.email || '',
      userDisplayName: user.full_name || user.email || 'User'
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
    const user = await prisma.profile.findFirst({
      where: { user_id: userId }
    });

    if (!user) {
      return errorResponse('User not found', 404, undefined, origin);
    }

    // Verificar challenge
    const storedChallenge = await prisma.webauthnChallenge.findFirst({
      where: {
        challenge: challengeId,
        user_id: user.user_id,
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

    // Salvar credencial WebAuthn - extract real public key from attestationObject
    let publicKeyBase64 = credential.publicKey;
    
    // If clientDataJSON is provided, verify the registration
    if (credential.clientDataJSON) {
      const clientDataJSON = Buffer.from(credential.clientDataJSON, 'base64');
      const clientData = JSON.parse(clientDataJSON.toString());
      
      // Verify type
      if (clientData.type !== 'webauthn.create') {
        return badRequest('Invalid clientData type', undefined, origin);
      }
      
      // Verify origin
      const expectedOrigin = getWebAuthnOrigin();
      if (clientData.origin !== expectedOrigin) {
        logger.warn('Origin mismatch in registration', { expected: expectedOrigin, received: clientData.origin });
        return badRequest('Invalid origin', undefined, origin);
      }
    }
    
    // Extract the actual EC public key from the attestationObject (CBOR)
    const extractedKey = extractPublicKeyFromAttestation(credential.publicKey);
    if (extractedKey) {
      publicKeyBase64 = extractedKey;
      logger.info('Extracted EC public key from attestation', { keyLength: Buffer.from(extractedKey, 'base64').length });
    } else {
      logger.warn('Could not extract public key from attestation, storing raw');
    }

    const webauthnCredential = await prisma.webAuthnCredential.create({
      data: {
        user_id: user.user_id,
        credential_id: credential.id,
        public_key: publicKeyBase64,
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
          userId: user.user_id,
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

// ============================================================================
// CBOR / COSE helpers for extracting EC public key from attestationObject
// ============================================================================

function extractPublicKeyFromAttestation(attestationBase64: string): string | null {
  try {
    const buf = Buffer.from(attestationBase64, 'base64');
    const authData = extractAuthDataFromCBOR(buf);
    if (!authData) return null;

    const flags = authData[32]; // flags byte is at offset 32 (after 32-byte rpIdHash)
    if (!(flags & 0x40)) return null; // AT (attested credential data) flag not set

    const credIdLen = authData.readUInt16BE(53); // credIdLen at offset 53 (32 rpIdHash + 1 flags + 4 counter + 16 aaguid)
    const coseKeyStart = 55 + credIdLen; // COSE key starts after credIdLen (2 bytes) + credId
    const coseKeyBytes = authData.subarray(coseKeyStart);
    return extractECKeyFromCOSE(coseKeyBytes);
  } catch {
    return null;
  }
}

function extractAuthDataFromCBOR(data: Buffer): Buffer | null {
  try {
    let offset = 0;
    const firstByte = data[offset++];
    if ((firstByte >> 5) !== 5) return null; // must be map

    const mapLen = firstByte & 0x1f;
    const numItems = mapLen < 24 ? mapLen : (mapLen === 24 ? data[offset++] : 0);

    for (let i = 0; i < numItems; i++) {
      const keyByte = data[offset++];
      if ((keyByte >> 5) !== 3) {
        offset = skipCBOR(data, offset - 1);
        offset = skipCBOR(data, offset);
        continue;
      }
      const keyLen = keyByte & 0x1f;
      const actualKeyLen = keyLen < 24 ? keyLen : (keyLen === 24 ? data[offset++] : 0);
      const key = data.subarray(offset, offset + actualKeyLen).toString('utf8');
      offset += actualKeyLen;

      if (key === 'authData') {
        const valByte = data[offset++];
        const valAdditional = valByte & 0x1f;
        let len: number;
        if (valAdditional < 24) len = valAdditional;
        else if (valAdditional === 24) { len = data[offset++]; }
        else if (valAdditional === 25) { len = data.readUInt16BE(offset); offset += 2; }
        else if (valAdditional === 26) { len = data.readUInt32BE(offset); offset += 4; }
        else return null;
        return data.subarray(offset, offset + len);
      } else {
        offset = skipCBOR(data, offset);
      }
    }
    return null;
  } catch { return null; }
}

function skipCBOR(data: Buffer, offset: number): number {
  const fb = data[offset++];
  const major = fb >> 5;
  const add = fb & 0x1f;
  let len: number;
  if (add < 24) len = add;
  else if (add === 24) { len = data[offset++]; }
  else if (add === 25) { len = data.readUInt16BE(offset); offset += 2; }
  else if (add === 26) { len = data.readUInt32BE(offset); offset += 4; }
  else return data.length;

  switch (major) {
    case 0: case 1: case 7: return offset;
    case 2: case 3: return offset + len;
    case 4:
      for (let i = 0; i < len; i++) offset = skipCBOR(data, offset);
      return offset;
    case 5:
      for (let i = 0; i < len; i++) { offset = skipCBOR(data, offset); offset = skipCBOR(data, offset); }
      return offset;
    default: return data.length;
  }
}

function extractECKeyFromCOSE(coseBytes: Buffer): string | null {
  try {
    let offset = 0;
    const fb = coseBytes[offset++];
    const mapLen = fb & 0x1f;
    const numItems = mapLen < 24 ? mapLen : (mapLen === 24 ? coseBytes[offset++] : 0);

    let x: Buffer | null = null;
    let y: Buffer | null = null;

    for (let i = 0; i < numItems; i++) {
      const keyByte = coseBytes[offset++];
      const keyMajor = keyByte >> 5;
      let keyVal: number;
      if (keyMajor === 0) {
        keyVal = keyByte & 0x1f;
        if (keyVal === 24) keyVal = coseBytes[offset++];
      } else if (keyMajor === 1) {
        keyVal = -1 - (keyByte & 0x1f);
        if ((keyByte & 0x1f) === 24) keyVal = -1 - coseBytes[offset++];
      } else {
        offset = skipCBOR(coseBytes, offset - 1);
        offset = skipCBOR(coseBytes, offset);
        continue;
      }

      const valByte = coseBytes[offset++];
      if ((valByte >> 5) === 2) { // byte string
        const vLen = valByte & 0x1f;
        const actualLen = vLen < 24 ? vLen : (vLen === 24 ? coseBytes[offset++] : 0);
        const value = coseBytes.subarray(offset, offset + actualLen);
        offset += actualLen;
        if (keyVal === -2) x = Buffer.from(value);
        else if (keyVal === -3) y = Buffer.from(value);
      } else {
        offset = skipCBOR(coseBytes, offset - 1);
      }
    }

    if (x && y && x.length === 32 && y.length === 32) {
      return Buffer.concat([Buffer.from([0x04]), x, y]).toString('base64');
    }
    return null;
  } catch { return null; }
}
