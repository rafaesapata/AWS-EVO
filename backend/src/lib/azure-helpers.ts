/**
 * Azure Helper Functions
 * 
 * Shared utilities for Azure handlers
 */

import {
  deserializeEncryptedToken,
  decryptToken,
  encryptToken,
  serializeEncryptedToken,
} from './token-encryption.js';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { logger } from './logger.js';

/** Default token expiry in seconds when Azure doesn't return expires_in */
const DEFAULT_TOKEN_EXPIRY_SECONDS = 3600;

// --- SSM-backed Azure OAuth credentials with in-memory cache ---

const SSM_REGION = process.env.AWS_REGION || 'us-east-1';
const SSM_ENV = process.env.ENVIRONMENT || 'production';
const SSM_PREFIX = `/evo-uds-v3/${SSM_ENV}`;

/** Cache TTL: 1 minute — balances freshness vs. SSM API calls */
const SSM_CACHE_TTL_MS = 60 * 1000;

/** Reuse SSM client across invocations (Lambda container reuse) */
let _ssmClient: SSMClient | null = null;

interface AzureOAuthCreds {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tenantId: string;
}

let _cachedCreds: AzureOAuthCreds | null = null;
let _cachedAt = 0;

function getSsmClient(): SSMClient {
  if (!_ssmClient) {
    _ssmClient = new SSMClient({ region: SSM_REGION });
  }
  return _ssmClient;
}

/**
 * Fetches Azure OAuth credentials from SSM Parameter Store with in-memory cache.
 * Falls back to process.env if SSM is unavailable (local dev).
 * Retries SSM up to 3 times with backoff on transient failures.
 * Does NOT cache empty env var fallbacks to allow SSM retry on next call.
 */
export async function getAzureOAuthCredentials(): Promise<AzureOAuthCreds> {
  // Check if cache is stale due to admin credential update
  const lastAdminUpdate = process.env.AZURE_CREDS_UPDATED_AT;
  const cacheStale = lastAdminUpdate && _cachedAt > 0 &&
    new Date(lastAdminUpdate).getTime() > _cachedAt;

  // Return cache if still valid and not stale
  if (_cachedCreds && !cacheStale && Date.now() - _cachedAt < SSM_CACHE_TTL_MS) {
    return _cachedCreds;
  }

  // Retry SSM up to 3 times with backoff
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ssm = getSsmClient();
      const [cidRes, secRes, uriRes, tidRes] = await Promise.all([
        ssm.send(new GetParameterCommand({ Name: `${SSM_PREFIX}/azure-oauth-client-id` })),
        ssm.send(new GetParameterCommand({ Name: `${SSM_PREFIX}/azure-oauth-client-secret`, WithDecryption: true })),
        ssm.send(new GetParameterCommand({ Name: `${SSM_PREFIX}/azure-oauth-redirect-uri` })),
        ssm.send(new GetParameterCommand({ Name: `${SSM_PREFIX}/azure-oauth-tenant-id` })).catch((err) => {
          // Tenant ID may not exist in SSM for multi-tenant apps — that's OK
          logger.info('azure-oauth-tenant-id not found in SSM (OK for multi-tenant)', { error: err.message });
          return null;
        }),
      ]);

      const clientId = cidRes.Parameter?.Value;
      const clientSecret = secRes.Parameter?.Value;
      const redirectUri = uriRes.Parameter?.Value;
      const tenantId = tidRes?.Parameter?.Value || 'common';

      if (clientId && clientSecret && redirectUri) {
        _cachedCreds = { clientId, clientSecret, redirectUri, tenantId };
        _cachedAt = Date.now();
        logger.info('Azure OAuth creds loaded from SSM', {
          clientId,
          tenantId,
          secretLength: clientSecret.length,
          secretPrefix: clientSecret.substring(0, 4) + '***',
        });
        return _cachedCreds;
      }

      // Data incomplete — no point retrying
      logger.warn('SSM Azure OAuth params incomplete, falling back to env vars', { attempt });
      break;
    } catch (err: any) {
      if (attempt < 2) {
        const delay = (attempt + 1) * 500; // 500ms, 1000ms
        logger.warn(`SSM fetch failed, retrying in ${delay}ms`, { attempt, error: err.message });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      logger.error('SSM fetch failed after 3 attempts, falling back to env vars', { error: err.message });
    }
  }

  // Fallback to env vars (local dev or SSM not configured)
  const fallback: AzureOAuthCreds = {
    clientId: process.env.AZURE_OAUTH_CLIENT_ID || '',
    clientSecret: process.env.AZURE_OAUTH_CLIENT_SECRET || '',
    redirectUri: process.env.AZURE_OAUTH_REDIRECT_URI || '',
    tenantId: process.env.AZURE_OAUTH_TENANT_ID || 'common',
  };

  // Only cache if we actually have valid credentials — otherwise retry SSM next call
  if (fallback.clientId && fallback.clientSecret) {
    _cachedCreds = fallback;
    _cachedAt = Date.now();
    logger.info('Azure OAuth creds loaded from env vars (fallback)', {
      clientId: fallback.clientId,
      tenantId: fallback.tenantId,
      secretLength: fallback.clientSecret.length,
      secretPrefix: fallback.clientSecret.substring(0, 4) + '***',
    });
  } else {
    logger.warn('Azure OAuth env vars are empty — will retry SSM on next call');
  }

  return fallback;
}

