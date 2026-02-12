import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Sync Resource Inventory
 * AWS Lambda Handler for sync-resource-inventory
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logger.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { syncResourceInventorySchema } from '../../lib/schemas.js';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Sync Resource Inventory started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    // Validate input with Zod
    const validation = parseAndValidateBody(syncResourceInventorySchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { accountId, regions, services, fullSync } = validation.data;
    const requestedRegion = regions?.[0];
    
    const prisma = getPrismaClient();
    
    const account = await prisma.awsCredential.findFirst({
      where: { id: accountId, organization_id: organizationId, is_active: true },
    });
    
    if (!account) {
      return error('AWS account not found', 404);
    }
    
    // Usar região solicitada, ou primeira região da conta, ou padrão
    const accountRegions = account.regions as string[] | null;
    const region = requestedRegion || 
                   (accountRegions && accountRegions.length > 0 ? accountRegions[0] : 'us-east-1');
    
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
    return error('An unexpected error occurred. Please try again.', 500);
  }
}
