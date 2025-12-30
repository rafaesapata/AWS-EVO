/**
 * Validate License - Check organization's license status
 * Returns cached license data from database (synced daily from external API)
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import { getLicenseSummary, hasValidLicense } from '../../lib/license-service.js';
import { getPrismaClient } from '../../lib/database.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    const userId = user.sub;

    logger.info(`License validation for org ${organizationId}`);

    const prisma = getPrismaClient();

    // Get license summary (from database, synced daily)
    const summary = await getLicenseSummary(organizationId);

    if (!summary.hasLicense) {
      return success({
        valid: false,
        reason: 'No license configured',
        configured: false,
        message: 'Please configure your license by setting your customer_id',
      }, 200, origin);
    }

    // Check if current user has a seat assigned
    const userSeat = await prisma.licenseSeatAssignment.findFirst({
      where: {
        user_id: userId,
        license: {
          organization_id: organizationId,
          is_active: true,
        },
      },
      include: {
        license: {
          select: {
            id: true,
            license_key: true,
            product_type: true,
            features: true,
          },
        },
      },
    });

    // Get usage stats
    const accountsCount = await prisma.awsAccount.count({
      where: { organization_id: organizationId },
    });

    const usersCount = await prisma.profile.count({
      where: { organization_id: organizationId },
    });

    // Find the primary active license
    const primaryLicense = summary.licenses.find((l: any) => !l.isExpired) || summary.licenses[0];

    // Generate alerts
    const alerts = [];

    if (primaryLicense) {
      if (primaryLicense.daysRemaining !== null && primaryLicense.daysRemaining <= 30 && primaryLicense.daysRemaining > 0) {
        alerts.push({
          type: primaryLicense.daysRemaining <= 7 ? 'critical' : 'warning',
          message: `License expires in ${primaryLicense.daysRemaining} days`,
        });
      }

      if (primaryLicense.isExpired) {
        alerts.push({
          type: 'error',
          message: 'License has expired',
        });
      }

      if (primaryLicense.availableSeats <= 0) {
        alerts.push({
          type: 'warning',
          message: 'No available seats. Some users may not have access.',
        });
      }
    }

    // Determine overall validity
    const hasValid = await hasValidLicense(organizationId);
    const userHasSeat = !!userSeat;

    return success({
      valid: hasValid && userHasSeat,
      configured: true,
      customer_id: summary.customerId,
      last_sync: summary.lastSync,
      sync_status: summary.syncStatus,
      
      user_access: {
        has_seat: userHasSeat,
        seat_license: userSeat ? {
          license_key: userSeat.license.license_key,
          product_type: userSeat.license.product_type,
          features: userSeat.license.features,
        } : null,
      },

      license: primaryLicense ? {
        plan_type: primaryLicense.planType,
        product_type: primaryLicense.productType,
        valid_from: primaryLicense.validFrom,
        valid_until: primaryLicense.validUntil,
        days_remaining: primaryLicense.daysRemaining,
        is_expired: primaryLicense.isExpired,
        is_trial: primaryLicense.isTrial,
        features: primaryLicense.features,
      } : null,

      seats: primaryLicense ? {
        total: primaryLicense.totalSeats,
        used: primaryLicense.usedSeats,
        available: primaryLicense.availableSeats,
        percentage: Math.round((primaryLicense.usedSeats / primaryLicense.totalSeats) * 100),
      } : null,

      usage: {
        accounts: {
          current: accountsCount,
          limit: 100, // Default limit
        },
        users: {
          current: usersCount,
          limit: primaryLicense?.totalSeats || 0,
        },
      },

      all_licenses: summary.licenses,
      alerts,

      status: !hasValid ? 'invalid' :
              primaryLicense?.isExpired ? 'expired' :
              (primaryLicense?.daysRemaining || 0) <= 7 ? 'expiring_soon' :
              !userHasSeat ? 'no_seat' : 'active',
    }, 200, origin);

  } catch (err) {
    logger.error('Validate license error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
  }
}
