/**
 * Retry Fallback Licenses Job
 * 
 * Runs daily to find trial licenses that were created locally (fallback)
 * due to external API instability, and retries creating them via the
 * external license API.
 * 
 * Fallback licenses are identified by:
 * - license_key starts with 'TRIAL-' (8 char UUID suffix)
 * - customer_id starts with 'CUST-' (8 char UUID suffix)
 * 
 * Once successfully recreated externally, the license_key and customer_id
 * are updated to the external values and the license won't be retried again.
 */

import type { ScheduledEvent } from 'aws-lambda';
import { logger } from '../../lib/logging.js';
import { getPrismaClient } from '../../lib/database.js';

// External License API configuration
const LICENSE_API_URL = process.env.LICENSE_API_URL || 'https://mhutjgpipiklepvjrboi.supabase.co/functions/v1/api-create-trial';
const LICENSE_API_KEY = process.env.LICENSE_API_KEY || '';

interface RetryReport {
  date: string;
  fallback_licenses_found: number;
  successfully_retried: number;
  failed: number;
  errors: string[];
  duration_ms: number;
}

interface ExternalLicenseResponse {
  success?: boolean;
  license_key?: string;
  licenseKey?: string;
  customer_id?: string;
  customerId?: string;
  valid_until?: string;
  validUntil?: string;
  error?: string;
  message?: string;
  license?: {
    license_key?: string;
    customer_id?: string;
    valid_until?: string;
  };
  user?: {
    id?: string;
  };
}

export async function handler(event: ScheduledEvent): Promise<RetryReport> {
  logger.info('Retry fallback licenses job started', {
    time: event.time,
    source: event.source,
  });

  const startTime = Date.now();
  const prisma = getPrismaClient();
  const errors: string[] = [];
  let successCount = 0;
  let failCount = 0;

  if (!LICENSE_API_KEY) {
    logger.error('LICENSE_API_KEY not configured, cannot retry fallback licenses');
    return {
      date: new Date().toISOString().split('T')[0],
      fallback_licenses_found: 0,
      successfully_retried: 0,
      failed: 0,
      errors: ['LICENSE_API_KEY not configured'],
      duration_ms: Date.now() - startTime,
    };
  }

  try {
    // Find all fallback licenses: TRIAL-XXXXXXXX pattern with CUST-XXXXXXXX customer_id
    const fallbackLicenses = await prisma.$queryRaw<any[]>`
      SELECT 
        l.id,
        l.organization_id,
        l.license_key,
        l.customer_id,
        l.valid_until,
        l.is_active,
        o.name as organization_name,
        o.slug,
        COALESCE(p.full_name, 'Unknown') as contact_name,
        COALESCE(o.contact_email, p.email, '') as contact_email
      FROM licenses l
      JOIN organizations o ON o.id = l.organization_id
      LEFT JOIN profiles p ON p.organization_id = l.organization_id AND p.role = 'org_admin'
      WHERE l.license_key LIKE 'TRIAL-%'
        AND l.customer_id LIKE 'CUST-%'
        AND l.is_trial = true
        AND l.is_active = true
      ORDER BY l.created_at ASC
    `;

    logger.info('Fallback licenses found', { count: fallbackLicenses.length });

    if (fallbackLicenses.length === 0) {
      return {
        date: new Date().toISOString().split('T')[0],
        fallback_licenses_found: 0,
        successfully_retried: 0,
        failed: 0,
        errors: [],
        duration_ms: Date.now() - startTime,
      };
    }

    for (const license of fallbackLicenses) {
      try {
        const result = await retryExternalLicenseCreation(license);

        if (result.success && result.licenseKey && result.customerId) {
          // Update license with external API data
          await prisma.$executeRaw`
            UPDATE licenses
            SET license_key = ${result.licenseKey},
                customer_id = ${result.customerId},
                valid_until = COALESCE(${result.validUntil}::timestamptz, valid_until),
                updated_at = NOW()
            WHERE id = ${license.id}::uuid
          `;

          // Update organization_license_configs with new customer_id
          await prisma.$executeRaw`
            UPDATE organization_license_configs
            SET customer_id = ${result.customerId},
                sync_status = 'synced',
                updated_at = NOW()
            WHERE organization_id = ${license.organization_id}::uuid
          `;

          successCount++;
          logger.info('Fallback license successfully replaced with external license', {
            organizationId: license.organization_id,
            oldLicenseKey: license.license_key,
            newLicenseKey: result.licenseKey,
            newCustomerId: result.customerId,
          });
        } else {
          failCount++;
          const errMsg = `Org ${license.organization_id}: ${result.error || 'Unknown error'}`;
          errors.push(errMsg);
          logger.warn('Failed to retry fallback license', {
            organizationId: license.organization_id,
            licenseKey: license.license_key,
            error: result.error,
          });
        }
      } catch (err: any) {
        failCount++;
        const errMsg = `Org ${license.organization_id}: ${err.message}`;
        errors.push(errMsg);
        logger.error('Error retrying fallback license', err, {
          organizationId: license.organization_id,
          licenseKey: license.license_key,
        });
      }
    }

    const report: RetryReport = {
      date: new Date().toISOString().split('T')[0],
      fallback_licenses_found: fallbackLicenses.length,
      successfully_retried: successCount,
      failed: failCount,
      errors: errors.slice(0, 20),
      duration_ms: Date.now() - startTime,
    };

    logger.info('Retry fallback licenses job completed', report);

    // Log system event via raw SQL (payload column may not exist in Prisma schema)
    try {
      await prisma.$executeRaw`
        INSERT INTO system_events (id, organization_id, event_type, processed, processed_at, created_at)
        VALUES (
          gen_random_uuid(),
          '00000000-0000-0000-0000-000000000000'::uuid,
          'FALLBACK_LICENSE_RETRY_COMPLETED',
          true,
          NOW(),
          NOW()
        )
      `;
    } catch (logErr: any) {
      logger.warn('Failed to log system event', { error: logErr.message });
    }

    return report;

  } catch (err: any) {
    logger.error('Retry fallback licenses job failed', err);

    try {
      await prisma.$executeRaw`
        INSERT INTO system_events (id, organization_id, event_type, processed, created_at)
        VALUES (
          gen_random_uuid(),
          '00000000-0000-0000-0000-000000000000'::uuid,
          'FALLBACK_LICENSE_RETRY_FAILED',
          false,
          NOW()
        )
      `;
    } catch (logErr: any) {
      logger.warn('Failed to log system event', { error: logErr.message });
    }

    throw err;
  }
}

