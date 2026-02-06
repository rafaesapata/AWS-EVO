/**
 * Start Compliance Scan Handler (Async)
 * Creates a background job and invokes compliance-scan via HTTPS
 */

import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';
import https from 'https';

const startComplianceScanSchema = z.object({
  frameworkId: z.string().min(1),
  accountId: z.string().uuid().optional(),
});

// Helper to make async HTTPS request (fire-and-forget)
function invokeComplianceScanAsync(
  authToken: string,
  body: object
): void {
  const postData = JSON.stringify(body);
  
  const options = {
    hostname: 'api-evo.ai.udstec.io',
    port: 443,
    path: '/api/functions/compliance-scan',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'Authorization': authToken,
    },
    timeout: 5000, // 5 second timeout for the initial connection
  };
  
  const req = https.request(options, (res) => {
    // We don't wait for the response - fire and forget
    logger.info('Compliance scan invoked via HTTPS', { statusCode: res.statusCode });
  });
  
  req.on('error', (err) => {
    logger.error('HTTPS request error (non-blocking)', { error: err.message });
  });
  
  req.on('timeout', () => {
    // Timeout is expected since the scan takes a long time
    logger.info('HTTPS request timeout (expected for long-running scan)');
    req.destroy();
  });
  
  req.write(postData);
  req.end();
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  logger.info('Start Compliance Scan (Async) handler invoked');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    // Validate input
    const validation = parseAndValidateBody(startComplianceScanSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { frameworkId, accountId } = validation.data;
    
    const prisma = getPrismaClient();
    
    // Verify credentials exist
    const credential = await prisma.awsCredential.findFirst({
      where: {
        organization_id: organizationId,
        is_active: true,
        ...(accountId && { id: accountId }),
      },
      orderBy: { created_at: 'desc' },
    });
    
    if (!credential) {
      return badRequest('AWS credentials not found. Please configure AWS credentials first.', undefined, origin);
    }
    
    // Check for existing running scan for this framework
    const existingJob = await prisma.backgroundJob.findFirst({
      where: {
        organization_id: organizationId,
        job_type: 'compliance-scan',
        status: { in: ['pending', 'running'] },
        payload: {
          path: ['frameworkId'],
          equals: frameworkId,
        },
      },
    });
    
    if (existingJob) {
      // Check if job is stuck (more than 10 minutes old)
      const jobAge = Date.now() - new Date(existingJob.created_at).getTime();
      const TEN_MINUTES = 10 * 60 * 1000;
      
      if (jobAge > TEN_MINUTES) {
        // Mark stuck job as failed and allow new scan
        logger.info('Marking stuck job as failed', { jobId: existingJob.id, ageMinutes: Math.round(jobAge / 60000) });
        await prisma.backgroundJob.update({
          where: { id: existingJob.id },
          data: {
            status: 'failed',
            completed_at: new Date(),
            error: 'Job timed out after 10 minutes',
            result: {
              progress: 0,
              error: 'Job timed out after 10 minutes',
              timed_out: true,
            },
          },
        });
        // Continue to create new job below
      } else {
        return success({
          job_id: existingJob.id,
          status: existingJob.status,
          message: 'A compliance scan for this framework is already in progress',
          already_running: true,
        }, 200, origin);
      }
    }
    
    // Create background job
    const job = await prisma.backgroundJob.create({
      data: {
        organization_id: organizationId,
        job_type: 'compliance-scan',
        status: 'pending',
        payload: {
          jobName: `Compliance Scan - ${getFrameworkName(frameworkId)}`,
          frameworkId,
          accountId: accountId || credential.id,
          organizationId,
        },
        result: {
          progress: 0,
          message: 'Scan queued...',
        },
      },
    });
    
    logger.info('Created background job for compliance scan', { 
      jobId: job.id, 
      frameworkId,
      accountId: accountId || credential.id
    });
    
    // Get authorization token from the request
    const authToken = event.headers?.authorization || event.headers?.Authorization || '';
    
    // Invoke compliance-scan via HTTPS (fire-and-forget)
    invokeComplianceScanAsync(authToken, {
      frameworkId,
      accountId: accountId || credential.id,
      jobId: job.id,
    });
    
    logger.info('Invoked compliance-scan via HTTPS', { jobId: job.id });
    
    return success({
      job_id: job.id,
      status: 'pending',
      message: 'Compliance scan started. Use the job_id to check progress.',
      framework: frameworkId,
      framework_name: getFrameworkName(frameworkId),
      account_id: accountId || credential.id,
      account_name: credential.account_name || credential.account_id,
    }, 202, origin);
    
  } catch (err) {
    logger.error('Start compliance scan error', err as Error);
    return error('An unexpected error occurred. Please try again.', 500, undefined, origin);
  }
}

function getFrameworkName(frameworkId: string): string {
  const names: Record<string, string> = {
    'cis': 'CIS AWS Foundations Benchmark v1.5.0',
    'lgpd': 'LGPD - Lei Geral de Proteção de Dados',
    'pci-dss': 'PCI-DSS v4.0',
    'hipaa': 'HIPAA Security Rule',
    'gdpr': 'GDPR - General Data Protection Regulation',
    'soc2': 'SOC 2 Type II',
    'nist': 'NIST 800-53',
  };
  return names[frameworkId] || frameworkId;
}
