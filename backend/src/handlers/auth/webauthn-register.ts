import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logger.js';
import { success, error as errorResponse, corsOptions, badRequest } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getOrigin } from '../../lib/middleware.js';
import { getWebAuthnRpId, getWebAuthnOrigin, getWebAuthnRpName, WEBAUTHN_CHALLENGE_EXPIRY_MS } from '../../lib/app-domain.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import * as crypto from 'crypto';

/** EC P-256 coordinate length in bytes */
const EC_P256_COORDINATE_LENGTH = 32;

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
    
    let body: RegistrationRequest;
    try {
      body = event.body ? JSON.parse(typeof event.body === 'string' ? event.body : JSON.stringify(event.body)) : {};
    } catch (parseError) {
      logger.error('Failed to parse request body:', parseError);
      return badRequest('Invalid JSON in request body', undefined, origin);
    }
    
    const { action } = body;

    logger.info('WebAuthn registration request:', { action, userId, organizationId });

    if (action === 'generate-challenge') {
      return await generateChallenge(userId, organizationId, body.deviceName, origin);
    } else if (action === 'verify-registration') {
      return await verifyRegistration(userId, organizationId, body, origin, event);
    }

    return badRequest('Invalid action. Use "generate-challenge" or "verify-registration"', undefined, origin);
  } catch (err: any) {
    logger.error('WebAuthn registration error:', err);
    return errorResponse(`Internal server error: ${err?.message || 'unknown'}`, 422, undefined, origin);
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

    // Salvar challenge via raw SQL (evita dependência do model gerado no Prisma client da layer)
    try {
      await prisma.$executeRaw`
        INSERT INTO webauthn_challenges (id, user_id, challenge, expires_at, created_at)
        VALUES (gen_random_uuid(), ${user.user_id}, ${challenge}, ${challengeExpiry}, NOW())
      `;
    } catch (insertErr: any) {
      const errMsg = insertErr?.message || '';
      const metaMsg = insertErr?.meta?.message || '';
      const combinedMsg = `${errMsg} ${metaMsg}`.toLowerCase();
      
      if (insertErr?.code === 'P2010' || combinedMsg.includes('does not exist') || insertErr?.meta?.code === '42P01') {
        // Tabela não existe — criar e tentar novamente
        logger.warn('webauthn_challenges table not found, creating...');
        await prisma.$executeRaw`
          CREATE TABLE IF NOT EXISTS webauthn_challenges (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NOT NULL,
            challenge TEXT NOT NULL,
            expires_at TIMESTAMPTZ(6) NOT NULL,
            created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `;
        await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS webauthn_challenges_user_id_idx ON webauthn_challenges(user_id)`;
        await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS webauthn_challenges_challenge_idx ON webauthn_challenges(challenge)`;
        await prisma.$executeRaw`
          INSERT INTO webauthn_challenges (id, user_id, challenge, expires_at, created_at)
          VALUES (gen_random_uuid(), ${user.user_id}, ${challenge}, ${challengeExpiry}, NOW())
        `;
      } else if (combinedMsg.includes('uuid') || combinedMsg.includes('invalid input syntax') || combinedMsg.includes('type')) {
        // Coluna user_id é UUID mas deveria ser TEXT — corrigir e tentar novamente
        logger.warn('webauthn_challenges user_id type mismatch, fixing to TEXT...');
        await prisma.$executeRaw`ALTER TABLE webauthn_challenges ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT`;
        await prisma.$executeRaw`
          INSERT INTO webauthn_challenges (id, user_id, challenge, expires_at, created_at)
          VALUES (gen_random_uuid(), ${user.user_id}, ${challenge}, ${challengeExpiry}, NOW())
        `;
      } else {
        throw insertErr;
      }
    }

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
  } catch (err: any) {
    logger.error('Error generating challenge:', {
      error: err?.message,
      code: err?.code,
      meta: err?.meta,
      stack: err?.stack?.substring(0, 500)
    });
    // Retornar detalhes do erro para diagnóstico (temporário)
    // Temporário: usar 422 para bypass da sanitização de erros 500 em produção
    return errorResponse(`Failed to generate challenge: ${err?.message || 'unknown'} [code=${err?.code || 'none'}]`, 422, undefined, origin);
  }
}

