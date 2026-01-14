/**
 * OAuth Utilities Library
 * 
 * Provides utilities for OAuth 2.0 Authorization Code flow with PKCE.
 * Used for Azure AD integration.
 */

import * as crypto from 'crypto';
import { logger } from './logging.js';

// PKCE configuration
const CODE_VERIFIER_LENGTH = 64; // 64 characters = 256 bits of entropy
const STATE_LENGTH = 32; // 32 bytes = 256 bits of entropy

/**
 * PKCE (Proof Key for Code Exchange) values
 */
export interface PKCEValues {
  codeVerifier: string;   // Random string stored client-side
  codeChallenge: string;  // SHA256 hash sent to authorization server
}

/**
 * Azure AD OAuth configuration
 */
export interface AzureOAuthConfig {
  clientId: string;
  redirectUri: string;
  tenantId?: string; // 'common' for multi-tenant, or specific tenant ID
}

/**
 * Generate a cryptographically secure random state parameter
 * 
 * The state parameter is used for CSRF protection.
 * It should be unique per authorization request and have at least 256 bits of entropy.
 * 
 * @returns 256-bit random state as URL-safe base64 string
 */
export function generateState(): string {
  const buffer = crypto.randomBytes(STATE_LENGTH);
  return buffer.toString('base64url');
}

/**
 * Generate PKCE code_verifier and code_challenge
 * 
 * PKCE (RFC 7636) prevents authorization code interception attacks.
 * - code_verifier: Random string stored client-side
 * - code_challenge: SHA256 hash of verifier sent to authorization server
 * 
 * @returns PKCE values (verifier and challenge)
 */
export function generatePKCE(): PKCEValues {
  // Generate random code_verifier (43-128 characters, URL-safe)
  const verifierBuffer = crypto.randomBytes(CODE_VERIFIER_LENGTH);
  const codeVerifier = verifierBuffer.toString('base64url');
  
  // Generate code_challenge = BASE64URL(SHA256(code_verifier))
  const hash = crypto.createHash('sha256');
  hash.update(codeVerifier);
  const codeChallenge = hash.digest('base64url');
  
  return {
    codeVerifier,
    codeChallenge,
  };
}

/**
 * Verify that a code_challenge matches a code_verifier
 * 
 * @param codeVerifier - The original code_verifier
 * @param codeChallenge - The code_challenge to verify
 * @returns true if they match
 */
export function verifyPKCE(codeVerifier: string, codeChallenge: string): boolean {
  const hash = crypto.createHash('sha256');
  hash.update(codeVerifier);
  const expectedChallenge = hash.digest('base64url');
  
  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedChallenge),
      Buffer.from(codeChallenge)
    );
  } catch {
    // Buffers have different lengths
    return false;
  }
}

/**
 * Build Azure AD authorization URL
 * 
 * @param config - OAuth configuration
 * @param state - State parameter for CSRF protection
 * @param codeChallenge - PKCE code challenge
 * @param scopes - OAuth scopes to request
 * @returns Full authorization URL
 */
export function buildAuthorizationUrl(
  config: AzureOAuthConfig,
  state: string,
  codeChallenge: string,
  scopes: string[] = ['https://management.azure.com/user_impersonation', 'offline_access']
): string {
  const tenant = config.tenantId || 'common';
  const baseUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
  
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    response_mode: 'query',
    scope: scopes.join(' '),
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'consent', // Always show consent screen for transparency
  });
  
  return `${baseUrl}?${params.toString()}`;
}

/**
 * Build Azure AD token endpoint URL
 * 
 * @param tenantId - Azure AD tenant ID (or 'common')
 * @returns Token endpoint URL
 */
export function getTokenEndpoint(tenantId: string = 'common'): string {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
}

