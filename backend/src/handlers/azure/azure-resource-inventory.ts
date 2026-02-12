/**
 * Azure Resource Inventory Handler
 * 
 * Discovers and stores Azure resources in the inventory.
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
import { AzureProvider } from '../../lib/cloud-provider/azure-provider.js';
import { validateServicePrincipalCredentials, ONE_HOUR_MS } from '../../lib/azure-helpers.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

// Validation schema
const azureResourceInventorySchema = z.object({
  credentialId: z.string().uuid('Invalid credential ID'),
  resourceTypes: z.array(z.string()).optional(),
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

    logger.info('Discovering Azure resources', { organizationId });

    // Parse and validate request body
    const validation = parseAndValidateBody(azureResourceInventorySchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const { credentialId, resourceTypes } = validation.data;

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
      const { getAzureCredentialWithToken } = await import('../../lib/azure-helpers.js');
      const tokenResult = await getAzureCredentialWithToken(prisma, credentialId, organizationId);
      
      if (!tokenResult.success) {
        return error(tokenResult.error, 400);
      }
      
      azureProvider = AzureProvider.withOAuthToken(
        organizationId,
        credential.subscription_id,
        credential.subscription_name || undefined,
        credential.oauth_tenant_id || credential.tenant_id || '',
        tokenResult.accessToken,
        new Date(Date.now() + ONE_HOUR_MS)
      );
    } else {
      const spValidation = validateServicePrincipalCredentials(credential);
      if (!spValidation.valid) {
        return error(spValidation.error, 400);
      }
      azureProvider = new AzureProvider(organizationId, spValidation.credentials);
    }

    const resources = await azureProvider.listResources(resourceTypes);

    logger.info('Azure resources discovered', {
      organizationId,
      credentialId,
      subscriptionId: credential.subscription_id,
      resourceCount: resources.length,
    });

    // Store resources in inventory
    let savedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const resource of resources) {
      try {
        // Upsert resource
        const existing = await prisma.resourceInventory.findFirst({
          where: {
            organization_id: organizationId,
            azure_credential_id: credentialId,
            resource_id: resource.id,
            region: resource.region,
          },
        });

        if (existing) {
          await prisma.resourceInventory.update({
            where: { id: existing.id },
            data: {
              resource_name: resource.name,
              resource_type: resource.type,
              cloud_provider: 'AZURE',
              azure_credential_id: credentialId,
              metadata: {
                ...resource.metadata,
                tags: resource.tags,
              },
              updated_at: new Date(),
            },
          });
          updatedCount++;
        } else {
          await prisma.resourceInventory.create({
            data: {
              organization_id: organizationId,
              cloud_provider: 'AZURE',
              azure_credential_id: credentialId,
              resource_id: resource.id,
              resource_name: resource.name,
              resource_type: resource.type,
              region: resource.region,
              metadata: {
                ...resource.metadata,
                tags: resource.tags,
              },
            },
          });
          savedCount++;
        }
      } catch (err: any) {
        logger.warn('Failed to save resource', {
          error: err.message,
          resourceId: resource.id,
          resourceType: resource.type,
        });
        errorCount++;
      }
    }

    logger.info('Azure resources saved to inventory', {
      organizationId,
      credentialId,
      savedCount,
      updatedCount,
      errorCount,
    });

    // Group resources by type
    const byType = resources.reduce((acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Group resources by region
    const byRegion = resources.reduce((acc, r) => {
      acc[r.region] = (acc[r.region] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return success({
      subscriptionId: credential.subscription_id,
      subscriptionName: credential.subscription_name,
      summary: {
        totalResources: resources.length,
        savedCount,
        updatedCount,
        errorCount,
      },
      byType,
      byRegion,
      resources: resources.map(r => ({
        id: r.id,
        name: r.name,
        type: r.type,
        region: r.region,
        tags: r.tags,
      })),
    });
  } catch (err: any) {
    logger.error('Error discovering Azure resources', { error: err.message });
    return error('Failed to discover Azure resources', 500);
  }
}
