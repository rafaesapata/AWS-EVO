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
import { invalidateAzureOAuthCredsCache, getAzureOAuthCredentials, getAzureTokenUrl } from '../../lib/azure-helpers.js';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ENV = process.env.ENVIRONMENT || 'production';
const LAMBDA_PREFIX = `evo-uds-v3-${ENV}`;
const SSM_PREFIX = `/evo-uds-v3/${ENV}`;
const MASK_MIN_LENGTH = 12;
const LAMBDA_LIST_PAGE_SIZE = 200;
const LAMBDA_CONCURRENCY = 10;
const LAMBDA_RETRY_DELAY_MS = 3000;
const LAMBDA_MAX_RETRIES = 2;

const ssmClient = new SSMClient({ region: REGION });
const lambdaClient = new LambdaClient({ region: REGION });

interface ActionBody {
  action: 'get' | 'update' | 'sync' | 'test';
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  secretExpiresAt?: string;
  notes?: string;
}

/** Mask a secret, showing only first 6 and last 4 chars */
function maskSecret(secret: string): string {
  if (!secret || secret.length < MASK_MIN_LENGTH) return '***';
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
      MaxItems: LAMBDA_LIST_PAGE_SIZE,
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

  // Process in batches to avoid API throttling
  for (let i = 0; i < functions.length; i += LAMBDA_CONCURRENCY) {
    const batch = functions.slice(i, i + LAMBDA_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (funcName) => {
        for (let attempt = 0; attempt <= LAMBDA_MAX_RETRIES; attempt++) {
          try {
            const config = await lambdaClient.send(new GetFunctionConfigurationCommand({ FunctionName: funcName }));
            // Skip if Lambda is being updated by another process (SAM deploy)
            if (config.LastUpdateStatus === 'InProgress') {
              if (attempt < LAMBDA_MAX_RETRIES) { await new Promise(r => setTimeout(r, LAMBDA_RETRY_DELAY_MS)); continue; }
              throw new Error(`Lambda ${funcName} still updating after retries`);
            }
            const mergedVars = { ...config.Environment?.Variables, ...vars };
            await lambdaClient.send(new UpdateFunctionConfigurationCommand({
              FunctionName: funcName,
              Environment: { Variables: mergedVars },
            }));
            return; // success
          } catch (err: any) {
            if (err.name === 'ResourceConflictException' && attempt < LAMBDA_MAX_RETRIES) {
              await new Promise(r => setTimeout(r, LAMBDA_RETRY_DELAY_MS));
              continue;
            }
            throw err;
          }
        }
      })
    );
    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'fulfilled') {
        updated++;
      } else {
        failed++;
        const reason = (results[j] as PromiseRejectedResult).reason;
        const errMsg = reason instanceof Error ? reason.message : (typeof reason === 'string' ? reason : JSON.stringify(reason));
        const errName = reason instanceof Error ? reason.name : 'UnknownError';
        logger.error(`Failed to update Lambda ${batch[j]}`, { errorMessage: errMsg, errorName: errName });
      }
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

