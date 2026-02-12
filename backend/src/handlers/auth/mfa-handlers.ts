/**
 * MFA Handlers - Gerenciamento de autenticação multi-fator
 * Inclui: mfa-list-factors, mfa-enroll, mfa-challenge-verify, mfa-unenroll
 */

import { getHttpMethod, getHttpPath, getOrigin } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId, checkUserRateLimit, RateLimitError } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { mfaEnrollSchema, mfaVerifySchema, mfaUnenrollSchema } from '../../lib/schemas.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { logger } from '../../lib/logger.js';
import { withErrorMonitoring } from '../../lib/error-middleware.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import * as crypto from 'crypto';

// NOTE: MFA is implemented locally using TOTP, not via Cognito MFA
// The Cognito SDK is NOT needed for this handler
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'us-east-1_HPU98xnmT';

// MFA List Factors Handler
export async function listFactorsHandler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    const user = getUserFromEvent(event);
    const prisma = getPrismaClient();
    
    // Get MFA factors from database using Prisma query builder
    const factors: any[] = [];
    try {
      const mfaFactors = await prisma.mfaFactor.findMany({
        where: {
          user_id: user.sub,
          is_active: true
        },
        select: {
          id: true,
          factor_type: true,
          friendly_name: true,
          status: true,
          created_at: true,
          last_used_at: true
        }
      });
      factors.push(...mfaFactors);
    } catch (e) {
      // Table may not exist yet
      logger.warn('MFA factors table not available');
    }
    
    // Also get WebAuthn credentials
    const webauthnCreds: any[] = [];
    try {
      const creds = await prisma.webAuthnCredential.findMany({
        where: { user_id: user.sub },
        select: {
          id: true,
          device_name: true,
          created_at: true,
          last_used_at: true
        }
      });
      webauthnCreds.push(...creds);
    } catch (e) {
      logger.warn('WebAuthn credentials not available');
    }
    
    return success({
      all: [
        ...factors.map((f: any) => ({
          id: f.id,
          factor_type: f.factor_type,
          friendly_name: f.friendly_name,
          status: f.status,
          created_at: f.created_at,
          last_used_at: f.last_used_at
        })),
        ...webauthnCreds.map((w: any) => ({
          id: w.id,
          factor_type: 'webauthn',
          friendly_name: w.device_name,
          status: 'verified',
          created_at: w.created_at,
          last_used_at: w.last_used_at
        }))
      ]
    }, 200, origin);
    
  } catch (err) {
    logger.error('MFA List Factors error', err as Error);
    return error('An unexpected error occurred. Please try again.', 500, undefined, origin);
  }
}

// MFA Enroll Handler
export async function enrollHandler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    const user = getUserFromEvent(event);
    
    // Parse and validate input
    const parseResult = parseAndValidateBody(mfaEnrollSchema, event.body);
    
    if (!parseResult.success) {
      return parseResult.error;
    }
    
    const { factorType, friendlyName } = parseResult.data;
    const prisma = getPrismaClient();
    
    if (factorType === 'totp') {
      // Generate TOTP secret LOCALLY (NOT using Cognito)
      // This ensures the secret matches what our verifyTOTP() function expects
      const secretBytes = crypto.randomBytes(20);
      const secretBase32 = base32Encode(secretBytes);
      
      logger.info('🔐 MFA Enroll: Generating local TOTP secret', { 
        userId: user.sub, 
        email: user.email 
      });
      
      // Create factor record using Prisma
      const factorId = crypto.randomUUID();
      try {
        await prisma.mfaFactor.create({
          data: {
            id: factorId,
            user_id: user.sub,
            factor_type: 'totp',
            friendly_name: friendlyName || 'Authenticator App',
            status: 'pending',
            secret: secretBase32, // Store Base32 encoded secret
            created_at: new Date()
          }
        });
        
        logger.info('🔐 MFA Enroll: Factor created successfully', { 
          factorId, 
          userId: user.sub 
        });
        
        // Audit log — factor is still pending verification, not yet enabled
        logAuditAsync({
          organizationId: getOrganizationId(user),
          userId: user.sub,
          action: 'MFA_ENABLED',
          resourceType: 'mfa',
          resourceId: factorId,
          details: { factor_type: 'totp', status: 'pending_verification', event: 'enrollment_started' },
          ipAddress: getIpFromEvent(event),
          userAgent: getUserAgentFromEvent(event),
        });
      } catch (e: any) {
        logger.error('MFA Enroll: Failed to create factor', { error: e.message });
        return error('Failed to create MFA factor', 500, undefined, origin);
      }
      
      // Generate otpauth URL for QR code
      const issuer = 'EVO';
      const accountName = user.email || user.sub;
      const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
      
      return success({
        factorId,
        type: 'totp',
        secret: secretBase32,
        qrCode: otpauthUrl,
        status: 'pending_verification'
      }, 200, origin);
    }
    
    return badRequest('Unsupported factor type', undefined, origin);
    
  } catch (err) {
    logger.error('MFA Enroll error', err as Error);
    return error('An unexpected error occurred. Please try again.', 500, undefined, origin);
  }
}

