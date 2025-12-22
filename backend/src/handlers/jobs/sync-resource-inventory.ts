/**
 * Lambda handler for Sync Resource Inventory
 * AWS Lambda Handler for sync-resource-inventory
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';

interface SyncResourceInventoryRequest {
  accountId: string;
  region?: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Sync Resource Inventory started');
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: SyncResourceInventoryRequest = event.body ? JSON.parse(event.body) : {};
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
    
    const response = await ec2Client.send(new DescribeInstancesCommand({}));
    
    let syncedCount = 0;
    
    if (response.Reservations) {
      for (const reservation of response.Reservations) {
        if (reservation.Instances) {
          for (const instance of reservation.Instances) {
            await prisma.resourceInventory.upsert({
              where: {
                aws_account_id_resource_id_region: {
                  aws_account_id: accountId,
                  resource_id: instance.InstanceId!,
                  region,
                },
              },
              update: {
                resource_name: instance.Tags?.find(t => t.Key === 'Name')?.Value,
                metadata: {
                  instanceType: instance.InstanceType,
                  state: instance.State?.Name,
                } as any
              },
              create: {
                organization_id: organizationId,
                aws_account_id: accountId,
                resource_id: instance.InstanceId!,
                resource_type: 'EC2::Instance',
                resource_name: instance.Tags?.find(t => t.Key === 'Name')?.Value,
                region,
                metadata: {
                  instanceType: instance.InstanceType,
                  state: instance.State?.Name,
                } as any
              },
            });
            syncedCount++;
          }
        }
      }
    }
    
    logger.info(`✅ Synced ${syncedCount} resources`);
    
    return success({
      success: true,
      syncedCount,
      region,
    });
    
  } catch (err) {
    logger.error('❌ Sync Resource Inventory error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
