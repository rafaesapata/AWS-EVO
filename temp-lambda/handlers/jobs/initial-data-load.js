"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const logging_js_1 = require("../../lib/logging.js");
const database_js_1 = require("../../lib/database.js");
const auth_js_1 = require("../../lib/auth.js");
const response_js_1 = require("../../lib/response.js");
const middleware_js_1 = require("../../lib/middleware.js");
const client_sts_1 = require("@aws-sdk/client-sts");
const client_ec2_1 = require("@aws-sdk/client-ec2");
const client_rds_1 = require("@aws-sdk/client-rds");
const client_s3_1 = require("@aws-sdk/client-s3");
const client_lambda_1 = require("@aws-sdk/client-lambda");
const client_iam_1 = require("@aws-sdk/client-iam");
const stsClient = new client_sts_1.STSClient({});
async function handler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    if (httpMethod === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    let organizationId;
    let userId;
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        userId = user.sub || user.id || 'unknown';
        organizationId = (0, auth_js_1.getOrganizationId)(user);
    }
    catch (authError) {
        logging_js_1.logger.error('Authentication error', authError);
        return (0, response_js_1.error)('Unauthorized', 401, undefined, origin);
    }
    try {
        const prisma = (0, database_js_1.getPrismaClient)();
        const body = JSON.parse(event.body || '{}');
        const { awsAccountId, regions: requestedRegions, resourceTypes } = body;
        if (!awsAccountId) {
            return (0, response_js_1.badRequest)('awsAccountId is required', undefined, origin);
        }
        // Buscar conta AWS - FILTRAR POR ORGANIZATION_ID
        const awsAccount = await prisma.awsAccount.findFirst({
            where: {
                id: awsAccountId,
                organization_id: organizationId // CRITICAL: Multi-tenancy filter
            },
            include: { organization: true }
        });
        if (!awsAccount) {
            return (0, response_js_1.notFound)('AWS Account not found', origin);
        }
        // Usar regiões solicitadas ou padrão
        const regions = requestedRegions || ['us-east-1'];
        // Assume role
        const assumeRoleResponse = await stsClient.send(new client_sts_1.AssumeRoleCommand({
            RoleArn: `arn:aws:iam::${awsAccount.account_id}:role/EvoUdsRole`,
            RoleSessionName: 'InitialDataLoadSession',
            DurationSeconds: 3600
        }));
        const credentials = {
            accessKeyId: assumeRoleResponse.Credentials.AccessKeyId,
            secretAccessKey: assumeRoleResponse.Credentials.SecretAccessKey,
            sessionToken: assumeRoleResponse.Credentials.SessionToken
        };
        const progress = { total: 0, completed: 0, current: '', errors: [] };
        const allResources = [];
        const typesToLoad = resourceTypes || ['EC2', 'RDS', 'S3', 'Lambda', 'VPC', 'SecurityGroup', 'IAM'];
        // Criar registro de job
        const job = await prisma.backgroundJob.create({
            data: {
                organization_id: organizationId, // Use organizationId from auth
                job_type: 'INITIAL_DATA_LOAD',
                job_name: 'Initial Data Load',
                status: 'RUNNING',
                parameters: { regions, resourceTypes: typesToLoad },
                started_at: new Date()
            }
        });
        try {
            for (const region of regions) {
                const ec2Client = new client_ec2_1.EC2Client({ region, credentials });
                const rdsClient = new client_rds_1.RDSClient({ region, credentials });
                const lambdaClient = new client_lambda_1.LambdaClient({ region, credentials });
                // EC2 Instances
                if (typesToLoad.includes('EC2')) {
                    progress.current = `Loading EC2 instances in ${region}`;
                    try {
                        const instances = await ec2Client.send(new client_ec2_1.DescribeInstancesCommand({}));
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
                    }
                    catch (e) {
                        progress.errors.push(`EC2 ${region}: ${e}`);
                    }
                }
                // RDS Instances
                if (typesToLoad.includes('RDS')) {
                    progress.current = `Loading RDS instances in ${region}`;
                    try {
                        const dbInstances = await rdsClient.send(new client_rds_1.DescribeDBInstancesCommand({}));
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
                    }
                    catch (e) {
                        progress.errors.push(`RDS ${region}: ${e}`);
                    }
                }
                // VPCs
                if (typesToLoad.includes('VPC')) {
                    progress.current = `Loading VPCs in ${region}`;
                    try {
                        const vpcs = await ec2Client.send(new client_ec2_1.DescribeVpcsCommand({}));
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
                    }
                    catch (e) {
                        progress.errors.push(`VPC ${region}: ${e}`);
                    }
                }
                // Security Groups
                if (typesToLoad.includes('SecurityGroup')) {
                    progress.current = `Loading Security Groups in ${region}`;
                    try {
                        const sgs = await ec2Client.send(new client_ec2_1.DescribeSecurityGroupsCommand({}));
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
                    }
                    catch (e) {
                        progress.errors.push(`SG ${region}: ${e}`);
                    }
                }
                // Lambda Functions
                if (typesToLoad.includes('Lambda')) {
                    progress.current = `Loading Lambda functions in ${region}`;
                    try {
                        const functions = await lambdaClient.send(new client_lambda_1.ListFunctionsCommand({}));
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
                    }
                    catch (e) {
                        progress.errors.push(`Lambda ${region}: ${e}`);
                    }
                }
            }
            // S3 Buckets (global)
            if (typesToLoad.includes('S3')) {
                progress.current = 'Loading S3 buckets';
                try {
                    const s3Client = new client_s3_1.S3Client({ region: 'us-east-1', credentials });
                    const buckets = await s3Client.send(new client_s3_1.ListBucketsCommand({}));
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
                }
                catch (e) {
                    progress.errors.push(`S3: ${e}`);
                }
            }
            // IAM (global)
            if (typesToLoad.includes('IAM')) {
                progress.current = 'Loading IAM resources';
                const iamClient = new client_iam_1.IAMClient({ region: 'us-east-1', credentials });
                try {
                    const users = await iamClient.send(new client_iam_1.ListUsersCommand({}));
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
                    const roles = await iamClient.send(new client_iam_1.ListRolesCommand({}));
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
                }
                catch (e) {
                    progress.errors.push(`IAM: ${e}`);
                }
            }
            // Salvar recursos no banco
            for (const resource of allResources) {
                const r = resource;
                await prisma.resourceInventory.upsert({
                    where: {
                        aws_account_id_resource_id_region: {
                            aws_account_id: awsAccountId,
                            resource_id: r.resourceId,
                            region: r.region
                        }
                    },
                    create: {
                        organization_id: organizationId, // Use organizationId from auth
                        aws_account_id: awsAccountId,
                        resource_id: r.resourceId,
                        resource_type: r.resourceType,
                        resource_name: r.name,
                        region: r.region,
                        metadata: r.metadata
                    },
                    update: {
                        resource_name: r.name,
                        metadata: r.metadata
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
            return (0, response_js_1.success)({
                jobId: job.id,
                resourcesLoaded: allResources.length,
                byType: groupByType(allResources),
                errors: progress.errors
            }, 200, origin);
        }
        catch (jobError) {
            await prisma.backgroundJob.update({
                where: { id: job.id },
                data: { status: 'FAILED', completed_at: new Date(), error: String(jobError) }
            });
            throw jobError;
        }
    }
    catch (err) {
        logging_js_1.logger.error('Initial data load error:', err);
        return (0, response_js_1.error)('Internal server error', 500, undefined, origin);
    }
}
function groupByType(resources) {
    return resources.reduce((acc, r) => {
        acc[r.resourceType] = (acc[r.resourceType] || 0) + 1;
        return acc;
    }, {});
}
//# sourceMappingURL=initial-data-load.js.map