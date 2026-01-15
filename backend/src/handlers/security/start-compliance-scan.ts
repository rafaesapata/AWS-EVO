/**
 * Start Compliance Scan Handler (Async)
 * Creates a background job and returns immediately
 * The actual scan runs asynchronously via compliance-scan handler
 */

import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { z } from 'zod';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

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
    const parseResult = startComplianceScanSchema.safeParse(
      event.body ? JSON.parse(event.body) : {}
    );
    
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      return badRequest(`Validation error: ${errorMessages}`, undefined, origin);
    }
    
    const { frameworkId, accountId } = parseResult.data;
    
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
        parameters: {
          path: ['frameworkId'],
          equals: frameworkId,
        },
      },
    });
    
    if (existingJob) {
      return success({
        job_id: existingJob.id,
        status: existingJob.status,
        message: 'A compliance scan for this framework is already in progress',
        already_running: true,
      }, 200, origin);
    }
    
    // Create background job
    const job = await prisma.backgroundJob.create({
      data: {
        organization_id: organizationId,
        job_type: 'compliance-scan',
        job_name: `Compliance Scan - ${getFrameworkName(frameworkId)}`,
        status: 'pending',
        parameters: {
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
    try {
      const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
      
      const payload = {
        body: JSON.stringify({
          frameworkId,
          accountId: accountId || credential.id,
          jobId: job.id,
        }),
        requestContext: {
          authorizer: {
            claims: event.requestContext.authorizer?.claims,
          },
          http: {
            method: 'POST',
          },
        },
        headers: event.headers,
      };
      
      await lambdaClient.send(new InvokeCommand({
        FunctionName: 'evo-uds-v3-production-compliance-scan',
        InvocationType: 'Event', // Async invocation
        Payload: Buffer.from(JSON.stringify(payload)),
      }));
      
      logger.info('Invoked compliance-scan Lambda asynchronously', { jobId: job.id });
      
    } catch (invokeError: any) {
      logger.error('Failed to invoke compliance-scan Lambda', { error: invokeError.message });
      
      // Update job status to failed
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: `Failed to start scan: ${invokeError.message}`,
        },
      });
      
      return error('Failed to start compliance scan', 500, undefined, origin);
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
    return error(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
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
