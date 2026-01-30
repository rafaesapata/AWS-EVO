import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler para executar jobs agendados
 * AWS Lambda Handler for execute-scheduled-job
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { executeScheduledJobSchema } from '../../lib/schemas.js';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  // Handle CORS preflight FIRST
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationIdWithImpersonation(event, user);
  
  logger.info('Execute scheduled job started', { 
    organizationId,
    userId: user.sub,
    requestId: context.awsRequestId 
  });
  
  try {
    // Validate input with Zod
    const validation = parseAndValidateBody(executeScheduledJobSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { jobId, force } = validation.data;
    
    const prisma = getPrismaClient();
    
    // Buscar job
    const job = await prisma.backgroundJob.findFirst({
      where: {
        id: jobId,
        organization_id: organizationId,
      },
    });
    
    if (!job) {
      return badRequest('Job not found');
    }
    
    logger.info('Executing scheduled job', { 
      organizationId, 
      jobId, 
      jobName: job.job_name, 
      jobType: job.job_type 
    });
    
    // Atualizar status para running
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: 'running',
        started_at: new Date(),
      },
    });
    
    try {
      // Executar job baseado no tipo
      let result: any;
      
      switch (job.job_type) {
        case 'security_scan':
          result = await invokeLambda('SecurityScan', job.parameters);
          break;
        case 'compliance_scan':
          result = await invokeLambda('ComplianceScan', job.parameters);
          break;
        case 'guardduty_scan':
          result = await invokeLambda('GuardDutyScan', job.parameters);
          break;
        case 'cost_analysis':
          result = await invokeLambda('FinopsCopilot', job.parameters);
          break;
        case 'sync_accounts':
          result = await invokeLambda('SyncOrganizationAccounts', {});
          break;
        default:
          throw new Error(`Unknown job type: ${job.job_type}`);
      }
      
      // Atualizar status para completed
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          completed_at: new Date(),
          result,
        },
      });
      
      logger.info('Scheduled job completed successfully', { 
        organizationId, 
        jobId, 
        jobName: job.job_name, 
        jobType: job.job_type 
      });
      
      return success({
        job_id: jobId,
        status: 'completed',
        result,
      });
      
    } catch (jobError) {
      // Atualizar status para failed
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          completed_at: new Date(),
          error: jobError instanceof Error ? jobError.message : 'Unknown error',
        },
      });
      
      throw jobError;
    }
    
  } catch (err) {
    logger.error('Execute scheduled job error', err as Error, { 
      organizationId,
      userId: user.sub,
      requestId: context.awsRequestId 
    });
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

async function invokeLambda(functionName: string, payload: any): Promise<any> {
  const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
  
  const response = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: `evo-uds-${process.env.ENVIRONMENT || 'dev'}-${functionName}`,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload),
    })
  );
  
  if (response.Payload) {
    const result = JSON.parse(new TextDecoder().decode(response.Payload));
    return result;
  }
  
  return null;
}
