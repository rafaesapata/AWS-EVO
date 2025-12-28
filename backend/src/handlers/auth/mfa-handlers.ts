/**
 * MFA Handlers - Gerenciamento de autenticação multi-fator
 * Inclui: mfa-list-factors, mfa-enroll, mfa-challenge-verify, mfa-unenroll
 */

import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { CognitoIdentityProviderClient, AdminSetUserMFAPreferenceCommand, AdminGetUserCommand, AssociateSoftwareTokenCommand, VerifySoftwareTokenCommand } from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' });
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'us-east-1_qGmGkvmpL';

interface MFAListRequest {}

interface MFAEnrollRequest {
  factorType: 'totp' | 'sms';
  friendlyName?: string;
}

interface MFAVerifyRequest {
  factorId: string;
  code: string;
}

interface MFAUnenrollRequest {
  factorId: string;
}

// MFA List Factors Handler
export async function listFactorsHandler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  console.log('🔐 MFA List Factors');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const prisma = getPrismaClient();
    
    // Get MFA factors from database - using raw query for flexibility
    const factors: any[] = [];
    try {
      const rawFactors = await (prisma as any).$queryRaw`
        SELECT id, factor_type, friendly_name, status, created_at, last_used_at 
        FROM mfa_factors 
        WHERE user_id = ${user.sub}::uuid AND is_active = true
      `;
      factors.push(...(rawFactors as any[]));
    } catch (e) {
      // Table may not exist yet
      console.log('MFA factors table not available');
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
      console.log('WebAuthn credentials not available');
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
    });
    
  } catch (err) {
    console.error('❌ MFA List Factors error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

// MFA Enroll Handler
export async function enrollHandler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  console.log('🔐 MFA Enroll');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const body: MFAEnrollRequest = event.body ? JSON.parse(event.body) : {};
    const { factorType, friendlyName } = body;
    
    if (!factorType) {
      return badRequest('Factor type is required');
    }
    
    const prisma = getPrismaClient();
    
    if (factorType === 'totp') {
      // Generate TOTP secret using Cognito
      const associateResponse = await cognitoClient.send(new AssociateSoftwareTokenCommand({
        AccessToken: event.headers?.authorization?.replace('Bearer ', '')
      }));
      
      // Create factor record using raw query
      const factorId = crypto.randomUUID();
      await (prisma as any).$executeRaw`
        INSERT INTO mfa_factors (id, user_id, factor_type, friendly_name, status, secret, created_at)
        VALUES (${factorId}::uuid, ${user.sub}::uuid, 'totp', ${friendlyName || 'Authenticator App'}, 'pending', ${associateResponse.SecretCode}, NOW())
      `;
      
      return success({
        factorId,
        type: 'totp',
        secret: associateResponse.SecretCode,
        qrCode: `otpauth://totp/EVO:${user.email}?secret=${associateResponse.SecretCode}&issuer=EVO`,
        status: 'pending_verification'
      });
    }
    
    return badRequest('Unsupported factor type');
    
  } catch (err) {
    console.error('❌ MFA Enroll error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

// MFA Challenge Verify Handler
export async function verifyHandler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  console.log('🔐 MFA Challenge Verify');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const body: MFAVerifyRequest = event.body ? JSON.parse(event.body) : {};
    const { factorId, code } = body;
    
    if (!factorId || !code) {
      return badRequest('Factor ID and code are required');
    }
    
    const prisma = getPrismaClient();
    
    // Get factor using raw query
    const factors = await (prisma as any).$queryRaw`
      SELECT id, factor_type, friendly_name, secret, status 
      FROM mfa_factors 
      WHERE id = ${factorId}::uuid AND user_id = ${user.sub}::uuid
    ` as any[];
    
    const factor = factors[0];
    
    if (!factor) {
      return badRequest('Factor not found');
    }
    
    // Verify with Cognito
    try {
      await cognitoClient.send(new VerifySoftwareTokenCommand({
        AccessToken: event.headers?.authorization?.replace('Bearer ', ''),
        UserCode: code,
        FriendlyDeviceName: factor.friendly_name || 'Authenticator'
      }));
      
      // Update factor status using raw query
      await (prisma as any).$executeRaw`
        UPDATE mfa_factors 
        SET status = 'verified', verified_at = NOW() 
        WHERE id = ${factorId}::uuid
      `;
      
      return success({
        verified: true,
        factorId,
        message: 'MFA factor verified successfully'
      });
      
    } catch (verifyError) {
      return badRequest('Invalid verification code');
    }
    
  } catch (err) {
    console.error('❌ MFA Verify error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

// MFA Unenroll Handler
export async function unenrollHandler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  console.log('🔐 MFA Unenroll');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const body: MFAUnenrollRequest = event.body ? JSON.parse(event.body) : {};
    const { factorId } = body;
    
    if (!factorId) {
      return badRequest('Factor ID is required');
    }
    
    const prisma = getPrismaClient();
    
    // Deactivate factor using raw query
    try {
      await (prisma as any).$executeRaw`
        UPDATE mfa_factors 
        SET is_active = false, deactivated_at = NOW() 
        WHERE id = ${factorId}::uuid
      `;
    } catch (e) {
      console.log('Factor not found in mfa_factors, may be webauthn');
    }
    
    return success({
      unenrolled: true,
      factorId,
      message: 'MFA factor removed successfully'
    });
    
  } catch (err) {
    console.error('❌ MFA Unenroll error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
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
