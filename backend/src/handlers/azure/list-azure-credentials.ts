/**
 * List Azure Credentials Handler
 * 
 * Lists all Azure credentials for the current organization.
 * Does NOT expose client_secret for security.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
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
    const organizationId = getOrganizationId(user);
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
        tenant_id: true,
        client_id: true,
        // client_secret is NOT selected for security
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
    const transformedCredentials = credentials.map((cred: {
      id: string;
      subscription_id: string;
      subscription_name: string | null;
      tenant_id: string;
      client_id: string;
      regions: string[];
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
    }) => ({
      id: cred.id,
      subscriptionId: cred.subscription_id,
      subscriptionName: cred.subscription_name,
      tenantId: cred.tenant_id,
      clientId: cred.client_id,
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
    return error(err.message || 'Failed to list Azure credentials', 500);
  }
}
