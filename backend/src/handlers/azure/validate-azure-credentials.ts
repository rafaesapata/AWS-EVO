/**
 * Azure Credential Validation Handler
 * 
 * Validates Azure Service Principal credentials by attempting to
 * authenticate and list resource groups.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { AzureProvider } from '../../lib/cloud-provider/azure-provider.js';
import { z } from 'zod';

// Validation schema for Azure credentials
const validateAzureCredentialsSchema = z.object({
  tenantId: z.string().min(1, 'Tenant ID is required'),
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client Secret is required'),
  subscriptionId: z.string().min(1, 'Subscription ID is required'),
  subscriptionName: z.string().optional(),
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

    logger.info('Validating Azure credentials', { organizationId });

    // Parse and validate request body
    let body: any;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return error('Invalid JSON in request body', 400);
    }

    const validation = validateAzureCredentialsSchema.safeParse(body);
    if (!validation.success) {
      return error(`Validation error: ${validation.error.errors.map(e => e.message).join(', ')}`, 400);
    }

    const { tenantId, clientId, clientSecret, subscriptionId, subscriptionName } = validation.data;

    // Create Azure provider and validate credentials
    const azureProvider = new AzureProvider(organizationId, {
      tenantId,
      clientId,
      clientSecret,
      subscriptionId,
      subscriptionName,
    });

    const result = await azureProvider.validateCredentials();

    if (!result.valid) {
      logger.warn('Azure credential validation failed', { 
        organizationId, 
        error: result.error,
      });
      
      return error(result.error || 'Invalid Azure credentials', 401, {
        valid: false,
        details: result.details,
      });
    }

    logger.info('Azure credentials validated successfully', {
      organizationId,
      subscriptionId: result.accountId,
    });

    return success({
      valid: true,
      subscriptionId: result.accountId,
      subscriptionName: result.accountName,
      details: result.details,
    });
  } catch (err: any) {
    logger.error('Error validating Azure credentials', { error: err.message });
    return error(err.message || 'Failed to validate Azure credentials', 500);
  }
}