/** Invalidates the cached SSM credentials (useful after admin updates) */
export function invalidateAzureOAuthCredsCache(): void {
  _cachedCreds = null;
  _cachedAt = 0;
}
/**
 * Resolve o tenant ID para uma credencial Azure, com fallback seguro.
 * Ordem de prioridade: oauth_tenant_id > tenant_id > 'common' (multi-tenant)
 * NUNCA retorna string vazia.
 */
export function resolveAzureTenantId(
  credential: Pick<AzureCredentialRecord, 'oauth_tenant_id' | 'tenant_id'>
): string {
  const tenantId = credential.oauth_tenant_id || credential.tenant_id;
  if (!tenantId || tenantId.trim() === '') {
    logger.warn('resolveAzureTenantId: no tenant ID found, falling back to "common"', {
      oauthTenantId: credential.oauth_tenant_id,
      tenantId: credential.tenant_id,
    });
    return 'common';
  }
  return tenantId;
}

/** One hour in milliseconds — used for OAuth token credential expiry estimates */
export const ONE_HOUR_MS = DEFAULT_TOKEN_EXPIRY_SECONDS * 1000;

/** Azure AD OAuth v2.0 token endpoint template */
export function getAzureTokenUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
}

/** Checks if an Azure AD error indicates an invalid or expired OAuth client secret */
export function isInvalidClientSecretError(errorText: string): boolean {
  return errorText.includes('invalid_client') || errorText.includes('AADSTS7000215');
}

/** User-facing message for invalid/expired OAuth client secret */
export const INVALID_CLIENT_SECRET_MESSAGE = 
  'Azure OAuth client secret is invalid or expired. Generate a new secret in Azure Portal (App registrations > Certificates & secrets) and update via Admin > EVO App Credentials.';

/**
 * Credential type from Prisma
 */
export interface AzureCredentialRecord {
  id: string;
  organization_id: string;
  subscription_id: string;
  subscription_name: string | null;
  auth_type: string;
  tenant_id: string | null;
  client_id: string | null;
  client_secret: string | null;
  encrypted_refresh_token: string | null;
  token_expires_at: Date | null;
  oauth_tenant_id: string | null;
  oauth_user_email: string | null;
  last_refresh_at: Date | null;
  refresh_error: string | null;
  // Certificate fields
  certificate_pem: string | null;
  certificate_thumbprint: string | null;
  certificate_expires_at: Date | null;
  // Common fields
  regions: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Service Principal credentials for Azure SDK
 */
export interface ServicePrincipalCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  subscriptionId: string;
  subscriptionName?: string;
}

