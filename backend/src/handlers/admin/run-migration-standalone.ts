/**
 * Standalone Migration Handler - Query licenses directly
 */

import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

export async function handler(): Promise<{statusCode: number; body: string}> {
  const organizationId = '865f299e-2009-4145-8279-f9a73e0278aa';

  console.log(`🔍 Querying licenses for org=${organizationId}`);

  try {
    const db = getPrisma();

    // Query licenses directly
    const licenses = await (db as any).license.findMany({
      where: { organization_id: organizationId },
    });

    console.log(`Found ${licenses.length} licenses`);

    // Also check config
    const config = await (db as any).organizationLicenseConfig.findUnique({
      where: { organization_id: organizationId },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        licenses_count: licenses.length,
        licenses: licenses.map((l: any) => ({
          id: l.id,
          license_key: l.license_key,
          product_type: l.product_type,
          is_active: l.is_active,
          is_expired: l.is_expired,
        })),
        config: config ? {
          customer_id: config.customer_id,
          sync_status: config.sync_status,
          last_sync_at: config.last_sync_at,
        } : null,
      }),
    };

  } catch (err) {
    console.error('❌ Query failed:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
    };
  }
}
