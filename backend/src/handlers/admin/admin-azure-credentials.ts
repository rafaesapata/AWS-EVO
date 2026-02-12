/**
 * Admin Azure Credentials Management Handler
 * 
 * Super admin only. Lists all Azure credentials across all organizations,
 * tests connectivity, updates credentials (tenant_id, client_secret, etc.),
 * and shows secret expiry information.
 */

import * as crypto from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = crypto.webcrypto || crypto;
}

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId, isSuperAdmin } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { encryptToken, serializeEncryptedToken } from '../../lib/token-encryption.js';
import { resolveClientSecret } from '../../lib/azure-helpers.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';

interface AdminAction {
  action: 'list' | 'test' | 'update';
  credentialId?: string;
  updates?: {
    tenant_id?: string;
    client_id?: string;
    client_secret?: string;
    subscription_id?: string;
  };
}

/** Azure AD token endpoint */
function getAzureTokenUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
}

/** Test Service Principal credentials against Azure AD */
async function testServicePrincipalCredentials(
  tenantId: string,
  clientId: string,
  clientSecret: string
): Promise<{ valid: boolean; error?: string; expiresAt?: string }> {
  try {
    const tokenUrl = getAzureTokenUrl(tenantId);
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'https://management.azure.com/.default',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Extract meaningful error from Azure AD response
      let errorMsg = 'Authentication failed';
      if (errorText.includes('AADSTS7000215')) {
        errorMsg = 'Invalid client secret. Ensure you are using the secret Value, not the secret ID.';
      } else if (errorText.includes('AADSTS90002')) {
        errorMsg = 'Tenant not found. Check the Tenant ID.';
      } else if (errorText.includes('AADSTS700016')) {
        errorMsg = 'Application not found. Check the Client ID.';
      } else if (errorText.includes('AADSTS7000222')) {
        errorMsg = 'Client secret is expired.';
      }
      return { valid: false, error: errorMsg };
    }

    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

/** Fetch app registration info from Microsoft Graph to get secret expiry */
async function getSecretExpiry(
  tenantId: string,
  clientId: string,
  clientSecret: string
): Promise<{ expiresAt: string | null; displayName: string | null }> {
  try {
    // First get a token for Microsoft Graph
    const tokenUrl = getAzureTokenUrl(tenantId);
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    });

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!tokenResponse.ok) {
      return { expiresAt: null, displayName: null };
    }

    const tokenData = await tokenResponse.json() as { access_token: string };

    // Query the app registration for password credentials
    const graphResponse = await fetch(
      `https://graph.microsoft.com/v1.0/applications?$filter=appId eq '${clientId}'&$select=displayName,passwordCredentials`,
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );

    if (!graphResponse.ok) {
      return { expiresAt: null, displayName: null };
    }

    const graphData = await graphResponse.json() as { value: Array<{ displayName: string; passwordCredentials: Array<{ endDateTime: string; displayName: string }> }> };
    const app = graphData.value?.[0];
    if (!app) return { expiresAt: null, displayName: null };

    // Find the latest expiring secret
    const secrets = app.passwordCredentials || [];
    const latestSecret = secrets.sort(
      (a, b) => new Date(b.endDateTime).getTime() - new Date(a.endDateTime).getTime()
    )[0];

    return {
      expiresAt: latestSecret?.endDateTime || null,
      displayName: app.displayName || null,
    };
  } catch {
    return { expiresAt: null, displayName: null };
  }
}

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (getHttpMethod(event) === 'OPTIONS') return corsOptions();

  const origin = event.headers?.['origin'] || event.headers?.['Origin'] || '*';

  try {
    const user = getUserFromEvent(event);

    // SECURITY: Super admin only
    if (!isSuperAdmin(user)) {
      return error('Forbidden: super_admin role required', 403, undefined, origin);
    }

    const organizationId = getOrganizationId(user);
    const prisma = getPrismaClient();

    let body: AdminAction;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return error('Invalid JSON body', 400, undefined, origin);
    }

    const { action } = body;

    // ========== LIST ==========
    if (action === 'list') {
      const credentials = await prisma.azureCredential.findMany({
        select: {
          id: true,
          organization_id: true,
          subscription_id: true,
          subscription_name: true,
          auth_type: true,
          tenant_id: true,
          client_id: true,
          oauth_tenant_id: true,
          oauth_user_email: true,
          token_expires_at: true,
          last_refresh_at: true,
          refresh_error: true,
          regions: true,
          is_active: true,
          created_at: true,
          updated_at: true,
        },
        orderBy: { updated_at: 'desc' },
      });

      // Fetch organization names
      const orgIds = [...new Set(credentials.map(c => c.organization_id))];
      const orgs = await prisma.organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, name: true },
      });
      const orgMap = new Map(orgs.map(o => [o.id, o.name]));

      const result = credentials.map(cred => ({
        ...cred,
        organizationName: orgMap.get(cred.organization_id) || 'Unknown',
        // Mask sensitive fields
        tenant_id: cred.tenant_id ? `${cred.tenant_id.substring(0, 8)}...${cred.tenant_id.substring(cred.tenant_id.length - 4)}` : null,
        tenant_id_full: cred.tenant_id,
        client_id: cred.client_id ? `${cred.client_id.substring(0, 8)}...${cred.client_id.substring(cred.client_id.length - 4)}` : null,
        client_id_full: cred.client_id,
      }));

      return success({ credentials: result }, 200, origin);
    }

    // ========== TEST ==========
    if (action === 'test') {
      if (!body.credentialId) {
        return error('credentialId is required', 400, undefined, origin);
      }

      const credential = await prisma.azureCredential.findUnique({
        where: { id: body.credentialId },
      });

      if (!credential) {
        return error('Credential not found', 404, undefined, origin);
      }

      const tenantId = credential.tenant_id || credential.oauth_tenant_id;
      if (!tenantId || !credential.client_id) {
        return error('Credential missing tenant_id or client_id', 400, undefined, origin);
      }

      const clientSecret = resolveClientSecret(credential);
      if (!clientSecret) {
        return error('Could not resolve client_secret', 400, undefined, origin);
      }

      // Test authentication
      const testResult = await testServicePrincipalCredentials(tenantId, credential.client_id, clientSecret);

      // Try to get secret expiry info
      let secretExpiry: { expiresAt: string | null; displayName: string | null } = { expiresAt: null, displayName: null };
      if (testResult.valid) {
        secretExpiry = await getSecretExpiry(tenantId, credential.client_id, clientSecret);
      }

      return success({
        credentialId: body.credentialId,
        valid: testResult.valid,
        error: testResult.error,
        secretExpiresAt: secretExpiry.expiresAt,
        appDisplayName: secretExpiry.displayName,
      }, 200, origin);
    }

    // ========== UPDATE ==========
    if (action === 'update') {
      if (!body.credentialId || !body.updates) {
        return error('credentialId and updates are required', 400, undefined, origin);
      }

      const credential = await prisma.azureCredential.findUnique({
        where: { id: body.credentialId },
      });

      if (!credential) {
        return error('Credential not found', 404, undefined, origin);
      }

      const updateData: Record<string, any> = {};

      if (body.updates.tenant_id) {
        updateData.tenant_id = body.updates.tenant_id;
      }
      if (body.updates.client_id) {
        updateData.client_id = body.updates.client_id;
      }
      if (body.updates.subscription_id) {
        updateData.subscription_id = body.updates.subscription_id;
      }
      if (body.updates.client_secret) {
        // Encrypt the new client secret
        const encrypted = encryptToken(body.updates.client_secret);
        updateData.client_secret = serializeEncryptedToken(encrypted);
      }

      if (Object.keys(updateData).length === 0) {
        return error('No valid fields to update', 400, undefined, origin);
      }

      await prisma.azureCredential.update({
        where: { id: body.credentialId },
        data: updateData,
      });

      // Audit log
      logAuditAsync({
        organizationId,
        userId: user.sub,
        action: 'ADMIN_UPDATE_AZURE_CREDENTIAL',
        resourceType: 'azure_credential',
        resourceId: body.credentialId,
        details: {
          updatedFields: Object.keys(updateData),
          targetOrganizationId: credential.organization_id,
        },
        ipAddress: getIpFromEvent(event),
        userAgent: getUserAgentFromEvent(event),
      });

      logger.info('Admin updated Azure credential', {
        credentialId: body.credentialId,
        updatedFields: Object.keys(updateData),
        adminUserId: user.sub,
      });

      return success({ updated: true, fields: Object.keys(updateData) }, 200, origin);
    }

    return error('Invalid action. Use: list, test, update', 400, undefined, origin);
  } catch (err: any) {
    logger.error('Admin Azure credentials error', { error: err.message });
    return error(err.message || 'Internal error', 500, undefined, origin);
  }
}