// Base32 encoding function for TOTP secrets
function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  let bits = 0;
  let value = 0;
  
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  
  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 31];
  }
  
  return result;
}

// MFA Challenge Verify Handler
export async function verifyHandler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    const user = getUserFromEvent(event);
    
    logger.info('🔐 MFA Verify: Starting verification', { userId: user.sub });
    
    // SECURITY: Rate limiting for MFA verification (prevent brute force)
    try {
      checkUserRateLimit(user.sub, 'auth'); // 10 attempts per minute, 15 min block
    } catch (e) {
      if (e instanceof RateLimitError) {
        logger.warn('MFA brute force attempt detected', { userId: user.sub });
        return {
          statusCode: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': e.retryAfter.toString(),
            'Access-Control-Allow-Origin': origin || '*',
          },
          body: JSON.stringify({
            error: 'Too many attempts',
            message: `Please wait ${e.retryAfter} seconds before trying again.`,
            retryAfter: e.retryAfter
          })
        };
      }
      throw e;
    }
    
    // Parse and validate input
    const parseResult = parseAndValidateBody(mfaVerifySchema, event.body);
    
    if (!parseResult.success) {
      return parseResult.error;
    }
    
    logger.info('🔐 MFA Verify: Received body', { 
      hasFactorId: !!parseResult.data.factorId, 
      hasCode: !!parseResult.data.code,
      codeLength: parseResult.data.code?.length 
    });
    
    const { factorId, code } = parseResult.data;
    const prisma = getPrismaClient();
    
    logger.info('🔐 MFA Verify: Looking up factor', { factorId, userId: user.sub });
    
    // Get factor using Prisma query builder
    let factor;
    try {
      factor = await prisma.mfaFactor.findFirst({
        where: {
          id: factorId,
          user_id: user.sub
        },
        select: {
          id: true,
          factor_type: true,
          friendly_name: true,
          secret: true,
          status: true
        }
      });
    } catch (e: any) {
      logger.error('🔐 MFA Verify: Database error', { error: e.message });
      return error('Database error while looking up factor', 500, undefined, origin);
    }
    
    if (!factor) {
      logger.warn('🔐 MFA Verify: Factor not found', { factorId, userId: user.sub });
      return badRequest('Factor not found', undefined, origin);
    }
    
    logger.info('🔐 MFA Verify: Factor found', { 
      factorId, 
      factorType: factor.factor_type,
      hasSecret: !!factor.secret,
      status: factor.status
    });
    
    // Verify TOTP code locally using the secret stored in database
    if (factor.factor_type === 'totp') {
      if (!factor.secret) {
        logger.error('🔐 MFA Verify: Factor has no secret', { factorId });
        return error('MFA factor configuration error - no secret', 500, undefined, origin);
      }
      
      const isValid = verifyTOTP(factor.secret, code);
      
      logger.info('🔐 MFA Verify: TOTP verification result', { 
        factorId, 
        isValid,
      });
      
      if (!isValid) {
        logger.warn('🔐 MFA Verify: Invalid TOTP code', { 
          factorId, 
          userId: user.sub 
        });
        return badRequest('Invalid verification code', undefined, origin);
      }
      
      // Update factor status to verified
      await prisma.mfaFactor.update({
        where: { id: factorId },
        data: {
          status: 'verified',
          verified_at: new Date()
        }
      });
      
      logger.info('🔐 MFA Verify: Factor verified successfully', { factorId, userId: user.sub });
      
      // Audit log — MFA is now truly enabled after verification
      logAuditAsync({
        organizationId: getOrganizationId(user),
        userId: user.sub,
        action: 'MFA_VERIFIED',
        resourceType: 'mfa',
        resourceId: factorId,
        details: { factor_type: 'totp', status: 'verified' },
        ipAddress: getIpFromEvent(event),
        userAgent: getUserAgentFromEvent(event),
      });
      
      return success({
        verified: true,
        factorId,
        message: 'MFA factor verified successfully'
      }, 200, origin);
    }
    
    return badRequest('Unsupported factor type', undefined, origin);
    
  } catch (err) {
    logger.error('MFA Verify error', err as Error);
    return error('An unexpected error occurred. Please try again.', 500, undefined, origin);
  }
}

