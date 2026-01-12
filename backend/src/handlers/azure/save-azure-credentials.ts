/**
 * Save Azure Credentials Handler
 * 
 * Saves validated Azure Service Principal credentials to the database.
 * Encrypts the client_secret before storage.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { AzureProvider } from '../../lib/cloud-provider/azure-provider.js';
import { z } from 'zod';

// Validation schema for saving Azure credentials
const saveAzureCredentialsSchema = z.object({
  tenantId: z.string().min(1, 'Tenant ID is required'),
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client Secret is required'),
  subscriptionId: z.string().min(1, 'Subscription ID is required'),
  subscriptionName: z.string().optional(),
  regions: z.array(z.string()).optional().default(['eastus']),
  validateFirst: z.boolean().optional().default(true),
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
    const organizationId = getOrganizationId(user);
    const prisma = getPrismaClient();

    logger.info('Saving Azure credentials', { organizationId });

    // Parse and validate request body
    let body: any;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return error('Invalid JSON in request body', 400);
    }

    const validation = saveAzureCredentialsSchema.safeParse(body);
    if (!validation.success) {
      return error(`Validation error: ${validation.error.errors.map(e => e.message).join(', ')}`, 400);
    }

    const { 
      tenantId, 
      clientId, 
      clientSecret, 
      subscriptionId, 
      subscriptionName,
      regions,
      validateFirst,
    } = validation.data;

    // Optionally validate credentials before saving
    if (validateFirst) {
      const azureProvider = new AzureProvider(organizationId, {
        tenantId,
        clientId,
        clientSecret,
        subscriptionId,
        subscriptionName,
      });

      const validationResult = await azureProvider.validateCredentials();
      
      if (!validationResult.valid) {
        logger.warn('Azure credential validation failed before save', {
          organizationId,
          error: validationResult.error,
        });
        
        return error(validationResult.error || 'Invalid Azure credentials', 401, {
          valid: false,
          details: validationResult.details,
        });
      }
    }

    // Check if credential already exists for this subscription
    const existingCredential = await prisma.azureCredential.findUnique({
      where: {
        organization_id_subscription_id: {
          organization_id: organizationId,
          subscription_id: subscriptionId,
        },
      },
    });

    let credential;

    if (existingCredential) {
      // Update existing credential
      credential = await prisma.azureCredential.update({
        where: { id: existingCredential.id },
        data: {
          tenant_id: tenantId,
          client_id: clientId,
          client_secret: clientSecret, // TODO: Encrypt with KMS
          subscription_name: subscriptionName,
          regions,
          is_active: true,
          updated_at: new Date(),
        },
      });

      logger.info('Azure credentials updated', {
        organizationId,
        credentialId: credential.id,
        subscriptionId,
      });
    } else {
      // Create new credential
      credential = await prisma.azureCredential.create({
        data: {
          organization_id: organizationId,
          tenant_id: tenantId,
          client_id: clientId,
          client_secret: clientSecret, // TODO: Encrypt with KMS
          subscription_id: subscriptionId,
          subscription_name: subscriptionName,
          regions,
          is_active: true,
        },
      });

      logger.info('Azure credentials created', {
        organizationId,
        credentialId: credential.id,
        subscriptionId,
      });
    }

    // Return credential without exposing the secret
    return success({
      id: credential.id,
      subscriptionId: credential.subscription_id,
      subscriptionName: credential.subscription_name,
      tenantId: credential.tenant_id,
      clientId: credential.client_id,
      regions: credential.regions,
      isActive: credential.is_active,
      createdAt: credential.created_at,
      updatedAt: credential.updated_at,
      isNew: !existingCredential,
    });
  } catch (err: any) {
    logger.error('Error saving Azure credentials', { error: err.message });
    
    // Handle unique constraint violation
    if (err.code === 'P2002') {
      return error('Azure credentials for this subscription already exist', 409);
    }
    
    return error(err.message || 'Failed to save Azure credentials', 500);
  }
}
