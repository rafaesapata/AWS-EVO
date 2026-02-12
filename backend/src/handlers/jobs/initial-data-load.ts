import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logger.js';
import { getPrismaClient } from '../../lib/database.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { success, error, badRequest, notFound, corsOptions } from '../../lib/response.js';
import { getOrigin } from '../../lib/middleware.js';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { EC2Client, DescribeInstancesCommand, DescribeVpcsCommand, DescribeSecurityGroupsCommand } from '@aws-sdk/client-ec2';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import { LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { IAMClient, ListUsersCommand, ListRolesCommand } from '@aws-sdk/client-iam';

const stsClient = new STSClient({});

interface LoadProgress {
  total: number;
  completed: number;
  current: string;
  errors: string[];
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  let organizationId: string;
  let userId: string;
  
  try {
    const user = getUserFromEvent(event);
    userId = user.sub || user.id || 'unknown';
    organizationId = getOrganizationIdWithImpersonation(event, user);
  } catch (authError) {
    logger.error('Authentication error', authError);
    return error('Unauthorized', 401, undefined, origin);
  }

  try {
    const prisma = getPrismaClient();
    const body = JSON.parse(event.body || '{}');
    const { awsAccountId, regions: requestedRegions, resourceTypes } = body;

    if (!awsAccountId) {
      return badRequest('awsAccountId is required', undefined, origin);
    }

    // Buscar conta AWS - FILTRAR POR ORGANIZATION_ID
    const awsAccount = await prisma.awsAccount.findFirst({
      where: { 
        id: awsAccountId,
        organization_id: organizationId  // CRITICAL: Multi-tenancy filter
      },
      include: { organization: true }
    });

    if (!awsAccount) {
      return notFound('AWS Account not found', origin);
    }
    
    // Usar regiões solicitadas ou padrão
    const regions = requestedRegions || ['us-east-1'];

    // Assume role - use the AWS account ID (12-digit number), not the database UUID
    // awsAccount.account_id should be the AWS account number from the aws_accounts table
    const awsAccountNumber = awsAccount.account_id;
    if (!awsAccountNumber || !/^\d{12}$/.test(awsAccountNumber)) {
      return badRequest('Invalid AWS account ID format. Expected 12-digit AWS account number.', undefined, origin);
    }
    
    const assumeRoleResponse = await stsClient.send(new AssumeRoleCommand({
      RoleArn: `arn:aws:iam::${awsAccountNumber}:role/EvoUdsRole`,
      RoleSessionName: 'InitialDataLoadSession',
      DurationSeconds: 3600
    }));

    const credentials = {
      accessKeyId: assumeRoleResponse.Credentials!.AccessKeyId!,
      secretAccessKey: assumeRoleResponse.Credentials!.SecretAccessKey!,
      sessionToken: assumeRoleResponse.Credentials!.SessionToken!
    };

    const progress: LoadProgress = { total: 0, completed: 0, current: '', errors: [] };
    const allResources: unknown[] = [];
    const typesToLoad = resourceTypes || ['EC2', 'RDS', 'S3', 'Lambda', 'VPC', 'SecurityGroup', 'IAM'];

    // Criar registro de job
    const job = await prisma.backgroundJob.create({
      data: {
        organization_id: organizationId,
        job_type: 'INITIAL_DATA_LOAD',
        status: 'RUNNING',
        payload: { regions, resourceTypes: typesToLoad } as any,
        started_at: new Date()
      }
    });

    try {
      for (const region of regions) {
        const ec2Client = new EC2Client({ region, credentials });
        const rdsClient = new RDSClient({ region, credentials });
        const lambdaClient = new LambdaClient({ region, credentials });

        // EC2 Instances
        if (typesToLoad.includes('EC2')) {
          progress.current = `Loading EC2 instances in ${region}`;
          try {
            const instances = await ec2Client.send(new DescribeInstancesCommand({}));
            for (const reservation of instances.Reservations || []) {
              for (const instance of reservation.Instances || []) {
                allResources.push({
                  resourceId: instance.InstanceId,
                  resourceType: 'EC2',
                  region,
                  name: instance.Tags?.find(t => t.Key === 'Name')?.Value || instance.InstanceId,
                  state: instance.State?.Name,
                  metadata: {
                    instanceType: instance.InstanceType,
                    launchTime: instance.LaunchTime,
                    vpcId: instance.VpcId,
                    subnetId: instance.SubnetId
                  }
                });
                progress.completed++;
              }
            }
          } catch (e) { progress.errors.push(`EC2 ${region}: ${e}`); }
        }

        // RDS Instances
        if (typesToLoad.includes('RDS')) {
          progress.current = `Loading RDS instances in ${region}`;
          try {
            const dbInstances = await rdsClient.send(new DescribeDBInstancesCommand({}));
            for (const db of dbInstances.DBInstances || []) {
              allResources.push({
                resourceId: db.DBInstanceIdentifier,
                resourceType: 'RDS',
                region,
                name: db.DBInstanceIdentifier,
                state: db.DBInstanceStatus,
                metadata: {
                  engine: db.Engine,
                  instanceClass: db.DBInstanceClass,
                  multiAZ: db.MultiAZ,
                  storageType: db.StorageType
                }
              });
              progress.completed++;
            }
          } catch (e) { progress.errors.push(`RDS ${region}: ${e}`); }
        }

        // VPCs
        if (typesToLoad.includes('VPC')) {
          progress.current = `Loading VPCs in ${region}`;
          try {
            const vpcs = await ec2Client.send(new DescribeVpcsCommand({}));
            for (const vpc of vpcs.Vpcs || []) {
              allResources.push({
                resourceId: vpc.VpcId,
                resourceType: 'VPC',
                region,
                name: vpc.Tags?.find(t => t.Key === 'Name')?.Value || vpc.VpcId,
                state: vpc.State,
                metadata: { cidrBlock: vpc.CidrBlock, isDefault: vpc.IsDefault }
              });
              progress.completed++;
            }
          } catch (e) { progress.errors.push(`VPC ${region}: ${e}`); }
        }

        // Security Groups
        if (typesToLoad.includes('SecurityGroup')) {
          progress.current = `Loading Security Groups in ${region}`;
          try {
            const sgs = await ec2Client.send(new DescribeSecurityGroupsCommand({}));
            for (const sg of sgs.SecurityGroups || []) {
              allResources.push({
                resourceId: sg.GroupId,
                resourceType: 'SecurityGroup',
                region,
                name: sg.GroupName,
                state: 'active',
                metadata: {
                  vpcId: sg.VpcId,
                  ingressRules: sg.IpPermissions?.length || 0,
                  egressRules: sg.IpPermissionsEgress?.length || 0
                }
              });
              progress.completed++;
            }
          } catch (e) { progress.errors.push(`SG ${region}: ${e}`); }
        }

        // Lambda Functions
        if (typesToLoad.includes('Lambda')) {
          progress.current = `Loading Lambda functions in ${region}`;
          try {
            const functions = await lambdaClient.send(new ListFunctionsCommand({}));
            for (const fn of functions.Functions || []) {
              allResources.push({
                resourceId: fn.FunctionArn,
                resourceType: 'Lambda',
                region,
                name: fn.FunctionName,
                state: fn.State || 'Active',
                metadata: {
                  runtime: fn.Runtime,
                  memorySize: fn.MemorySize,
                  timeout: fn.Timeout,
                  lastModified: fn.LastModified
                }
              });
              progress.completed++;
            }
          } catch (e) { progress.errors.push(`Lambda ${region}: ${e}`); }
        }
      }

      // S3 Buckets (global)
      if (typesToLoad.includes('S3')) {
        progress.current = 'Loading S3 buckets';
        try {
          const s3Client = new S3Client({ region: 'us-east-1', credentials });
          const buckets = await s3Client.send(new ListBucketsCommand({}));
          for (const bucket of buckets.Buckets || []) {
            allResources.push({
              resourceId: bucket.Name,
              resourceType: 'S3',
              region: 'global',
              name: bucket.Name,
              state: 'active',
              metadata: { creationDate: bucket.CreationDate }
            });
            progress.completed++;
          }
        } catch (e) { progress.errors.push(`S3: ${e}`); }
      }

      // IAM (global)
      if (typesToLoad.includes('IAM')) {
        progress.current = 'Loading IAM resources';
        const iamClient = new IAMClient({ region: 'us-east-1', credentials });
        try {
          const users = await iamClient.send(new ListUsersCommand({}));
          for (const user of users.Users || []) {
            allResources.push({
              resourceId: user.Arn,
              resourceType: 'IAM_User',
              region: 'global',
              name: user.UserName,
              state: 'active',
              metadata: { createDate: user.CreateDate, passwordLastUsed: user.PasswordLastUsed }
            });
            progress.completed++;
          }

          const roles = await iamClient.send(new ListRolesCommand({}));
          for (const role of roles.Roles || []) {
            allResources.push({
              resourceId: role.Arn,
              resourceType: 'IAM_Role',
              region: 'global',
              name: role.RoleName,
              state: 'active',
              metadata: { createDate: role.CreateDate, path: role.Path }
            });
            progress.completed++;
          }
        } catch (e) { progress.errors.push(`IAM: ${e}`); }
      }

      // Salvar recursos no banco
      for (const resource of allResources) {
        const r = resource as { resourceId: string; resourceType: string; region: string; name: string; state: string; metadata: Record<string, unknown> };
        await prisma.resourceInventory.upsert({
          where: {
            aws_account_id_resource_id_region: { 
              aws_account_id: awsAccountId, 
              resource_id: r.resourceId,
              region: r.region
            }
          },
          create: {
            organization_id: organizationId,  // Use organizationId from auth
            aws_account_id: awsAccountId,
            resource_id: r.resourceId,
            resource_type: r.resourceType,
            resource_name: r.name,
            region: r.region,
            metadata: r.metadata as any
          },
          update: {
            resource_name: r.name,
            metadata: r.metadata as any
          }
        });
      }

      // Atualizar job
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          completed_at: new Date(),
          result: { resourcesLoaded: allResources.length, errors: progress.errors }
        }
      });

      return success({
        jobId: job.id,
        resourcesLoaded: allResources.length,
        byType: groupByType(allResources),
        errors: progress.errors
      }, 200, origin);
    } catch (jobError) {
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', completed_at: new Date(), error: String(jobError) }
      });
      throw jobError;
    }
  } catch (err) {
    logger.error('Initial data load error:', err);
    return error('Internal server error', 500, undefined, origin);
  }
}

function groupByType(resources: unknown[]): Record<string, number> {
  return (resources as { resourceType: string }[]).reduce((acc, r) => {
    acc[r.resourceType] = (acc[r.resourceType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}