// MFA Unenroll Handler
export async function unenrollHandler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    const user = getUserFromEvent(event);
    
    // Parse and validate input
    const parseResult = parseAndValidateBody(mfaUnenrollSchema, event.body);
    
    if (!parseResult.success) {
      return parseResult.error;
    }
    
    const { factorId } = parseResult.data;
    const prisma = getPrismaClient();
    
    // SECURITY: Verify the factor belongs to the authenticated user before deactivating
    const factor = await prisma.mfaFactor.findFirst({
      where: {
        id: factorId,
        user_id: user.sub
      }
    });
    
    if (!factor) {
      logger.warn('MFA Unenroll: Factor not found or does not belong to user', { factorId, userId: user.sub });
      return badRequest('Factor not found', undefined, origin);
    }
    
    // Deactivate factor using Prisma
    try {
      await prisma.mfaFactor.update({
        where: { id: factorId },
        data: {
          is_active: false,
          deactivated_at: new Date()
        }
      });
      
      // Audit log — MFA factor removed
      logAuditAsync({
        organizationId: getOrganizationId(user),
        userId: user.sub,
        action: 'MFA_DISABLED',
        resourceType: 'mfa',
        resourceId: factorId,
        details: { factor_type: factor.factor_type, event: 'unenrolled' },
        ipAddress: getIpFromEvent(event),
        userAgent: getUserAgentFromEvent(event),
      });
    } catch (e) {
      logger.warn('Failed to deactivate factor', { factorId, error: (e as Error).message });
    }
    
    return success({
      unenrolled: true,
      factorId,
      message: 'MFA factor removed successfully'
    }, 200, origin);
    
  } catch (err) {
    logger.error('MFA Unenroll error', err as Error);
    return error('An unexpected error occurred. Please try again.', 500, undefined, origin);
  }
}

// MFA Check Handler - Verifica se usuário tem MFA habilitado
export async function checkHandler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    const prisma = getPrismaClient();
    
    logger.info('🔐 MFA Check: Checking MFA status for user', { 
      userId: user.sub, 
      email: user.email,
      organizationId 
    });
    
    // Check if user has active MFA factors (gracefully handle if table doesn't exist)
    let mfaFactors: any[] = [];
    try {
      mfaFactors = await prisma.mfaFactor.findMany({
        where: {
          user_id: user.sub,
          is_active: true,
          status: 'verified'
        },
        select: {
          id: true,
          factor_type: true,
          friendly_name: true,
          status: true,
          verified_at: true
        }
      });
    } catch (e: any) {
      // Table may not exist yet - this is OK, just means no MFA factors
      if (e.code === 'P2021' || e.message?.includes('does not exist')) {
        logger.warn('🔐 MFA Check: mfa_factors table does not exist yet - no MFA configured');
        mfaFactors = [];
      } else {
        throw e;
      }
    }
    
    // Check if user has WebAuthn credentials (gracefully handle if table doesn't exist)
    let webauthnCredentials: any[] = [];
    try {
      webauthnCredentials = await prisma.webAuthnCredential.findMany({
        where: {
          user_id: user.sub
        },
        select: {
          id: true,
          device_name: true,
          created_at: true
        }
      });
    } catch (e: any) {
      // Table may not exist yet - this is OK
      if (e.code === 'P2021' || e.message?.includes('does not exist')) {
        logger.warn('🔐 MFA Check: webauthn_credentials table does not exist yet');
        webauthnCredentials = [];
      } else {
        throw e;
      }
    }
    
    const hasMFA = mfaFactors.length > 0;
    const hasWebAuthn = webauthnCredentials.length > 0;
    const requiresMFA = hasMFA || hasWebAuthn; // If user has any MFA method, it's required
    
    logger.info('🔐 MFA Check: Results', {
      userId: user.sub,
      hasMFA,
      hasWebAuthn,
      requiresMFA,
      mfaFactorsCount: mfaFactors.length,
      webauthnCount: webauthnCredentials.length
    });
    
    return success({
      requiresMFA,
      hasMFA,
      hasWebAuthn,
      mfaFactors: mfaFactors.map(factor => ({
        id: factor.id,
        type: factor.factor_type,
        name: factor.friendly_name,
        status: factor.status,
        verifiedAt: factor.verified_at
      })),
      webauthnCredentials: webauthnCredentials.map(cred => ({
        id: cred.id,
        name: cred.device_name,
        createdAt: cred.created_at
      }))
    }, 200, origin);
    
  } catch (err) {
    logger.error('MFA Check error', err as Error);
    return error('An unexpected error occurred. Please try again.', 500, undefined, origin);
  }
}

