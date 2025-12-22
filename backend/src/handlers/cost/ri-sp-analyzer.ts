/**
 * Lambda handler for RI/SP Analyzer
 * AWS Lambda Handler for ri-sp-analyzer
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { EC2Client, DescribeReservedInstancesCommand } from '@aws-sdk/client-ec2';

interface RISPAnalyzerRequest {
  accountId: string;
  region?: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 RI/SP Analyzer started');
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: RISPAnalyzerRequest = event.body ? JSON.parse(event.body) : {};
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
    
    const ec2Client = new EC2Client({
      region,
      credentials: toAwsCredentials(resolvedCreds),
    });
    
    const riResponse = await ec2Client.send(new DescribeReservedInstancesCommand({}));
    
    const reservedInstances = (riResponse.ReservedInstances || []).map(ri => ({
      id: ri.ReservedInstancesId,
      instanceType: ri.InstanceType,
      instanceCount: ri.InstanceCount,
      state: ri.State,
      start: ri.Start,
      end: ri.End,
      offeringType: ri.OfferingType,
    }));
    
    const recommendations = [];
    
    if (reservedInstances.length === 0) {
      recommendations.push({
        type: 'ri_purchase',
        priority: 'medium',
        message: 'No Reserved Instances found. Consider purchasing RIs for steady-state workloads',
        potentialSavings: 'Up to 72%',
      });
    }
    
    logger.info(`✅ Analyzed ${reservedInstances.length} Reserved Instances`);
    
    return success({
      success: true,
      reservedInstances,
      recommendations,
      summary: {
        totalRIs: reservedInstances.length,
        active: reservedInstances.filter(ri => ri.state === 'active').length,
      },
    });
    
  } catch (err) {
    logger.error('❌ RI/SP Analyzer error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
