/**
 * Azure OAuth Refresh Handler
 * 
 * Refreshes the access token for an OAuth credential.
 * Decrypts stored refresh token, calls Azure AD, and updates stored tokens.
 * 
 * @endpoint POST /api/functions/azure-oauth-refresh
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
import { logger } from '../../lib/logger.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { refreshAccessToken } from '../../lib/oauth-utils.js';
import {
  decryptToken,
  encryptToken,
  deserializeEncryptedToken,
  serializeEncryptedToken,
} from '../../lib/token-encryption.js';
import { z } from 'zod';
import { parseAndValidateBody } from '../../lib/validation.js';

// OAuth configuration from environment
const AZURE_OAUTH_CLIENT_ID = process.env.AZURE_OAUTH_CLIENT_ID;
const AZURE_OAUTH_CLIENT_SECRET = process.env.AZURE_OAUTH_CLIENT_SECRET;
const AZURE_OAUTH_REDIRECT_URI = process.env.AZURE_OAUTH_REDIRECT_URI || 'https://evo.nuevacore.com/azure/callback';

// Validation schema
const refreshSchema = z.object({
  credentialId: z.string().uuid('Invalid credential ID'),
});

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
      return error('Azure OAuth integration is not configured. Contact administrator.', 400);
    }

    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    // Parse and validate request body
    const validation = parseAndValidateBody(refreshSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const { credentialId } = validation.data;

    logger.info('Refreshing Azure OAuth token', {
      organizationId,
      credentialId,
    });

    // Fetch credential
    const credential = await prisma.azureCredential.findFirst({
      where: {
        id: credentialId,
        organization_id: organizationId,
      },
    });

    if (!credential) {
      return error('Azure credential not found', 404);
    }

    // Verify this is an OAuth credential
    if (credential.auth_type !== 'oauth') {
      return error('This credential does not use OAuth authentication', 400);
    }

    // Check if credential has a refresh error (needs re-authentication)
    if (credential.refresh_error) {
      return error(`Credential is invalid: ${credential.refresh_error}. Please reconnect your Azure account.`, 400);
    }

    // Check if we have a refresh token
    if (!credential.encrypted_refresh_token) {
      return error('No refresh token available. Please reconnect your Azure account.', 400);
    }

    // Decrypt refresh token
    let refreshToken: string;
    try {
      const encryptedToken = deserializeEncryptedToken(credential.encrypted_refresh_token);
      refreshToken = decryptToken(encryptedToken);
    } catch (err: any) {
      logger.error('Failed to decrypt refresh token', {
        credentialId,
        error: err.message,
      });
      
      // Mark credential as invalid
      await prisma.azureCredential.update({
        where: { id: credentialId },
        data: {
          refresh_error: 'Failed to decrypt stored token. Please reconnect.',
          is_active: false,
        },
      });
      
      return error('Failed to decrypt stored credentials. Please reconnect your Azure account.', 400);
    }

    // Refresh the token
    try {
      const tokenResponse = await refreshAccessToken(
        refreshToken,
        {
          clientId: AZURE_OAUTH_CLIENT_ID,
          clientSecret: AZURE_OAUTH_CLIENT_SECRET,
          redirectUri: AZURE_OAUTH_REDIRECT_URI,
        },
        credential.oauth_tenant_id || 'common'
      );

      // Calculate new expiration
      const tokenExpiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

      // Update credential with new token info
      const updateData: any = {
        token_expires_at: tokenExpiresAt,
        last_refresh_at: new Date(),
        refresh_error: null,
        is_active: true,
      };

      // If we got a new refresh token, encrypt and store it
      if (tokenResponse.refresh_token) {
        const encrypted = encryptToken(tokenResponse.refresh_token);
        updateData.encrypted_refresh_token = serializeEncryptedToken(encrypted);
      }

      await prisma.azureCredential.update({
        where: { id: credentialId },
        data: updateData,
      });

      logger.info('Azure OAuth token refreshed successfully', {
        organizationId,
        credentialId,
        expiresAt: tokenExpiresAt.toISOString(),
        hasNewRefreshToken: !!tokenResponse.refresh_token,
      });

      return success({
        success: true,
        expiresAt: tokenExpiresAt.toISOString(),
        message: 'Token refreshed successfully',
      });
    } catch (err: any) {
      logger.error('Token refresh failed', {
        credentialId,
        error: err.message,
      });

      // Determine if this is a permanent failure
      const isPermanentFailure = 
        err.message.includes('invalid_grant') ||
        err.message.includes('AADSTS700082') || // Refresh token expired
        err.message.includes('AADSTS50076') || // MFA required
        err.message.includes('AADSTS50078') || // Conditional access
        err.message.includes('AADSTS50079'); // User action required

      if (isPermanentFailure) {
        // Mark credential as invalid
        await prisma.azureCredential.update({
          where: { id: credentialId },
          data: {
            refresh_error: 'Authorization expired or revoked. Please reconnect.',
            is_active: false,
          },
        });

        return error('Your Azure authorization has expired or been revoked. Please reconnect your Azure account.', 401);
      }

      // Temporary failure - don't mark as invalid
      return error('Failed to refresh token. Please try again later.', 500);
    }
  } catch (err: any) {
    logger.error('Error refreshing Azure OAuth token', {
      error: err.message,
      stack: err.stack,
    });
    return error('Failed to refresh Azure token', 500);
  }
}

/**
 * Get a valid access token for an OAuth credential
 * This is a helper function that can be used by other handlers
 * 
 * @param credentialId - The credential ID
 * @param organizationId - The organization ID
 * @returns Access token or null if refresh failed
 */
