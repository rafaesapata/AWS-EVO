/**
 * Azure Fetch Costs Handler
 * 
 * Fetches cost data from Azure Cost Management API and stores in database.
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
import { logger } from '../../lib/logging.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { AzureProvider } from '../../lib/cloud-provider/azure-provider.js';
import { validateServicePrincipalCredentials } from '../../lib/azure-helpers.js';
import type { CostQueryParams } from '../../types/cloud.js';
import { z } from 'zod';

// Validation schema
const azureFetchCostsSchema = z.object({
  credentialId: z.string().uuid('Invalid credential ID'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD'),
  granularity: z.enum(['DAILY', 'MONTHLY']).optional().default('DAILY'),
});

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
    let body: any;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return error('Invalid JSON in request body', 400);
    }

    const validation = azureFetchCostsSchema.safeParse(body);
    if (!validation.success) {
      return error(`Validation error: ${validation.error.errors.map(e => e.message).join(', ')}`, 400);
    }

    const { credentialId, startDate, endDate, granularity } = validation.data;

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

    // Handle both OAuth and Service Principal credentials
    let azureProvider: AzureProvider;
    
    if (credential.auth_type === 'oauth') {
      // Use getAzureCredentialWithToken for OAuth
      const { getAzureCredentialWithToken } = await import('../../lib/azure-helpers.js');
      const tokenResult = await getAzureCredentialWithToken(prisma, credentialId, organizationId);
      
      if (!tokenResult.success) {
        return error(tokenResult.error, 400);
      }
      
      // Create provider with OAuth token
      azureProvider = AzureProvider.withOAuthToken(
        organizationId,
        credential.subscription_id,
        credential.subscription_name || undefined,
        credential.oauth_tenant_id || credential.tenant_id || '',
        tokenResult.accessToken,
        new Date(Date.now() + 3600 * 1000) // 1 hour expiry
      );
    } else {
      // Validate Service Principal credentials
      const spValidation = validateServicePrincipalCredentials(credential);
      if (!spValidation.valid) {
        return error(spValidation.error, 400);
      }
      
      // Create Azure provider with Service Principal
      azureProvider = new AzureProvider(organizationId, spValidation.credentials);
    }

    const costParams: CostQueryParams = {
      startDate,
      endDate,
      granularity,
    };

    const costs = await azureProvider.getCosts(costParams);

    logger.info('Azure costs fetched', {
      organizationId,
      credentialId,
      subscriptionId: credential.subscription_id,
      costRecords: costs.length,
    });

    // Store costs in database
    let savedCount = 0;
    let skippedCount = 0;

    for (const cost of costs) {
      try {
        // Upsert cost record
        await prisma.dailyCost.upsert({
          where: {
            organization_id_aws_account_id_date_service: {
              organization_id: organizationId,
              aws_account_id: credentialId, // Reusing field for Azure credential ID
              date: new Date(cost.date),
              service: cost.service || 'Unknown',
            },
          },
          update: {
            cost: cost.cost,
            currency: cost.currency,
            cloud_provider: 'AZURE',
            azure_credential_id: credentialId,
          },
          create: {
            organization_id: organizationId,
            aws_account_id: credentialId,
            cloud_provider: 'AZURE',
            azure_credential_id: credentialId,
            date: new Date(cost.date),
            service: cost.service || 'Unknown',
            cost: cost.cost,
            currency: cost.currency,
          },
        });
        savedCount++;
      } catch (err: any) {
        logger.warn('Failed to save cost record', { 
          error: err.message,
          date: cost.date,
          service: cost.service,
        });
        skippedCount++;
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
    const byService = costs.reduce((acc, c) => {
      acc[c.service] = (acc[c.service] || 0) + c.cost;
      return acc;
    }, {} as Record<string, number>);

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
        currency: 'USD',
        recordCount: costs.length,
        savedCount,
        skippedCount,
      },
      byService,
    });
  } catch (err: any) {
    logger.error('Error fetching Azure costs', { error: err.message });
    return error(err.message || 'Failed to fetch Azure costs', 500);
  }
}
