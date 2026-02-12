/**
 * Centralized App Domain Configuration
 * 
 * All domain-related URLs are derived from the APP_DOMAIN environment variable,
 * which is set via SAM template parameter. No more hardcoded domains.
 * 
 * Default: evo.nuevacore.com (production)
 */

const DEFAULT_DOMAIN = 'evo.nuevacore.com';

// ============================================================================
// Shared Constants
// ============================================================================

/** WebAuthn challenge expiry in milliseconds (5 minutes) */
export const WEBAUTHN_CHALLENGE_EXPIRY_MS = 5 * 60 * 1000;

/** Offset in authenticatorData where the sign counter starts (per WebAuthn spec) */
export const WEBAUTHN_COUNTER_OFFSET = 33;

/** Fallback organization ID for system-level events when no org context is available */
export const SYSTEM_ORG_ID_FALLBACK = '00000000-0000-0000-0000-000000000000';

/** Base domain (e.g., evo.nuevacore.com) */
export function getAppDomain(): string {
  return process.env.APP_DOMAIN || DEFAULT_DOMAIN;
}

/** API domain (e.g., api-evo.nuevacore.com) */
export function getApiDomain(): string {
  return process.env.API_DOMAIN || `api-${getAppDomain()}`;
}

/** Full app URL (e.g., https://evo.nuevacore.com) */
export function getAppUrl(): string {
  return `https://${getAppDomain()}`;
}

/** Full API URL (e.g., https://api-evo.nuevacore.com) */
export function getApiUrl(): string {
  return `https://${getApiDomain()}`;
}

/** Azure OAuth redirect URI */
export function getAzureOAuthRedirectUri(): string {
  return process.env.AZURE_OAUTH_REDIRECT_URI || `${getAppUrl()}/azure/callback`;
}

/** WebAuthn Relying Party ID (just the domain, no protocol) */
export function getWebAuthnRpId(): string {
  return process.env.WEBAUTHN_RP_ID || getAppDomain();
}

/** WebAuthn expected origin (e.g., https://evo.nuevacore.com) */
export function getWebAuthnOrigin(): string {
  return process.env.WEBAUTHN_ORIGIN || getAppUrl();
}

/** WebAuthn Relying Party display name */
export function getWebAuthnRpName(): string {
  return process.env.WEBAUTHN_RP_NAME || 'EVO Platform';
}

/** Allowed origins for CORS and security headers */
export function getAllowedOrigins(): string[] {
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
  }
  return [getAppUrl(), getApiUrl()];
}

/** Allowed domains for password reset URLs */
export function getAllowedResetDomains(): string[] {
  const domains = [getAppDomain(), getApiDomain(), 'localhost'];
  if (process.env.ALLOWED_RESET_DOMAIN) {
    domains.push(process.env.ALLOWED_RESET_DOMAIN);
  }
  return domains;
}
