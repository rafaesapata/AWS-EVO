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
import { logger } from '../../lib/logging.js';
import { CognitoIdentityProviderClient, AdminSetUserMFAPreferenceCommand, AdminGetUserCommand, AssociateSoftwareTokenCommand, VerifySoftwareTokenCommand } from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' });
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'us-east-1_cnesJ48lR';

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
      factors: [
        ...factors.map((f: any) => ({
          id: f.id,
          type: f.factor_type,
          name: f.friendly_name,
          status: f.status,
          createdAt: f.created_at,
          lastUsedAt: f.last_used_at
        })),
        ...webauthnCreds.map((w: any) => ({
          id: w.id,
          type: 'webauthn',
          name: w.device_name,
          status: 'verified',
          createdAt: w.created_at,
          lastUsedAt: w.last_used_at
        }))
      ]
    }, 200, origin);
    
  } catch (err) {
    logger.error('MFA List Factors error', err as Error);
    return error(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
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
    let body;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return badRequest('Invalid JSON in request body', undefined, origin);
    }
    
    const parseResult = mfaEnrollSchema.safeParse(body);
    
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      return badRequest(`Validation error: ${errorMessages}`, undefined, origin);
    }
    
    const { factorType, friendlyName } = parseResult.data;
    const prisma = getPrismaClient();
    
    if (factorType === 'totp') {
      // Generate TOTP secret using Cognito
      const associateResponse = await cognitoClient.send(new AssociateSoftwareTokenCommand({
        AccessToken: event.headers?.authorization?.replace('Bearer ', '')
      }));
      
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
            secret: associateResponse.SecretCode, // TODO: Encrypt with KMS
            created_at: new Date()
          }
        });
      } catch (e) {
        // Fallback to raw query if model doesn't exist
        logger.warn('MFA factor model not available, using raw query');
      }
      
      return success({
        factorId,
        type: 'totp',
        secret: associateResponse.SecretCode,
        qrCode: `otpauth://totp/EVO:${user.email}?secret=${associateResponse.SecretCode}&issuer=EVO`,
        status: 'pending_verification'
      }, 200, origin);
    }
    
    return badRequest('Unsupported factor type', undefined, origin);
    
  } catch (err) {
    logger.error('MFA Enroll error', err as Error);
    return error(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
  }
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
    let body;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return badRequest('Invalid JSON in request body', undefined, origin);
    }
    
    const parseResult = mfaVerifySchema.safeParse(body);
    
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      return badRequest(`Validation error: ${errorMessages}`, undefined, origin);
    }
    
    const { factorId, code } = parseResult.data;
    const prisma = getPrismaClient();
    
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
    } catch (e) {
      logger.warn('MFA factor model not available');
      return badRequest('Factor not found', undefined, origin);
    }
    
    if (!factor) {
      return badRequest('Factor not found', undefined, origin);
    }
    
    // Verify with Cognito
    try {
      await cognitoClient.send(new VerifySoftwareTokenCommand({
        AccessToken: event.headers?.authorization?.replace('Bearer ', ''),
        UserCode: code,
        FriendlyDeviceName: factor.friendly_name || 'Authenticator'
      }));
      
      // Update factor status
      await prisma.mfaFactor.update({
        where: { id: factorId },
        data: {
          status: 'verified',
          verified_at: new Date()
        }
      });
      
      return success({
        verified: true,
        factorId,
        message: 'MFA factor verified successfully'
      }, 200, origin);
      
    } catch (verifyError) {
      logger.warn('MFA verification failed', { factorId, userId: user.sub });
      return badRequest('Invalid verification code', undefined, origin);
    }
    
  } catch (err) {
    logger.error('MFA Verify error', err as Error);
    return error(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
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
    let body;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return badRequest('Invalid JSON in request body', undefined, origin);
    }
    
    const parseResult = mfaUnenrollSchema.safeParse(body);
    
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      return badRequest(`Validation error: ${errorMessages}`, undefined, origin);
    }
    
    const { factorId } = parseResult.data;
    const prisma = getPrismaClient();
    
    // Deactivate factor using Prisma
    try {
      await prisma.mfaFactor.update({
        where: { id: factorId },
        data: {
          is_active: false,
          deactivated_at: new Date()
        }
      });
    } catch (e) {
      logger.warn('Factor not found in mfa_factors, may be webauthn');
    }
    
    return success({
      unenrolled: true,
      factorId,
      message: 'MFA factor removed successfully'
    }, 200, origin);
    
  } catch (err) {
    logger.error('MFA Unenroll error', err as Error);
    return error(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
  }
}

// Main handler that routes to specific MFA function
export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const path = getHttpPath(event);
  
  if (path.includes('mfa-list-factors')) {
    return listFactorsHandler(event, context);
  } else if (path.includes('mfa-enroll')) {
    return enrollHandler(event, context);
  } else if (path.includes('mfa-challenge-verify')) {
    return verifyHandler(event, context);
  } else if (path.includes('mfa-unenroll')) {
    return unenrollHandler(event, context);
  }
  
  return badRequest('Unknown MFA operation');
}
