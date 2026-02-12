/**
 * WebAuthn Authentication Handler (Public - No Auth Required)
 * 
 * Handles the WebAuthn authentication flow:
 * - start: generates a challenge for the user
 * - finish: verifies the assertion and creates a session
 * 
 * This endpoint is called PRE-LOGIN so it must NOT require Cognito auth.
 * Domain config comes from SSM-backed env vars (WEBAUTHN_RP_ID, WEBAUTHN_ORIGIN).
 */

import { logger } from '../../lib/logger.js';
import { success, error as errorResponse, corsOptions, badRequest, unauthorized } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { getWebAuthnRpId, getWebAuthnOrigin } from '../../lib/app-domain.js';
import * as crypto from 'crypto';

const SESSION_TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

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

/**
 * Verify ES256 (ECDSA P-256) signature for WebAuthn assertion.
 */
function verifySignature(
  publicKeyPem: string,
  authenticatorData: Buffer,
  clientDataJSON: Buffer,
  signature: Buffer
): boolean {
  try {
    const clientDataHash = crypto.createHash('sha256').update(clientDataJSON).digest();
    const signedData = Buffer.concat([authenticatorData, clientDataHash]);
    const verifier = crypto.createVerify('SHA256');
    verifier.update(signedData);
    return verifier.verify(publicKeyPem, signature);
  } catch (err) {
    logger.error('Signature verification error:', err);
    return false;
  }
}

/**
 * Convert raw EC P-256 uncompressed point (65 bytes) to PEM.
 * Also handles keys already stored as PEM or base64-encoded DER.
 */
function rawPublicKeyToPem(storedKey: string): string | null {
  try {
    // If already PEM
    if (storedKey.includes('-----BEGIN')) {
      return storedKey;
    }

    const keyBuffer = Buffer.from(storedKey, 'base64');

    // Raw uncompressed EC point: 0x04 + 32 bytes X + 32 bytes Y = 65 bytes
    if (keyBuffer.length === 65 && keyBuffer[0] === 0x04) {
      const derHeader = Buffer.from([
        0x30, 0x59, // SEQUENCE, 89 bytes
        0x30, 0x13, // SEQUENCE, 19 bytes
        0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID ecPublicKey
        0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // OID prime256v1
        0x03, 0x42, 0x00 // BIT STRING, 66 bytes, 0 unused bits
      ]);
      const derKey = Buffer.concat([derHeader, keyBuffer]);
      return '-----BEGIN PUBLIC KEY-----\n' +
        derKey.toString('base64').match(/.{1,64}/g)!.join('\n') +
        '\n-----END PUBLIC KEY-----';
    }

    // Try as DER-encoded SubjectPublicKeyInfo (91 bytes for P-256)
    if (keyBuffer.length === 91 && keyBuffer[0] === 0x30) {
      return '-----BEGIN PUBLIC KEY-----\n' +
        keyBuffer.toString('base64').match(/.{1,64}/g)!.join('\n') +
        '\n-----END PUBLIC KEY-----';
    }

    return null;
  } catch (err) {
    logger.error('Public key conversion error:', err);
    return null;
  }
}

export async function handler(event: any): Promise<any> {
  const origin = event.headers?.['origin'] || event.headers?.['Origin'] || '*';
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const body: AuthenticationRequest = event.body ? JSON.parse(event.body) : {};
    const { action } = body;

    logger.info('WebAuthn authenticate called', { action, hasEmail: !!body.email });

    if (action === 'start') {
      return await startAuthentication(body.email, origin);
    } else if (action === 'finish') {
      return await finishAuthentication(body, origin);
    }

    return badRequest('Invalid action', undefined, origin);
  } catch (err) {
    logger.error('WebAuthn authenticate error:', err);
    return errorResponse('Internal server error', 500, undefined, origin);
  }
}

async function startAuthentication(email?: string, origin?: string): Promise<any> {
  const prisma = getPrismaClient();

  if (!email) {
    return badRequest('Email is required', undefined, origin);
  }

  // Find user by email
  const user = await prisma.profile.findFirst({
    where: { email: email.toLowerCase().trim() }
  });

  if (!user) {
    return success({ hasWebAuthn: false }, 200, origin);
  }

  // Find WebAuthn credentials
  const webauthnCredentials = await prisma.webAuthnCredential.findMany({
    where: { user_id: user.user_id }
  });

  if (webauthnCredentials.length === 0) {
    return success({ hasWebAuthn: false }, 200, origin);
  }

  // Generate challenge (base64url encoded)
  const challenge = crypto.randomBytes(32).toString('base64url');
  const challengeExpiry = new Date(Date.now() + 300000); // 5 minutes

  await prisma.webauthnChallenge.create({
    data: {
      user_id: user.user_id,
      challenge,
      expires_at: challengeExpiry
    }
  });

  const rpId = getWebAuthnRpId();

  const allowCredentials = webauthnCredentials.map(cred => ({
    type: 'public-key' as const,
    id: cred.credential_id // base64url credential ID
  }));

  return success({
    hasWebAuthn: true,
    options: {
      challenge,
      rpId,
      timeout: 300000,
      userVerification: 'preferred',
      allowCredentials
    }
  }, 200, origin);
}

