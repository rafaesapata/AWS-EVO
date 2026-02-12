/**
 * Admin EVO App Credentials Handler
 * 
 * Manages the platform-level Azure App Registration credentials (the OAuth intermediary).
 * Actions: get (current state), update (SSM + Lambdas + DB), sync (propagate to Lambdas).
 * Super admin only.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId, isSuperAdmin } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import { SSMClient, PutParameterCommand, GetParameterCommand } from '@aws-sdk/client-ssm';
import { LambdaClient, ListFunctionsCommand, GetFunctionConfigurationCommand, UpdateFunctionConfigurationCommand } from '@aws-sdk/client-lambda';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ENV = process.env.ENVIRONMENT || 'production';
const LAMBDA_PREFIX = `evo-uds-v3-${ENV}`;
const SSM_PREFIX = `/evo-uds-v3/${ENV}`;

const ssmClient = new SSMClient({ region: REGION });
const lambdaClient = new LambdaClient({ region: REGION });

interface ActionBody {
  action: 'get' | 'update' | 'sync';
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  secretExpiresAt?: string;
  notes?: string;
}

/** Mask a secret, showing only first 6 and last 4 chars */
function maskSecret(secret: string): string {
  if (!secret || secret.length < 12) return '***';
  return `${secret.substring(0, 6)}...${secret.substring(secret.length - 4)}`;
}

/** Read current credentials from env vars + DB metadata */
async function handleGet(prisma: any, origin: string): Promise<APIGatewayProxyResultV2> {
  const clientId = process.env.AZURE_OAUTH_CLIENT_ID || '';
  const clientSecret = process.env.AZURE_OAUTH_CLIENT_SECRET || '';
  const redirectUri = process.env.AZURE_OAUTH_REDIRECT_URI || '';

  // Get metadata from DB
  const record = clientId
    ? await prisma.evoAppCredential.findFirst({ where: { provider: 'azure', client_id: clientId } })
    : null;

  // Try to read SSM values to check sync status
  let ssmClientId = '';
  let ssmRedirectUri = '';
  let ssmSecretMasked = '';
  try {
    const [cidRes, secRes, uriRes] = await Promise.allSettled([
      ssmClient.send(new GetParameterCommand({ Name: `${SSM_PREFIX}/azure-oauth-client-id` })),
      ssmClient.send(new GetParameterCommand({ Name: `${SSM_PREFIX}/azure-oauth-client-secret`, WithDecryption: true })),
      ssmClient.send(new GetParameterCommand({ Name: `${SSM_PREFIX}/azure-oauth-redirect-uri` })),
    ]);
    if (cidRes.status === 'fulfilled') ssmClientId = cidRes.value.Parameter?.Value || '';
    if (secRes.status === 'fulfilled') ssmSecretMasked = maskSecret(secRes.value.Parameter?.Value || '');
    if (uriRes.status === 'fulfilled') ssmRedirectUri = uriRes.value.Parameter?.Value || '';
  } catch {
    // SSM params may not exist yet
  }

  return success({
    current: {
      clientId,
      clientSecretMasked: maskSecret(clientSecret),
      redirectUri,
    },
    ssm: {
      clientId: ssmClientId,
      clientSecretMasked: ssmSecretMasked,
      redirectUri: ssmRedirectUri,
      inSync: ssmClientId === clientId && ssmRedirectUri === redirectUri,
    },
    metadata: record ? {
      secretExpiresAt: record.secret_expires_at,
      ssmSyncedAt: record.ssm_synced_at,
      lambdasSyncedAt: record.lambdas_synced_at,
      lambdasSyncedCount: record.lambdas_synced_count,
      notes: record.notes,
      updatedBy: record.updated_by,
      updatedAt: record.updated_at,
    } : null,
  }, 200, origin);
}