/**
 * Certificate credentials for Azure SDK
 */
export interface CertificateCredentials {
  tenantId: string;
  clientId: string;
  certificatePem: string;
  subscriptionId: string;
  subscriptionName?: string;
}

/**
 * Validation result for Service Principal credentials
 */
export type ServicePrincipalValidationResult = 
  | { valid: true; credentials: ServicePrincipalCredentials }
  | { valid: false; error: string };

/**
 * Validates that an Azure credential has valid Service Principal credentials
 * 
 * @param credential - The Azure credential record from the database
 * @returns Validation result with credentials if valid, or error message if not
 */
export async function validateServicePrincipalCredentials(
  credential: Pick<AzureCredentialRecord, 'auth_type' | 'tenant_id' | 'client_id' | 'client_secret' | 'subscription_id' | 'subscription_name'>
): Promise<ServicePrincipalValidationResult> {
  // Check if this is an OAuth credential
  if (credential.auth_type === 'oauth') {
    return { 
      valid: false, 
      error: 'OAuth credentials not yet supported for this operation. Please use Service Principal credentials.' 
    };
  }
  
  // Validate required Service Principal fields
  if (!credential.tenant_id) {
    return { valid: false, error: 'Missing tenant_id in Service Principal credentials.' };
  }
  
  if (!credential.client_id) {
    return { valid: false, error: 'Missing client_id in Service Principal credentials.' };
  }

  const clientSecret = await resolveClientSecret(credential);
  if (!clientSecret) {
    return { valid: false, error: 'Missing client_secret in Service Principal credentials.' };
  }
  
  return {
    valid: true,
    credentials: {
      tenantId: credential.tenant_id,
      clientId: credential.client_id,
      clientSecret,
      subscriptionId: credential.subscription_id,
      subscriptionName: credential.subscription_name || undefined,
    },
  };
}

/**
 * Resolves the client secret for an Azure credential.
 * Prefers the centralized SSM secret when the credential uses the EVO app registration.
 * Falls back to decrypting the client_secret stored in the database.
 */
export async function resolveClientSecret(credential: Pick<AzureCredentialRecord, 'client_id' | 'client_secret'>): Promise<string | null> {
  const creds = await getAzureOAuthCredentials();

  if (creds.clientId && creds.clientSecret && credential.client_id === creds.clientId) {
    logger.info('resolveClientSecret: using SSM/env credential', {
      clientId: credential.client_id,
      secretLength: creds.clientSecret.length,
      secretPrefix: creds.clientSecret.substring(0, 4) + '***',
    });
    return creds.clientSecret;
  }

  if (!credential.client_secret) {
    logger.info('resolveClientSecret: no client_secret in DB and no SSM match', {
      clientId: credential.client_id,
    });
    return null;
  }

  let secret = credential.client_secret;
  try {
    const parsed = JSON.parse(secret);
    if (parsed.ciphertext && parsed.iv && parsed.tag && parsed.keyId) {
      secret = decryptToken(parsed);
      logger.info('resolveClientSecret: decrypted from DB', {
        clientId: credential.client_id,
        secretLength: secret.length,
        secretPrefix: secret.substring(0, 4) + '***',
      });
    }
  } catch {
    // Not JSON — use as-is (legacy plaintext)
    logger.info('resolveClientSecret: using plaintext from DB', {
      clientId: credential.client_id,
      secretLength: secret.length,
      secretPrefix: secret.substring(0, 4) + '***',
    });
  }
  return secret;
}

/**
 * Checks if an Azure credential is an OAuth credential
 */
export function isOAuthCredential(credential: Pick<AzureCredentialRecord, 'auth_type'>): boolean {
  return credential.auth_type === 'oauth';
}

/**
 * Checks if an Azure credential is a Service Principal credential
 */
