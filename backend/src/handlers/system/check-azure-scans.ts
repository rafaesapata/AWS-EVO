/**
 * Check Azure Scans - Debug handler
 */

import type { APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

export async function handler(): Promise<APIGatewayProxyResultV2> {
  logger.info('Checking Azure scans');
  
  const prisma = getPrismaClient();
  
  try {
    // Query recent scans
    const recentScans = await prisma.$queryRaw<any[]>`
      SELECT id, organization_id, cloud_provider, azure_credential_id, aws_account_id, status, scan_type, created_at
      FROM security_scans
      ORDER BY created_at DESC
      LIMIT 10
    `;
    
    // Query recent background jobs
    const recentJobs = await prisma.$queryRaw<any[]>`
      SELECT id, organization_id, job_type, status, created_at
      FROM background_jobs
      ORDER BY created_at DESC
      LIMIT 10
    `;
    
    // Check table structure
    const tableInfo = await prisma.$queryRaw<any[]>`
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_name = 'security_scans'
      ORDER BY ordinal_position
    `;
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        recentScans,
        recentJobs,
        tableInfo,
      }, null, 2),
    };
  } catch (err: any) {
    logger.error('Error checking scans', { error: err.message });
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