// MFA Verify Login Handler - Verifica código MFA durante o login
export async function verifyLoginHandler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    // SECURITY: Rate limiting for MFA verification (prevent brute force)
    try {
      checkUserRateLimit(user.sub, 'auth'); // 10 attempts per minute, 15 min block
    } catch (e) {
      if (e instanceof RateLimitError) {
        logger.warn('MFA brute force attempt detected', { userId: user.sub });
        return {
          statusCode: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': e.retryAfter.toString(),
            'Access-Control-Allow-Origin': origin || '*',
          },
          body: JSON.stringify({
            error: 'Too many attempts',
            message: `Please wait ${e.retryAfter} seconds before trying again.`,
            retryAfter: e.retryAfter
          })
        };
      }
      throw e;
    }
    
    // Parse and validate input
    const parseResult = parseAndValidateBody(mfaVerifySchema, event.body);
    
    if (!parseResult.success) {
      return parseResult.error;
    }
    
    const { code, factorId } = parseResult.data;
    
    const prisma = getPrismaClient();
    
    logger.info('🔐 MFA Verify Login: Verifying code', { 
      userId: user.sub, 
      factorId,
      organizationId 
    });
    
    // Get the MFA factor
    const mfaFactor = await prisma.mfaFactor.findFirst({
      where: {
        id: factorId,
        user_id: user.sub,
        is_active: true,
        status: 'verified'
      },
      select: {
        id: true,
        factor_type: true,
        secret: true,
        friendly_name: true
      }
    });
    
    if (!mfaFactor) {
      logger.warn('MFA factor not found or not active', { userId: user.sub, factorId });
      return badRequest('MFA factor not found or not active', undefined, origin);
    }
    
    // Verify TOTP code
    if (mfaFactor.factor_type === 'totp') {
      if (!mfaFactor.secret) {
        logger.error('MFA factor missing secret', { userId: user.sub, factorId });
        return error('MFA factor configuration error', 500, undefined, origin);
      }
      
      const isValid = verifyTOTP(mfaFactor.secret, code);
      
      if (!isValid) {
        logger.warn('Invalid MFA code provided', { userId: user.sub, factorId });
        return badRequest('Invalid MFA code', undefined, origin);
      }
      
      // Update last used timestamp
      await prisma.mfaFactor.update({
        where: { id: factorId },
        data: {
          last_used_at: new Date()
        }
      });
      
      logger.info('🔐 MFA Verify Login: Code verified successfully', { 
        userId: user.sub, 
        factorId 
      });
      
      return success({
        verified: true,
        message: 'MFA code verified successfully'
      }, 200, origin);
    }
    
    return badRequest('Unsupported MFA factor type', undefined, origin);
    
  } catch (err) {
    logger.error('MFA Verify Login error', err as Error);
    return error('An unexpected error occurred. Please try again.', 500, undefined, origin);
  }
}

// TOTP verification function
function verifyTOTP(secret: string, token: string, window: number = 1): boolean {
  try {
    const epoch = Math.round(new Date().getTime() / 1000.0);
    const counter = Math.floor(epoch / 30);
    
    // Simple base32 decode for TOTP secrets
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    let value = 0;
    let index = 0;
    
    for (let i = 0; i < secret.length; i++) {
      const char = secret.charAt(i).toUpperCase();
      const charIndex = base32Chars.indexOf(char);
      if (charIndex === -1) continue;
      
      value = (value << 5) | charIndex;
      index += 5;
      
      if (index >= 8) {
        bits += String.fromCharCode((value >>> (index - 8)) & 255);
        index -= 8;
      }
    }
    
    const secretBytes = Buffer.from(bits, 'binary');
    
    for (let i = -window; i <= window; i++) {
      const testCounter = counter + i;
      const hash = crypto.createHmac('sha1', secretBytes);
      const counterBuffer = Buffer.alloc(8);
      counterBuffer.writeUInt32BE(testCounter, 4);
      hash.update(counterBuffer);
      const hmac = hash.digest();
      
      const offset = hmac[hmac.length - 1] & 0xf;
      const code = (hmac[offset] & 0x7f) << 24 |
                   (hmac[offset + 1] & 0xff) << 16 |
                   (hmac[offset + 2] & 0xff) << 8 |
                   (hmac[offset + 3] & 0xff);
      
      const otp = (code % 1000000).toString().padStart(6, '0');
      
      if (otp === token) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('TOTP verification error:', error);
    return false;
  }
}

// Main handler that routes to specific MFA function
export const handler = withErrorMonitoring('mfa-handlers', async (
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> => {
  const path = getHttpPath(event);
  
  if (path.includes('mfa-list-factors')) {
    return listFactorsHandler(event, context);
  } else if (path.includes('mfa-enroll')) {
    return enrollHandler(event, context);
  } else if (path.includes('mfa-challenge-verify')) {
    return verifyHandler(event, context);
  } else if (path.includes('mfa-verify-login')) {
    return verifyLoginHandler(event, context);
  } else if (path.includes('mfa-check')) {
    return checkHandler(event, context);
  } else if (path.includes('mfa-unenroll')) {
    return unenrollHandler(event, context);
  }
  
  return badRequest('Unknown MFA operation');
});
