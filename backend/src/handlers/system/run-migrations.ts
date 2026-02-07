/**
 * Lambda to run Prisma migrations
 * This Lambda runs inside the VPC and can access the RDS
 */

import type { APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error } from '../../lib/response.js';
import { execSync } from 'child_process';

export async function handler(): Promise<APIGatewayProxyResultV2> {
  try {
    console.log('Starting Prisma migrations...');
    
    // Run prisma migrate deploy
    const result = execSync('npx prisma migrate deploy', {
      cwd: '/var/task',
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL,
      },
      encoding: 'utf-8',
      timeout: 300000, // 5 minutes
    });
    
    console.log('Migration output:', result);
    
    return success({
      message: 'Migrations completed successfully',
      output: result,
    });
  } catch (err) {
    console.error('Migration failed:', err);
    return error(
      'Migration failed. Please check logs.',
      500
    );
  }
}
