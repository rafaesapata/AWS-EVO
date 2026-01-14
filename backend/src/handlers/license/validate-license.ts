/**
 * Validate License - Check organization's license status
 * Returns cached license data from database (synced daily from external API)
 * Auto-assigns seats to users on first validation if seats are available
 * Also handles initial configuration when customer_id is provided in body
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation, isAdmin } from '../../lib/auth.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import { getLicenseSummary, hasValidLicense, assignSeat, syncOrganizationLicenses } from '../../lib/license-service.js';
import { getPrismaClient } from '../../lib/database.js';

interface ValidateLicenseBody {
  customer_id?: string;
}

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const userId = user.sub;

    logger.info(`License validation for org ${organizationId}, user ${userId}`);

    const prisma = getPrismaClient();

    // Check if customer_id is being configured
    const body: ValidateLicenseBody = event.body ? JSON.parse(event.body) : {};
    
    logger.info(`Request body: ${JSON.stringify(body)}, has customer_id: ${!!body.customer_id}`);
    
    if (body.customer_id) {
      // Only admins can configure license
      if (!isAdmin(user)) {
        return error('Only administrators can configure license settings', 403, undefined, origin);
      }

      // Validate customer_id format (UUID)
      const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
      if (!uuidRegex.test(body.customer_id)) {
        return error('Invalid customer_id format. Must be a valid UUID.', 400, undefined, origin);
      }

      logger.info(`Configuring license for org ${organizationId} with customer_id ${body.customer_id}`);

      // Upsert config
      await prisma.organizationLicenseConfig.upsert({
        where: { organization_id: organizationId },
        create: {
          organization_id: organizationId,
          customer_id: body.customer_id,
          auto_sync: true,
          sync_status: 'pending',
        },
        update: {
          customer_id: body.customer_id,
          auto_sync: true,
          sync_status: 'pending',
          sync_error: null,
        },
      });

      // Trigger sync with external license API
      const syncResult = await syncOrganizationLicenses(organizationId);
      
      if (!syncResult.success) {
        logger.error(`License sync failed: ${syncResult.errors.join(', ')}`);
        return error('Failed to validate license with external system', 400, undefined, origin);
      }

      logger.info(`License sync successful: ${syncResult.licensesSynced} licenses synced`);
    }

    // Get license summary (from database, synced daily)
    const summary = await getLicenseSummary(organizationId);
    
    logger.info(`License summary for org ${organizationId}: hasLicense=${summary.hasLicense}, customerId=${summary.customerId}, licenses=${summary.licenses?.length || 0}`);

    if (!summary.hasLicense) {
      // Check if there's a config but no licenses synced yet
      const config = await prisma.organizationLicenseConfig.findUnique({
        where: { organization_id: organizationId },
      });
      
      logger.info(`License config for org ${organizationId}: ${config ? `customer_id=${config.customer_id}, sync_status=${config.sync_status}` : 'not found'}`);
      
      // If config exists but no licenses, it means sync failed or is pending
      if (config?.customer_id) {
        return success({
          valid: false,
          reason: 'License sync pending or failed',
          configured: true,
          customer_id: config.customer_id,
          sync_status: config.sync_status,
          sync_error: config.sync_error,
          message: config.sync_status === 'error' 
            ? 'License sync failed. Please try again.' 
            : 'License sync in progress. Please wait.',
          licenses: [],
          total_licenses: 0,
        }, 200, origin);
      }
      
      return success({
        valid: false,
        reason: 'No license configured',
        configured: false,
        message: 'Please configure your license by setting your customer_id',
        licenses: [],
        total_licenses: 0,
      }, 200, origin);
    }

    // Check if current user has a seat assigned (only for EVO licenses)
    let userSeat = await prisma.licenseSeatAssignment.findFirst({
      where: {
        user_id: userId,
        license: {
          organization_id: organizationId,
          is_active: true,
          product_type: {
            contains: 'evo',
            mode: 'insensitive'
          }
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

    logger.info(`User ${userId} seat check: has_seat=${!!userSeat}`);

    // AUTO-ASSIGNMENT: If user doesn't have a seat, try to assign one automatically
    if (!userSeat) {
      logger.info(`Attempting auto-assign for user ${userId}`);
      
      // Find an active EVO license with available seats
      const availableLicense = await prisma.license.findFirst({
        where: {
          organization_id: organizationId,
          is_active: true,
          is_expired: false,
          product_type: {
            contains: 'evo',
            mode: 'insensitive'
          }
        },
        include: {
          seat_assignments: true,
        },
        orderBy: [
          { is_trial: 'asc' }, // Prefer non-trial licenses
          { valid_until: 'desc' }, // Prefer licenses with longer validity
        ],
      });

      if (availableLicense) {
        const usedSeats = availableLicense.seat_assignments.length;
        const availableSeats = availableLicense.max_users - usedSeats;

        logger.info(`Found license ${availableLicense.id}: max_users=${availableLicense.max_users}, used=${usedSeats}, available=${availableSeats}`);

        if (availableSeats > 0) {
          logger.info(`Auto-assigning seat to user ${userId} on license ${availableLicense.id}`);
          
          const assignResult = await assignSeat(availableLicense.id, userId, undefined);
          
          if (assignResult.success) {
            logger.info(`Seat auto-assigned successfully to user ${userId}`);
            
            // Fetch the newly created seat assignment
            userSeat = await prisma.licenseSeatAssignment.findFirst({
              where: {
                user_id: userId,
                license_id: availableLicense.id,
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
          } else {
            logger.warn(`Failed to auto-assign seat: ${assignResult.error}`);
          }
        } else {
          logger.warn(`No available seats for user ${userId} in org ${organizationId}`);
        }
      }
    }

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

      // For frontend compatibility - transform to expected format
      total_licenses: summary.licenses.length,
      licenses: summary.licenses.map((l: any) => ({
        license_key: l.licenseKey,
        product_type: l.productType,
        status: l.isExpired ? 'expired' : 'active',
        total_seats: l.totalSeats,
        used_seats: l.usedSeats,
        available_seats: l.availableSeats,
        valid_from: l.validFrom,
        valid_until: l.validUntil,
        is_expired: l.isExpired,
        has_available_seats: l.availableSeats > 0,
        is_trial: l.isTrial,
        days_remaining: l.daysRemaining,
      })),
      all_licenses: summary.licenses,
      alerts,

      status: !hasValid ? 'invalid' :
              primaryLicense?.isExpired ? 'expired' :
              (primaryLicense?.daysRemaining || 0) <= 7 ? 'expiring_soon' :
              !userHasSeat ? 'no_seat' : 'active',
    }, 200, origin);

  } catch (err) {
    logger.error('Validate license error:', err);
    // Don't expose internal error details to frontend
    return error('License validation failed. Please try again.', 500, undefined, origin);
  }
}
