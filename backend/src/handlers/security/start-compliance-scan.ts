/**
 * Start Compliance Scan Handler (Async)
 * Creates a background job and invokes compliance-scan Lambda asynchronously
 */

import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { ensureNotDemoMode } from '../../lib/demo-data-service.js';

const startComplianceScanSchema = z.object({
  frameworkId: z.string().min(1),
  accountId: z.string().uuid().optional(),
});

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
    
    // SECURITY: Block scan operations in demo mode
    const demoCheck = await ensureNotDemoMode(prisma, organizationId, origin);
    if (demoCheck.blocked) return demoCheck.response;
    
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
    
    // Invoke compliance-scan Lambda asynchronously
    const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const prefix = process.env.LAMBDA_PREFIX || `evo-uds-v3-${process.env.ENVIRONMENT || 'sandbox'}`;
    
    const lambdaPayload = {
      body: JSON.stringify({
        frameworkId,
        accountId: accountId || credential.id,
        jobId: job.id,
      }),
      requestContext: {
        http: { method: 'POST' },
        authorizer: event.requestContext?.authorizer,
      },
      headers: {
        authorization: event.headers?.authorization || event.headers?.Authorization || '',
        'content-type': 'application/json',
      },
    };
    
    try {
      await lambdaClient.send(new InvokeCommand({
        FunctionName: `${prefix}-compliance-scan`,
        InvocationType: 'Event', // Async invocation - fire and forget
        Payload: Buffer.from(JSON.stringify(lambdaPayload)),
      }));
      logger.info('Invoked compliance-scan Lambda async', { jobId: job.id, functionName: `${prefix}-compliance-scan` });
    } catch (invokeErr: any) {
      logger.error('Failed to invoke compliance-scan Lambda', { error: invokeErr.message });
      // Update job as failed since we couldn't invoke the scan
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: `Failed to invoke scan: ${invokeErr.message}`,
          completed_at: new Date(),
        },
      });
      return error('Failed to start compliance scan. Please try again.', 500, undefined, origin);
    }
    
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
