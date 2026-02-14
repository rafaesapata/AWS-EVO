/**
 * Azure Fetch Costs Handler
 * 
 * Fetches cost data from Azure Cost Management API and stores in database.
 * Uses direct REST API calls for reliability (same approach as debug-azure-costs).
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
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';
import { fetchWithRetry, DEFAULT_AZURE_RETRY_CONFIG } from '../../lib/azure-retry.js';

// Constants
const AZURE_MANAGEMENT_SCOPE = 'https://management.azure.com/.default';
const COST_MANAGEMENT_API_VERSION = '2023-11-01';

// Validation schema
const azureFetchCostsSchema = z.object({
  credentialId: z.string().uuid('Invalid credential ID'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD'),
  granularity: z.enum(['DAILY', 'MONTHLY']).optional().default('DAILY'),
});

/**
 * Azure credential from database
 */
interface AzureCredentialRecord {
  id: string;
  organization_id: string;
  subscription_id: string;
  subscription_name: string | null;
  auth_type: string;
  tenant_id: string | null;
  client_id: string | null;
  client_secret: string | null;
  encrypted_refresh_token: string | null;
  oauth_tenant_id: string | null;
  certificate_pem: string | null;
  certificate_thumbprint: string | null;
  certificate_expires_at: Date | null;
  regions: string[];
}

/**
 * Column definition from Azure API
 */
interface ColumnDefinition {
  name: string;
  type?: string;
}

/**
 * Get access token for Azure - handles both OAuth and Service Principal
 */
async function getAccessToken(
  credential: AzureCredentialRecord,
  prisma: ReturnType<typeof getPrismaClient>
): Promise<{ success: true; token: string } | { success: false; error: string }> {
  try {
    if (credential.auth_type === 'oauth') {
      // OAuth flow - use existing helper
      const { getAzureCredentialWithToken, isInvalidClientSecretError, INVALID_CLIENT_SECRET_MESSAGE } = await import('../../lib/azure-helpers.js');
      const tokenResult = await getAzureCredentialWithToken(prisma, credential.id, credential.organization_id);
      
      if (!tokenResult.success) {
        if (isInvalidClientSecretError(tokenResult.error)) {
          return { success: false, error: INVALID_CLIENT_SECRET_MESSAGE };
        }
        return { success: false, error: tokenResult.error };
      }
      return { success: true, token: tokenResult.accessToken };
    }
    
    if (credential.auth_type === 'certificate') {
      const { resolveCertificatePem } = await import('../../lib/azure-helpers.js');
      const pem = await resolveCertificatePem(credential);
      if (!credential.tenant_id || !credential.client_id || !pem) {
        return { success: false, error: 'Missing Certificate credentials (tenant_id, client_id, or certificate_pem)' };
      }
      const { ClientCertificateCredential } = await import('@azure/identity');
      const certCredential = new ClientCertificateCredential(credential.tenant_id, credential.client_id, { certificate: pem });
      const tokenResponse = await certCredential.getToken(AZURE_MANAGEMENT_SCOPE);
      return { success: true, token: tokenResponse.token };
    }
    
    // Service Principal flow - direct approach (same as debug-azure-costs)
    const { resolveClientSecret } = await import('../../lib/azure-helpers.js');
    const resolvedSecret = await resolveClientSecret(credential);
    if (!credential.tenant_id || !credential.client_id || !resolvedSecret) {
      return { success: false, error: 'Missing Service Principal credentials (tenant_id, client_id, or client_secret)' };
    }
    
    const { ClientSecretCredential } = await import('@azure/identity');
    const spCredential = new ClientSecretCredential(
      credential.tenant_id,
      credential.client_id,
      resolvedSecret
    );
    
    const tokenResponse = await spCredential.getToken(AZURE_MANAGEMENT_SCOPE);
    return { success: true, token: tokenResponse.token };
  } catch (err: unknown) {
    const errorDetails = err instanceof Error 
      ? { message: err.message, code: (err as NodeJS.ErrnoException).code, name: err.name }
      : { message: 'Unknown error' };
    logger.error('Failed to get Azure access token', { error: errorDetails });
    // Check for invalid client secret across all auth types
    const { isInvalidClientSecretError, INVALID_CLIENT_SECRET_MESSAGE } = await import('../../lib/azure-helpers.js');
    if (isInvalidClientSecretError(errorDetails.message)) {
      return { success: false, error: INVALID_CLIENT_SECRET_MESSAGE };
    }
    return { success: false, error: `Failed to get access token: ${errorDetails.message}` };
  }
}

