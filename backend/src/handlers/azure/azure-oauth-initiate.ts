/**
 * Azure OAuth Initiate Handler
 * 
 * Initiates the OAuth 2.0 Authorization Code flow with PKCE for Azure AD.
 * Generates state and PKCE values, stores them in the database, and returns
 * the authorization URL for the frontend to redirect to.
 * 
 * @endpoint POST /api/functions/azure-oauth-initiate
 * @auth Required (Cognito)
 */

// Ensure crypto is available globally for Azure SDK
import * as crypto from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = crypto.webcrypto || crypto;
}

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod } from '../../lib/middleware.js';
import {
  generateState,
  generatePKCE,
  buildAuthorizationUrl,
  calculateStateExpiration,
  getAllowedRedirectUris,
} from '../../lib/oauth-utils.js';

// OAuth configuration from environment
const AZURE_OAUTH_CLIENT_ID = process.env.AZURE_OAUTH_CLIENT_ID;
const AZURE_OAUTH_REDIRECT_URI = process.env.AZURE_OAUTH_REDIRECT_URI || 'https://evo.nuevacore.com/azure/callback';

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_REQUESTS_PER_USER = 5;   // 5 per user per hour
const RATE_LIMIT_MAX_REQUESTS_PER_ORG = 10;   // 10 per organization per hour

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
    if (!AZURE_OAUTH_CLIENT_ID) {
      logger.error('Azure OAuth not configured: missing AZURE_OAUTH_CLIENT_ID');
      return error('Azure OAuth integration is not configured', 500);
    }

    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const userId = user.sub;
    const prisma = getPrismaClient();

    logger.info('Initiating Azure OAuth flow', { 
      organizationId, 
      userId,
    });

    // Rate limiting check - per user
    const recentUserStates = await prisma.oAuthState.count({
      where: {
        user_id: userId,
        created_at: {
          gte: new Date(Date.now() - RATE_LIMIT_WINDOW_MS),
        },
      },
    });

    if (recentUserStates >= RATE_LIMIT_MAX_REQUESTS_PER_USER) {
      logger.warn('Rate limit exceeded for OAuth initiate (per user)', { 
        organizationId, 
        userId,
        recentStates: recentUserStates,
        limit: RATE_LIMIT_MAX_REQUESTS_PER_USER,
      });
      return error('Too many OAuth requests. Please wait an hour and try again.', 429);
    }

    // Rate limiting check - per organization
    const recentOrgStates = await prisma.oAuthState.count({
      where: {
        organization_id: organizationId,
        created_at: {
          gte: new Date(Date.now() - RATE_LIMIT_WINDOW_MS),
        },
      },
    });

    if (recentOrgStates >= RATE_LIMIT_MAX_REQUESTS_PER_ORG) {
      logger.warn('Rate limit exceeded for OAuth initiate (per organization)', { 
        organizationId, 
        userId,
        recentStates: recentOrgStates,
        limit: RATE_LIMIT_MAX_REQUESTS_PER_ORG,
      });
      return error('Your organization has exceeded the OAuth request limit. Please wait an hour and try again.', 429);
    }

    // Generate state and PKCE values
    const state = generateState();
    const { codeVerifier, codeChallenge } = generatePKCE();
    const expiresAt = calculateStateExpiration(10); // 10 minutes

    // Store state in database for validation during callback
    await prisma.oAuthState.create({
      data: {
        organization_id: organizationId,
        user_id: userId,
        state,
        code_verifier: codeVerifier,
        redirect_uri: AZURE_OAUTH_REDIRECT_URI,
        expires_at: expiresAt,
        used: false,
      },
    });

    logger.info('OAuth state created', {
      organizationId,
      userId,
      statePrefix: state.substring(0, 8) + '...',
      expiresAt: expiresAt.toISOString(),
    });

    // Build authorization URL
    const authorizationUrl = buildAuthorizationUrl(
      {
        clientId: AZURE_OAUTH_CLIENT_ID,
        redirectUri: AZURE_OAUTH_REDIRECT_URI,
        tenantId: 'common', // Multi-tenant: allow any Azure AD tenant
      },
      state,
      codeChallenge,
      [
        'https://management.azure.com/user_impersonation',
        'offline_access', // Required for refresh tokens
      ]
    );

    logger.info('Authorization URL generated', {
      organizationId,
      userId,
      redirectUri: AZURE_OAUTH_REDIRECT_URI,
    });

    // Clean up expired states (async, don't wait)
    cleanupExpiredStates(prisma).catch(err => {
      logger.warn('Failed to cleanup expired OAuth states', { error: err.message });
    });

    return success({
      authorizationUrl,
      state, // Frontend needs this to verify callback
      codeVerifier, // Frontend stores this and sends back during callback
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err: any) {
    logger.error('Error initiating Azure OAuth', { 
      error: err.message,
      stack: err.stack,
    });
    return error(err.message || 'Failed to initiate Azure OAuth', 500);
  }
}

/**
 * Clean up expired OAuth states
 * This runs asynchronously to avoid blocking the response
 */
async function cleanupExpiredStates(prisma: any): Promise<void> {
  const deleted = await prisma.oAuthState.deleteMany({
    where: {
      OR: [
        { expires_at: { lt: new Date() } },
        { used: true, created_at: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, // Used states older than 24h
      ],
    },
  });

  if (deleted.count > 0) {
    logger.info('Cleaned up expired OAuth states', { count: deleted.count });
  }
}
