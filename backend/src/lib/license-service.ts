/**
 * License Service - External License Validation
 * Integrates with external license validation API
 */

import { logger } from './logging.js';
import { getPrismaClient } from './database.js';

// ============================================================================
// TYPES
// ============================================================================

interface ExternalLicense {
  license_key: string;
  product_type: string;
  status: string;
  total_seats: number;
  used_seats: number;
  available_seats: number;
  valid_from: string;
  valid_until: string;
  is_expired: boolean;
  has_available_seats: boolean;
  is_trial: boolean;
  days_remaining: number;
}

interface ExternalLicenseResponse {
  valid: boolean;
  customer_id: string;
  total_licenses: number;
  licenses: ExternalLicense[];
  error?: string;
}

interface SyncResult {
  success: boolean;
  organizationId: string;
  customerId: string;
  licensesFound: number;
  licensesSynced: number;
  errors: string[];
}

// ============================================================================
// EXTERNAL API CLIENT
// ============================================================================

export async function fetchExternalLicenses(customerId: string): Promise<ExternalLicenseResponse> {
  const apiUrl = process.env.LICENSE_API_URL;
  const apiKey = process.env.LICENSE_API_KEY;

  if (!apiUrl || !apiKey) {
    throw new Error('License API configuration missing (LICENSE_API_URL or LICENSE_API_KEY)');
  }

  logger.info(`Fetching licenses for customer: ${customerId}`);

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

  const data = await response.json() as ExternalLicenseResponse;
  logger.info(`License API response: valid=${data.valid}, licenses=${data.total_licenses}`);
  return data;
}

// ============================================================================
// SYNC FUNCTIONS
// ============================================================================

export async function syncOrganizationLicenses(organizationId: string): Promise<SyncResult> {
  const prisma = getPrismaClient() as any;
  const errors: string[] = [];
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
        // IMPORTANT: Ensure minimum 14 days validity for trial licenses
        // The external API sometimes returns incorrect/short validity periods
        let validUntil = new Date(extLicense.valid_until);
        let daysRemaining = extLicense.days_remaining;
        let isExpired = extLicense.is_expired;
        let isActive = extLicense.status === 'active' && !extLicense.is_expired;
        
        if (extLicense.is_trial) {
          const minValidUntil = new Date();
          minValidUntil.setDate(minValidUntil.getDate() + 14);
          
          // If API says trial is expired but was created recently, extend it
          if (isExpired || validUntil < new Date()) {
            // Check if license was created within last 7 days
            const createdAt = new Date(extLicense.valid_from);
            const daysSinceCreation = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysSinceCreation < 7) {
              logger.warn('External API returned short validity for recent trial, extending to 14 days', {
                licenseKey: extLicense.license_key,
                apiValidUntil: extLicense.valid_until,
                daysSinceCreation
              });
              validUntil = minValidUntil;
              daysRemaining = 14;
              isExpired = false;
              isActive = true;
            }
          }
        }
        
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
            valid_until: validUntil,
            is_active: isActive,
            is_trial: extLicense.is_trial,
            is_expired: isExpired,
            days_remaining: daysRemaining,
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
            valid_until: validUntil,
            is_active: isActive,
            is_trial: extLicense.is_trial,
            is_expired: isExpired,
            days_remaining: daysRemaining,
            last_sync_at: new Date(),
            sync_error: null,
          },
        });
        licensesSynced++;
        logger.info(`License ${extLicense.license_key} synced successfully for org ${organizationId}`);
      } catch (licenseError) {
        const errMsg = licenseError instanceof Error ? licenseError.message : String(licenseError);
        errors.push(`Failed to sync license ${extLicense.license_key}: ${errMsg}`);
        logger.error(`License sync error for ${extLicense.license_key}:`, licenseError);
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

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`License sync failed for org ${organizationId}:`, err);

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