/**
 * Build cost query request body
 */
function buildCostQueryRequest(startDate: string, endDate: string, granularity: string) {
  return {
    type: 'ActualCost',
    timeframe: 'Custom',
    timePeriod: { from: startDate, to: endDate },
    dataset: {
      granularity: granularity === 'MONTHLY' ? 'Monthly' : 'Daily',
      aggregation: {
        totalCost: { name: 'Cost', function: 'Sum' },
      },
      grouping: [{ type: 'Dimension', name: 'ServiceName' }],
    },
  };
}

/**
 * Query Azure Cost Management API directly
 */
async function queryCostManagementApi(
  subscriptionId: string,
  accessToken: string,
  requestBody: object
): Promise<{ success: true; rows: unknown[][]; columns: ColumnDefinition[] } | { success: false; error: string; status?: number }> {
  const scope = `/subscriptions/${subscriptionId}`;
  const apiUrl = `https://management.azure.com${scope}/providers/Microsoft.CostManagement/query?api-version=${COST_MANAGEMENT_API_VERSION}`;

  try {
    const response = await fetchWithRetry(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }, {
      maxRetries: 2,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      jitterFactor: 0.2,
      requestTimeoutMs: 25000,
      retryAfterHeaders: ['x-ms-ratelimit-microsoft.costmanagement-retry-after'],
    });

    const responseText = await response.text();

    logger.info('Cost Management API response', {
      status: response.status,
      statusText: response.statusText,
      responseLength: responseText.length,
    });

    let responseData: { properties?: { rows?: unknown[][]; columns?: ColumnDefinition[] }; error?: { code?: string; message?: string }; rawText?: string };
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { rawText: responseText.substring(0, 1000) };
    }

    if (!response.ok) {
      const azureErrorMsg = responseData.error?.message || responseData.error?.code || '';
      logger.error('Cost Management API error', {
        status: response.status,
        statusText: response.statusText,
        error: responseData,
      });
      return {
        success: false,
        error: azureErrorMsg
          ? `Azure Cost Management error: ${azureErrorMsg}`
          : `Azure Cost Management API error: ${response.status} ${response.statusText}`,
        status: response.status,
      };
    }

    return {
      success: true,
      rows: responseData.properties?.rows || [],
      columns: responseData.properties?.columns || [],
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Cost Management API request failed', { error: errorMessage });
    return { success: false, error: `API request failed: ${errorMessage}` };
  }
}



/**
 * Parse Azure date format (YYYYMMDD number) to ISO date string
 */
