/**
 * Lambda handler for Process Background Jobs
 * AWS Lambda Handler for process-background-jobs
 * 
 * Processes pending background jobs from the background_jobs table.
 * Triggered by EventBridge every 5 minutes.
 * 
 * SECURITY NOTE: This handler processes jobs from ALL organizations.
 * This is intentional because:
 * 1. It's a system-level job processor triggered by EventBridge
 * 2. Each job has its own organization_id and is processed in isolation
 * 3. Job results are stored with the correct organization_id
 * 
 * Rate limiting is applied per-organization to prevent any single org
 * from monopolizing the job queue.
 * 
 * @schedule rate(5 minutes)
 */

import type { LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

// EventBridge scheduled event type
interface ScheduledEvent {
  'detail-type'?: string;
  source?: string;
  time?: string;
  requestContext?: {
    http?: { method: string };
  };
}

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
  event: ScheduledEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }
  
  const startTime = Date.now();
  logger.info('Process Background Jobs started', { 
    requestId: context.awsRequestId,
    source: event.source || 'api-gateway',
    time: event.time || new Date().toISOString()
  });
  
  try {
    const prisma = getPrismaClient();
    
    // Buscar jobs pendentes (sistema processa de todas as orgs)
    const pendingJobs = await prisma.backgroundJob.findMany({
      where: {
        status: 'pending',
      },
      orderBy: { created_at: 'asc' },
      take: 20,
    });
    
    logger.info('Found pending background jobs', { jobsCount: pendingJobs.length });
    
    if (pendingJobs.length === 0) {
      return success({
        success: true,
        message: 'No pending jobs',
        jobsProcessed: 0,
        results: [],
        durationMs: Date.now() - startTime
      });
    }
    
    const results = [];
    const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
    
    for (const job of pendingJobs) {
      const jobOrgId = job.organization_id;
      
      // Rate limiting per organization
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
        
        // Processar job baseado no tipo
        const result = await processJob(prisma, lambdaClient, job);
        
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
    
    const completed = results.filter(r => r.status === 'completed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const rateLimited = results.filter(r => r.status === 'rate_limited').length;
    
    logger.info('Process Background Jobs completed', {
      jobsProcessed: results.length,
      completed,
      failed,
      rateLimited,
      durationMs: Date.now() - startTime
    });
    
    return success({
      success: true,
      jobsProcessed: results.length,
      summary: { completed, failed, rateLimited },
      results,
      durationMs: Date.now() - startTime
    });
    
  } catch (err) {
    logger.error('Process Background Jobs error', err as Error, { requestId: context.awsRequestId });
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

async function processJob(prisma: any, lambdaClient: LambdaClient, job: any): Promise<any> {
  const params = job.parameters || {};
  
  // Map job types to Lambda functions for scan-related jobs
  const scanJobMapping: Record<string, string> = {
    'security_scan': 'security-scan',
    'compliance_scan': 'compliance-scan',
    'well_architected_scan': 'well-architected-scan',
    'cost_analysis': 'cost-optimization',
    'drift_detection': 'drift-detection',
    'guardduty_scan': 'guardduty-scan',
    // Azure scans
    'azure-security-scan': 'azure-security-scan',
    'azure-compliance-scan': 'azure-compliance-scan',
    'azure-well-architected-scan': 'azure-well-architected-scan',
  };
  
  // If it's a scan job, invoke the corresponding Lambda
  if (scanJobMapping[job.job_type]) {
    const lambdaName = scanJobMapping[job.job_type];
    
    const payload = {
      body: JSON.stringify({
        ...params,
        backgroundJobId: job.id,
        scheduledExecution: true
      }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'background-job-processor',
            'custom:organization_id': job.organization_id
          }
        },
        http: { method: 'POST' }
      }
    };
    
    await lambdaClient.send(new InvokeCommand({
      FunctionName: `evo-uds-v3-production-${lambdaName}`,
      InvocationType: 'Event', // Async
      Payload: Buffer.from(JSON.stringify(payload))
    }));
    
    return { 
      triggered: true, 
      lambdaName,
      message: `Lambda ${lambdaName} invoked asynchronously` 
    };
  }
  
  // Handle other job types locally
  switch (job.job_type) {
    case 'data_export':
      return await processDataExport(prisma, params, job.organization_id);
    
    case 'report_generation':
      return await processReportGeneration(prisma, params, job.organization_id);
    
    case 'cleanup':
      return await processCleanup(prisma, params, job.organization_id);
    
    case 'sync':
      return await processSync(prisma, params, job.organization_id);
    
    default:
      return { processed: true, message: `Job type ${job.job_type} processed` };
  }
}

async function processDataExport(prisma: any, params: any, organizationId: string) {
  // Placeholder - implement actual data export logic
  return { exported: true, records: 0, organizationId };
}

async function processReportGeneration(prisma: any, params: any, organizationId: string) {
  // Placeholder - implement actual report generation logic
  return { generated: true, reportId: `report-${Date.now()}`, organizationId };
}

async function processCleanup(prisma: any, params: any, organizationId: string) {
  // Clean up old completed/failed jobs for this organization
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const deleted = await prisma.backgroundJob.deleteMany({
    where: {
      organization_id: organizationId,
      status: { in: ['completed', 'failed'] },
      completed_at: { lt: thirtyDaysAgo }
    }
  });
  
  return { cleaned: true, deletedRecords: deleted.count, organizationId };
}

async function processSync(prisma: any, params: any, organizationId: string) {
  // Placeholder - implement actual sync logic
  return { synced: true, syncedRecords: 0, organizationId };
}