/** List all Lambda functions with our prefix, handling pagination */
async function listAllLambdas(): Promise<string[]> {
  const functions: string[] = [];
  let marker: string | undefined;
  do {
    const res = await lambdaClient.send(new ListFunctionsCommand({
      MaxItems: 200,
      Marker: marker,
    }));
    for (const fn of res.Functions || []) {
      if (fn.FunctionName?.startsWith(LAMBDA_PREFIX)) {
        functions.push(fn.FunctionName);
      }
    }
    marker = res.NextMarker;
  } while (marker);
  return functions;
}

/** Update env vars on all Lambdas */
async function syncLambdaEnvVars(
  vars: Record<string, string>
): Promise<{ updated: number; failed: number }> {
  const functions = await listAllLambdas();
  let updated = 0;
  let failed = 0;

  for (const funcName of functions) {
    try {
      const config = await lambdaClient.send(new GetFunctionConfigurationCommand({ FunctionName: funcName }));
      const currentVars = config.Environment?.Variables || {};
      const mergedVars = { ...currentVars, ...vars };

      await lambdaClient.send(new UpdateFunctionConfigurationCommand({
        FunctionName: funcName,
        Environment: { Variables: mergedVars },
      }));
      updated++;
    } catch (err: any) {
      logger.error(`Failed to update Lambda ${funcName}`, { error: err.message });
      failed++;
    }
  }

  return { updated, failed };
}

/** Write values to SSM Parameter Store */
async function syncToSSM(clientId: string, clientSecret: string, redirectUri: string): Promise<void> {
  const params = [
    { Name: `${SSM_PREFIX}/azure-oauth-client-id`, Value: clientId, Type: 'String' as const },
    { Name: `${SSM_PREFIX}/azure-oauth-client-secret`, Value: clientSecret, Type: 'SecureString' as const },
    { Name: `${SSM_PREFIX}/azure-oauth-redirect-uri`, Value: redirectUri, Type: 'String' as const },
  ];

  for (const p of params) {
    await ssmClient.send(new PutParameterCommand({
      Name: p.Name,
      Value: p.Value,
      Type: p.Type,
      Overwrite: true,
      Description: `EVO Platform Azure OAuth - managed via Admin UI`,
    }));
  }
}

/** Update credentials: SSM + all Lambdas + DB metadata */
async function handleUpdate(
  prisma: any,
  body: ActionBody,
  userId: string,
  origin: string
): Promise<APIGatewayProxyResultV2> {
  const clientId = body.clientId || process.env.AZURE_OAUTH_CLIENT_ID || '';
  const clientSecret = body.clientSecret || process.env.AZURE_OAUTH_CLIENT_SECRET || '';
  const redirectUri = body.redirectUri || process.env.AZURE_OAUTH_REDIRECT_URI || '';

  if (!clientId || !clientSecret) {
    return error('clientId and clientSecret are required', 400, undefined, origin);
  }

  // 1. Write to SSM
  logger.info('Syncing Azure OAuth credentials to SSM...');
  await syncToSSM(clientId, clientSecret, redirectUri);
  const ssmSyncedAt = new Date();

  // 2. Propagate to all Lambdas
  logger.info('Propagating Azure OAuth credentials to all Lambdas...');
  const lambdaVars: Record<string, string> = {
    AZURE_OAUTH_CLIENT_ID: clientId,
    AZURE_OAUTH_CLIENT_SECRET: clientSecret,
    AZURE_OAUTH_REDIRECT_URI: redirectUri,
  };
  const { updated, failed } = await syncLambdaEnvVars(lambdaVars);
  const lambdasSyncedAt = new Date();

  // 3. Save metadata to DB
  const secretExpiresAt = body.secretExpiresAt ? new Date(body.secretExpiresAt) : null;
  await prisma.evoAppCredential.upsert({
    where: { provider_client_id: { provider: 'azure', client_id: clientId } },
    create: {
      provider: 'azure',
      client_id: clientId,
      client_secret_masked: maskSecret(clientSecret),
      secret_expires_at: secretExpiresAt,
      redirect_uri: redirectUri,
      ssm_synced_at: ssmSyncedAt,
      lambdas_synced_at: lambdasSyncedAt,
      lambdas_synced_count: updated,
      notes: body.notes || null,
      updated_by: userId,
    },
    update: {
      client_secret_masked: maskSecret(clientSecret),
      secret_expires_at: secretExpiresAt,
      redirect_uri: redirectUri,
      ssm_synced_at: ssmSyncedAt,
      lambdas_synced_at: lambdasSyncedAt,
      lambdas_synced_count: updated,
      notes: body.notes || undefined,
      updated_by: userId,
      updated_at: new Date(),
    },
  });

  return success({
    message: 'Credentials updated successfully',
    ssm: { synced: true, syncedAt: ssmSyncedAt },
    lambdas: { updated, failed, syncedAt: lambdasSyncedAt },
    secretExpiresAt,
  }, 200, origin);
}