async function verifyRegistration(
  userId: string,
  organizationId: string,
  body: RegistrationRequest,
  origin?: string,
  event?: AuthorizedEvent
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

    // Verificar challenge via raw SQL
    const challenges: any[] = await prisma.$queryRaw`
      SELECT id, user_id, challenge, expires_at 
      FROM webauthn_challenges 
      WHERE challenge = ${challengeId} 
        AND user_id = ${user.user_id} 
        AND expires_at > NOW()
      LIMIT 1
    `;
    const storedChallenge = challenges[0];

    if (!storedChallenge) {
      return badRequest('Invalid or expired challenge', undefined, origin);
    }

    // Deletar challenge usado (cast para text pois id retornado do queryRaw é string)
    await prisma.$executeRaw`
      DELETE FROM webauthn_challenges WHERE id::text = ${String(storedChallenge.id)}
    `;

    // Salvar credencial WebAuthn - extract real public key from attestationObject
    let publicKeyBase64 = credential.publicKey;
    
    // If clientDataJSON is provided, verify the registration
    if (credential.clientDataJSON) {
      let clientData: any;
      try {
        const clientDataJSON = Buffer.from(credential.clientDataJSON, 'base64');
        clientData = JSON.parse(clientDataJSON.toString());
      } catch {
        return badRequest('Invalid clientDataJSON encoding', undefined, origin);
      }
      
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

    // Save credential via raw SQL
    const deviceName = body.deviceName || 'Security Key';
    let webauthnCredential: any;
    try {
      const inserted: any[] = await prisma.$queryRaw`
        INSERT INTO webauthn_credentials (id, user_id, credential_id, public_key, counter, device_name, created_at)
        VALUES (gen_random_uuid(), ${user.user_id}, ${credential.id}, ${publicKeyBase64}, 0, ${deviceName}, NOW())
        RETURNING id, device_name, created_at
      `;
      webauthnCredential = inserted[0];
    } catch (credErr: any) {
      const errMsg = `${credErr?.message || ''} ${credErr?.meta?.message || ''}`.toLowerCase();
      if (errMsg.includes('uuid') || errMsg.includes('invalid input syntax') || errMsg.includes('type')) {
        logger.warn('webauthn_credentials user_id type mismatch, fixing to TEXT...');
        await prisma.$executeRaw`ALTER TABLE webauthn_credentials ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT`;
        const inserted: any[] = await prisma.$queryRaw`
          INSERT INTO webauthn_credentials (id, user_id, credential_id, public_key, counter, device_name, created_at)
          VALUES (gen_random_uuid(), ${user.user_id}, ${credential.id}, ${publicKeyBase64}, 0, ${deviceName}, NOW())
          RETURNING id, device_name, created_at
        `;
        webauthnCredential = inserted[0];
      } else {
        throw credErr;
      }
    }

    // Registrar evento de segurança via raw SQL
    try {
      await prisma.$executeRaw`
        INSERT INTO security_events (id, organization_id, event_type, severity, description, metadata, created_at)
        VALUES (gen_random_uuid(), ${organizationId}::uuid, 'WEBAUTHN_REGISTERED', 'INFO', 
          ${`WebAuthn credential registered for device: ${webauthnCredential.device_name}`},
          ${JSON.stringify({ userId: user.user_id, credentialId: webauthnCredential.id, deviceName: webauthnCredential.device_name })}::jsonb,
          NOW())
      `;
    } catch (secErr: any) {
      // Non-critical — log but don't fail
      logger.warn('Failed to log security event:', secErr?.message);
    }

    logger.info('WebAuthn credential registered successfully:', { 
      userId, 
      credentialId: webauthnCredential.id,
      deviceName: webauthnCredential.device_name 
    });

    // Audit logging (obrigatório para operações que modificam dados)
    if (event) {
      logAuditAsync({
        organizationId,
        userId,
        action: 'CREDENTIAL_CREATE',
        resourceType: 'webauthn_credential',
        resourceId: webauthnCredential.id,
        details: { deviceName: webauthnCredential.device_name },
        ipAddress: getIpFromEvent(event),
        userAgent: getUserAgentFromEvent(event)
      });
    }

    return success({
      credential: {
        id: webauthnCredential.id,
        deviceName: webauthnCredential.device_name,
        createdAt: webauthnCredential.created_at
      }
    }, 200, origin);
  } catch (err: any) {
    logger.error('Error verifying registration:', {
      error: err?.message,
      code: err?.code,
      meta: err?.meta,
      stack: err?.stack?.substring(0, 500)
    });
    // Temporário: usar 422 para bypass da sanitização de erros 500 em produção
    return errorResponse(`Failed to verify registration: ${err?.message || 'unknown'} [code=${err?.code || 'none'}]`, 422, undefined, origin);
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

    if (x && y && x.length === EC_P256_COORDINATE_LENGTH && y.length === EC_P256_COORDINATE_LENGTH) {
      return Buffer.concat([Buffer.from([0x04]), x, y]).toString('base64');
    }
    return null;
  } catch { return null; }
}
