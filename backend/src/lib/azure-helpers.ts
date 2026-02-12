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

/** Default token expiry in seconds when Azure doesn't return expires_in */
const DEFAULT_TOKEN_EXPIRY_SECONDS = 3600;

/** One hour in milliseconds — used for OAuth token credential expiry estimates */
export const ONE_HOUR_MS = DEFAULT_TOKEN_EXPIRY_SECONDS * 1000;

/** Azure AD OAuth v2.0 token endpoint template */
function getAzureTokenUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
}

/** Checks if an Azure AD error indicates an invalid or expired OAuth client secret */
export function isInvalidClientSecretError(errorText: string): boolean {
  return errorText.includes('invalid_client') || errorText.includes('AADSTS7000215');
}

/** User-facing message for invalid/expired OAuth client secret */
export const INVALID_CLIENT_SECRET_MESSAGE = 
  'Azure OAuth client secret is invalid or expired. Generate a new secret in Azure Portal (App registrations > Certificates & secrets) and update AZURE_OAUTH_CLIENT_SECRET.';

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
export function validateServicePrincipalCredentials(
  credential: Pick<AzureCredentialRecord, 'auth_type' | 'tenant_id' | 'client_id' | 'client_secret' | 'subscription_id' | 'subscription_name'>
): ServicePrincipalValidationResult {
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
  
  if (!credential.client_secret && !(process.env.AZURE_OAUTH_CLIENT_ID && process.env.AZURE_OAUTH_CLIENT_SECRET && credential.client_id === process.env.AZURE_OAUTH_CLIENT_ID)) {
    return { valid: false, error: 'Missing client_secret in Service Principal credentials.' };
  }

  const clientSecret = resolveClientSecret(credential);
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
 * Prefers the centralized SSM secret (env var) when the credential uses the EVO app registration.
 * Falls back to decrypting the client_secret stored in the database.
 */
export function resolveClientSecret(credential: Pick<AzureCredentialRecord, 'client_id' | 'client_secret'>): string | null {
  const evoClientId = process.env.AZURE_OAUTH_CLIENT_ID;
  const evoClientSecret = process.env.AZURE_OAUTH_CLIENT_SECRET;

  if (evoClientId && evoClientSecret && credential.client_id === evoClientId) {
    return evoClientSecret;
  }

  if (!credential.client_secret) return null;

  let secret = credential.client_secret;
  try {
    const parsed = JSON.parse(secret);
    if (parsed.ciphertext && parsed.iv && parsed.tag && parsed.keyId) {
      secret = decryptToken(parsed);
    }
  } catch {
    // Not JSON — use as-is (legacy plaintext)
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
  const clientId = process.env.AZURE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.AZURE_OAUTH_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('Azure OAuth client credentials not configured');
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
    
    const tenantId = credential.oauth_tenant_id || credential.tenant_id;
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
  
  // Handle Service Principal credentials
  const spValidation = validateServicePrincipalCredentials(credential);
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
