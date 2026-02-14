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
  action: 'get' | 'update' | 'sync' | 'test' | 'test-preview';
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  tenantId?: string;
  secretExpiresAt?: string;
  notes?: string;
}

/** Mask a secret, showing only first 6 and last 4 chars */
function maskSecret(secret: string): string {
  if (!secret || secret.length < MASK_MIN_LENGTH) return '***';
  return `${secret.substring(0, 6)}...${secret.substring(secret.length - 4)}`;
}

/** Read current credentials from SSM (canonical source) + DB metadata */
async function handleGet(prisma: any, origin: string): Promise<APIGatewayProxyResultV2> {
  // Read from SSM (canonical source) instead of process.env
  const creds = await getAzureOAuthCredentials();
  const clientId = creds.clientId;
  const clientSecret = creds.clientSecret;
  const redirectUri = creds.redirectUri;
  const tenantId = creds.tenantId;

  // Get metadata from DB
  const record = clientId
    ? await prisma.evoAppCredential.findFirst({ where: { provider: 'azure', client_id: clientId } })
    : null;

  // Try to read SSM values to check sync status
  let ssmClientId = '';
  let ssmRedirectUri = '';
  let ssmSecretMasked = '';
  let ssmTenantId = '';
  try {
    const [cidRes, secRes, uriRes, tidRes] = await Promise.allSettled([
      ssmClient.send(new GetParameterCommand({ Name: `${SSM_PREFIX}/azure-oauth-client-id` })),
      ssmClient.send(new GetParameterCommand({ Name: `${SSM_PREFIX}/azure-oauth-client-secret`, WithDecryption: true })),
      ssmClient.send(new GetParameterCommand({ Name: `${SSM_PREFIX}/azure-oauth-redirect-uri` })),
      ssmClient.send(new GetParameterCommand({ Name: `${SSM_PREFIX}/azure-oauth-tenant-id` })),
    ]);
    if (cidRes.status === 'fulfilled') ssmClientId = cidRes.value.Parameter?.Value || '';
    if (secRes.status === 'fulfilled') ssmSecretMasked = maskSecret(secRes.value.Parameter?.Value || '');
    if (uriRes.status === 'fulfilled') ssmRedirectUri = uriRes.value.Parameter?.Value || '';
    if (tidRes.status === 'fulfilled') ssmTenantId = tidRes.value.Parameter?.Value || '';
  } catch {
    // SSM params may not exist yet
  }

  return success({
    current: {
      clientId,
      clientSecretMasked: maskSecret(clientSecret),
      redirectUri,
      tenantId,
    },
    ssm: {
      clientId: ssmClientId,
      clientSecretMasked: ssmSecretMasked,
      redirectUri: ssmRedirectUri,
      tenantId: ssmTenantId,
      inSync: ssmClientId === clientId && ssmRedirectUri === redirectUri && ssmTenantId === tenantId,
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
async function syncToSSM(clientId: string, clientSecret: string, redirectUri: string, tenantId: string): Promise<void> {
  const params = [
    { Name: `${SSM_PREFIX}/azure-oauth-client-id`, Value: clientId, Type: 'String' as const },
    { Name: `${SSM_PREFIX}/azure-oauth-client-secret`, Value: clientSecret, Type: 'SecureString' as const },
    { Name: `${SSM_PREFIX}/azure-oauth-redirect-uri`, Value: redirectUri, Type: 'String' as const },
    { Name: `${SSM_PREFIX}/azure-oauth-tenant-id`, Value: tenantId, Type: 'String' as const },
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
  credentials: { clientId: string; clientSecret: string; redirectUri: string; tenantId: string },
  userId: string,
  extraDbFields?: { secret_expires_at?: Date | null; notes?: string | null }
): Promise<{ ssmSyncedAt: Date; lambdasSyncedAt: Date; updated: number; failed: number }> {
  const { clientId, clientSecret, redirectUri, tenantId } = credentials;

  await syncToSSM(clientId, clientSecret, redirectUri, tenantId);
  invalidateAzureOAuthCredsCache();
  const ssmSyncedAt = new Date();

  const { updated, failed } = await syncLambdaEnvVars({
    AZURE_OAUTH_CLIENT_ID: clientId,
    AZURE_OAUTH_CLIENT_SECRET: clientSecret,
    AZURE_OAUTH_REDIRECT_URI: redirectUri,
    AZURE_OAUTH_TENANT_ID: tenantId,
    AZURE_CREDS_UPDATED_AT: new Date().toISOString(),
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
  // Read current values from SSM (canonical source), override with body fields
  const currentCreds = await getAzureOAuthCredentials();
  const clientId = body.clientId || currentCreds.clientId;
  const clientSecret = body.clientSecret || currentCreds.clientSecret;
  const redirectUri = body.redirectUri || currentCreds.redirectUri;
  const tenantId = body.tenantId || currentCreds.tenantId;

  if (!clientId || !clientSecret) {
    return error('clientId and clientSecret are required', 400, undefined, origin);
  }

  logger.info('Updating and syncing Azure OAuth credentials...');
  const secretExpiresAt = body.secretExpiresAt ? new Date(body.secretExpiresAt) : null;
  const { ssmSyncedAt, lambdasSyncedAt, updated, failed } = await performFullSync(
    prisma,
    { clientId, clientSecret, redirectUri, tenantId },
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

/** Sync-only: propagate current SSM credentials to all Lambdas (no secret change) */
async function handleSync(
  prisma: any,
  userId: string,
  origin: string
): Promise<APIGatewayProxyResultV2> {
  // Read from SSM (canonical source) instead of process.env
  const creds = await getAzureOAuthCredentials();
  const clientId = creds.clientId;
  const clientSecret = creds.clientSecret;
  const redirectUri = creds.redirectUri;
  const tenantId = creds.tenantId;

  if (!clientId || !clientSecret) {
    return error('Azure OAuth credentials not found in SSM. Configure them first via Update.', 400, undefined, origin);
  }

  logger.info('Re-syncing Azure OAuth credentials...');
  const { ssmSyncedAt, lambdasSyncedAt, updated, failed } = await performFullSync(
    prisma,
    { clientId, clientSecret, redirectUri, tenantId },
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
  return testCredentialsAgainstAzureAD(creds.clientId, creds.clientSecret, creds.tenantId, 'ssm', origin);
}


/**
 * Test credentials provided in the request body BEFORE saving.
 * Allows admin to validate new credentials without affecting the running system.
 */
async function handleTestPreview(body: ActionBody, origin: string): Promise<APIGatewayProxyResultV2> {
  const clientId = body.clientId;
  const clientSecret = body.clientSecret;

  if (!clientId || !clientSecret) {
    return success({ valid: false, error: 'clientId and clientSecret are required for testing', source: 'preview' }, 200, origin);
  }

  // Use tenant from body, or fall back to SSM-stored tenant
  let tenantId = body.tenantId;
  if (!tenantId) {
    const creds = await getAzureOAuthCredentials();
    tenantId = creds.tenantId;
  }

  return testCredentialsAgainstAzureAD(clientId, clientSecret, tenantId, 'preview', origin);
}


/**
 * Shared logic: test credentials against Azure AD token endpoint.
 */
async function testCredentialsAgainstAzureAD(
  clientId: string,
  clientSecret: string,
  tenantId: string,
  source: string,
  origin: string
): Promise<APIGatewayProxyResultV2> {
  if (!clientId || !clientSecret) {
    return success({ valid: false, error: 'Azure OAuth credentials not configured', source }, 200, origin);
  }

  const effectiveTenant = tenantId && tenantId !== 'common' ? tenantId : 'organizations';
  const diagnostics: {
    step: string;
    status: 'success' | 'warning' | 'error';
    message: string;
    details?: Record<string, any>;
  }[] = [];

  // ── Step 1: Test token acquisition with actual tenant ──
  const tokenUrl = getAzureTokenUrl(effectiveTenant);
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });

  let accessToken: string | null = null;

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();

      // Parse the full Azure AD error response
      let azureError: Record<string, any> = {};
      try {
        azureError = JSON.parse(errorText);
      } catch {
        const codeMatch = errorText.match(/AADSTS\d+/);
        if (codeMatch) azureError = { error_codes: [codeMatch[0]] };
      }

      const azureErrorCode = azureError.error || '';
      const azureErrorDescription = azureError.error_description || errorText.substring(0, 500);
      const azureErrorCodes = (azureError.error_codes || []).map(String);
      const azureCorrelationId = azureError.correlation_id || '';
      const azureTimestamp = azureError.timestamp || '';
      const azureTraceId = azureError.trace_id || '';

      logger.warn('EVO App credential test: token request failed', {
        status: response.status,
        clientId,
        tenant: effectiveTenant,
        azureErrorCode,
        azureErrorCodes,
        azureCorrelationId,
        error: azureErrorDescription.substring(0, 500),
        source,
      });

      // ── Deep analysis of Azure AD error codes ──
      const result = analyzeAzureAdError({
        httpStatus: response.status,
        errorCode: azureErrorCode,
        errorCodes: azureErrorCodes,
        errorDescription: azureErrorDescription,
        correlationId: azureCorrelationId,
        timestamp: azureTimestamp,
        traceId: azureTraceId,
        tenant: effectiveTenant,
        clientId,
      });

      diagnostics.push({
        step: 'token_acquisition',
        status: result.credentialsValid ? 'warning' : 'error',
        message: result.summary,
        details: {
          httpStatus: response.status,
          azureErrorCode,
          azureErrorCodes,
          correlationId: azureCorrelationId,
          timestamp: azureTimestamp,
          tenant: effectiveTenant,
        },
      });

      // If credentials are valid but blocked (e.g. CA policy), try alternate scopes
      if (result.credentialsValid) {
        // Try management scope to see if it's scope-specific
        const mgmtResult = await testAlternateScope(clientId, clientSecret, effectiveTenant, 'https://management.azure.com/.default');
        diagnostics.push({
          step: 'management_scope_test',
          status: mgmtResult.ok ? 'success' : 'warning',
          message: mgmtResult.ok
            ? 'Token acquired with Azure Management scope'
            : `Management scope also blocked: ${mgmtResult.errorCode || mgmtResult.error}`,
          details: mgmtResult.ok ? undefined : { errorCode: mgmtResult.errorCode },
        });

        // If management scope works, use that token for deeper checks
        if (mgmtResult.ok && mgmtResult.accessToken) {
          accessToken = mgmtResult.accessToken;
        }
      }

      // If we never got a token, return the diagnostic result
      if (!accessToken) {
        return success({
          valid: result.credentialsValid,
          conditionalAccess: result.isConditionalAccess,
          source,
          clientId,
          note: result.summary,
          azureErrorCode: azureErrorCodes[0] || azureErrorCode,
          diagnostics,
          suggestions: result.suggestions,
          errorCategory: result.category,
          azureCorrelationId,
        }, 200, origin);
      }
    } else {
      const tokenData = await response.json() as { access_token: string; expires_in: number; ext_expires_in?: number };
      accessToken = tokenData.access_token;

      diagnostics.push({
        step: 'token_acquisition',
        status: 'success',
        message: `Token acquired successfully (expires in ${tokenData.expires_in}s)`,
        details: { tenant: effectiveTenant, expiresIn: tokenData.expires_in },
      });
    }
  } catch (err: any) {
    logger.error('EVO App credential test: network error', { error: err.message, source });
    diagnostics.push({
      step: 'token_acquisition',
      status: 'error',
      message: `Network error: ${err.message}`,
    });
    return success({
      valid: false,
      error: `Connection error: ${err.message}`,
      source,
      diagnostics,
      suggestions: ['Verify network connectivity to login.microsoftonline.com', 'Check if Lambda has internet access via NAT Gateway/VPC'],
      errorCategory: 'network',
    }, 200, origin);
  }

  // ── Step 2: If we have a token, check app registration details via Graph ──
  if (accessToken) {
    try {
      const appInfo = await fetchAppRegistrationInfo(accessToken, clientId);
      if (appInfo) {
        diagnostics.push({
          step: 'app_registration',
          status: 'success',
          message: `App: ${appInfo.displayName}`,
          details: {
            displayName: appInfo.displayName,
            secretExpiry: appInfo.secretExpiry,
            secretsCount: appInfo.secretsCount,
            isMultiTenant: appInfo.isMultiTenant,
          },
        });

        // Check secret expiry
        if (appInfo.secretExpiry) {
          const expiryDate = new Date(appInfo.secretExpiry);
          const daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          if (daysUntilExpiry < 0) {
            diagnostics.push({
              step: 'secret_expiry',
              status: 'error',
              message: `Client secret expired ${Math.abs(daysUntilExpiry)} days ago (${appInfo.secretExpiry})`,
            });
          } else if (daysUntilExpiry < 30) {
            diagnostics.push({
              step: 'secret_expiry',
              status: 'warning',
              message: `Client secret expires in ${daysUntilExpiry} days (${appInfo.secretExpiry})`,
            });
          } else {
            diagnostics.push({
              step: 'secret_expiry',
              status: 'success',
              message: `Client secret valid for ${daysUntilExpiry} days (expires ${appInfo.secretExpiry})`,
            });
          }
        }
      }
    } catch (err: any) {
      diagnostics.push({
        step: 'app_registration',
        status: 'warning',
        message: `Could not fetch app details: ${err.message}`,
      });
    }

    // ── Step 3: Check API permissions ──
    try {
      const permissions = await checkApiPermissions(accessToken, clientId);
      if (permissions) {
        diagnostics.push({
          step: 'api_permissions',
          status: permissions.hasRequiredPermissions ? 'success' : 'warning',
          message: permissions.hasRequiredPermissions
            ? `API permissions OK (${permissions.grantedPermissions.length} granted)`
            : `Missing recommended permissions. Granted: ${permissions.grantedPermissions.join(', ') || 'none'}`,
          details: {
            granted: permissions.grantedPermissions,
            missing: permissions.missingPermissions,
          },
        });
      }
    } catch (err: any) {
      diagnostics.push({
        step: 'api_permissions',
        status: 'warning',
        message: `Could not check permissions: ${err.message}`,
      });
    }
  }

  const allSuccess = diagnostics.every(d => d.status === 'success');
  const hasErrors = diagnostics.some(d => d.status === 'error');

  logger.info('EVO App credential test completed', {
    clientId,
    source,
    tenant: effectiveTenant,
    allSuccess,
    hasErrors,
    steps: diagnostics.length,
  });

  return success({
    valid: !hasErrors,
    conditionalAccess: diagnostics.some(d => d.details?.azureErrorCodes?.includes('53003') || d.message?.includes('Conditional Access')),
    source,
    clientId,
    note: allSuccess
      ? 'All checks passed'
      : diagnostics.filter(d => d.status !== 'success').map(d => d.message).join('. '),
    diagnostics,
    suggestions: allSuccess ? [] : generateSuggestions(diagnostics),
    errorCategory: hasErrors ? 'authentication' : (allSuccess ? 'none' : 'partial'),
  }, 200, origin);
}

/** Analyze Azure AD error response and return structured diagnostic info */
function analyzeAzureAdError(params: {
  httpStatus: number;
  errorCode: string;
  errorCodes: string[];
  errorDescription: string;
  correlationId: string;
  timestamp: string;
  traceId: string;
  tenant: string;
  clientId: string;
}): {
  credentialsValid: boolean;
  isConditionalAccess: boolean;
  category: string;
  summary: string;
  suggestions: string[];
} {
  const { httpStatus, errorCode, errorCodes, errorDescription, tenant, clientId } = params;
  const allCodes = errorCodes.join(',');

  // AADSTS53003 — Conditional Access policy blocked
  if (allCodes.includes('53003') || errorDescription.includes('AADSTS53003')) {
    // Extract CA policy details from error description
    const policyMatch = errorDescription.match(/policy\s+"([^"]+)"/i);
    const policyName = policyMatch ? policyMatch[1] : null;

    return {
      credentialsValid: true,
      isConditionalAccess: true,
      category: 'conditional_access',
      summary: policyName
        ? `Credentials are valid. Blocked by Conditional Access policy "${policyName}". This is expected when the Lambda IP is not whitelisted in Azure AD.`
        : 'Credentials are valid. Blocked by a Conditional Access policy. The Lambda execution environment IP is not in the allowed locations for this policy.',
      suggestions: [
        'In Azure Portal → Entra ID → Security → Conditional Access, review the policies applied to this App Registration',
        'Add the Lambda NAT Gateway IP to the "Named Locations" trusted list',
        'Or create an exclusion for this Service Principal in the Conditional Access policy',
        `Check policy details with Correlation ID: ${params.correlationId}`,
        'In Entra ID → Sign-in logs, filter by the Correlation ID to see which specific policy blocked the request',
      ],
    };
  }

  // AADSTS7000215 — Invalid client secret
  if (allCodes.includes('7000215') || errorCode === 'invalid_client') {
    return {
      credentialsValid: false,
      isConditionalAccess: false,
      category: 'invalid_secret',
      summary: 'Invalid client secret. Make sure you are using the secret Value (not the Secret ID) from Azure Portal.',
      suggestions: [
        'In Azure Portal → App Registrations → Your App → Certificates & Secrets',
        'Copy the "Value" column (shown only once at creation), NOT the "Secret ID"',
        'If the value is no longer visible, create a new client secret',
        'Check if the secret has expired in the "Expires" column',
      ],
    };
  }

  // AADSTS700016 — App not found
  if (allCodes.includes('700016')) {
    return {
      credentialsValid: false,
      isConditionalAccess: false,
      category: 'app_not_found',
      summary: `Application ${clientId} not found in tenant "${tenant}". The App Registration may have been deleted or the Client ID is incorrect.`,
      suggestions: [
        'Verify the Client ID (Application ID) in Azure Portal → App Registrations',
        `Check if the app exists in tenant "${tenant}"`,
        'If using a multi-tenant app, ensure it has been consented in the target tenant',
        'The app may have been deleted — check the "Deleted applications" section',
      ],
    };
  }

  // AADSTS90002 — Tenant not found
  if (allCodes.includes('90002')) {
    return {
      credentialsValid: false,
      isConditionalAccess: false,
      category: 'tenant_not_found',
      summary: `Tenant "${tenant}" not found. Verify the Tenant ID (Directory ID) is correct.`,
      suggestions: [
        'In Azure Portal → Entra ID → Overview, copy the "Tenant ID"',
        'Ensure you are using the Directory (tenant) ID, not the Subscription ID',
        'The tenant domain (e.g., contoso.onmicrosoft.com) can also be used',
      ],
    };
  }

  // AADSTS7000229 — No service principal
  if (allCodes.includes('7000229')) {
    return {
      credentialsValid: false,
      isConditionalAccess: false,
      category: 'no_service_principal',
      summary: 'The App Registration exists but has no Service Principal in this tenant. Admin consent may be required.',
      suggestions: [
        'In Azure Portal → Enterprise Applications, search for the App',
        'If not found, the app needs admin consent in this tenant',
        `Grant admin consent: Azure Portal → App Registrations → ${clientId} → API Permissions → "Grant admin consent"`,
        'For multi-tenant apps, an admin in the target tenant must consent',
      ],
    };
  }

  // AADSTS50034 — User account not found (shouldn't happen with client_credentials but just in case)
  if (allCodes.includes('50034')) {
    return {
      credentialsValid: false,
      isConditionalAccess: false,
      category: 'account_not_found',
      summary: 'The account was not found in the directory.',
      suggestions: [
        'Verify the Client ID is correct',
        'Ensure the App Registration exists in the correct tenant',
      ],
    };
  }

  // AADSTS50076 / 50079 — MFA required
  if (allCodes.includes('50076') || allCodes.includes('50079')) {
    return {
      credentialsValid: true,
      isConditionalAccess: true,
      category: 'mfa_required',
      summary: 'Credentials are valid but MFA is required by policy. For service-to-service (client_credentials) flow, MFA should not apply.',
      suggestions: [
        'Review Conditional Access policies — MFA should not be required for Service Principal authentication',
        'Ensure the Conditional Access policy targets "Users" not "Workload identities"',
        'In Entra ID → Conditional Access, check if any policy applies to Service Principals',
      ],
    };
  }

  // AADSTS530003 — Device compliance required
  if (allCodes.includes('530003')) {
    return {
      credentialsValid: true,
      isConditionalAccess: true,
      category: 'device_compliance',
      summary: 'Credentials are valid but device compliance is required. This should not apply to service-to-service flows.',
      suggestions: [
        'Review Conditional Access policies for device compliance requirements',
        'Exclude Service Principals from device compliance policies',
      ],
    };
  }

  // AADSTS700024 — Client assertion expired
  if (allCodes.includes('700024')) {
    return {
      credentialsValid: false,
      isConditionalAccess: false,
      category: 'assertion_expired',
      summary: 'Client assertion (certificate) has expired.',
      suggestions: [
        'Renew the certificate used for authentication',
        'Upload a new certificate in App Registrations → Certificates & Secrets',
      ],
    };
  }

  // Generic fallback
  return {
    credentialsValid: false,
    isConditionalAccess: false,
    category: 'unknown',
    summary: `Azure AD error (HTTP ${httpStatus}): ${errorDescription.substring(0, 200)}`,
    suggestions: [
      `Error code: ${errorCode || 'unknown'} (${allCodes || 'no AADSTS code'})`,
      `Use Correlation ID ${params.correlationId} to investigate in Azure Portal → Entra ID → Sign-in logs`,
      'Check Azure Service Health for any ongoing issues',
    ],
  };
}

/** Test an alternate scope to determine if the issue is scope-specific */
async function testAlternateScope(
  clientId: string,
  clientSecret: string,
  tenant: string,
  scope: string
): Promise<{ ok: boolean; accessToken?: string; error?: string; errorCode?: string }> {
  try {
    const tokenUrl = getAzureTokenUrl(tenant);
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
      let errorCode = '';
      try {
        const errorJson = JSON.parse(errorText);
        errorCode = errorJson.error_codes?.[0]?.toString() || errorJson.error || '';
      } catch {
        const m = errorText.match(/AADSTS\d+/);
        if (m) errorCode = m[0];
      }
      return { ok: false, error: errorText.substring(0, 200), errorCode };
    }

    const data = await response.json() as { access_token: string };
    return { ok: true, accessToken: data.access_token };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/** Fetch app registration info from Microsoft Graph */
async function fetchAppRegistrationInfo(
  accessToken: string,
  clientId: string
): Promise<{ displayName: string; secretExpiry: string | null; secretsCount: number; isMultiTenant: boolean } | null> {
  const graphResponse = await fetch(
    `https://graph.microsoft.com/v1.0/applications?$filter=appId eq '${clientId}'&$select=displayName,passwordCredentials,signInAudience`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!graphResponse.ok) return null;

  const graphData = await graphResponse.json() as {
    value: Array<{
      displayName: string;
      passwordCredentials: Array<{ endDateTime: string }>;
      signInAudience: string;
    }>;
  };

  const app = graphData.value?.[0];
  if (!app) return null;

  const secrets = app.passwordCredentials || [];
  const latestSecret = secrets
    .filter(s => s.endDateTime)
    .sort((a, b) => new Date(b.endDateTime).getTime() - new Date(a.endDateTime).getTime())[0];

  return {
    displayName: app.displayName,
    secretExpiry: latestSecret?.endDateTime || null,
    secretsCount: secrets.length,
    isMultiTenant: app.signInAudience === 'AzureADMultipleOrgs' || app.signInAudience === 'AzureADandPersonalMicrosoftAccount',
  };
}

/** Check API permissions granted to the app */
async function checkApiPermissions(
  accessToken: string,
  clientId: string
): Promise<{ hasRequiredPermissions: boolean; grantedPermissions: string[]; missingPermissions: string[] } | null> {
  // Get the service principal for this app
  const spResponse = await fetch(
    `https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '${clientId}'&$select=id`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!spResponse.ok) return null;

  const spData = await spResponse.json() as { value: Array<{ id: string }> };
  const sp = spData.value?.[0];
  if (!sp) return null;

  // Get app role assignments (application permissions)
  const rolesResponse = await fetch(
    `https://graph.microsoft.com/v1.0/servicePrincipals/${sp.id}/appRoleAssignments`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!rolesResponse.ok) return null;

  const rolesData = await rolesResponse.json() as {
    value: Array<{ resourceDisplayName: string; appRoleId: string }>;
  };

  const grantedPermissions = rolesData.value?.map(r => r.resourceDisplayName) || [];
  // For EVO, we mainly need Microsoft Graph access
  const hasGraphAccess = grantedPermissions.some(p => p.includes('Microsoft Graph'));

  return {
    hasRequiredPermissions: hasGraphAccess || grantedPermissions.length > 0,
    grantedPermissions: [...new Set(grantedPermissions)],
    missingPermissions: !hasGraphAccess ? ['Microsoft Graph (for user/directory operations)'] : [],
  };
}

/** Generate actionable suggestions based on diagnostic results */
function generateSuggestions(diagnostics: Array<{ step: string; status: string; message: string }>): string[] {
  const suggestions: string[] = [];
  const failedSteps = diagnostics.filter(d => d.status !== 'success');

  for (const step of failedSteps) {
    if (step.step === 'token_acquisition' && step.message.includes('Conditional Access')) {
      suggestions.push('Review Conditional Access policies in Entra ID → Security → Conditional Access');
      suggestions.push('Add Lambda NAT Gateway IP to Named Locations or exclude the Service Principal');
    }
    if (step.step === 'secret_expiry' && step.status === 'error') {
      suggestions.push('Create a new client secret in App Registrations → Certificates & Secrets');
    }
    if (step.step === 'api_permissions' && step.status === 'warning') {
      suggestions.push('Grant required API permissions in App Registrations → API Permissions');
    }
  }

  return [...new Set(suggestions)];
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
          details: { clientId: body.clientId, redirectUri: body.redirectUri, tenantId: body.tenantId },
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

      case 'test-preview':
        return handleTestPreview(body, origin);

      default:
        return error('Invalid action. Use: get, update, sync, test, test-preview', 400, undefined, origin);
    }
  } catch (err: any) {
    logger.error('Admin EVO app credentials error', { error: err.message });
    return error(err.message || 'Internal error', 500, undefined, origin);
  }
}
