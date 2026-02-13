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
import { resolveClientSecret, getAzureTokenUrl } from '../../lib/azure-helpers.js';
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

/** Azure AD error code to user-friendly message mapping */
const AZURE_AD_ERROR_MAP: Record<string, string> = {
  'AADSTS7000215': 'Invalid client secret. Ensure you are using the secret Value, not the secret ID.',
  'AADSTS90002': 'Tenant not found. Check the Tenant ID.',
  'AADSTS700016': 'Application not found. Check the Client ID.',
  'AADSTS7000222': 'Client secret is expired.',
};

/** Extract user-friendly error message from Azure AD error response */
function parseAzureAdError(errorText: string): string {
  for (const [code, message] of Object.entries(AZURE_AD_ERROR_MAP)) {
    if (errorText.includes(code)) return message;
  }
  return 'Authentication failed';
}

/** Request a client_credentials token from Azure AD for a given scope */
async function requestClientCredentialsToken(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  scope: string
): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  try {
    const tokenUrl = getAzureTokenUrl(tenantId);
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { ok: false, error: parseAzureAdError(errorText) };
    }

    const data = await response.json() as { access_token: string };
    return { ok: true, accessToken: data.access_token };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/** Test Service Principal credentials against Azure AD */
async function testServicePrincipalCredentials(
  tenantId: string,
  clientId: string,
  clientSecret: string
): Promise<{ valid: boolean; error?: string }> {
  const result = await requestClientCredentialsToken(tenantId, clientId, clientSecret, 'https://management.azure.com/.default');
  return result.ok ? { valid: true } : { valid: false, error: result.error };
}

