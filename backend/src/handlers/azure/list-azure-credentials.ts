/**
 * List Azure Credentials Handler
 * 
 * Lists all Azure credentials for the current organization.
 * Does NOT expose client_secret or encrypted_refresh_token for security.
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

    logger.info('Listing Azure credentials', { organizationId });

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const activeOnly = queryParams.activeOnly !== 'false';

    // Build where clause
    const where: any = {
      organization_id: organizationId,
    };

    if (activeOnly) {
      where.is_active = true;
    }

    // Fetch credentials
    const credentials = await prisma.azureCredential.findMany({
      where,
      select: {
        id: true,
        subscription_id: true,
        subscription_name: true,
        auth_type: true,
        tenant_id: true,
        client_id: true,
        // client_secret is NOT selected for security
        // encrypted_refresh_token is NOT selected for security
        // certificate_pem is NOT selected for security
        certificate_thumbprint: true,
        certificate_expires_at: true,
        oauth_tenant_id: true,
        oauth_user_email: true,
        token_expires_at: true,
        last_refresh_at: true,
        refresh_error: true,
        regions: true,
        is_active: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    logger.info('Azure credentials listed', {
      organizationId,
      count: credentials.length,
    });

    // Transform to camelCase for frontend
    const transformedCredentials = credentials.map((cred) => ({
      id: cred.id,
      subscriptionId: cred.subscription_id,
      subscriptionName: cred.subscription_name,
      authType: cred.auth_type,
      // Service Principal fields
      tenantId: cred.tenant_id,
      clientId: cred.client_id,
      // Certificate fields
      certificateThumbprint: cred.certificate_thumbprint,
      certificateExpiresAt: cred.certificate_expires_at,
      // OAuth fields
      oauthTenantId: cred.oauth_tenant_id,
      oauthUserEmail: cred.oauth_user_email,
      tokenExpiresAt: cred.token_expires_at,
      lastRefreshAt: cred.last_refresh_at,
      refreshError: cred.refresh_error,
      // Common fields
      regions: cred.regions,
      isActive: cred.is_active,
      createdAt: cred.created_at,
      updatedAt: cred.updated_at,
      provider: 'AZURE',
    }));

    return success({
      data: transformedCredentials,
      total: transformedCredentials.length,
    });
  } catch (err: any) {
    logger.error('Error listing Azure credentials', { error: err.message });
    return error('Failed to list Azure credentials', 500);
  }
}
