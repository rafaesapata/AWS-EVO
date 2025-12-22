/**
 * Lambda handler for Well-Architected Scan
 * AWS Lambda Handler for well-architected-scan
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logging.js';
import { 
  WellArchitectedClient, 
  ListWorkloadsCommand,
  GetWorkloadCommand 
} from '@aws-sdk/client-wellarchitected';

interface WellArchitectedScanRequest {
  accountId: string;
  region?: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationId(user);
  
  logger.info('Well-Architected Scan started', { 
    organizationId,
    userId: user.id,
    requestId: context.awsRequestId 
  });
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const body: WellArchitectedScanRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId, region = 'us-east-1' } = body;
    
    if (!accountId) {
      return error('Missing required parameter: accountId');
    }
    
    const prisma = getPrismaClient();
    
    const account = await prisma.awsCredential.findFirst({
      where: { id: accountId, organization_id: organizationId, is_active: true },
    });
    
    if (!account) {
      return error('AWS account not found');
    }
    
    const resolvedCreds = await resolveAwsCredentials(account, region);
    
    const waClient = new WellArchitectedClient({
      region,
      credentials: toAwsCredentials(resolvedCreds),
    });
    
    // Listar workloads
    const listCommand = new ListWorkloadsCommand({});
    const listResponse = await waClient.send(listCommand);
    
    const workloads = [];
    
    if (listResponse.WorkloadSummaries) {
      for (const summary of listResponse.WorkloadSummaries) {
        const getCommand = new GetWorkloadCommand({
          WorkloadId: summary.WorkloadId,
        });
        
        const workload = await waClient.send(getCommand);
        workloads.push(workload.Workload);
      }
    }
    
    logger.info('Well-Architected scan completed', { 
      organizationId, 
      accountId, 
      region,
      workloadsCount: workloads.length 
    });
    
    return success({
      success: true,
      workloads,
      summary: {
        count: workloads.length,
      },
    });
    
  } catch (err) {
    logger.error('Well-Architected Scan error', err as Error, { 
      organizationId,
      userId: user.id,
      requestId: context.awsRequestId 
    });
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
