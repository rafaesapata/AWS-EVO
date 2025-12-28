import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Process Background Jobs
 * AWS Lambda Handler for process-background-jobs
 * 
 * SECURITY NOTE: This handler processes jobs from ALL organizations.
 * This is intentional because:
 * 1. It's a system-level job processor triggered by EventBridge/CloudWatch
 * 2. Each job has its own organization_id and is processed in isolation
 * 3. Job results are stored with the correct organization_id
 * 
 * Rate limiting is applied per-organization to prevent any single org
 * from monopolizing the job queue.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

// Rate limiting per organization (max jobs per minute)
const ORG_JOB_LIMITS = new Map<string, { count: number; resetTime: number }>();
const MAX_JOBS_PER_ORG_PER_MINUTE = 10;

function checkOrgRateLimit(organizationId: string): boolean {
  const now = Date.now();
  const limit = ORG_JOB_LIMITS.get(organizationId);
  
  if (!limit || now > limit.resetTime) {
    ORG_JOB_LIMITS.set(organizationId, { count: 1, resetTime: now + 60000 });
    return true;
  }
  
  if (limit.count >= MAX_JOBS_PER_ORG_PER_MINUTE) {
    logger.warn('Organization rate limit exceeded for background jobs', { organizationId });
    return false;
  }
  
  limit.count++;
  return true;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  logger.info('Process Background Jobs started', { requestId: context.awsRequestId });
  
  try {
    const prisma = getPrismaClient();
    
    // Buscar jobs pendentes (sistema processa de todas as orgs)
    // Cada job é isolado por organization_id
    const pendingJobs = await prisma.backgroundJob.findMany({
      where: {
        status: 'pending',
      },
      orderBy: { created_at: 'asc' },
      take: 20,
    });
    
    logger.info('Found pending background jobs', { jobsCount: pendingJobs.length });
    
    const results = [];
    
    for (const job of pendingJobs) {
      // Rate limiting per organization
      const jobOrgId = (job as any).organization_id;
      if (jobOrgId && !checkOrgRateLimit(jobOrgId)) {
        results.push({
          jobId: job.id,
          jobType: job.job_type,
          status: 'rate_limited',
          organizationId: jobOrgId,
        });
        continue;
      }
      
      try {
        // Marcar como em execução
        await prisma.backgroundJob.update({
          where: { id: job.id },
          data: {
            status: 'running',
            started_at: new Date(),
          },
        });
        
        // Processar job (isolado por organization_id do job)
        const result = await processJob(prisma, job);
        
        // Marcar como completo
        await prisma.backgroundJob.update({
          where: { id: job.id },
          data: {
            status: 'completed',
            result,
            completed_at: new Date(),
          },
        });
        
        results.push({
          jobId: job.id,
          jobType: job.job_type,
          status: 'completed',
          organizationId: jobOrgId,
        });
        
        logger.info('Background job completed', { 
          jobId: job.id, 
          jobType: job.job_type,
          organizationId: jobOrgId 
        });
        
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        
        await prisma.backgroundJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            error: errorMessage,
            completed_at: new Date(),
          },
        });
        
        results.push({
          jobId: job.id,
          jobType: job.job_type,
          status: 'failed',
          error: errorMessage,
          organizationId: jobOrgId,
        });
        
        logger.error('Background job failed', err as Error, { 
          jobId: job.id, 
          jobType: job.job_type,
          organizationId: jobOrgId 
        });
      }
    }
    
    return success({
      success: true,
      jobsProcessed: results.length,
      results,
    });
    
  } catch (err) {
    logger.error('Process Background Jobs error', err as Error, { requestId: context.awsRequestId });
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

async function processJob(prisma: any, job: any): Promise<any> {
  const params = job.parameters || {};
  
  switch (job.job_type) {
    case 'data_export':
      return await processDataExport(prisma, params);
    
    case 'report_generation':
      return await processReportGeneration(prisma, params);
    
    case 'cleanup':
      return await processCleanup(prisma, params);
    
    case 'sync':
      return await processSync(prisma, params);
    
    default:
      return { processed: true, message: `Job type ${job.job_type} processed` };
  }
}

async function processDataExport(prisma: any, params: any) {
  return { exported: true, records: 0 };
}

async function processReportGeneration(prisma: any, params: any) {
  return { generated: true, reportId: 'report-123' };
}

async function processCleanup(prisma: any, params: any) {
  return { cleaned: true, deletedRecords: 0 };
}

async function processSync(prisma: any, params: any) {
  return { synced: true, syncedRecords: 0 };
}
