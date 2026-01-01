"use strict";
/**
 * Scheduled License Sync - EventBridge triggered daily sync
 * Runs daily to sync all organization licenses from external API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const logging_js_1 = require("../../lib/logging.js");
const database_js_1 = require("../../lib/database.js");
const license_service_js_1 = require("../../lib/license-service.js");
async function handler(event) {
    logging_js_1.logger.info('🔄 Scheduled license sync started', {
        time: event.time,
        source: event.source,
    });
    const prisma = (0, database_js_1.getPrismaClient)();
    const startTime = Date.now();
    try {
        // Sync all organizations
        const results = await (0, license_service_js_1.syncAllOrganizationLicenses)();
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;
        const totalLicensesSynced = results.reduce((sum, r) => sum + r.licensesSynced, 0);
        const allErrors = results.flatMap(r => r.errors);
        const report = {
            date: new Date().toISOString().split('T')[0],
            total_organizations: results.length,
            successful: successCount,
            failed: failCount,
            total_licenses_synced: totalLicensesSynced,
            errors: allErrors.slice(0, 20), // Limit errors in report
        };
        // Log summary
        logging_js_1.logger.info('✅ Scheduled license sync completed', {
            ...report,
            duration_ms: Date.now() - startTime,
        });
        // Create system event for audit
        await prisma.systemEvent.create({
            data: {
                event_type: 'LICENSE_SYNC_COMPLETED',
                payload: report,
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
                        },
                    },
                });
            }
        }
        // Check for expiring licenses and send alerts
        await checkExpiringLicenses();
        return report;
    }
    catch (err) {
        logging_js_1.logger.error('❌ Scheduled license sync failed:', err);
        // Log error event
        await prisma.systemEvent.create({
            data: {
                event_type: 'LICENSE_SYNC_FAILED',
                payload: {
                    error: err instanceof Error ? err.message : String(err),
                    timestamp: new Date().toISOString(),
                },
                processed: false,
            },
        });
        throw err;
    }
}
/**
 * Check for licenses expiring soon and create alerts
 */
async function checkExpiringLicenses() {
    const prisma = (0, database_js_1.getPrismaClient)();
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
        const daysRemaining = Math.ceil((license.valid_until.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        // Determine severity based on days remaining
        let severity;
        if (daysRemaining <= 7) {
            severity = 'CRITICAL';
        }
        else if (daysRemaining <= 14) {
            severity = 'HIGH';
        }
        else {
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
                    },
                },
            });
            logging_js_1.logger.info(`Created expiration alert for org ${license.organization_id}, ${daysRemaining} days remaining`);
        }
    }
}
//# sourceMappingURL=scheduled-license-sync.js.map