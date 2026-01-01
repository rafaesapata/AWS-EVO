"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const aws_helpers_js_1 = require("../../lib/aws-helpers.js");
const logging_js_1 = require("../../lib/logging.js");
const metrics_js_1 = require("../../lib/metrics.js");
const client_ec2_1 = require("@aws-sdk/client-ec2");
const client_rds_1 = require("@aws-sdk/client-rds");
async function handler(event, context) {
    const startTime = Date.now();
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    const user = (0, auth_js_1.getUserFromEvent)(event);
    const organizationId = (0, auth_js_1.getOrganizationId)(user);
    logging_js_1.logger.info('Cost optimization started', {
        organizationId,
        userId: user.sub,
        requestId: context.awsRequestId
    });
    try {
        const body = event.body ? JSON.parse(event.body) : {};
        const { accountId } = body;
        const prisma = (0, database_js_1.getPrismaClient)();
        const credential = await prisma.awsCredential.findFirst({
            where: {
                organization_id: organizationId,
                is_active: true,
                ...(accountId && { id: accountId }),
            },
            orderBy: { created_at: 'desc' },
        });
        if (!credential) {
            logging_js_1.logger.warn('AWS credentials not found for cost optimization', {
                organizationId,
                accountId
            });
            return (0, response_js_1.badRequest)('AWS credentials not found');
        }
        const regions = credential.regions || ['us-east-1'];
        const optimizations = [];
        for (const region of regions) {
            const creds = await (0, aws_helpers_js_1.resolveAwsCredentials)(credential, region);
            // EC2 Optimizations
            const ec2Client = new client_ec2_1.EC2Client({ region, credentials: (0, aws_helpers_js_1.toAwsCredentials)(creds) });
            const instancesResponse = await ec2Client.send(new client_ec2_1.DescribeInstancesCommand({}));
            const instances = instancesResponse.Reservations?.flatMap(r => r.Instances || []) || [];
            // Stopped instances
            for (const instance of instances.filter(i => i.State?.Name === 'stopped')) {
                optimizations.push({
                    type: 'terminate_stopped_instance',
                    resource_id: instance.InstanceId || 'unknown',
                    resource_type: 'EC2',
                    current_cost: 10, // EBS cost estimate
                    optimized_cost: 0,
                    savings: 10,
                    recommendation: 'Terminate stopped instance or create AMI and terminate',
                    priority: 'medium',
                    effort: 'low',
                });
            }
            // Old generation instances
            for (const instance of instances.filter(i => i.State?.Name === 'running' &&
                (i.InstanceType?.startsWith('t2.') || i.InstanceType?.startsWith('m4.')))) {
                const currentCost = estimateInstanceCost(instance.InstanceType || '');
                const newGenType = instance.InstanceType?.replace('t2.', 't3.').replace('m4.', 'm5.');
                const optimizedCost = estimateInstanceCost(newGenType || '');
                optimizations.push({
                    type: 'upgrade_instance_generation',
                    resource_id: instance.InstanceId || 'unknown',
                    resource_type: 'EC2',
                    current_cost: currentCost,
                    optimized_cost: optimizedCost,
                    savings: currentCost - optimizedCost,
                    recommendation: `Upgrade from ${instance.InstanceType} to ${newGenType} for better price/performance`,
                    priority: 'medium',
                    effort: 'medium',
                });
            }
            // Unattached EBS volumes
            const volumesResponse = await ec2Client.send(new client_ec2_1.DescribeVolumesCommand({}));
            const unattachedVolumes = volumesResponse.Volumes?.filter(v => v.State === 'available') || [];
            for (const volume of unattachedVolumes) {
                const monthlyCost = (volume.Size || 0) * 0.10; // $0.10/GB/month estimate
                optimizations.push({
                    type: 'delete_unattached_volume',
                    resource_id: volume.VolumeId || 'unknown',
                    resource_type: 'EBS',
                    current_cost: monthlyCost,
                    optimized_cost: 0,
                    savings: monthlyCost,
                    recommendation: 'Delete unattached EBS volume or create snapshot',
                    priority: 'high',
                    effort: 'low',
                });
            }
            // RDS Optimizations
            const rdsClient = new client_rds_1.RDSClient({ region, credentials: (0, aws_helpers_js_1.toAwsCredentials)(creds) });
            const dbResponse = await rdsClient.send(new client_rds_1.DescribeDBInstancesCommand({}));
            const databases = dbResponse.DBInstances || [];
            // Oversized databases
            for (const db of databases.filter(d => d.DBInstanceClass?.includes('db.r5.') || d.DBInstanceClass?.includes('db.r6.'))) {
                const currentCost = estimateRDSCost(db.DBInstanceClass || '');
                const recommendedClass = db.DBInstanceClass?.replace('r5.', 't3.').replace('r6.', 't3.');
                const optimizedCost = estimateRDSCost(recommendedClass || '');
                optimizations.push({
                    type: 'downsize_rds',
                    resource_id: db.DBInstanceIdentifier || 'unknown',
                    resource_type: 'RDS',
                    current_cost: currentCost,
                    optimized_cost: optimizedCost,
                    savings: currentCost - optimizedCost,
                    recommendation: `Consider downsizing from ${db.DBInstanceClass} to ${recommendedClass} if metrics allow`,
                    priority: 'high',
                    effort: 'medium',
                });
            }
        }
        // Sort by savings
        optimizations.sort((a, b) => b.savings - a.savings);
        // Save optimizations to database
        const prismaOptimizations = optimizations.map(opt => ({
            organization_id: organizationId,
            aws_account_id: credential.account_id || 'unknown',
            resource_type: opt.resource_type,
            resource_id: opt.resource_id,
            optimization_type: opt.type,
            potential_savings: opt.savings,
            status: 'pending'
        }));
        // Clear existing optimizations for this account and insert new ones
        await prisma.costOptimization.deleteMany({
            where: {
                organization_id: organizationId,
                aws_account_id: credential.account_id || 'unknown'
            }
        });
        if (prismaOptimizations.length > 0) {
            await prisma.costOptimization.createMany({
                data: prismaOptimizations
            });
        }
        const totalSavings = optimizations.reduce((sum, opt) => sum + opt.savings, 0);
        const duration = Date.now() - startTime;
        // Publish metrics
        await metrics_js_1.businessMetrics.costAnalysisCompleted(0, // Total cost analyzed - would need actual cost data
        totalSavings, organizationId);
        logging_js_1.logger.info('Cost optimization completed', {
            organizationId,
            optimizationsCount: optimizations.length,
            totalSavings: parseFloat(totalSavings.toFixed(2)),
            duration
        });
        return (0, response_js_1.success)({
            optimizations,
            summary: {
                total_opportunities: optimizations.length,
                monthly_savings: parseFloat(totalSavings.toFixed(2)),
                annual_savings: parseFloat((totalSavings * 12).toFixed(2)),
                by_priority: {
                    high: optimizations.filter(o => o.priority === 'high').length,
                    medium: optimizations.filter(o => o.priority === 'medium').length,
                    low: optimizations.filter(o => o.priority === 'low').length,
                },
            },
        });
    }
    catch (err) {
        logging_js_1.logger.error('Cost optimization error', err, {
            organizationId,
            userId: user.sub,
            requestId: context.awsRequestId
        });
        await metrics_js_1.businessMetrics.errorOccurred('cost_optimization_error', 'cost-optimization', organizationId);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
function estimateInstanceCost(instanceType) {
    const costs = {
        't2.micro': 8.5,
        't2.small': 17,
        't2.medium': 34,
        't3.micro': 7.5,
        't3.small': 15,
        't3.medium': 30,
        'm4.large': 73,
        'm5.large': 70,
    };
    return costs[instanceType] || 50;
}
function estimateRDSCost(instanceClass) {
    const costs = {
        'db.t3.micro': 15,
        'db.t3.small': 30,
        'db.t3.medium': 60,
        'db.r5.large': 180,
        'db.r6.large': 170,
    };
    return costs[instanceClass] || 100;
}
//# sourceMappingURL=cost-optimization.js.map