/**
 * Sync License - Manual license sync trigger
 * Allows admin to manually sync licenses from external API
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions, forbidden } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation, isAdmin } from '../../lib/auth.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import { syncOrganizationLicenses, getLicenseSummary } from '../../lib/license-service.js';

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

    // Only admins can trigger sync
    if (!isAdmin(user)) {
      return forbidden('Only administrators can sync licenses', origin);
    }

    logger.info(`Manual license sync triggered for org ${organizationId}`);

    // Sync licenses
    const syncResult = await syncOrganizationLicenses(organizationId);

    // Get updated summary
    const summary = await getLicenseSummary(organizationId);

    return success({
      sync_result: {
        success: syncResult.success,
        customer_id: syncResult.customerId,
        licenses_found: syncResult.licensesFound,
        licenses_synced: syncResult.licensesSynced,
        errors: syncResult.errors,
      },
      license_summary: summary,
    }, 200, origin);

  } catch (err) {
    logger.error('Sync license error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
  }
}
