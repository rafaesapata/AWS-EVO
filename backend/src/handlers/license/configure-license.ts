/**
 * Configure License - Set customer_id for organization
 * Allows organization admin to configure their license customer ID
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, badRequest, corsOptions, forbidden } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation, isAdmin } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import { syncOrganizationLicenses } from '../../lib/license-service.js';

interface ConfigureLicenseRequest {
  customer_id: string;
  auto_sync?: boolean;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const method = getHttpMethod(event);

  if (method === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);

    // Only admins can configure license
    if (!isAdmin(user)) {
      return forbidden('Only administrators can configure license settings', origin);
    }

    const prisma = getPrismaClient();

    // GET - Return current config
    if (method === 'GET') {
      const config = await prisma.organizationLicenseConfig.findUnique({
        where: { organization_id: organizationId },
      });

      return success({
        configured: !!config,
        customer_id: config?.customer_id,
        auto_sync: config?.auto_sync ?? true,
        last_sync_at: config?.last_sync_at,
        sync_status: config?.sync_status,
        sync_error: config?.sync_error,
      }, 200, origin);
    }

    // POST/PUT - Configure customer_id
    const body: ConfigureLicenseRequest = event.body ? JSON.parse(event.body) : {};

    if (!body.customer_id) {
      return badRequest('customer_id is required', undefined, origin);
    }

    // Validate customer_id format (UUID)
    const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    if (!uuidRegex.test(body.customer_id)) {
      return badRequest('Invalid customer_id format. Must be a valid UUID.', undefined, origin);
    }

    // Upsert config
    const config = await prisma.organizationLicenseConfig.upsert({
      where: { organization_id: organizationId },
      create: {
        organization_id: organizationId,
        customer_id: body.customer_id,
        auto_sync: body.auto_sync ?? true,
        sync_status: 'pending',
      },
      update: {
        customer_id: body.customer_id,
        auto_sync: body.auto_sync ?? true,
        sync_status: 'pending',
        sync_error: null,
      },
    });

    logger.info(`License config updated for org ${organizationId}, customer_id: ${body.customer_id}`);

    // Trigger initial sync
    const syncResult = await syncOrganizationLicenses(organizationId);

    return success({
      message: 'License configuration saved',
      customer_id: config.customer_id,
      auto_sync: config.auto_sync,
      sync_result: {
        success: syncResult.success,
        licenses_found: syncResult.licensesFound,
        licenses_synced: syncResult.licensesSynced,
        errors: syncResult.errors,
      },
    }, 200, origin);

  } catch (err) {
    logger.error('Configure license error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
  }
}