function parseAzureDate(rawDate: unknown, defaultDate: string): string {
  if (!rawDate) return defaultDate;
  
  const dateStr = String(rawDate);
  
  // YYYYMMDD format
  if (/^\d{8}$/.test(dateStr)) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }
  
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.slice(0, 10);
  }
  
  return defaultDate;
}

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  // Handle CORS preflight
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    logger.info('Fetching Azure costs', { organizationId });

    // Parse and validate request body
    const validation = parseAndValidateBody(azureFetchCostsSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const { credentialId, startDate, endDate, granularity = 'DAILY' } = validation.data;

    // Fetch Azure credential
    const credential = await prisma.azureCredential.findFirst({
      where: {
        id: credentialId,
        organization_id: organizationId,
        is_active: true,
      },
    });

    if (!credential) {
      return error('Azure credential not found or inactive', 404);
    }

    logger.info('Credential found', {
      id: credential.id,
      subscriptionId: credential.subscription_id,
      authType: credential.auth_type,
    });

    // Get access token (handles both OAuth and Service Principal)
    const tokenResult = await getAccessToken(credential, prisma);
    if (!tokenResult.success) {
      return error(tokenResult.error, 400);
    }

    logger.info('Token obtained', { tokenLength: tokenResult.token.length });

    // Ensure subscription_id is present
    if (!credential.subscription_id) {
      return error('Azure credential is missing subscription_id', 400);
    }

    // Build and execute cost query
    const requestBody = buildCostQueryRequest(startDate, endDate, granularity ?? 'DAILY');
    const costResult = await queryCostManagementApi(
      credential.subscription_id,
      tokenResult.token,
      requestBody
    );

    if (!costResult.success) {
      return error(costResult.error, costResult.status || 500);
    }

    const { rows, columns } = costResult;

    logger.info('Cost data retrieved', {
      rowCount: rows.length,
      columns: columns.map((c) => c.name),
    });

    // Map column indices
    const columnIndices = { cost: 0, date: 1, service: 2, currency: 3 };
    columns.forEach((col, idx) => {
      const name = (col.name || '').toLowerCase();
      if (name === 'cost' || name === 'totalcost' || name === 'precost') {
        columnIndices.cost = idx;
      } else if (name === 'usagedate' || name === 'billingperiod' || name.includes('date')) {
        columnIndices.date = idx;
      } else if (name === 'servicename' || name === 'service') {
        columnIndices.service = idx;
      } else if (name === 'currency') {
        columnIndices.currency = idx;
      }
    });

    // Transform rows to cost data
    const costs = rows.map((row) => ({
      date: parseAzureDate(row[columnIndices.date], startDate),
      service: String(row[columnIndices.service] || 'Unknown'),
      cost: parseFloat(String(row[columnIndices.cost])) || 0,
      currency: String(row[columnIndices.currency] || 'BRL'),
    }));

    // Store costs in database using batch transaction
    let savedCount = 0;
    let skippedCount = 0;

    // Batch upsert: findFirst + create/update in a single transaction
    const BATCH_SIZE = 50;
    for (let i = 0; i < costs.length; i += BATCH_SIZE) {
      const batch = costs.slice(i, i + BATCH_SIZE);
      try {
        await prisma.$transaction(async (tx) => {
          for (const cost of batch) {
            const existing = await tx.dailyCost.findFirst({
              where: {
                organization_id: organizationId,
                azure_credential_id: credentialId,
                cloud_provider: 'AZURE',
                date: new Date(cost.date),
                service: cost.service,
              },
              select: { id: true },
            });

            if (existing) {
              await tx.dailyCost.update({
                where: { id: existing.id },
                data: {
                  cost: cost.cost,
                  currency: cost.currency,
                },
              });
            } else {
              await tx.dailyCost.create({
                data: {
                  organization_id: organizationId,
                  cloud_provider: 'AZURE',
                  azure_credential_id: credentialId,
                  date: new Date(cost.date),
                  service: cost.service,
                  cost: cost.cost,
                  currency: cost.currency,
                },
              });
            }
            savedCount++;
          }
        });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.warn('Failed to save cost batch', { 
          error: errorMessage,
          batchStart: i,
          batchSize: batch.length,
        });
        skippedCount += batch.length;
      }
    }

    logger.info('Azure costs saved', {
      organizationId,
      credentialId,
      savedCount,
      skippedCount,
    });

    // Calculate totals
    const totalCost = costs.reduce((sum, c) => sum + c.cost, 0);
    const byService = costs.reduce<Record<string, number>>((acc, c) => {
      acc[c.service] = (acc[c.service] || 0) + c.cost;
      return acc;
    }, {});

    return success({
      subscriptionId: credential.subscription_id,
      subscriptionName: credential.subscription_name,
      period: {
        startDate,
        endDate,
        granularity,
      },
      summary: {
        totalCost,
        currency: costs[0]?.currency || 'BRL',
        recordCount: costs.length,
        savedCount,
        skippedCount,
      },
      byService,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to fetch Azure costs';
    const errorStack = err instanceof Error ? err.stack?.split('\n').slice(0, 3).join('\n') : undefined;
    logger.error('Error fetching Azure costs', { 
      error: errorMessage,
      stack: errorStack,
    });
    return error(errorMessage, 500);
  }
}
