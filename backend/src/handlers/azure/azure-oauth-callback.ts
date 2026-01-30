/**
 * Azure OAuth Callback Handler
 * 
 * Handles the OAuth 2.0 callback from Azure AD.
 * Validates state, exchanges authorization code for tokens,
 * encrypts refresh token, and lists available subscriptions.
 * 
 * @endpoint POST /api/functions/azure-oauth-callback
 * @auth Required (Cognito)
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod } from '../../lib/middleware.js';
import {
  exchangeCodeForTokens,
  isStateValid,
  AzureTokenResponse,
} from '../../lib/oauth-utils.js';
import {
  encryptToken,
  serializeEncryptedToken,
} from '../../lib/token-encryption.js';
import { z } from 'zod';
import { parseAndValidateBody } from '../../lib/validation.js';

// OAuth configuration from environment
const AZURE_OAUTH_CLIENT_ID = process.env.AZURE_OAUTH_CLIENT_ID;
const AZURE_OAUTH_CLIENT_SECRET = process.env.AZURE_OAUTH_CLIENT_SECRET;
const AZURE_OAUTH_REDIRECT_URI = process.env.AZURE_OAUTH_REDIRECT_URI || 'https://evo.ai.udstec.io/azure/callback';

// Validation schema
const callbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State parameter is required'),
  codeVerifier: z.string().min(43, 'Code verifier must be at least 43 characters'),
});

// Azure subscription interface
interface AzureSubscription {
  subscriptionId: string;
  subscriptionName: string;
  tenantId: string;
  state: string;
}

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  // Handle CORS preflight
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }

  try {
    // Validate OAuth configuration
    if (!AZURE_OAUTH_CLIENT_ID || !AZURE_OAUTH_CLIENT_SECRET) {
      logger.error('Azure OAuth not configured');
      return error('Azure OAuth integration is not configured', 500);
    }

    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const userId = user.sub;
    const prisma = getPrismaClient();

    // Parse and validate request body
    const validation = parseAndValidateBody(callbackSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const { code, state, codeVerifier } = validation.data;

    logger.info('Processing Azure OAuth callback', {
      organizationId,
      userId,
      statePrefix: state.substring(0, 8) + '...',
    });

    // Validate state parameter
    const storedState = await prisma.oAuthState.findUnique({
      where: { state },
    });

    if (!storedState) {
      logger.warn('Invalid OAuth state: not found', { 
        organizationId, 
        statePrefix: state.substring(0, 8) + '...',
      });
      return error('Invalid or expired authorization session. Please try again.', 400);
    }

    // Verify state belongs to this user/organization
    if (storedState.organization_id !== organizationId || storedState.user_id !== userId) {
      logger.warn('OAuth state mismatch', {
        expectedOrg: storedState.organization_id,
        actualOrg: organizationId,
        expectedUser: storedState.user_id,
        actualUser: userId,
      });
      return error('Authorization session does not match current user.', 403);
    }

    // Check if state was already used
    if (storedState.used) {
      logger.warn('OAuth state already used', { 
        organizationId, 
        statePrefix: state.substring(0, 8) + '...',
      });
      return error('This authorization has already been processed.', 400);
    }

    // Check state expiration
    if (!isStateValid(storedState.created_at, 10)) {
      logger.warn('OAuth state expired', {
        organizationId,
        createdAt: storedState.created_at,
        expiresAt: storedState.expires_at,
      });
      
      // Mark as used to prevent retry
      await prisma.oAuthState.update({
        where: { id: storedState.id },
        data: { used: true },
      });
      
      return error('Authorization session expired. Please try again.', 400);
    }

    // Mark state as used immediately to prevent replay attacks
    await prisma.oAuthState.update({
      where: { id: storedState.id },
      data: { used: true },
    });

    // Exchange authorization code for tokens
    let tokenResponse: AzureTokenResponse;
    try {
      tokenResponse = await exchangeCodeForTokens(
        code,
        codeVerifier,
        {
          clientId: AZURE_OAUTH_CLIENT_ID,
          clientSecret: AZURE_OAUTH_CLIENT_SECRET,
          redirectUri: AZURE_OAUTH_REDIRECT_URI,
        },
        'common' // Multi-tenant
      );
    } catch (err: any) {
      logger.error('Token exchange failed', { 
        error: err.message,
        organizationId,
      });
      return error('Failed to complete authorization. Please try again.', 400);
    }

    // Extract user info from ID token (if available)
    let userEmail: string | undefined;
    let tenantId: string | undefined;
    
    if (tokenResponse.id_token) {
      try {
        const idTokenPayload = parseJwtPayload(tokenResponse.id_token);
        userEmail = idTokenPayload.email || idTokenPayload.preferred_username;
        tenantId = idTokenPayload.tid;
      } catch (err) {
        logger.warn('Failed to parse ID token', { error: (err as Error).message });
      }
    }

    // List available subscriptions using the access token
    let subscriptions: AzureSubscription[] = [];
    try {
      subscriptions = await listAzureSubscriptions(tokenResponse.access_token);
    } catch (err: any) {
      logger.error('Failed to list subscriptions', { 
        error: err.message,
        organizationId,
      });
      return error('Failed to list Azure subscriptions. Please ensure you have access to at least one subscription.', 400);
    }

    if (subscriptions.length === 0) {
      return error('No Azure subscriptions found. Please ensure your account has access to at least one subscription.', 400);
    }

    // Encrypt refresh token for storage
    let encryptedRefreshToken: string | null = null;
    if (tokenResponse.refresh_token) {
      try {
        const encrypted = encryptToken(tokenResponse.refresh_token);
        encryptedRefreshToken = serializeEncryptedToken(encrypted);
      } catch (err: any) {
        logger.error('Failed to encrypt refresh token', { error: err.message });
        return error('Failed to securely store credentials.', 500);
      }
    }

    // Calculate token expiration
    const tokenExpiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

    logger.info('Azure OAuth callback successful', {
      organizationId,
      userId,
      subscriptionCount: subscriptions.length,
      hasRefreshToken: !!tokenResponse.refresh_token,
      tenantId,
      userEmail: userEmail ? userEmail.substring(0, 3) + '***' : undefined,
    });

    return success({
      success: true,
      subscriptions,
      oauthData: {
        encryptedRefreshToken,
        tokenExpiresAt: tokenExpiresAt.toISOString(),
        tenantId,
        userEmail,
      },
      message: `Found ${subscriptions.length} Azure subscription(s). Select which ones to connect.`,
    });
  } catch (err: any) {
    logger.error('Error processing Azure OAuth callback', {
      error: err.message,
      stack: err.stack,
    });
    return error(err.message || 'Failed to process Azure authorization', 500);
  }
}

/**
 * Parse JWT payload without verification (for extracting claims)
 * Note: The token is already validated by Azure AD
 */
function parseJwtPayload(token: string): any {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  
  const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
  return JSON.parse(payload);
}

/**
 * List Azure subscriptions using the access token
 */
async function listAzureSubscriptions(accessToken: string): Promise<AzureSubscription[]> {
  const response = await fetch('https://management.azure.com/subscriptions?api-version=2022-12-01', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to list subscriptions: ${response.status} - ${errorBody}`);
  }

  const data = await response.json() as {
    value: Array<{
      subscriptionId: string;
      displayName: string;
      tenantId: string;
      state: string;
    }>;
  };

  return data.value.map(sub => ({
    subscriptionId: sub.subscriptionId,
    subscriptionName: sub.displayName,
    tenantId: sub.tenantId,
    state: sub.state,
  }));
}
