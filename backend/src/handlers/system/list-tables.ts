/**
 * Lambda to list database tables in public schema
 * Runs inside VPC with RDS access - internal use only
 */

import type { APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';

interface TableInfo {
  table_name: string;
}

export async function handler(): Promise<APIGatewayProxyResultV2> {
  try {
    logger.info('Listing database tables');
    
    const prisma = getPrismaClient();
    
    const tables = await prisma.$queryRaw<TableInfo[]>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;
    
    logger.info('Tables retrieved', { count: tables.length });
    
    return success({
      tables: tables.map(t => t.table_name),
      count: tables.length,
    });
  } catch (err) {
    logger.error('List tables failed', err as Error);
    return error('Failed to list tables');
  }
}
