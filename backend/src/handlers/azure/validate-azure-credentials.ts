/**
 * Azure Credential Validation Handler
 * 
 * Validates Azure Service Principal credentials by attempting to
 * authenticate and list resource groups.
 */

// Ensure crypto is available globally for Azure SDK
import * as crypto from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = crypto.webcrypto || crypto;
}

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { AzureProvider } from '../../lib/cloud-provider/azure-provider.js';
import { parseAndValidateBody } from '../../lib/validation.js';
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
    // Get user with lenient validation (exp claim optional for this endpoint)
    const claims = event.requestContext.authorizer?.claims || 
                   event.requestContext.authorizer?.jwt?.claims;

    if (!claims) {
      return error('No authentication claims found', 401);
    }

    // Validate only essential claims (sub, email, organization_id)
    if (!claims.sub || !claims.email) {
      return error('Missing required authentication claims', 401);
    }

    const user = claims;
    const organizationId = getOrganizationIdWithImpersonation(event, user);

    logger.info('Validating Azure credentials', { organizationId });

    // Parse and validate request body
    const validation = parseAndValidateBody(validateAzureCredentialsSchema, event.body);
    if (!validation.success) {
      return validation.error;
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