/**
 * Exchange authorization code for tokens
 * 
 * @param code - Authorization code from callback
 * @param codeVerifier - PKCE code verifier
 * @param config - OAuth configuration
 * @param clientSecret - Client secret (for confidential clients)
 * @returns Token response from Azure AD
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  config: AzureOAuthConfig & { clientSecret: string },
  tenantId: string = 'common'
): Promise<AzureTokenResponse> {
  const tokenEndpoint = getTokenEndpoint(tenantId);
  
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: code,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });
  
  logger.info('Exchanging authorization code for tokens', {
    tokenEndpoint,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
  });
  
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  
  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('Token exchange failed', {
      status: response.status,
      error: errorBody,
    });
    throw new Error(`Token exchange failed: ${response.status} - ${errorBody}`);
  }
  
  const tokenResponse = await response.json() as AzureTokenResponse;
  
  logger.info('Token exchange successful', {
    hasAccessToken: !!tokenResponse.access_token,
    hasRefreshToken: !!tokenResponse.refresh_token,
    expiresIn: tokenResponse.expires_in,
  });
  
  return tokenResponse;
}

/**
 * Refresh access token using refresh token
 * 
 * @param refreshToken - Refresh token
 * @param config - OAuth configuration
 * @param tenantId - Azure AD tenant ID
 * @returns New token response
 */
export async function refreshAccessToken(
  refreshToken: string,
  config: AzureOAuthConfig & { clientSecret: string },
  tenantId: string = 'common'
): Promise<AzureTokenResponse> {
  const tokenEndpoint = getTokenEndpoint(tenantId);
  
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: 'https://management.azure.com/user_impersonation offline_access',
  });
  
  logger.info('Refreshing access token', {
    tokenEndpoint,
    clientId: config.clientId,
  });
  
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  
  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('Token refresh failed', {
      status: response.status,
      error: errorBody,
    });
    throw new Error(`Token refresh failed: ${response.status} - ${errorBody}`);
  }
  
  const tokenResponse = await response.json() as AzureTokenResponse;
  
  logger.info('Token refresh successful', {
    hasAccessToken: !!tokenResponse.access_token,
    hasNewRefreshToken: !!tokenResponse.refresh_token,
    expiresIn: tokenResponse.expires_in,
  });
  
  return tokenResponse;
}

/**
 * Azure AD token response
 */
export interface AzureTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string; // May not be returned on every refresh
  id_token?: string;
}

/**
 * Parse and validate state expiration
 * 
 * @param createdAt - When the state was created
 * @param maxAgeMinutes - Maximum age in minutes (default: 10)
 * @returns true if state is still valid
 */
export function isStateValid(createdAt: Date, maxAgeMinutes: number = 10): boolean {
  const now = new Date();
  const ageMs = now.getTime() - createdAt.getTime();
  const maxAgeMs = maxAgeMinutes * 60 * 1000;
  
  return ageMs <= maxAgeMs;
}

/**
 * Calculate state expiration time
 * 
 * @param maxAgeMinutes - Maximum age in minutes (default: 10)
 * @returns Expiration date
 */
export function calculateStateExpiration(maxAgeMinutes: number = 10): Date {
  const now = new Date();
  return new Date(now.getTime() + maxAgeMinutes * 60 * 1000);
}

/**
 * Validate redirect URI against whitelist
 * 
 * @param redirectUri - URI to validate
 * @param allowedUris - List of allowed URIs
 * @returns true if URI is in whitelist
 */
export function isRedirectUriAllowed(redirectUri: string, allowedUris: string[]): boolean {
  return allowedUris.includes(redirectUri);
}

/**
 * Get allowed redirect URIs from environment
 * 
 * @returns Array of allowed redirect URIs
 */
export function getAllowedRedirectUris(): string[] {
  const uris = process.env.AZURE_OAUTH_REDIRECT_URIS || process.env.AZURE_OAUTH_REDIRECT_URI || '';
  return uris.split(',').map(uri => uri.trim()).filter(uri => uri.length > 0);
}