/**
 * Call external license API to create a trial license for an organization
 */
async function retryExternalLicenseCreation(license: {
  organization_id: string;
  organization_name: string;
  contact_name: string | null;
  contact_email: string | null;
}): Promise<{
  success: boolean;
  licenseKey?: string;
  customerId?: string;
  validUntil?: string;
  error?: string;
}> {
  const requestBody = {
    organization_name: license.organization_name || 'Unknown',
    contact_name: license.contact_name || 'Unknown',
    contact_email: license.contact_email || '',
    product_type: 'evo',
    estimated_seats: 1,
    notes: `Retry fallback license - Organization ID: ${license.organization_id}`,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  let response: Response;
  try {
    response = await fetch(LICENSE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': LICENSE_API_KEY,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (err: any) {
    return { success: false, error: `Network error: ${err.message}` };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return { success: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
  }

  let data: ExternalLicenseResponse;
  try {
    data = await response.json() as ExternalLicenseResponse;
  } catch {
    return { success: false, error: 'Invalid JSON response' };
  }

  if (data.success === false) {
    return { success: false, error: data.error || data.message || 'API returned success: false' };
  }

  const licenseKey = data.license?.license_key || data.license_key || data.licenseKey;
  const customerId = data.license?.customer_id || data.user?.id || data.customer_id || data.customerId;
  const validUntil = data.license?.valid_until || data.valid_until || data.validUntil;

  if (!licenseKey && !customerId) {
    return { success: false, error: 'Response missing license_key and customer_id' };
  }

  return {
    success: true,
    licenseKey: licenseKey || undefined,
    customerId: customerId || undefined,
    validUntil: validUntil || undefined,
  };
}
