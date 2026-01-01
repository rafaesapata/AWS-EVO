"use strict";
/**
 * License Service - External License Validation
 * Integrates with external license validation API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchExternalLicenses = fetchExternalLicenses;
exports.syncOrganizationLicenses = syncOrganizationLicenses;
exports.syncAllOrganizationLicenses = syncAllOrganizationLicenses;
exports.assignSeat = assignSeat;
exports.revokeSeat = revokeSeat;
exports.hasValidLicense = hasValidLicense;
exports.getLicenseSummary = getLicenseSummary;
const logging_js_1 = require("./logging.js");
const database_js_1 = require("./database.js");
// ============================================================================
// EXTERNAL API CLIENT
// ============================================================================
async function fetchExternalLicenses(customerId) {
    const apiUrl = process.env.LICENSE_API_URL;
    const apiKey = process.env.LICENSE_API_KEY;
    if (!apiUrl || !apiKey) {
        throw new Error('License API configuration missing (LICENSE_API_URL or LICENSE_API_KEY)');
    }
    logging_js_1.logger.info(`Fetching licenses for customer: ${customerId}`);
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
        },
        body: JSON.stringify({ customer_id: customerId }),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`License API error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    logging_js_1.logger.info(`License API response: valid=${data.valid}, licenses=${data.total_licenses}`);
    return data;
}
// ============================================================================
// SYNC FUNCTIONS
// ============================================================================
async function syncOrganizationLicenses(organizationId) {
    const prisma = (0, database_js_1.getPrismaClient)();
    const errors = [];
    let licensesSynced = 0;
    const config = await prisma.organizationLicenseConfig.findUnique({
        where: { organization_id: organizationId },
    });
    if (!config) {
        return {
            success: false,
            organizationId,
            customerId: '',
            licensesFound: 0,
            licensesSynced: 0,
            errors: ['Organization has no license configuration. Please set customer_id first.'],
        };
    }
    try {
        const externalData = await fetchExternalLicenses(config.customer_id);
        if (!externalData.valid) {
            await prisma.organizationLicenseConfig.update({
                where: { organization_id: organizationId },
                data: {
                    sync_status: 'error',
                    sync_error: externalData.error || 'Invalid license response',
                    last_sync_at: new Date(),
                },
            });
            return {
                success: false,
                organizationId,
                customerId: config.customer_id,
                licensesFound: 0,
                licensesSynced: 0,
                errors: [externalData.error || 'License validation failed'],
            };
        }
        for (const extLicense of externalData.licenses) {
            try {
                // IMPORTANT: Update organization_id in the update clause to handle
                // cases where the same license_key exists but belongs to a different org
                await prisma.license.upsert({
                    where: { license_key: extLicense.license_key },
                    create: {
                        organization_id: organizationId,
                        license_key: extLicense.license_key,
                        customer_id: config.customer_id,
                        plan_type: extLicense.product_type,
                        product_type: extLicense.product_type,
                        max_accounts: 100,
                        max_users: extLicense.total_seats,
                        used_seats: extLicense.used_seats,
                        available_seats: extLicense.available_seats,
                        features: getProductFeatures(extLicense.product_type),
                        valid_from: new Date(extLicense.valid_from),
                        valid_until: new Date(extLicense.valid_until),
                        is_active: extLicense.status === 'active' && !extLicense.is_expired,
                        is_trial: extLicense.is_trial,
                        is_expired: extLicense.is_expired,
                        days_remaining: extLicense.days_remaining,
                        last_sync_at: new Date(),
                    },
                    update: {
                        organization_id: organizationId, // CRITICAL: Update org_id to current org
                        customer_id: config.customer_id,
                        product_type: extLicense.product_type,
                        plan_type: extLicense.product_type,
                        max_users: extLicense.total_seats,
                        used_seats: extLicense.used_seats,
                        available_seats: extLicense.available_seats,
                        features: getProductFeatures(extLicense.product_type),
                        valid_from: new Date(extLicense.valid_from),
                        valid_until: new Date(extLicense.valid_until),
                        is_active: extLicense.status === 'active' && !extLicense.is_expired,
                        is_trial: extLicense.is_trial,
                        is_expired: extLicense.is_expired,
                        days_remaining: extLicense.days_remaining,
                        last_sync_at: new Date(),
                        sync_error: null,
                    },
                });
                licensesSynced++;
                logging_js_1.logger.info(`License ${extLicense.license_key} synced successfully for org ${organizationId}`);
            }
            catch (licenseError) {
                const errMsg = licenseError instanceof Error ? licenseError.message : String(licenseError);
                errors.push(`Failed to sync license ${extLicense.license_key}: ${errMsg}`);
                logging_js_1.logger.error(`License sync error for ${extLicense.license_key}:`, licenseError);
            }
        }
        const externalKeys = externalData.licenses.map(l => l.license_key);
        await prisma.license.updateMany({
            where: {
                organization_id: organizationId,
                license_key: { notIn: externalKeys },
                is_active: true,
            },
            data: {
                is_active: false,
                sync_error: 'License not found in external system',
                last_sync_at: new Date(),
            },
        });
        await prisma.organizationLicenseConfig.update({
            where: { organization_id: organizationId },
            data: {
                sync_status: errors.length > 0 ? 'partial' : 'success',
                sync_error: errors.length > 0 ? errors.join('; ') : null,
                last_sync_at: new Date(),
            },
        });
        return {
            success: errors.length === 0,
            organizationId,
            customerId: config.customer_id,
            licensesFound: externalData.total_licenses,
            licensesSynced,
            errors,
        };
    }
    catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logging_js_1.logger.error(`License sync failed for org ${organizationId}:`, err);
        await prisma.organizationLicenseConfig.update({
            where: { organization_id: organizationId },
            data: {
                sync_status: 'error',
                sync_error: errMsg,
                last_sync_at: new Date(),
            },
        });
        return {
            success: false,
            organizationId,
            customerId: config.customer_id,
            licensesFound: 0,
            licensesSynced: 0,
            errors: [errMsg],
        };
    }
}
async function syncAllOrganizationLicenses() {
    const prisma = (0, database_js_1.getPrismaClient)();
    const results = [];
    const configs = await prisma.organizationLicenseConfig.findMany({
        where: { auto_sync: true },
    });
    logging_js_1.logger.info(`Starting license sync for ${configs.length} organizations`);
    for (const config of configs) {
        const result = await syncOrganizationLicenses(config.organization_id);
        results.push(result);
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return results;
}
// ============================================================================
// SEAT MANAGEMENT
// ============================================================================
async function assignSeat(licenseId, userId, assignedBy) {
    const prisma = (0, database_js_1.getPrismaClient)();
    const license = await prisma.license.findUnique({
        where: { id: licenseId },
        include: { seat_assignments: true },
    });
    if (!license)
        return { success: false, error: 'License not found' };
    if (!license.is_active)
        return { success: false, error: 'License is not active' };
    if (license.is_expired)
        return { success: false, error: 'License has expired' };
    const currentAssignments = license.seat_assignments.length;
    if (currentAssignments >= license.max_users) {
        return { success: false, error: 'No available seats' };
    }
    const existingAssignment = license.seat_assignments.find((a) => a.user_id === userId);
    if (existingAssignment) {
        return { success: false, error: 'User already has a seat assigned' };
    }
    await prisma.licenseSeatAssignment.create({
        data: {
            license_id: licenseId,
            user_id: userId,
            assigned_by: assignedBy,
        },
    });
    await prisma.license.update({
        where: { id: licenseId },
        data: {
            used_seats: currentAssignments + 1,
            available_seats: license.max_users - currentAssignments - 1,
        },
    });
    return { success: true };
}
async function revokeSeat(licenseId, userId) {
    const prisma = (0, database_js_1.getPrismaClient)();
    const assignment = await prisma.licenseSeatAssignment.findUnique({
        where: {
            license_id_user_id: {
                license_id: licenseId,
                user_id: userId,
            },
        },
    });
    if (!assignment)
        return { success: false, error: 'Seat assignment not found' };
    await prisma.licenseSeatAssignment.delete({
        where: { id: assignment.id },
    });
    const license = await prisma.license.findUnique({
        where: { id: licenseId },
        include: { seat_assignments: true },
    });
    if (license) {
        const currentAssignments = license.seat_assignments.length;
        await prisma.license.update({
            where: { id: licenseId },
            data: {
                used_seats: currentAssignments,
                available_seats: license.max_users - currentAssignments,
            },
        });
    }
    return { success: true };
}
// ============================================================================
// HELPERS
// ============================================================================
function getProductFeatures(productType) {
    const featureMap = {
        pilotone: ['security_scan', 'compliance_check', 'cost_analysis', 'drift_detection', 'basic_reports'],
        enterprise: ['security_scan', 'compliance_check', 'cost_analysis', 'drift_detection', 'advanced_reports', 'api_access', 'sso', 'audit_logs', 'custom_integrations'],
        trial: ['security_scan', 'compliance_check', 'basic_reports'],
    };
    return featureMap[productType.toLowerCase()] || featureMap['pilotone'];
}
async function hasValidLicense(organizationId) {
    const prisma = (0, database_js_1.getPrismaClient)();
    // Only consider EVO licenses as valid
    const license = await prisma.license.findFirst({
        where: {
            organization_id: organizationId,
            is_active: true,
            is_expired: false,
            product_type: {
                contains: 'evo',
                mode: 'insensitive'
            }
        },
    });
    return !!license;
}
async function getLicenseSummary(organizationId) {
    const prisma = (0, database_js_1.getPrismaClient)();
    // First, get ALL licenses to log their types for debugging
    const allLicenses = await prisma.license.findMany({
        where: {
            organization_id: organizationId,
            is_active: true,
        },
        select: { id: true, product_type: true, license_key: true }
    });
    logging_js_1.logger.info(`All licenses for org ${organizationId}: ${JSON.stringify(allLicenses.map((l) => ({ key: l.license_key?.substring(0, 10), type: l.product_type })))}`);
    // Filter only EVO licenses (product_type equals 'EVO' case insensitive)
    const licenses = await prisma.license.findMany({
        where: {
            organization_id: organizationId,
            is_active: true,
            OR: [
                { product_type: { equals: 'EVO', mode: 'insensitive' } },
                { product_type: { equals: 'evo', mode: 'insensitive' } },
                { product_type: { startsWith: 'EVO', mode: 'insensitive' } },
            ]
        },
        include: { seat_assignments: true },
        orderBy: { valid_until: 'desc' },
    });
    logging_js_1.logger.info(`Filtered EVO licenses: ${licenses.length}`);
    const config = await prisma.organizationLicenseConfig.findUnique({
        where: { organization_id: organizationId },
    });
    return {
        hasLicense: licenses.length > 0,
        customerId: config?.customer_id,
        lastSync: config?.last_sync_at,
        syncStatus: config?.sync_status,
        licenses: licenses.map((l) => ({
            id: l.id,
            licenseKey: l.license_key,
            productType: l.product_type,
            planType: l.plan_type,
            totalSeats: l.max_users,
            usedSeats: l.seat_assignments.length,
            availableSeats: l.max_users - l.seat_assignments.length,
            validFrom: l.valid_from,
            validUntil: l.valid_until,
            daysRemaining: l.days_remaining,
            isExpired: l.is_expired,
            isTrial: l.is_trial,
            features: l.features,
        })),
    };
}
//# sourceMappingURL=license-service.js.map