/** Common sync: SSM + Lambdas + DB upsert. Returns sync result. */
async function performFullSync(
  prisma: any,
  credentials: { clientId: string; clientSecret: string; redirectUri: string },
  userId: string,
  extraDbFields?: { secret_expires_at?: Date | null; notes?: string | null }
): Promise<{ ssmSyncedAt: Date; lambdasSyncedAt: Date; updated: number; failed: number }> {
  const { clientId, clientSecret, redirectUri } = credentials;

  await syncToSSM(clientId, clientSecret, redirectUri);
  invalidateAzureOAuthCredsCache();
  const ssmSyncedAt = new Date();

  const { updated, failed } = await syncLambdaEnvVars({
    AZURE_OAUTH_CLIENT_ID: clientId,
    AZURE_OAUTH_CLIENT_SECRET: clientSecret,
    AZURE_OAUTH_REDIRECT_URI: redirectUri,
  });
  const lambdasSyncedAt = new Date();

  await prisma.evoAppCredential.upsert({
    where: { provider_client_id: { provider: 'azure', client_id: clientId } },
    create: {
      provider: 'azure',
      client_id: clientId,
      client_secret_masked: maskSecret(clientSecret),
      redirect_uri: redirectUri,
      secret_expires_at: extraDbFields?.secret_expires_at ?? null,
      ssm_synced_at: ssmSyncedAt,
      lambdas_synced_at: lambdasSyncedAt,
      lambdas_synced_count: updated,
      notes: extraDbFields?.notes ?? null,
      updated_by: userId,
    },
    update: {
      client_secret_masked: maskSecret(clientSecret),
      redirect_uri: redirectUri,
      ...(extraDbFields?.secret_expires_at !== undefined && { secret_expires_at: extraDbFields.secret_expires_at }),
      ...(extraDbFields?.notes !== undefined && { notes: extraDbFields.notes }),
      ssm_synced_at: ssmSyncedAt,
      lambdas_synced_at: lambdasSyncedAt,
      lambdas_synced_count: updated,
      updated_by: userId,
      updated_at: new Date(),
    },
  });

  return { ssmSyncedAt, lambdasSyncedAt, updated, failed };
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

  logger.info('Updating and syncing Azure OAuth credentials...');
  const secretExpiresAt = body.secretExpiresAt ? new Date(body.secretExpiresAt) : null;
  const { ssmSyncedAt, lambdasSyncedAt, updated, failed } = await performFullSync(
    prisma,
    { clientId, clientSecret, redirectUri },
    userId,
    { secret_expires_at: secretExpiresAt, notes: body.notes || null }
  );

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

  logger.info('Re-syncing Azure OAuth credentials...');
  const { ssmSyncedAt, lambdasSyncedAt, updated, failed } = await performFullSync(
    prisma,
    { clientId, clientSecret, redirectUri },
    userId
  );

  return success({
    message: 'Sync completed',
    ssm: { synced: true, syncedAt: ssmSyncedAt },
    lambdas: { updated, failed, syncedAt: lambdasSyncedAt },
  }, 200, origin);
}

/**
 * Test EVO App credentials by requesting a client_credentials token from Azure AD.
 * Uses the SSM-backed credentials (same path as all handlers).
 */
async function handleTest(origin: string): Promise<APIGatewayProxyResultV2> {
  const creds = await getAzureOAuthCredentials();

  if (!creds.clientId || !creds.clientSecret) {
    return success({ valid: false, error: 'Azure OAuth credentials not configured', source: 'none' }, 200, origin);
  }

  // We need a tenant to test against — use 'common' for multi-tenant apps
  const tokenUrl = getAzureTokenUrl('organizations');
  const params = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn('EVO App credential test failed', {
        status: response.status,
        clientId: creds.clientId,
        secretLength: creds.clientSecret.length,
        secretPrefix: creds.clientSecret.substring(0, 4) + '***',
        error: errorText.substring(0, 500),
      });

      // Parse Azure AD error for user-friendly message
      let userError = `Azure AD returned ${response.status}`;
      let credentialsValid = false;
      if (errorText.includes('AADSTS53003')) {
        // Conditional Access policy blocked the request — but the secret itself IS valid
        credentialsValid = true;
        userError = 'Credentials are valid (blocked by Conditional Access policy — expected from non-whitelisted IPs).';
      } else if (errorText.includes('AADSTS7000215') || errorText.includes('invalid_client')) {
        userError = 'Invalid client secret. Ensure you are using the secret Value, not the secret ID.';
      } else if (errorText.includes('AADSTS700016')) {
        userError = 'Application not found in the directory.';
      } else if (errorText.includes('AADSTS90002')) {
        userError = 'Tenant not found. Check the tenant configuration.';
      } else if (errorText.includes('AADSTS7000229')) {
        userError = 'Service principal not found in tenant. App registration may need admin consent.';
      }

      if (credentialsValid) {
        logger.info('EVO App credential test: secret valid but Conditional Access blocked', { clientId: creds.clientId });
        return success({ valid: true, source: 'ssm', clientId: creds.clientId, note: userError }, 200, origin);
      }

      return success({ valid: false, error: userError, source: 'ssm' }, 200, origin);
    }

    logger.info('EVO App credential test passed', { clientId: creds.clientId });
    return success({ valid: true, source: 'ssm', clientId: creds.clientId }, 200, origin);
  } catch (err: any) {
    logger.error('EVO App credential test error', { error: err.message });
    return success({ valid: false, error: err.message, source: 'ssm' }, 200, origin);
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

      case 'test':
        return handleTest(origin);

      default:
        return error('Invalid action. Use: get, update, sync, test', 400, undefined, origin);
    }
  } catch (err: any) {
    logger.error('Admin EVO app credentials error', { error: err.message });
    return error(err.message || 'Internal error', 500, undefined, origin);
  }
}
