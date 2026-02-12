/**
 * Admin Sync License - Super Admin can sync any organization's license
 * Allows super admin to manually trigger license sync for specific organizations
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logger.js';
import { success, error, badRequest, corsOptions, forbidden } from '../../lib/response.js';
import { getUserFromEvent, isSuperAdmin } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import { syncOrganizationLicenses, getLicenseSummary } from '../../lib/license-service.js';

interface AdminSyncRequest {
  organization_ids?: string[];
  customer_id?: string;  // Can sync by customer_id instead of organization_ids
  sync_all?: boolean;
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

    // Only super admins can use this endpoint
    if (!isSuperAdmin(user)) {
      return forbidden('Only super administrators can access this endpoint', origin);
    }

    const prisma = getPrismaClient();

    // GET - List all organizations with license configs
    if (method === 'GET') {
      const configs = await prisma.organizationLicenseConfig.findMany();

      // Get organization names
      const orgIds = configs.map((c: { organization_id: string }) => c.organization_id);
      const organizations = await prisma.organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, name: true, slug: true },
      });

      const orgMap = new Map(organizations.map(o => [o.id, o]));

      const result = configs.map((config: any) => ({
        organization_id: config.organization_id,
        organization_name: orgMap.get(config.organization_id)?.name || 'Unknown',
        organization_slug: orgMap.get(config.organization_id)?.slug || 'unknown',
        customer_id: config.customer_id,
        auto_sync: config.auto_sync,
        last_sync_at: config.last_sync_at,
        sync_status: config.sync_status,
        sync_error: config.sync_error,
      }));

      return success({
        total: result.length,
        organizations: result,
      }, 200, origin);
    }

    // POST - Sync specific organizations
    const body: AdminSyncRequest = event.body ? JSON.parse(event.body) : {};

    let organizationIds: string[] = [];

    if (body.sync_all) {
      // Get all organizations with license config
      const configs = await prisma.organizationLicenseConfig.findMany({
        select: { organization_id: true },
      });
      organizationIds = configs.map((c: { organization_id: string }) => c.organization_id);
    } else if (body.customer_id) {
      // Find organizations by customer_id
      const configs = await prisma.organizationLicenseConfig.findMany({
        where: { customer_id: body.customer_id },
        select: { organization_id: true },
      });
      
      if (configs.length === 0) {
        return badRequest(`No organizations found with customer_id: ${body.customer_id}`, undefined, origin);
      }
      
      organizationIds = configs.map((c: { organization_id: string }) => c.organization_id);
      logger.info(`Found ${organizationIds.length} organizations for customer_id: ${body.customer_id}`);
    } else if (body.organization_ids && body.organization_ids.length > 0) {
      organizationIds = body.organization_ids;
    } else {
      return badRequest('Provide organization_ids array, customer_id, or set sync_all: true', undefined, origin);
    }

    logger.info(`Admin sync triggered for ${organizationIds.length} organizations`);

    const results = [];

    for (const orgId of organizationIds) {
      const syncResult = await syncOrganizationLicenses(orgId);
      const summary = await getLicenseSummary(orgId);

      // Get org name
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { name: true },
      });

      results.push({
        organization_id: orgId,
        organization_name: org?.name || 'Unknown',
        sync_success: syncResult.success,
        customer_id: syncResult.customerId,
        licenses_found: syncResult.licensesFound,
        licenses_synced: syncResult.licensesSynced,
        errors: syncResult.errors,
        current_licenses: summary.licenses.length,
      });

      // Small delay between syncs
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const successCount = results.filter(r => r.sync_success).length;
    const failCount = results.filter(r => !r.sync_success).length;

    return success({
      summary: {
        total_organizations: results.length,
        successful: successCount,
        failed: failCount,
      },
      results,
    }, 200, origin);

  } catch (err) {
    logger.error('Admin sync license error:', err);
    return error('An unexpected error occurred. Please try again.', 500, undefined, origin);
  }
}
