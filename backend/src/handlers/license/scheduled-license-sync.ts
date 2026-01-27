/**
 * Scheduled License Sync - EventBridge triggered daily sync
 * Runs daily to sync all organization licenses from external API
 */

import type { ScheduledEvent } from 'aws-lambda';
import { logger } from '../../lib/logging.js';
import { getPrismaClient } from '../../lib/database.js';
import { syncAllOrganizationLicenses } from '../../lib/license-service.js';

interface SyncReport {
  date: string;
  total_organizations: number;
  successful: number;
  failed: number;
  total_licenses_synced: number;
  errors: string[];
}

export async function handler(event: ScheduledEvent): Promise<SyncReport> {
  logger.info('🔄 Scheduled license sync started', {
    time: event.time,
    source: event.source,
  });

  const prisma = getPrismaClient();
  const startTime = Date.now();

  try {
    // Sync all organizations
    const results = await syncAllOrganizationLicenses();

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const totalLicensesSynced = results.reduce((sum, r) => sum + r.licensesSynced, 0);
    const allErrors = results.flatMap(r => r.errors);

    const report: SyncReport = {
      date: new Date().toISOString().split('T')[0],
      total_organizations: results.length,
      successful: successCount,
      failed: failCount,
      total_licenses_synced: totalLicensesSynced,
      errors: allErrors.slice(0, 20), // Limit errors in report
    };

    // Log summary
    logger.info('✅ Scheduled license sync completed', {
      ...report,
      duration_ms: Date.now() - startTime,
    });

    // Create system event for audit
    await prisma.systemEvent.create({
      data: {
        event_type: 'LICENSE_SYNC_COMPLETED',
        payload: report as any,
        processed: true,
        processed_at: new Date(),
      },
    });

    // Send alerts for failed syncs
    if (failCount > 0) {
      const failedOrgs = results.filter(r => !r.success);
      
      for (const failed of failedOrgs) {
        await prisma.alert.create({
          data: {
            organization_id: failed.organizationId,
            severity: 'HIGH',
            title: 'License Sync Failed',
            message: `Failed to sync licenses: ${failed.errors.join('; ')}`,
            metadata: {
              customer_id: failed.customerId,
              errors: failed.errors,
            } as any,
          },
        });
      }
    }

    // Check for expiring licenses and send alerts
    await checkExpiringLicenses();

    // Clean up orphan seat assignments
    await cleanupOrphanSeatAssignments();

    return report;

  } catch (err) {
    logger.error('❌ Scheduled license sync failed:', err);

    // Log error event
    await prisma.systemEvent.create({
      data: {
        event_type: 'LICENSE_SYNC_FAILED',
        payload: {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        } as any,
        processed: false,
      },
    });

    throw err;
  }
}

/**
 * Check for licenses expiring soon and create alerts
 */
async function checkExpiringLicenses(): Promise<void> {
  const prisma = getPrismaClient();

  // Find licenses expiring in next 30 days
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const expiringLicenses = await prisma.license.findMany({
    where: {
      is_active: true,
      is_expired: false,
      valid_until: {
        lte: thirtyDaysFromNow,
        gt: new Date(),
      },
    },
    include: {
      organization: {
        select: { name: true },
      },
    },
  });

  for (const license of expiringLicenses) {
    const daysRemaining = Math.ceil(
      (license.valid_until.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    // Determine severity based on days remaining
    let severity: string;
    if (daysRemaining <= 7) {
      severity = 'CRITICAL';
    } else if (daysRemaining <= 14) {
      severity = 'HIGH';
    } else {
      severity = 'MEDIUM';
    }

    // Check if alert already exists for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingAlert = await prisma.alert.findFirst({
      where: {
        organization_id: license.organization_id,
        title: { contains: 'License Expiring' },
        triggered_at: { gte: today },
      },
    });

    if (!existingAlert) {
      await prisma.alert.create({
        data: {
          organization_id: license.organization_id,
          severity,
          title: `License Expiring in ${daysRemaining} days`,
          message: `Your ${license.product_type || license.plan_type} license (${license.license_key}) will expire on ${license.valid_until.toISOString().split('T')[0]}. Please renew to avoid service interruption.`,
          metadata: {
            license_id: license.id,
            license_key: license.license_key,
            product_type: license.product_type,
            valid_until: license.valid_until.toISOString(),
            days_remaining: daysRemaining,
          } as any,
        },
      });

      logger.info(`Created expiration alert for org ${license.organization_id}, ${daysRemaining} days remaining`);
    }
  }
}


/**
 * Clean up orphan seat assignments
 * Removes seat assignments where:
 * 1. User doesn't have a profile in the license's organization
 * 2. Updates license seat counts to reflect actual assignments
 */
async function cleanupOrphanSeatAssignments(): Promise<void> {
  const prisma = getPrismaClient();

  logger.info('Starting orphan seat assignment cleanup');

  // Get all licenses with their seat assignments
  const licenses = await prisma.license.findMany({
    where: { is_active: true },
    include: {
      seat_assignments: true,
    },
  });

  let totalOrphansRemoved = 0;
  let licensesUpdated = 0;

  for (const license of licenses) {
    // Get all profiles for this organization
    const orgProfiles = await prisma.profile.findMany({
      where: { organization_id: license.organization_id },
      select: { user_id: true },
    });

    const validUserIds = new Set(orgProfiles.map(p => p.user_id));

    // Find orphan seat assignments (user not in organization)
    const orphanSeats = license.seat_assignments.filter(
      (seat: any) => !validUserIds.has(seat.user_id)
    );

    if (orphanSeats.length > 0) {
      logger.warn(`Found ${orphanSeats.length} orphan seats for license ${license.id}`, {
        licenseKey: license.license_key,
        organizationId: license.organization_id,
        orphanUserIds: orphanSeats.map((s: any) => s.user_id),
      });

      // Delete orphan seat assignments
      await prisma.licenseSeatAssignment.deleteMany({
        where: {
          id: { in: orphanSeats.map((s: any) => s.id) },
        },
      });

      totalOrphansRemoved += orphanSeats.length;
    }

    // Recalculate and update seat counts
    const actualSeatCount = license.seat_assignments.length - orphanSeats.length;
    const expectedUsedSeats = actualSeatCount;
    const expectedAvailableSeats = license.max_users - actualSeatCount;

    if (license.used_seats !== expectedUsedSeats || license.available_seats !== expectedAvailableSeats) {
      await prisma.license.update({
        where: { id: license.id },
        data: {
          used_seats: expectedUsedSeats,
          available_seats: expectedAvailableSeats,
        },
      });

      licensesUpdated++;
      logger.info(`Updated seat counts for license ${license.id}`, {
        licenseKey: license.license_key,
        oldUsedSeats: license.used_seats,
        newUsedSeats: expectedUsedSeats,
        oldAvailableSeats: license.available_seats,
        newAvailableSeats: expectedAvailableSeats,
      });
    }
  }

  logger.info('Orphan seat assignment cleanup completed', {
    totalOrphansRemoved,
    licensesUpdated,
    totalLicensesChecked: licenses.length,
  });

  // Create system event for audit
  if (totalOrphansRemoved > 0 || licensesUpdated > 0) {
    await prisma.systemEvent.create({
      data: {
        event_type: 'ORPHAN_SEATS_CLEANUP',
        payload: {
          orphans_removed: totalOrphansRemoved,
          licenses_updated: licensesUpdated,
          timestamp: new Date().toISOString(),
        } as any,
        processed: true,
        processed_at: new Date(),
      },
    });
  }
}
