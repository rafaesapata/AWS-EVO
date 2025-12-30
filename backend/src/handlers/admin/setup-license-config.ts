/**
 * Setup License Config - Admin tool to configure license for organization
 */

import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

export async function handler(event: any): Promise<{statusCode: number; body: string}> {
  const body = event.body ? JSON.parse(event.body) : event;
  const { organization_id, customer_id } = body;

  if (!organization_id || !customer_id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'organization_id and customer_id are required' }),
    };
  }

  console.log(`Setting up license config: org=${organization_id}, customer=${customer_id}`);

  try {
    const db = getPrisma();

    const config = await db.organizationLicenseConfig.upsert({
      where: { organization_id },
      create: {
        organization_id,
        customer_id,
        auto_sync: true,
        sync_status: 'pending',
      },
      update: {
        customer_id,
        auto_sync: true,
        sync_status: 'pending',
      },
    });

    console.log('License config created/updated:', config);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'License configuration saved',
        config,
      }),
    };

  } catch (err) {
    console.error('Setup license config error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
    };
  }
}