/** Fetch app registration info from Microsoft Graph to get secret expiry */
async function getSecretExpiry(
  tenantId: string,
  clientId: string,
  clientSecret: string
): Promise<{ expiresAt: string | null; displayName: string | null }> {
  const tokenResult = await requestClientCredentialsToken(tenantId, clientId, clientSecret, 'https://graph.microsoft.com/.default');
  if (!tokenResult.ok) return { expiresAt: null, displayName: null };

  try {
    const graphResponse = await fetch(
      `https://graph.microsoft.com/v1.0/applications?$filter=appId eq '${clientId}'&$select=displayName,passwordCredentials`,
      { headers: { Authorization: `Bearer ${tokenResult.accessToken}` } }
    );

    if (!graphResponse.ok) return { expiresAt: null, displayName: null };

    const graphData = await graphResponse.json() as { value: Array<{ displayName: string; passwordCredentials: Array<{ endDateTime: string }> }> };
    const app = graphData.value?.[0];
    if (!app) return { expiresAt: null, displayName: null };

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

/** Mask a UUID-like string showing first 8 and last 4 chars */
function maskId(value: string | null): string | null {
  if (!value || value.length < 13) return value;
  return `${value.substring(0, 8)}...${value.substring(value.length - 4)}`;
}

/** List all Azure credentials across organizations */
async function handleList(prisma: any, origin: string): Promise<APIGatewayProxyResultV2> {
  const credentials = await prisma.azureCredential.findMany({
    select: {
      id: true, organization_id: true, subscription_id: true, subscription_name: true,
      auth_type: true, tenant_id: true, client_id: true, oauth_tenant_id: true,
      oauth_user_email: true, token_expires_at: true, last_refresh_at: true,
      refresh_error: true, regions: true, is_active: true, created_at: true, updated_at: true,
    },
    orderBy: { updated_at: 'desc' },
  });

  const orgIds = [...new Set(credentials.map((c: any) => c.organization_id))];
  const orgs = await prisma.organization.findMany({
    where: { id: { in: orgIds } },
    select: { id: true, name: true },
  });
  const orgMap = new Map(orgs.map((o: any) => [o.id, o.name]));

  const result = credentials.map((cred: any) => ({
    ...cred,
    organizationName: orgMap.get(cred.organization_id) || 'Unknown',
    tenant_id: maskId(cred.tenant_id),
    tenant_id_full: cred.tenant_id,
    client_id: maskId(cred.client_id),
    client_id_full: cred.client_id,
  }));

  return success({ credentials: result }, 200, origin);
}

/** Test a specific Azure credential's connectivity */
async function handleTest(prisma: any, credentialId: string, origin: string): Promise<APIGatewayProxyResultV2> {
  const credential = await prisma.azureCredential.findUnique({ where: { id: credentialId } });
  if (!credential) return error('Credential not found', 404, undefined, origin);

  const tenantId = credential.tenant_id || credential.oauth_tenant_id;
  if (!tenantId || !credential.client_id) {
    return error('Credential missing tenant_id or client_id', 400, undefined, origin);
  }

  const clientSecret = await resolveClientSecret(credential);
  if (!clientSecret) return error('Could not resolve client_secret', 400, undefined, origin);

  const testResult = await testServicePrincipalCredentials(tenantId, credential.client_id, clientSecret);

  let secretExpiry: { expiresAt: string | null; displayName: string | null } = { expiresAt: null, displayName: null };
  if (testResult.valid) {
    secretExpiry = await getSecretExpiry(tenantId, credential.client_id, clientSecret);
  }

  return success({
    credentialId,
    valid: testResult.valid,
    error: testResult.error,
    secretExpiresAt: secretExpiry.expiresAt,
    appDisplayName: secretExpiry.displayName,
  }, 200, origin);
}

/** Update an Azure credential and log the change */
async function handleUpdate(
  prisma: any,
  credentialId: string,
  updates: NonNullable<AdminAction['updates']>,
  event: AuthorizedEvent,
  user: any,
  organizationId: string,
  origin: string
): Promise<APIGatewayProxyResultV2> {
  const credential = await prisma.azureCredential.findUnique({ where: { id: credentialId } });
  if (!credential) return error('Credential not found', 404, undefined, origin);

  const updateData: Record<string, any> = {};
  if (updates.tenant_id) updateData.tenant_id = updates.tenant_id;
  if (updates.client_id) updateData.client_id = updates.client_id;
  if (updates.subscription_id) updateData.subscription_id = updates.subscription_id;
  if (updates.client_secret) {
    const encrypted = encryptToken(updates.client_secret);
    updateData.client_secret = serializeEncryptedToken(encrypted);
  }

  if (Object.keys(updateData).length === 0) {
    return error('No valid fields to update', 400, undefined, origin);
  }

  await prisma.azureCredential.update({ where: { id: credentialId }, data: updateData });

  logAuditAsync({
    organizationId,
    userId: user.sub,
    action: 'ADMIN_UPDATE_AZURE_CREDENTIAL',
    resourceType: 'azure_credential',
    resourceId: credentialId,
    details: { updatedFields: Object.keys(updateData), targetOrganizationId: credential.organization_id },
    ipAddress: getIpFromEvent(event),
    userAgent: getUserAgentFromEvent(event),
  });

  logger.info('Admin updated Azure credential', {
    credentialId,
    updatedFields: Object.keys(updateData),
    adminUserId: user.sub,
  });

  return success({ updated: true, fields: Object.keys(updateData) }, 200, origin);
}

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (getHttpMethod(event) === 'OPTIONS') return corsOptions();

  const origin = event.headers?.['origin'] || event.headers?.['Origin'] || '*';

  try {
    const user = getUserFromEvent(event);

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

    switch (body.action) {
      case 'list':
        return handleList(prisma, origin);
      case 'test':
        if (!body.credentialId) return error('credentialId is required', 400, undefined, origin);
        return handleTest(prisma, body.credentialId, origin);
      case 'update':
        if (!body.credentialId || !body.updates) return error('credentialId and updates are required', 400, undefined, origin);
        return handleUpdate(prisma, body.credentialId, body.updates, event, user, organizationId, origin);
      default:
        return error('Invalid action. Use: list, test, update', 400, undefined, origin);
    }
  } catch (err: any) {
    logger.error('Admin Azure credentials error', { error: err.message });
    return error(err.message || 'Internal error', 500, undefined, origin);
  }
}
