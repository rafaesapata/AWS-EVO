/**
 * Lambda para executar migrations do Prisma
 * Usa prisma migrate deploy para aplicar todas as migrations pendentes
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error } from '../../lib/response.js';
import { logger } from '../../lib/logging.js';

const execAsync = promisify(exec);


export async function handler(): Promise<APIGatewayProxyResultV2> {
  const startTime = Date.now();
  
  try {
    logger.info('Starting Prisma migrations');
    
    // Executar prisma migrate deploy
    const { stdout, stderr } = await execAsync('npx prisma migrate deploy', {
      cwd: '/var/task',
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL
      }
    });
    
    logger.info('Migration output', { stdout, stderr });
    
    const duration = Date.now() - startTime;
    
    return success({
      success: true,
      message: 'Prisma migrations executed successfully',
      duration_ms: duration,
      output: stdout
    });
    
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Migration failed', { error: errorMessage, stderr: err.stderr, stdout: err.stdout });
    
    return error(`Migration failed: ${errorMessage}`, 500);
  }
}