async function finishAuthentication(
  body: AuthenticationRequest,
  origin?: string
): Promise<any> {
  const prisma = getPrismaClient();
  const { assertion, challenge } = body;

  if (!assertion || !challenge) {
    return badRequest('Missing assertion or challenge', undefined, origin);
  }

  // Verify challenge exists and is not expired
  const storedChallenge = await prisma.webauthnChallenge.findFirst({
    where: {
      challenge,
      expires_at: { gt: new Date() }
    }
  });

  if (!storedChallenge) {
    return badRequest('Invalid or expired challenge', undefined, origin);
  }

  // Delete used challenge immediately
  await prisma.webauthnChallenge.delete({ where: { id: storedChallenge.id } });

  // Find credential by credential_id
  const credential = await prisma.webAuthnCredential.findFirst({
    where: { credential_id: assertion.id }
  });

  if (!credential) {
    await logSecurityEvent(prisma, 'WEBAUTHN_AUTH_FAILED', 'MEDIUM', 
      'Credential not found', { credentialId: assertion.id });
    return unauthorized('Invalid credential', origin);
  }

  // Find user profile
  const userProfile = await prisma.profile.findFirst({
    where: { user_id: credential.user_id },
    include: { organization: { select: { id: true, name: true } } }
  });

  if (!userProfile) {
    await logSecurityEvent(prisma, 'WEBAUTHN_AUTH_FAILED', 'HIGH',
      'Credential user not found', { credentialId: assertion.id, userId: credential.user_id });
    return unauthorized('User not found', origin);
  }

  const orgId = userProfile.organization_id;

  try {
    // Decode clientDataJSON
    const clientDataJSON = Buffer.from(assertion.response.clientDataJSON, 'base64');
    const clientData = JSON.parse(clientDataJSON.toString());

    // Verify challenge matches
    if (clientData.challenge !== challenge) {
      return badRequest('Challenge mismatch', undefined, origin);
    }

    // Verify type
    if (clientData.type !== 'webauthn.get') {
      return badRequest('Invalid type', undefined, origin);
    }

    // Verify origin (anti-phishing)
    const expectedOrigin = getWebAuthnOrigin();
    if (clientData.origin !== expectedOrigin) {
      logger.warn('Origin mismatch', { expected: expectedOrigin, received: clientData.origin });
      return badRequest('Invalid origin', undefined, origin);
    }

    // Decode authenticatorData and signature
    const authenticatorData = Buffer.from(assertion.response.authenticatorData, 'base64');
    const signature = Buffer.from(assertion.response.signature, 'base64');

    // Verify cryptographic signature
    if (credential.public_key) {
      const publicKeyPem = rawPublicKeyToPem(credential.public_key);
      
      if (publicKeyPem) {
        const isValid = verifySignature(publicKeyPem, authenticatorData, clientDataJSON, signature);
        if (!isValid) {
          await logSecurityEvent(prisma, 'WEBAUTHN_SIGNATURE_INVALID', 'HIGH',
            'Signature verification failed', { credentialId: credential.id, userId: credential.user_id }, orgId);
          return unauthorized('Invalid signature', origin);
        }
      } else {
        logger.warn('Could not convert public key to PEM', { credentialId: credential.id });
        return unauthorized('Invalid credential key format', origin);
      }
    } else {
      return unauthorized('Credential has no public key', origin);
    }

    // Verify counter (replay protection)
    const counter = authenticatorData.readUInt32BE(33);
    if (counter > 0 && counter <= credential.counter) {
      await logSecurityEvent(prisma, 'WEBAUTHN_REPLAY_DETECTED', 'HIGH',
        'Replay attack detected', { 
          credentialId: credential.id, 
          expectedCounter: credential.counter, 
          receivedCounter: counter 
        }, orgId);
      return unauthorized('Replay attack detected', origin);
    }

    // Update counter and last_used_at
    await prisma.webAuthnCredential.update({
      where: { id: credential.id },
      data: { counter, last_used_at: new Date() }
    });

    // Create session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionExpiry = new Date(Date.now() + SESSION_TOKEN_EXPIRY_MS);

    await prisma.session.create({
      data: {
        user_id: credential.user_id,
        session_token: sessionToken,
        expires_at: sessionExpiry
      }
    });

    // Log successful authentication
    await logSecurityEvent(prisma, 'WEBAUTHN_AUTH_SUCCESS', 'INFO',
      'WebAuthn authentication successful', {
        credentialId: credential.id,
        deviceName: credential.device_name,
        userId: credential.user_id
      }, orgId);

    return success({
      sessionToken,
      expiresAt: sessionExpiry.toISOString(),
      user: {
        id: userProfile.user_id,
        email: userProfile.email,
        name: userProfile.full_name || userProfile.email?.split('@')[0] || 'User',
        role: userProfile.role || 'user',
        organizationId: orgId,
        organizationName: userProfile.organization?.name || 'Organization'
      }
    }, 200, origin);
  } catch (err) {
    logger.error('Assertion verification error:', err);
    return badRequest('Invalid assertion', undefined, origin);
  }
}

async function logSecurityEvent(
  prisma: any, eventType: string, severity: string, 
  description: string, metadata: any, orgId?: string
): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        organization_id: orgId || process.env.SYSTEM_ORGANIZATION_ID || '00000000-0000-0000-0000-000000000000',
        event_type: eventType,
        severity,
        description,
        metadata
      }
    });
  } catch (err) {
    logger.error('Failed to log security event:', err);
  }
}