export async function syncAllOrganizationLicenses(): Promise<SyncResult[]> {
  const prisma = getPrismaClient() as any;
  const results: SyncResult[] = [];

  const configs = await prisma.organizationLicenseConfig.findMany({
    where: { auto_sync: true },
  });

  logger.info(`Starting license sync for ${configs.length} organizations`);

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

export async function assignSeat(
  licenseId: string,
  userId: string,
  assignedBy?: string
): Promise<{ success: boolean; error?: string }> {
  const prisma = getPrismaClient() as any;

  const license = await prisma.license.findUnique({
    where: { id: licenseId },
    include: { seat_assignments: true },
  });

  if (!license) return { success: false, error: 'License not found' };
  if (!license.is_active) return { success: false, error: 'License is not active' };
  if (license.is_expired) return { success: false, error: 'License has expired' };

  // CRITICAL: Verify user belongs to the same organization as the license
  const userProfile = await prisma.profile.findFirst({
    where: {
      user_id: userId,
      organization_id: license.organization_id
    }
  });

  if (!userProfile) {
    logger.warn('Attempted to assign seat to user not in organization', {
      userId,
      licenseId,
      licenseOrgId: license.organization_id
    });
    return { success: false, error: 'User does not belong to the license organization' };
  }

  // Super admins don't consume seats - they have unlimited access
  if (userProfile.role === 'super_admin' || userProfile.role === 'SUPER_ADMIN') {
    logger.info('Super admin does not need seat assignment', { userId, licenseId });
    return { success: true };
  }

  const currentAssignments = license.seat_assignments.length;
  if (currentAssignments >= license.max_users) {
    return { success: false, error: 'No available seats' };
  }

  const existingAssignment = license.seat_assignments.find((a: any) => a.user_id === userId);
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

export async function revokeSeat(
  licenseId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const prisma = getPrismaClient() as any;

  const assignment = await prisma.licenseSeatAssignment.findUnique({
    where: {
      license_id_user_id: {
        license_id: licenseId,
        user_id: userId,
      },
    },
  });

  if (!assignment) return { success: false, error: 'Seat assignment not found' };

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

function getProductFeatures(productType: string): string[] {
  const featureMap: Record<string, string[]> = {
    pilotone: ['security_scan', 'compliance_check', 'cost_analysis', 'drift_detection', 'basic_reports'],
    enterprise: ['security_scan', 'compliance_check', 'cost_analysis', 'drift_detection', 'advanced_reports', 'api_access', 'sso', 'audit_logs', 'custom_integrations'],
    trial: ['security_scan', 'compliance_check', 'basic_reports'],
  };
  return featureMap[productType.toLowerCase()] || featureMap['pilotone'];
}

export async function hasValidLicense(organizationId: string): Promise<boolean> {
  const prisma = getPrismaClient() as any;
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

export async function getLicenseSummary(organizationId: string) {
  const prisma = getPrismaClient() as any;

  // First, get ALL licenses to log their types for debugging
  const allLicenses = await prisma.license.findMany({
    where: { 
      organization_id: organizationId, 
      is_active: true,
    },
    select: { id: true, product_type: true, license_key: true }
  });
  
  logger.info(`All licenses for org ${organizationId}: ${JSON.stringify(allLicenses.map((l: any) => ({ key: l.license_key?.substring(0, 10), type: l.product_type })))}`);

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

  logger.info(`Filtered EVO licenses: ${licenses.length}`);

  // Get super admin user IDs to exclude from seat count
  const superAdminProfiles = await prisma.profile.findMany({
    where: {
      organization_id: organizationId,
      role: { in: ['super_admin', 'SUPER_ADMIN'] }
    },
    select: { user_id: true }
  });
  const superAdminUserIds = new Set(superAdminProfiles.map((p: any) => p.user_id));

  const config = await prisma.organizationLicenseConfig.findUnique({
    where: { organization_id: organizationId },
  });

  return {
    hasLicense: licenses.length > 0,
    customerId: config?.customer_id,
    lastSync: config?.last_sync_at,
    syncStatus: config?.sync_status,
    licenses: licenses.map((l: any) => {
      // Exclude super admins from seat count
      const nonSuperAdminSeats = l.seat_assignments.filter(
        (s: any) => !superAdminUserIds.has(s.user_id)
      );
      const usedSeats = nonSuperAdminSeats.length;
      
      return {
        id: l.id,
        licenseKey: l.license_key,
        productType: l.product_type,
        planType: l.plan_type,
        totalSeats: l.max_users,
        usedSeats: usedSeats,
        availableSeats: l.max_users - usedSeats,
        validFrom: l.valid_from,
        validUntil: l.valid_until,
        daysRemaining: l.days_remaining,
        isExpired: l.is_expired,
        isTrial: l.is_trial,
        features: l.features,
      };
    }),
  };
}