/** Sync-only: propagate current env vars to all Lambdas (no secret change) */
async function handleSync(
  prisma: any,
  userId: string,
  origin: string
): Promise<APIGatewayProxyResultV2> {
  const clientId = process.env.AZURE_OAUTH_CLIENT_ID || '';
  const clientSecret = process.env.AZURE_OAUTH_CLIENT_SECRET || '';
  const redirectUri = process.env.AZURE_OAUTH_REDIRECT_URI || '';

  if (!clientId || !clientSecret) {
    return error('AZURE_OAUTH_CLIENT_ID/SECRET not configured in this Lambda', 400, undefined, origin);
  }

  // Sync to SSM
  await syncToSSM(clientId, clientSecret, redirectUri);
  const ssmSyncedAt = new Date();

  // Sync to Lambdas
  const { updated, failed } = await syncLambdaEnvVars({
    AZURE_OAUTH_CLIENT_ID: clientId,
    AZURE_OAUTH_CLIENT_SECRET: clientSecret,
    AZURE_OAUTH_REDIRECT_URI: redirectUri,
  });
  const lambdasSyncedAt = new Date();

  // Update DB metadata
  await prisma.evoAppCredential.upsert({
    where: { provider_client_id: { provider: 'azure', client_id: clientId } },
    create: {
      provider: 'azure',
      client_id: clientId,
      client_secret_masked: maskSecret(clientSecret),
      redirect_uri: redirectUri,
      ssm_synced_at: ssmSyncedAt,
      lambdas_synced_at: lambdasSyncedAt,
      lambdas_synced_count: updated,
      updated_by: userId,
    },
    update: {
      ssm_synced_at: ssmSyncedAt,
      lambdas_synced_at: lambdasSyncedAt,
      lambdas_synced_count: updated,
      updated_by: userId,
      updated_at: new Date(),
    },
  });

  return success({
    message: 'Sync completed',
    ssm: { synced: true, syncedAt: ssmSyncedAt },
    lambdas: { updated, failed, syncedAt: lambdasSyncedAt },
  }, 200, origin);
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

    let body: ActionBody;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return error('Invalid JSON body', 400, undefined, origin);
    }

    switch (body.action) {
      case 'get':
        return handleGet(prisma, origin);

      case 'update':
        logAuditAsync({
          organizationId, userId: user.sub, action: 'EVO_APP_CREDENTIALS_UPDATE',
          resourceType: 'evo_app_credentials', resourceId: 'azure',
          details: { clientId: body.clientId, redirectUri: body.redirectUri },
          ipAddress: getIpFromEvent(event), userAgent: getUserAgentFromEvent(event),
        });
        return handleUpdate(prisma, body, user.sub, origin);

      case 'sync':
        logAuditAsync({
          organizationId, userId: user.sub, action: 'EVO_APP_CREDENTIALS_SYNC',
          resourceType: 'evo_app_credentials', resourceId: 'azure',
          details: {},
          ipAddress: getIpFromEvent(event), userAgent: getUserAgentFromEvent(event),
        });
        return handleSync(prisma, user.sub, origin);

      default:
        return error('Invalid action. Use: get, update, sync', 400, undefined, origin);
    }
  } catch (err: any) {
    logger.error('Admin EVO app credentials error', { error: err.message });
    return error(err.message || 'Internal error', 500, undefined, origin);
  }
}