export function isServicePrincipalCredential(credential: Pick<AzureCredentialRecord, 'auth_type'>): boolean {
  return credential.auth_type === 'service_principal' || !credential.auth_type;
}

/**
 * Checks if an Azure credential is a Certificate credential
 */
export function isCertificateCredential(credential: Pick<AzureCredentialRecord, 'auth_type'>): boolean {
  return credential.auth_type === 'certificate';
}

/**
 * Resolves the certificate PEM from a credential record.
 * Decrypts if stored encrypted, returns as-is if plaintext.
 */
export async function resolveCertificatePem(
  credential: Pick<AzureCredentialRecord, 'certificate_pem'>
): Promise<string | null> {
  if (!credential.certificate_pem) return null;

  let pem = credential.certificate_pem;
  try {
    const parsed = JSON.parse(pem);
    if (parsed.ciphertext && parsed.iv && parsed.tag && parsed.keyId) {
      pem = decryptToken(parsed);
      logger.info('resolveCertificatePem: decrypted from DB');
    }
  } catch {
    // Not JSON — use as-is (legacy plaintext)
    logger.info('resolveCertificatePem: using plaintext from DB');
  }
  return pem;
}

/**
 * Validates that an Azure credential has valid Certificate credentials
 */
export async function validateCertificateCredentials(
  credential: Pick<AzureCredentialRecord, 'auth_type' | 'tenant_id' | 'client_id' | 'certificate_pem' | 'subscription_id' | 'subscription_name'>
): Promise<{ valid: true; credentials: CertificateCredentials } | { valid: false; error: string }> {
  if (credential.auth_type !== 'certificate') {
    return { valid: false, error: 'Credential is not certificate type' };
  }

  const pem = await resolveCertificatePem(credential);
  if (!credential.tenant_id || !credential.client_id || !pem) {
    return { valid: false, error: 'Certificate credentials incomplete. Missing tenant_id, client_id, or certificate_pem.' };
  }

  return {
    valid: true,
    credentials: {
      tenantId: credential.tenant_id,
      clientId: credential.client_id,
      certificatePem: pem,
      subscriptionId: credential.subscription_id,
      subscriptionName: credential.subscription_name || undefined,
    },
  };
}


/**
 * Decrypts an encrypted refresh token stored in the database
 */
function decryptRefreshToken(encryptedToken: string): string {
  const tokenData = deserializeEncryptedToken(encryptedToken);
  return decryptToken(tokenData);
}

/**
 * Refreshes an OAuth access token using the refresh token
 */
async function refreshOAuthToken(
  tenantId: string,
  refreshToken: string
): Promise<{ accessToken: string; expiresIn: number; newRefreshToken?: string }> {
  const creds = await getAzureOAuthCredentials();
  const clientId = creds.clientId;
  const clientSecret = creds.clientSecret;
  
  if (!clientId || !clientSecret) {
    throw new Error('Azure OAuth client credentials not configured (check SSM parameters)');
  }
  
  const tokenUrl = getAzureTokenUrl(tenantId);
  
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: 'https://management.azure.com/user_impersonation offline_access',
  });
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    if (isInvalidClientSecretError(errorText)) {
      throw new Error(`invalid_client: ${INVALID_CLIENT_SECRET_MESSAGE}`);
    }
    throw new Error(`Failed to refresh OAuth token: ${response.status} ${errorText}`);
  }
  
  const data = await response.json() as { access_token: string; expires_in?: number; refresh_token?: string };
  
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || DEFAULT_TOKEN_EXPIRY_SECONDS,
    newRefreshToken: data.refresh_token,
  };
}

/**
 * Gets an Azure credential with a valid access token
 * Handles both Service Principal and OAuth credentials
 */