export async function getValidAccessToken(
  credentialId: string,
  organizationId: string
): Promise<string | null> {
  const prisma = getPrismaClient();

  const credential = await prisma.azureCredential.findFirst({
    where: {
      id: credentialId,
      organization_id: organizationId,
      auth_type: 'oauth',
    },
  });

  if (!credential || !credential.encrypted_refresh_token || credential.refresh_error) {
    return null;
  }

  // Access tokens are never persisted for security — always refresh to get a new one

  // Decrypt refresh token
  let refreshToken: string;
  try {
    const encryptedToken = deserializeEncryptedToken(credential.encrypted_refresh_token);
    refreshToken = decryptToken(encryptedToken);
  } catch {
    return null;
  }

  // Refresh the token
  try {
    const tokenResponse = await refreshAccessToken(
      refreshToken,
      {
        clientId: AZURE_OAUTH_CLIENT_ID!,
        clientSecret: AZURE_OAUTH_CLIENT_SECRET!,
        redirectUri: AZURE_OAUTH_REDIRECT_URI,
      },
      credential.oauth_tenant_id || 'common'
    );

    // Update credential with new token info
    const tokenExpiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);
    const updateData: any = {
      token_expires_at: tokenExpiresAt,
      last_refresh_at: new Date(),
      refresh_error: null,
    };

    if (tokenResponse.refresh_token) {
      const encrypted = encryptToken(tokenResponse.refresh_token);
      updateData.encrypted_refresh_token = serializeEncryptedToken(encrypted);
    }

    await prisma.azureCredential.update({
      where: { id: credentialId },
      data: updateData,
    });

    return tokenResponse.access_token;
  } catch (err: any) {
    logger.error('Failed to get valid access token', {
      credentialId,
      error: err.message,
    });

    // Mark as invalid if permanent failure
    if (err.message.includes('invalid_grant') || err.message.includes('AADSTS')) {
      await prisma.azureCredential.update({
        where: { id: credentialId },
        data: {
          refresh_error: 'Authorization expired or revoked',
          is_active: false,
        },
      });
    }

    return null;
  }
}
