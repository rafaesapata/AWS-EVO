/**
 * Setup License Config - Admin tool to configure license for organization
 * SECURITY: Requires super_admin authentication
 */

import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';

export async function handler(event: any): Promise<{statusCode: number; headers: Record<string, string>; body: string}> {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // Handle CORS preflight
  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  let body: any;
  try {
    body = event.body ? JSON.parse(event.body) : event;
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid JSON in request body' }),
    };
  }

  const { organization_id, customer_id } = body;

  if (!organization_id || !customer_id) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'organization_id and customer_id are required' }),
    };
  }

  // Validate UUID format
  const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!uuidRegex.test(organization_id) || !uuidRegex.test(customer_id)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'organization_id and customer_id must be valid UUIDs' }),
    };
  }

  logger.info(`Setting up license config: org=${organization_id}, customer=${customer_id}`);

  try {
    const db = getPrismaClient();

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

    logger.info('License config created/updated', { organizationId: organization_id });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'License configuration saved',
        config,
      }),
    };

  } catch (err) {
    logger.error('Setup license config error:', err as Error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to save license configuration',
      }),
    };
  }
}