export async function getAzureCredentialWithToken(
  prisma: any,
  credentialId: string,
  organizationId: string
): Promise<{
  success: true;
  credential: AzureCredentialRecord;
  accessToken: string;
} | {
  success: false;
  error: string;
}> {
  // Fetch credential from database
  const credential = await prisma.azureCredential.findFirst({
    where: {
      id: credentialId,
      organization_id: organizationId,
      is_active: true,
    },
  });
  
  if (!credential) {
    return { success: false, error: 'Azure credential not found or inactive' };
  }
  
  // Handle OAuth credentials
  if (credential.auth_type === 'oauth') {
    if (!credential.encrypted_refresh_token) {
      return { success: false, error: 'OAuth credential missing refresh token' };
    }
    
    const tenantId = resolveAzureTenantId(credential);
    if (!tenantId) {
      return { success: false, error: 'OAuth credential missing tenant ID' };
    }
    
    try {
      // Decrypt refresh token
      const refreshToken = decryptRefreshToken(credential.encrypted_refresh_token);
      
      // Refresh access token
      const tokenResult = await refreshOAuthToken(tenantId, refreshToken);
      
      // Build update data
      const updateData: any = {
        last_refresh_at: new Date(),
        token_expires_at: new Date(Date.now() + tokenResult.expiresIn * 1000),
        refresh_error: null,
      };

      // If Azure returned a rotated refresh token, re-encrypt and store it
      if (tokenResult.newRefreshToken) {
        const encrypted = encryptToken(tokenResult.newRefreshToken);
        updateData.encrypted_refresh_token = serializeEncryptedToken(encrypted);
      }

      await prisma.azureCredential.update({
        where: { id: credentialId },
        data: updateData,
      });
      
      return {
        success: true,
        credential,
        accessToken: tokenResult.accessToken,
      };
    } catch (err: any) {
      // Update refresh error in database
      await prisma.azureCredential.update({
        where: { id: credentialId },
        data: {
          refresh_error: err.message,
        },
      });
      
      return { success: false, error: `Failed to refresh OAuth token: ${err.message}` };
    }
  }
  
  // Handle Certificate credentials
  if (credential.auth_type === 'certificate') {
    const certValidation = await validateCertificateCredentials(credential);
    if (!certValidation.valid) {
      return { success: false, error: certValidation.error };
    }
    
    try {
      const { ClientCertificateCredential } = await import('@azure/identity');
      const certCredential = new ClientCertificateCredential(
        certValidation.credentials.tenantId,
        certValidation.credentials.clientId,
        { certificate: certValidation.credentials.certificatePem }
      );
      
      const tokenResponse = await certCredential.getToken('https://management.azure.com/.default');
      
      return {
        success: true,
        credential,
        accessToken: tokenResponse.token,
      };
    } catch (err: any) {
      return { success: false, error: `Failed to get Certificate token: ${err.message}` };
    }
  }
  
  // Handle Service Principal credentials
  const spValidation = await validateServicePrincipalCredentials(credential);
  if (!spValidation.valid) {
    return { success: false, error: spValidation.error };
  }
  
  try {
    // Get access token using client credentials flow
    const tokenUrl = getAzureTokenUrl(spValidation.credentials.tenantId);
    
    const params = new URLSearchParams({
      client_id: spValidation.credentials.clientId,
      client_secret: spValidation.credentials.clientSecret,
      grant_type: 'client_credentials',
      scope: 'https://management.azure.com/.default',
    });
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Failed to get access token: ${response.status} ${errorText}` };
    }
    
    const data = await response.json() as { access_token: string };
    
    return {
      success: true,
      credential,
      accessToken: data.access_token,
    };
  } catch (err: any) {
    return { success: false, error: `Failed to get Service Principal token: ${err.message}` };
  }
}


/**
 * Creates a lightweight TokenCredential-compatible object from an access token.
 * Use this instead of manually constructing { getToken: ... } in every handler.
 */
export function createStaticTokenCredential(accessToken: string): { getToken: () => Promise<{ token: string; expiresOnTimestamp: number }> } {
  return {
    getToken: async () => ({
      token: accessToken,
      expiresOnTimestamp: Date.now() + ONE_HOUR_MS,
    }),
  };
}
