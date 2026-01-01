"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const aws_helpers_js_1 = require("../../lib/aws-helpers.js");
const client_ec2_1 = require("@aws-sdk/client-ec2");
const client_rds_1 = require("@aws-sdk/client-rds");
const client_cost_explorer_1 = require("@aws-sdk/client-cost-explorer");
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
async function handler(event, context) {
    logging_js_1.logger.info('🚀 Advanced RI/SP Analyzer started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { accountId, region = 'us-east-1', analysisDepth = 'comprehensive' } = body;
        if (!accountId) {
            return (0, response_js_1.error)('Missing required parameter: accountId');
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        const account = await prisma.awsCredential.findFirst({
            where: { id: accountId, organization_id: organizationId, is_active: true },
        });
        if (!account) {
            return (0, response_js_1.error)('AWS account not found');
        }
        const resolvedCreds = await (0, aws_helpers_js_1.resolveAwsCredentials)(account, region);
        const credentials = (0, aws_helpers_js_1.toAwsCredentials)(resolvedCreds);
        const ec2Client = new client_ec2_1.EC2Client({ region, credentials });
        const rdsClient = new client_rds_1.RDSClient({ region, credentials });
        const costExplorerClient = new client_cost_explorer_1.CostExplorerClient({ region, credentials });
        const cloudWatchClient = new client_cloudwatch_1.CloudWatchClient({ region, credentials });
        logging_js_1.logger.info('🔍 Starting comprehensive cost optimization analysis...');
        // 1. Get current Reserved Instances and Savings Plans
        const [reservedInstances, reservedRDSInstances, savingsPlans] = await Promise.all([
            getCurrentReservedInstances(ec2Client),
            getCurrentReservedRDSInstances(rdsClient),
            getCurrentSavingsPlans(costExplorerClient)
        ]);
        // 2. Get current running instances
        const [ec2Instances, rdsInstances] = await Promise.all([
            getCurrentEC2Instances(ec2Client),
            getCurrentRDSInstances(rdsClient)
        ]);
        // 3. Analyze usage patterns and costs
        const [usagePatterns, costData] = await Promise.all([
            analyzeUsagePatterns(ec2Instances, rdsInstances, cloudWatchClient),
            getCostData(costExplorerClient)
        ]);
        // 4. Generate comprehensive recommendations
        const recommendations = await generateAdvancedRecommendations(reservedInstances, reservedRDSInstances, savingsPlans, ec2Instances, rdsInstances, usagePatterns, costData, costExplorerClient);
        // 5. Calculate coverage and utilization
        const coverage = await calculateCoverage(costExplorerClient);
        // 6. Generate executive summary
        const executiveSummary = generateExecutiveSummary(reservedInstances, reservedRDSInstances, savingsPlans, recommendations, coverage);
        logging_js_1.logger.info(`✅ Analysis complete: ${recommendations.length} recommendations generated`);
        return (0, response_js_1.success)({
            success: true,
            executiveSummary,
            reservedInstances: {
                ec2: reservedInstances,
                rds: reservedRDSInstances,
                total: reservedInstances.length + reservedRDSInstances.length
            },
            savingsPlans: {
                plans: savingsPlans,
                total: savingsPlans.length
            },
            currentResources: {
                ec2Instances: ec2Instances.length,
                rdsInstances: rdsInstances.length,
                totalMonthlyCost: usagePatterns.reduce((sum, p) => sum + p.monthlyCost, 0)
            },
            usagePatterns,
            coverage,
            recommendations: recommendations.sort((a, b) => {
                const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
                return priorityOrder[b.priority] - priorityOrder[a.priority];
            }),
            potentialSavings: {
                monthly: recommendations.reduce((sum, r) => sum + r.potentialSavings.monthly, 0),
                annual: recommendations.reduce((sum, r) => sum + r.potentialSavings.annual, 0),
                maxPercentage: Math.max(...recommendations.map(r => r.potentialSavings.percentage), 0)
            },
            analysisMetadata: {
                analysisDepth,
                region,
                timestamp: new Date().toISOString(),
                accountId
            }
        });
    }
    catch (err) {
        logging_js_1.logger.error('❌ Advanced RI/SP Analyzer error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
// Helper Functions for Advanced Analysis
async function getCurrentReservedInstances(ec2Client) {
    try {
        const response = await ec2Client.send(new client_ec2_1.DescribeReservedInstancesCommand({}));
        return (response.ReservedInstances || []).map(ri => ({
            id: ri.ReservedInstancesId || '',
            instanceType: ri.InstanceType || '',
            instanceCount: ri.InstanceCount || 0,
            state: ri.State || '',
            start: ri.Start || new Date(),
            end: ri.End || new Date(),
            offeringType: ri.OfferingType || '',
            availabilityZone: ri.AvailabilityZone,
            platform: ri.ProductDescription,
            scope: ri.Scope
        }));
    }
    catch (error) {
        logging_js_1.logger.warn('Could not fetch Reserved Instances:', { error: error instanceof Error ? error.message : String(error) });
        return [];
    }
}
async function getCurrentReservedRDSInstances(rdsClient) {
    try {
        const response = await rdsClient.send(new client_rds_1.DescribeReservedDBInstancesCommand({}));
        return (response.ReservedDBInstances || []).map(rds => ({
            id: rds.ReservedDBInstanceId || '',
            dbInstanceClass: rds.DBInstanceClass || '',
            engine: rds.ProductDescription || '',
            state: rds.State || '',
            start: rds.StartTime || new Date(),
            end: new Date((rds.StartTime?.getTime() || 0) + (rds.Duration || 0) * 1000),
            instanceCount: rds.DBInstanceCount || 0,
            offeringType: rds.OfferingType || ''
        }));
    }
    catch (error) {
        logging_js_1.logger.warn('Could not fetch Reserved RDS Instances:', { error: error instanceof Error ? error.message : String(error) });
        return [];
    }
}
async function getCurrentSavingsPlans(costExplorerClient) {
    try {
        // Note: This would require @aws-sdk/client-savingsplans for full implementation
        // For now, return empty array but log that we attempted to fetch
        logging_js_1.logger.info('Savings Plans analysis requires additional SDK client');
        return [];
    }
    catch (error) {
        logging_js_1.logger.warn('Could not fetch Savings Plans:', { error: error instanceof Error ? error.message : String(error) });
        return [];
    }
}
async function getCurrentEC2Instances(ec2Client) {
    try {
        const response = await ec2Client.send(new client_ec2_1.DescribeInstancesCommand({}));
        const instances = [];
        for (const reservation of response.Reservations || []) {
            for (const instance of reservation.Instances || []) {
                if (instance.State?.Name === 'running') {
                    instances.push({
                        instanceId: instance.InstanceId || '',
                        instanceType: instance.InstanceType || '',
                        state: instance.State?.Name || '',
                        launchTime: instance.LaunchTime || new Date(),
                        availabilityZone: instance.Placement?.AvailabilityZone || '',
                        platform: instance.Platform || 'Linux/UNIX'
                    });
                }
            }
        }
        return instances;
    }
    catch (error) {
        logging_js_1.logger.warn('Could not fetch EC2 instances:', { error: error instanceof Error ? error.message : String(error) });
        return [];
    }
}
async function getCurrentRDSInstances(rdsClient) {
    try {
        const response = await rdsClient.send(new client_rds_1.DescribeDBInstancesCommand({}));
        return (response.DBInstances || [])
            .filter(db => db.DBInstanceStatus === 'available')
            .map(db => ({
            dbInstanceIdentifier: db.DBInstanceIdentifier || '',
            dbInstanceClass: db.DBInstanceClass || '',
            engine: db.Engine || '',
            availabilityZone: db.AvailabilityZone || '',
            multiAZ: db.MultiAZ || false
        }));
    }
    catch (error) {
        logging_js_1.logger.warn('Could not fetch RDS instances:', { error: error instanceof Error ? error.message : String(error) });
        return [];
    }
}
async function analyzeUsagePatterns(ec2Instances, rdsInstances, cloudWatchClient) {
    const patterns = [];
    // Group EC2 instances by type
    const ec2ByType = ec2Instances.reduce((acc, instance) => {
        if (!acc[instance.instanceType]) {
            acc[instance.instanceType] = [];
        }
        acc[instance.instanceType].push(instance);
        return acc;
    }, {});
    // Analyze each instance type
    for (const [instanceType, instances] of Object.entries(ec2ByType)) {
        try {
            // Calculate average utilization (simplified - would need actual CloudWatch metrics)
            const avgUtilization = await getAverageUtilization(instances, cloudWatchClient);
            const consistencyScore = calculateConsistencyScore(instances);
            const monthlyCost = estimateMonthlyCost(instanceType, instances.length);
            patterns.push({
                instanceType,
                averageHoursPerDay: avgUtilization.hoursPerDay,
                consistencyScore,
                recommendedCommitment: determineCommitmentLevel(avgUtilization.hoursPerDay, consistencyScore),
                instances: instances.length,
                monthlyCost
            });
        }
        catch (error) {
            logging_js_1.logger.warn(`Could not analyze pattern for ${instanceType}:`, { error: error instanceof Error ? error.message : String(error) });
        }
    }
    return patterns;
}
async function getAverageUtilization(instances, cloudWatchClient) {
    // Simplified utilization calculation
    // In a real implementation, this would fetch actual CloudWatch metrics
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    // For demo purposes, assume instances running 24/7 have high utilization
    const avgHoursPerDay = instances.reduce((sum, instance) => {
        const daysRunning = Math.min(30, (now.getTime() - instance.launchTime.getTime()) / (24 * 60 * 60 * 1000));
        return sum + (daysRunning > 0 ? 24 : 0);
    }, 0) / instances.length;
    return { hoursPerDay: avgHoursPerDay };
}
function calculateConsistencyScore(instances) {
    // Simplified consistency calculation based on launch times
    if (instances.length === 1)
        return 100;
    const now = new Date();
    const avgAge = instances.reduce((sum, instance) => {
        return sum + (now.getTime() - instance.launchTime.getTime());
    }, 0) / instances.length;
    // Higher score for instances that have been running consistently
    return Math.min(100, (avgAge / (30 * 24 * 60 * 60 * 1000)) * 100);
}
function determineCommitmentLevel(hoursPerDay, consistencyScore) {
    if (hoursPerDay >= 20 && consistencyScore >= 80)
        return 'full';
    if (hoursPerDay >= 12 && consistencyScore >= 60)
        return 'partial';
    return 'none';
}
function estimateMonthlyCost(instanceType, count) {
    // Simplified cost estimation - in reality, would use AWS Pricing API
    const baseCosts = {
        't3.micro': 8.5,
        't3.small': 17,
        't3.medium': 34,
        't3.large': 67,
        't3.xlarge': 134,
        'm5.large': 88,
        'm5.xlarge': 176,
        'm5.2xlarge': 352,
        'c5.large': 78,
        'c5.xlarge': 156,
        'r5.large': 115,
        'r5.xlarge': 230
    };
    const baseCost = baseCosts[instanceType] || 100; // Default estimate
    return baseCost * count;
}
async function getCostData(costExplorerClient) {
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        const response = await costExplorerClient.send(new client_cost_explorer_1.GetCostAndUsageCommand({
            TimePeriod: {
                Start: startDate.toISOString().split('T')[0],
                End: endDate.toISOString().split('T')[0],
            },
            Granularity: 'MONTHLY',
            Metrics: ['BlendedCost', 'UnblendedCost'],
            GroupBy: [
                { Type: 'DIMENSION', Key: 'SERVICE' }
            ]
        }));
        return response.ResultsByTime || [];
    }
    catch (error) {
        logging_js_1.logger.warn('Could not fetch cost data:', { error: error instanceof Error ? error.message : String(error) });
        return [];
    }
}
async function generateAdvancedRecommendations(reservedInstances, reservedRDSInstances, savingsPlans, ec2Instances, rdsInstances, usagePatterns, costData, costExplorerClient) {
    const recommendations = [];
    // 1. Reserved Instance Recommendations
    if (reservedInstances.length === 0 && ec2Instances.length > 0) {
        const highUtilizationPatterns = usagePatterns.filter(p => p.recommendedCommitment !== 'none');
        if (highUtilizationPatterns.length > 0) {
            const totalMonthlySavings = highUtilizationPatterns.reduce((sum, pattern) => {
                return sum + (pattern.monthlyCost * 0.4); // Up to 40% savings with RIs
            }, 0);
            recommendations.push({
                type: 'ri_purchase',
                priority: 'high',
                service: 'EC2',
                title: 'Purchase Reserved Instances for Steady Workloads',
                description: `${highUtilizationPatterns.length} instance types show consistent usage patterns suitable for Reserved Instances. Consider 1-year or 3-year commitments for maximum savings.`,
                potentialSavings: {
                    monthly: totalMonthlySavings,
                    annual: totalMonthlySavings * 12,
                    percentage: 40
                },
                implementation: {
                    difficulty: 'easy',
                    timeToImplement: '1-2 hours',
                    steps: [
                        'Review usage patterns in AWS Cost Explorer',
                        'Purchase Reserved Instances for identified instance types',
                        'Monitor utilization and adjust as needed',
                        'Set up billing alerts for RI utilization'
                    ]
                },
                details: {
                    recommendedInstances: highUtilizationPatterns.map(p => ({
                        instanceType: p.instanceType,
                        quantity: p.instances,
                        commitment: p.recommendedCommitment,
                        monthlySavings: p.monthlyCost * 0.4
                    }))
                }
            });
        }
    }
    // 2. Savings Plans Recommendations
    if (savingsPlans.length === 0) {
        const totalComputeCost = usagePatterns.reduce((sum, p) => sum + p.monthlyCost, 0);
        if (totalComputeCost > 100) {
            recommendations.push({
                type: 'sp_purchase',
                priority: 'high',
                service: 'General',
                title: 'Implement Compute Savings Plans',
                description: 'Compute Savings Plans provide flexible savings across EC2, Lambda, and Fargate with up to 66% savings. More flexible than Reserved Instances.',
                potentialSavings: {
                    monthly: totalComputeCost * 0.3,
                    annual: totalComputeCost * 0.3 * 12,
                    percentage: 30
                },
                implementation: {
                    difficulty: 'easy',
                    timeToImplement: '30 minutes',
                    steps: [
                        'Access AWS Cost Management console',
                        'Navigate to Savings Plans',
                        'Review recommendations and purchase appropriate plan',
                        'Monitor utilization monthly'
                    ]
                },
                details: {
                    recommendedCommitment: Math.floor(totalComputeCost * 0.7), // 70% of current usage
                    planType: 'Compute Savings Plan',
                    term: '1 year'
                }
            });
        }
    }
    // 3. Right-sizing Recommendations
    const underutilizedPatterns = usagePatterns.filter(p => p.averageHoursPerDay < 12);
    if (underutilizedPatterns.length > 0) {
        const potentialSavings = underutilizedPatterns.reduce((sum, p) => sum + (p.monthlyCost * 0.3), 0);
        recommendations.push({
            type: 'right_sizing',
            priority: 'medium',
            service: 'EC2',
            title: 'Right-size Underutilized Instances',
            description: `${underutilizedPatterns.length} instance types show low utilization. Consider downsizing or using Spot instances.`,
            potentialSavings: {
                monthly: potentialSavings,
                annual: potentialSavings * 12,
                percentage: 30
            },
            implementation: {
                difficulty: 'medium',
                timeToImplement: '2-4 hours',
                steps: [
                    'Analyze CloudWatch metrics for CPU and memory utilization',
                    'Identify instances with consistently low utilization',
                    'Test smaller instance types in non-production',
                    'Gradually migrate to appropriately sized instances'
                ]
            },
            details: {
                underutilizedInstances: underutilizedPatterns
            }
        });
    }
    // 4. Spot Instance Recommendations
    const developmentWorkloads = ec2Instances.filter(i => i.instanceId.includes('dev') || i.instanceId.includes('test') || i.instanceId.includes('staging'));
    if (developmentWorkloads.length > 0) {
        const spotSavings = developmentWorkloads.length * 50; // Estimated $50/month per instance
        recommendations.push({
            type: 'spot_instances',
            priority: 'medium',
            service: 'EC2',
            title: 'Use Spot Instances for Development Workloads',
            description: `${developmentWorkloads.length} instances appear to be development/testing workloads. Spot instances can provide up to 90% savings.`,
            potentialSavings: {
                monthly: spotSavings,
                annual: spotSavings * 12,
                percentage: 70
            },
            implementation: {
                difficulty: 'medium',
                timeToImplement: '4-6 hours',
                steps: [
                    'Identify fault-tolerant workloads suitable for Spot',
                    'Implement Spot Fleet or Auto Scaling with mixed instance types',
                    'Set up proper handling for Spot interruptions',
                    'Monitor Spot pricing and availability'
                ]
            },
            details: {
                candidateInstances: developmentWorkloads.length,
                recommendedStrategy: 'Mixed instance types with Spot Fleet'
            }
        });
    }
    // 5. Schedule-based Optimization
    if (ec2Instances.length > 2) {
        recommendations.push({
            type: 'schedule_optimization',
            priority: 'low',
            service: 'EC2',
            title: 'Implement Automated Scheduling',
            description: 'Automatically stop non-production instances during off-hours to reduce costs by 50-70%.',
            potentialSavings: {
                monthly: usagePatterns.reduce((sum, p) => sum + p.monthlyCost, 0) * 0.3,
                annual: usagePatterns.reduce((sum, p) => sum + p.monthlyCost, 0) * 0.3 * 12,
                percentage: 30
            },
            implementation: {
                difficulty: 'easy',
                timeToImplement: '2-3 hours',
                steps: [
                    'Use AWS Instance Scheduler or Lambda functions',
                    'Tag instances with schedule requirements',
                    'Set up CloudWatch Events for automation',
                    'Monitor and adjust schedules based on usage'
                ]
            },
            details: {
                recommendedSchedule: 'Stop at 8 PM, start at 8 AM on weekdays',
                applicableInstances: ec2Instances.length
            }
        });
    }
    return recommendations;
}
async function calculateCoverage(costExplorerClient) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    let riCoverage = 0;
    let spCoverage = 0;
    try {
        const riCoverageResponse = await costExplorerClient.send(new client_cost_explorer_1.GetReservationCoverageCommand({
            TimePeriod: {
                Start: startDate.toISOString().split('T')[0],
                End: endDate.toISOString().split('T')[0],
            },
        }));
        riCoverage = parseFloat(riCoverageResponse.Total?.CoverageHours?.CoverageHoursPercentage || '0');
    }
    catch (error) {
        logging_js_1.logger.warn('Could not fetch RI coverage:', { error: error instanceof Error ? error.message : String(error) });
    }
    try {
        const spCoverageResponse = await costExplorerClient.send(new client_cost_explorer_1.GetSavingsPlansCoverageCommand({
            TimePeriod: {
                Start: startDate.toISOString().split('T')[0],
                End: endDate.toISOString().split('T')[0],
            },
        }));
        const total = spCoverageResponse.SavingsPlansCoverages?.[0]?.Coverage;
        spCoverage = parseFloat(total?.CoveragePercentage || '0');
    }
    catch (error) {
        logging_js_1.logger.warn('Could not fetch SP coverage:', { error: error instanceof Error ? error.message : String(error) });
    }
    return {
        reservedInstances: riCoverage,
        savingsPlans: spCoverage,
        overall: (riCoverage + spCoverage) / 2
    };
}
function generateExecutiveSummary(reservedInstances, reservedRDSInstances, savingsPlans, recommendations, coverage) {
    const totalPotentialSavings = recommendations.reduce((sum, r) => sum + r.potentialSavings.annual, 0);
    const criticalRecommendations = recommendations.filter(r => r.priority === 'critical').length;
    const highPriorityRecommendations = recommendations.filter(r => r.priority === 'high').length;
    return {
        status: reservedInstances.length === 0 && savingsPlans.length === 0 ? 'needs_attention' : 'optimized',
        totalCommitments: reservedInstances.length + reservedRDSInstances.length + savingsPlans.length,
        coverageScore: coverage.overall,
        potentialAnnualSavings: totalPotentialSavings,
        recommendationsSummary: {
            total: recommendations.length,
            critical: criticalRecommendations,
            high: highPriorityRecommendations,
            quickWins: recommendations.filter(r => r.implementation.difficulty === 'easy').length
        },
        keyInsights: [
            reservedInstances.length === 0 ? 'No Reserved Instances found - significant savings opportunity' : `${reservedInstances.length} Reserved Instances active`,
            savingsPlans.length === 0 ? 'No Savings Plans found - consider flexible commitment options' : `${savingsPlans.length} Savings Plans active`,
            `Coverage score: ${coverage.overall.toFixed(1)}% - ${coverage.overall < 50 ? 'needs improvement' : 'good'}`,
            `${recommendations.length} optimization opportunities identified`
        ]
    };
}
//# sourceMappingURL=ri-sp-analyzer.js.map