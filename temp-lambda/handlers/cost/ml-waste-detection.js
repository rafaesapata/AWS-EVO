"use strict";
/**
 * ML Waste Detection Lambda Handler v3.0
 *
 * Uses machine learning analysis to detect AWS resource waste.
 * Analyzes EC2, RDS, Lambda, S3, EBS, NAT Gateway, EIP, and DynamoDB resources.
 * Includes full ARN tracking for all resources.
 * Optimized to execute within API Gateway 29s timeout.
 */
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
const client_lambda_1 = require("@aws-sdk/client-lambda");
const client_s3_1 = require("@aws-sdk/client-s3");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const client_sts_1 = require("@aws-sdk/client-sts");
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
const crypto_1 = require("crypto");
const index_js_1 = require("../../lib/ml-analysis/index.js");
const pricing_js_1 = require("../../lib/cost/pricing.js");
const DEFAULT_REGIONS = ['us-east-1'];
const MAX_EXECUTION_TIME = 25000;
function calculatePriority(savings, confidence) {
    if (savings > 500 && confidence > 0.8)
        return 5;
    if (savings > 200 || (savings > 500 && confidence > 0.6))
        return 4;
    if (savings > 50)
        return 3;
    if (savings > 10)
        return 2;
    return 1;
}
async function handler(event, context) {
    const startTime = Date.now();
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    const user = (0, auth_js_1.getUserFromEvent)(event);
    const organizationId = (0, auth_js_1.getOrganizationId)(user);
    logging_js_1.logger.info('ML Waste Detection v3.0 started', {
        organizationId,
        userId: user.sub,
        requestId: context.awsRequestId
    });
    try {
        const body = event.body ? JSON.parse(event.body) : {};
        const { accountId, regions: requestedRegions, analysisDepth = 'standard', maxResources = 50 } = body;
        const prisma = (0, database_js_1.getPrismaClient)();
        const awsAccounts = await prisma.awsCredential.findMany({
            where: {
                organization_id: organizationId,
                is_active: true,
                ...(accountId && { id: accountId }),
            },
            take: 1,
        });
        if (awsAccounts.length === 0) {
            return (0, response_js_1.success)({
                success: true,
                message: 'No AWS credentials configured',
                analyzed_resources: 0,
                total_monthly_savings: 0,
                total_annual_savings: 0,
                recommendations: [],
            });
        }
        const account = awsAccounts[0];
        const regions = requestedRegions || account.regions || DEFAULT_REGIONS;
        const allResults = [];
        let totalAnalyzed = 0;
        let awsAccountNumber = '';
        // Create history record for this scan
        const historyId = (0, crypto_1.randomUUID)();
        const scanStartTime = new Date();
        await prisma.mLAnalysisHistory.create({
            data: {
                id: historyId,
                organization_id: organizationId,
                aws_account_id: account.id,
                scan_type: 'ml-waste-detection',
                status: 'running',
                analysis_depth: analysisDepth,
                regions_scanned: regions,
                started_at: scanStartTime,
            },
        });
        logging_js_1.logger.info('Starting ML analysis v3.0', {
            organizationId,
            accountId: account.id,
            regions,
            analysisDepth,
            historyId
        });
        // Process each region
        for (const region of regions) {
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                logging_js_1.logger.warn('Approaching timeout, returning partial results');
                break;
            }
            try {
                const resolvedCreds = await (0, aws_helpers_js_1.resolveAwsCredentials)(account, region);
                const credentials = (0, aws_helpers_js_1.toAwsCredentials)(resolvedCreds);
                // Get AWS account number via STS
                if (!awsAccountNumber) {
                    try {
                        const stsClient = new client_sts_1.STSClient({ region, credentials });
                        const identity = await stsClient.send(new client_sts_1.GetCallerIdentityCommand({}));
                        awsAccountNumber = identity.Account || '';
                    }
                    catch (stsErr) {
                        logging_js_1.logger.warn('Failed to get AWS account number', { error: stsErr.message });
                    }
                }
                // Analyze EC2 instances
                const ec2Results = await analyzeEC2Instances(credentials, region, awsAccountNumber, maxResources, MAX_EXECUTION_TIME - (Date.now() - startTime));
                allResults.push(...ec2Results);
                totalAnalyzed += ec2Results.length;
                if (Date.now() - startTime > MAX_EXECUTION_TIME)
                    break;
                // Analyze RDS instances
                const rdsResults = await analyzeRDSInstances(credentials, region, awsAccountNumber, MAX_EXECUTION_TIME - (Date.now() - startTime));
                allResults.push(...rdsResults);
                totalAnalyzed += rdsResults.length;
                if (Date.now() - startTime > MAX_EXECUTION_TIME)
                    break;
                // Analyze EBS volumes
                const ebsResults = await analyzeEBSVolumes(credentials, region, awsAccountNumber, maxResources, MAX_EXECUTION_TIME - (Date.now() - startTime));
                allResults.push(...ebsResults);
                totalAnalyzed += ebsResults.length;
                if (Date.now() - startTime > MAX_EXECUTION_TIME)
                    break;
                // Analyze Elastic IPs
                const eipResults = await analyzeElasticIPs(credentials, region, awsAccountNumber, MAX_EXECUTION_TIME - (Date.now() - startTime));
                allResults.push(...eipResults);
                totalAnalyzed += eipResults.length;
                if (Date.now() - startTime > MAX_EXECUTION_TIME)
                    break;
                // Analyze NAT Gateways
                const natResults = await analyzeNATGateways(credentials, region, awsAccountNumber, MAX_EXECUTION_TIME - (Date.now() - startTime));
                allResults.push(...natResults);
                totalAnalyzed += natResults.length;
                // Deep analysis includes Lambda, S3, DynamoDB
                if (analysisDepth === 'deep' && Date.now() - startTime < MAX_EXECUTION_TIME) {
                    const lambdaResults = await analyzeLambdaFunctions(credentials, region, awsAccountNumber, 20, MAX_EXECUTION_TIME - (Date.now() - startTime));
                    allResults.push(...lambdaResults);
                    totalAnalyzed += lambdaResults.length;
                    if (Date.now() - startTime < MAX_EXECUTION_TIME) {
                        // Analyze S3 buckets (only in us-east-1 since buckets are global)
                        if (region === 'us-east-1') {
                            const s3Results = await analyzeS3Buckets(credentials, awsAccountNumber, 20, MAX_EXECUTION_TIME - (Date.now() - startTime));
                            allResults.push(...s3Results);
                            totalAnalyzed += s3Results.length;
                        }
                    }
                    if (Date.now() - startTime < MAX_EXECUTION_TIME) {
                        // Analyze DynamoDB tables
                        const dynamoResults = await analyzeDynamoDBTables(credentials, region, awsAccountNumber, 20, MAX_EXECUTION_TIME - (Date.now() - startTime));
                        allResults.push(...dynamoResults);
                        totalAnalyzed += dynamoResults.length;
                    }
                }
            }
            catch (err) {
                logging_js_1.logger.error('Error analyzing region', err, { region });
            }
        }
        // Filter actionable recommendations
        const actionableResults = allResults.filter(r => r.recommendationType !== 'optimize' || r.potentialMonthlySavings > 0);
        // Save results to database
        if (actionableResults.length > 0) {
            await saveMLResultsV3(prisma, organizationId, account.id, awsAccountNumber, actionableResults);
        }
        // Calculate summary
        const totalMonthlySavings = actionableResults.reduce((sum, r) => sum + r.potentialMonthlySavings, 0);
        const totalAnnualSavings = totalMonthlySavings * 12;
        const byType = {
            terminate: actionableResults.filter(r => r.recommendationType === 'terminate').length,
            downsize: actionableResults.filter(r => r.recommendationType === 'downsize').length,
            'auto-scale': actionableResults.filter(r => r.recommendationType === 'auto-scale').length,
            optimize: actionableResults.filter(r => r.recommendationType === 'optimize').length,
            migrate: actionableResults.filter(r => r.recommendationType === 'migrate').length,
        };
        const byResourceType = {};
        for (const r of actionableResults) {
            const type = r.resourceType.split('::')[0];
            if (!byResourceType[type])
                byResourceType[type] = { count: 0, savings: 0 };
            byResourceType[type].count++;
            byResourceType[type].savings += r.potentialMonthlySavings;
        }
        const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
        // Update history record with results
        await prisma.mLAnalysisHistory.update({
            where: { id: historyId },
            data: {
                status: 'completed',
                aws_account_number: awsAccountNumber || null,
                total_resources_analyzed: totalAnalyzed,
                total_recommendations: actionableResults.length,
                total_monthly_savings: parseFloat(totalMonthlySavings.toFixed(2)),
                total_annual_savings: parseFloat(totalAnnualSavings.toFixed(2)),
                terminate_count: byType.terminate,
                downsize_count: byType.downsize,
                autoscale_count: byType['auto-scale'],
                optimize_count: byType.optimize,
                migrate_count: byType.migrate,
                by_resource_type: byResourceType,
                execution_time_seconds: parseFloat(executionTime),
                completed_at: new Date(),
            },
        });
        logging_js_1.logger.info('ML Waste Detection v3.0 completed', {
            organizationId,
            totalAnalyzed,
            recommendationsCount: actionableResults.length,
            totalMonthlySavings: parseFloat(totalMonthlySavings.toFixed(2)),
            totalAnnualSavings: parseFloat(totalAnnualSavings.toFixed(2)),
            executionTime,
            historyId
        });
        return (0, response_js_1.success)({
            success: true,
            analyzed_resources: totalAnalyzed,
            total_monthly_savings: parseFloat(totalMonthlySavings.toFixed(2)),
            total_annual_savings: parseFloat(totalAnnualSavings.toFixed(2)),
            recommendations: actionableResults.map(r => ({
                id: (0, crypto_1.randomUUID)(),
                resource_id: r.resourceId,
                resource_arn: r.resourceArn,
                resource_name: r.resourceName,
                resource_type: r.resourceType,
                resource_subtype: r.resourceSubtype,
                region: r.region,
                account_id: r.accountId,
                current_size: r.currentSize,
                current_monthly_cost: r.currentMonthlyCost,
                current_hourly_cost: r.currentHourlyCost,
                recommended_size: r.recommendedSize,
                recommendation_type: r.recommendationType,
                recommendation_priority: r.recommendationPriority,
                potential_monthly_savings: r.potentialMonthlySavings,
                potential_annual_savings: r.potentialAnnualSavings,
                ml_confidence: r.mlConfidence,
                utilization_patterns: r.utilizationPatterns,
                resource_metadata: r.resourceMetadata,
                dependencies: r.dependencies,
                auto_scaling_eligible: r.autoScalingEligible,
                auto_scaling_config: r.autoScalingConfig,
                implementation_complexity: r.implementationComplexity,
                implementation_steps: r.implementationSteps,
                risk_assessment: r.riskAssessment,
                last_activity_at: r.lastActivityAt?.toISOString() || null,
                days_since_activity: r.daysSinceActivity,
                analyzed_at: r.analyzedAt.toISOString(),
            })),
            summary: {
                by_type: byResourceType,
                by_recommendation: byType,
                execution_time: executionTime,
                aws_account_number: awsAccountNumber,
            },
        });
    }
    catch (err) {
        logging_js_1.logger.error('ML Waste Detection error', err, {
            organizationId,
            userId: user.sub,
            requestId: context.awsRequestId
        });
        // Update history record with error status if historyId exists
        try {
            const prisma = (0, database_js_1.getPrismaClient)();
            // Try to find and update any running history for this org/account
            await prisma.mLAnalysisHistory.updateMany({
                where: {
                    organization_id: organizationId,
                    status: 'running',
                },
                data: {
                    status: 'failed',
                    error_message: err instanceof Error ? err.message : 'Unknown error',
                    completed_at: new Date(),
                },
            });
        }
        catch (updateErr) {
            logging_js_1.logger.warn('Failed to update history record on error', { error: updateErr.message });
        }
        await metrics_js_1.businessMetrics.errorOccurred('ml_waste_detection_error', 'ml-waste-detection', organizationId);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
/**
 * Analyze EC2 instances for waste
 */
async function analyzeEC2Instances(credentials, region, accountId, maxInstances, remainingTime) {
    const results = [];
    const startTime = Date.now();
    try {
        const ec2Client = new client_ec2_1.EC2Client({ region, credentials });
        const cwClient = new client_cloudwatch_1.CloudWatchClient({ region, credentials });
        const response = await ec2Client.send(new client_ec2_1.DescribeInstancesCommand({
            Filters: [{ Name: 'instance-state-name', Values: ['running'] }],
            MaxResults: maxInstances,
        }));
        for (const reservation of response.Reservations || []) {
            for (const instance of reservation.Instances || []) {
                if (Date.now() - startTime > remainingTime - 2000) {
                    logging_js_1.logger.warn('Time limit reached in EC2 analysis');
                    return results;
                }
                const instanceId = instance.InstanceId;
                const instanceType = instance.InstanceType;
                const instanceName = instance.Tags?.find(t => t.Key === 'Name')?.Value || null;
                const launchTime = instance.LaunchTime;
                try {
                    const cpuMetrics = await getCloudWatchMetrics(cwClient, 'AWS/EC2', 'CPUUtilization', [{ Name: 'InstanceId', Value: instanceId }], 7);
                    if (cpuMetrics.length === 0)
                        continue;
                    const utilization = (0, index_js_1.analyzeUtilization)(cpuMetrics);
                    const recommendation = (0, index_js_1.classifyWaste)(utilization, 'EC2', instanceType);
                    if (recommendation.type === 'optimize' && recommendation.savings === 0)
                        continue;
                    const currentMonthlyCost = (0, pricing_js_1.getMonthlyCost)('EC2', instanceType);
                    const currentHourlyCost = (0, pricing_js_1.getHourlyCost)('EC2', instanceType);
                    const arn = (0, index_js_1.buildResourceArn)('ec2', region, accountId, 'instance', instanceId);
                    const priority = calculatePriority(recommendation.savings, recommendation.confidence);
                    const implementationSteps = generateEC2ImplementationSteps(instanceId, recommendation.type, recommendation.recommendedSize, region);
                    results.push({
                        resourceId: instanceId,
                        resourceArn: arn,
                        resourceName: instanceName,
                        resourceType: 'EC2::Instance',
                        resourceSubtype: instanceType,
                        region,
                        accountId,
                        currentSize: instanceType,
                        currentMonthlyCost: parseFloat(currentMonthlyCost.toFixed(2)),
                        currentHourlyCost: parseFloat(currentHourlyCost.toFixed(4)),
                        recommendationType: recommendation.type,
                        recommendationPriority: priority,
                        recommendedSize: recommendation.recommendedSize || null,
                        potentialMonthlySavings: parseFloat(recommendation.savings.toFixed(2)),
                        potentialAnnualSavings: parseFloat((recommendation.savings * 12).toFixed(2)),
                        mlConfidence: parseFloat(recommendation.confidence.toFixed(4)),
                        utilizationPatterns: {
                            ...(0, index_js_1.generateUtilizationPatterns)(utilization),
                            trend: 'stable',
                            seasonality: 'none',
                        },
                        resourceMetadata: {
                            launchTime: launchTime?.toISOString(),
                            platform: instance.Platform || 'linux',
                            vpcId: instance.VpcId,
                            subnetId: instance.SubnetId,
                            tags: instance.Tags?.reduce((acc, t) => ({ ...acc, [t.Key]: t.Value }), {}),
                        },
                        dependencies: [],
                        autoScalingEligible: recommendation.type === 'auto-scale',
                        autoScalingConfig: recommendation.autoScalingConfig || null,
                        implementationComplexity: recommendation.complexity,
                        implementationSteps,
                        riskAssessment: recommendation.type === 'terminate' ? 'high' : 'medium',
                        lastActivityAt: null,
                        daysSinceActivity: null,
                        analyzedAt: new Date(),
                    });
                }
                catch (metricErr) {
                    logging_js_1.logger.warn('Error getting metrics for EC2 instance', {
                        instanceId, error: metricErr.message
                    });
                }
            }
        }
    }
    catch (err) {
        logging_js_1.logger.error('Error in EC2 analysis', err, { region });
    }
    return results;
}
/**
 * Analyze RDS instances for waste
 */
async function analyzeRDSInstances(credentials, region, accountId, remainingTime) {
    const results = [];
    const startTime = Date.now();
    try {
        const rdsClient = new client_rds_1.RDSClient({ region, credentials });
        const cwClient = new client_cloudwatch_1.CloudWatchClient({ region, credentials });
        const response = await rdsClient.send(new client_rds_1.DescribeDBInstancesCommand({}));
        for (const instance of response.DBInstances || []) {
            if (Date.now() - startTime > remainingTime - 2000) {
                logging_js_1.logger.warn('Time limit reached in RDS analysis');
                return results;
            }
            const dbIdentifier = instance.DBInstanceIdentifier;
            const instanceClass = instance.DBInstanceClass;
            try {
                const cpuMetrics = await getCloudWatchMetrics(cwClient, 'AWS/RDS', 'CPUUtilization', [{ Name: 'DBInstanceIdentifier', Value: dbIdentifier }], 7);
                const connMetrics = await getCloudWatchMetrics(cwClient, 'AWS/RDS', 'DatabaseConnections', [{ Name: 'DBInstanceIdentifier', Value: dbIdentifier }], 7);
                if (cpuMetrics.length === 0)
                    continue;
                const utilization = (0, index_js_1.analyzeUtilization)(cpuMetrics);
                const avgConnections = connMetrics.length > 0
                    ? connMetrics.reduce((sum, dp) => sum + (dp.Average || 0), 0) / connMetrics.length
                    : -1;
                const currentMonthlyCost = (0, pricing_js_1.getMonthlyCost)('RDS', instanceClass);
                const currentHourlyCost = (0, pricing_js_1.getHourlyCost)('RDS', instanceClass);
                const arn = (0, index_js_1.buildResourceArn)('rds', region, accountId, 'db', dbIdentifier);
                let recommendation;
                let riskAssessment = 'medium';
                if (avgConnections >= 0 && avgConnections < 1) {
                    recommendation = { type: 'terminate', savings: currentMonthlyCost, confidence: 0.95, complexity: 'medium' };
                    riskAssessment = 'high';
                }
                else {
                    recommendation = (0, index_js_1.classifyWaste)(utilization, 'RDS', instanceClass);
                }
                if (recommendation.type === 'optimize' && recommendation.savings === 0)
                    continue;
                const priority = calculatePriority(recommendation.savings, recommendation.confidence);
                const implementationSteps = generateRDSImplementationSteps(dbIdentifier, recommendation.type, recommendation.recommendedSize, region);
                results.push({
                    resourceId: dbIdentifier,
                    resourceArn: arn,
                    resourceName: dbIdentifier,
                    resourceType: 'RDS::DBInstance',
                    resourceSubtype: instanceClass,
                    region,
                    accountId,
                    currentSize: instanceClass,
                    currentMonthlyCost: parseFloat(currentMonthlyCost.toFixed(2)),
                    currentHourlyCost: parseFloat(currentHourlyCost.toFixed(4)),
                    recommendationType: recommendation.type,
                    recommendationPriority: priority,
                    recommendedSize: recommendation.recommendedSize || null,
                    potentialMonthlySavings: parseFloat(recommendation.savings.toFixed(2)),
                    potentialAnnualSavings: parseFloat((recommendation.savings * 12).toFixed(2)),
                    mlConfidence: parseFloat(recommendation.confidence.toFixed(4)),
                    utilizationPatterns: {
                        ...(0, index_js_1.generateUtilizationPatterns)(utilization),
                        avgConnections: avgConnections >= 0 ? parseFloat(avgConnections.toFixed(2)) : undefined,
                        trend: 'stable',
                        seasonality: 'none',
                    },
                    resourceMetadata: {
                        engine: instance.Engine,
                        engineVersion: instance.EngineVersion,
                        allocatedStorage: instance.AllocatedStorage,
                        multiAZ: instance.MultiAZ,
                        storageType: instance.StorageType,
                    },
                    dependencies: [],
                    autoScalingEligible: false,
                    autoScalingConfig: null,
                    implementationComplexity: (0, index_js_1.getImplementationComplexity)(recommendation.type, 'RDS'),
                    implementationSteps,
                    riskAssessment,
                    lastActivityAt: null,
                    daysSinceActivity: null,
                    analyzedAt: new Date(),
                });
            }
            catch (metricErr) {
                logging_js_1.logger.warn('Error getting metrics for RDS instance', {
                    dbIdentifier, error: metricErr.message
                });
            }
        }
    }
    catch (err) {
        logging_js_1.logger.error('Error in RDS analysis', err, { region });
    }
    return results;
}
/**
 * Analyze EBS volumes for waste
 */
async function analyzeEBSVolumes(credentials, region, accountId, maxVolumes, remainingTime) {
    const results = [];
    const startTime = Date.now();
    try {
        const ec2Client = new client_ec2_1.EC2Client({ region, credentials });
        const cwClient = new client_cloudwatch_1.CloudWatchClient({ region, credentials });
        // Find unattached volumes
        const response = await ec2Client.send(new client_ec2_1.DescribeVolumesCommand({
            Filters: [{ Name: 'status', Values: ['available'] }],
            MaxResults: maxVolumes,
        }));
        for (const volume of response.Volumes || []) {
            if (Date.now() - startTime > remainingTime - 2000)
                break;
            const volumeId = volume.VolumeId;
            const volumeType = volume.VolumeType || 'gp2';
            const sizeGB = volume.Size || 0;
            const volumeName = volume.Tags?.find(t => t.Key === 'Name')?.Value || null;
            const currentMonthlyCost = (0, pricing_js_1.getEBSMonthlyCost)(volumeType, sizeGB);
            const currentHourlyCost = currentMonthlyCost / 730;
            const arn = (0, index_js_1.buildResourceArn)('ec2', region, accountId, 'volume', volumeId);
            const implementationSteps = [
                { order: 1, action: 'Create snapshot before deletion', command: `aws ec2 create-snapshot --volume-id ${volumeId} --description "Backup before deletion" --region ${region}`, riskLevel: 'safe' },
                { order: 2, action: 'Delete unattached volume', command: `aws ec2 delete-volume --volume-id ${volumeId} --region ${region}`, riskLevel: 'destructive', notes: 'Ensure snapshot is complete before deletion' },
            ];
            results.push({
                resourceId: volumeId,
                resourceArn: arn,
                resourceName: volumeName,
                resourceType: 'EC2::Volume',
                resourceSubtype: volumeType,
                region,
                accountId,
                currentSize: `${sizeGB} GB (${volumeType})`,
                currentMonthlyCost: parseFloat(currentMonthlyCost.toFixed(2)),
                currentHourlyCost: parseFloat(currentHourlyCost.toFixed(4)),
                recommendationType: 'terminate',
                recommendationPriority: calculatePriority(currentMonthlyCost, 0.95),
                recommendedSize: null,
                potentialMonthlySavings: parseFloat(currentMonthlyCost.toFixed(2)),
                potentialAnnualSavings: parseFloat((currentMonthlyCost * 12).toFixed(2)),
                mlConfidence: 0.95,
                utilizationPatterns: { avgCpuUsage: 0, maxCpuUsage: 0, avgMemoryUsage: 0, maxMemoryUsage: 0, peakHours: [], weekdayPattern: [], hasRealMetrics: true, dataCompleteness: 1, trend: 'stable', seasonality: 'none' },
                resourceMetadata: { volumeType, sizeGB, iops: volume.Iops, throughput: volume.Throughput, encrypted: volume.Encrypted, createTime: volume.CreateTime?.toISOString() },
                dependencies: [],
                autoScalingEligible: false,
                autoScalingConfig: null,
                implementationComplexity: 'low',
                implementationSteps,
                riskAssessment: 'medium',
                lastActivityAt: null,
                daysSinceActivity: null,
                analyzedAt: new Date(),
            });
        }
    }
    catch (err) {
        logging_js_1.logger.error('Error in EBS analysis', err, { region });
    }
    return results;
}
/**
 * Analyze Elastic IPs for waste
 */
async function analyzeElasticIPs(credentials, region, accountId, remainingTime) {
    const results = [];
    try {
        const ec2Client = new client_ec2_1.EC2Client({ region, credentials });
        const response = await ec2Client.send(new client_ec2_1.DescribeAddressesCommand({}));
        for (const address of response.Addresses || []) {
            // Only flag unassociated EIPs
            if (address.AssociationId)
                continue;
            const allocationId = address.AllocationId;
            const publicIp = address.PublicIp;
            const eipName = address.Tags?.find(t => t.Key === 'Name')?.Value || null;
            const currentMonthlyCost = pricing_js_1.EIP_PRICING.monthlyUnassociated;
            const currentHourlyCost = pricing_js_1.EIP_PRICING.unassociatedHourly;
            const arn = (0, index_js_1.buildResourceArn)('ec2', region, accountId, 'elastic-ip', allocationId);
            const implementationSteps = [
                { order: 1, action: 'Verify EIP is not needed', command: `aws ec2 describe-addresses --allocation-ids ${allocationId} --region ${region}`, riskLevel: 'safe' },
                { order: 2, action: 'Release Elastic IP', command: `aws ec2 release-address --allocation-id ${allocationId} --region ${region}`, riskLevel: 'destructive', notes: 'IP address will be released back to AWS pool' },
            ];
            results.push({
                resourceId: allocationId,
                resourceArn: arn,
                resourceName: eipName || publicIp,
                resourceType: 'EC2::ElasticIp',
                resourceSubtype: 'vpc',
                region,
                accountId,
                currentSize: publicIp,
                currentMonthlyCost: parseFloat(currentMonthlyCost.toFixed(2)),
                currentHourlyCost: parseFloat(currentHourlyCost.toFixed(4)),
                recommendationType: 'terminate',
                recommendationPriority: 2,
                recommendedSize: null,
                potentialMonthlySavings: parseFloat(currentMonthlyCost.toFixed(2)),
                potentialAnnualSavings: parseFloat((currentMonthlyCost * 12).toFixed(2)),
                mlConfidence: 0.98,
                utilizationPatterns: { avgCpuUsage: 0, maxCpuUsage: 0, avgMemoryUsage: 0, maxMemoryUsage: 0, peakHours: [], weekdayPattern: [], hasRealMetrics: true, dataCompleteness: 1, trend: 'stable', seasonality: 'none' },
                resourceMetadata: { publicIp, domain: address.Domain, networkBorderGroup: address.NetworkBorderGroup },
                dependencies: [],
                autoScalingEligible: false,
                autoScalingConfig: null,
                implementationComplexity: 'low',
                implementationSteps,
                riskAssessment: 'low',
                lastActivityAt: null,
                daysSinceActivity: null,
                analyzedAt: new Date(),
            });
        }
    }
    catch (err) {
        logging_js_1.logger.error('Error in EIP analysis', err, { region });
    }
    return results;
}
/**
 * Analyze NAT Gateways for waste
 */
async function analyzeNATGateways(credentials, region, accountId, remainingTime) {
    const results = [];
    const startTime = Date.now();
    try {
        const ec2Client = new client_ec2_1.EC2Client({ region, credentials });
        const cwClient = new client_cloudwatch_1.CloudWatchClient({ region, credentials });
        const response = await ec2Client.send(new client_ec2_1.DescribeNatGatewaysCommand({
            Filter: [{ Name: 'state', Values: ['available'] }],
        }));
        for (const natGw of response.NatGateways || []) {
            if (Date.now() - startTime > remainingTime - 2000)
                break;
            const natGatewayId = natGw.NatGatewayId;
            const natName = natGw.Tags?.find(t => t.Key === 'Name')?.Value || null;
            try {
                // Get traffic metrics
                const bytesOutMetrics = await getCloudWatchMetrics(cwClient, 'AWS/NATGateway', 'BytesOutToDestination', [{ Name: 'NatGatewayId', Value: natGatewayId }], 7);
                const bytesInMetrics = await getCloudWatchMetrics(cwClient, 'AWS/NATGateway', 'BytesInFromDestination', [{ Name: 'NatGatewayId', Value: natGatewayId }], 7);
                const totalBytesOut = bytesOutMetrics.reduce((sum, dp) => sum + (dp.Sum || 0), 0);
                const totalBytesIn = bytesInMetrics.reduce((sum, dp) => sum + (dp.Sum || 0), 0);
                const totalBytesGB = (totalBytesOut + totalBytesIn) / (1024 * 1024 * 1024);
                // Calculate cost
                const dataProcessingCost = totalBytesGB * pricing_js_1.NAT_GATEWAY_PRICING.dataProcessingPerGB * (30 / 7);
                const currentMonthlyCost = pricing_js_1.NAT_GATEWAY_PRICING.hourlyRate * 730 + dataProcessingCost;
                const currentHourlyCost = pricing_js_1.NAT_GATEWAY_PRICING.hourlyRate;
                const arn = (0, index_js_1.buildResourceArn)('ec2', region, accountId, 'nat-gateway', natGatewayId);
                // Only flag if zero traffic
                if (totalBytesOut === 0 && totalBytesIn === 0) {
                    const savings = pricing_js_1.NAT_GATEWAY_PRICING.hourlyRate * 730; // ~$32.85/month
                    const implementationSteps = [
                        { order: 1, action: 'Verify no active connections', command: `aws cloudwatch get-metric-statistics --namespace AWS/NATGateway --metric-name ActiveConnectionCount --dimensions Name=NatGatewayId,Value=${natGatewayId} --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) --period 300 --statistics Maximum --region ${region}`, riskLevel: 'safe' },
                        { order: 2, action: 'Update route tables to remove NAT Gateway', command: `# Update route tables that reference this NAT Gateway`, riskLevel: 'review', notes: 'Check route tables before deletion' },
                        { order: 3, action: 'Delete NAT Gateway', command: `aws ec2 delete-nat-gateway --nat-gateway-id ${natGatewayId} --region ${region}`, riskLevel: 'destructive' },
                    ];
                    results.push({
                        resourceId: natGatewayId,
                        resourceArn: arn,
                        resourceName: natName,
                        resourceType: 'EC2::NatGateway',
                        region,
                        accountId,
                        currentSize: 'NAT Gateway',
                        currentMonthlyCost: parseFloat(currentMonthlyCost.toFixed(2)),
                        currentHourlyCost: parseFloat(currentHourlyCost.toFixed(4)),
                        recommendationType: 'terminate',
                        recommendationPriority: calculatePriority(savings, 0.95),
                        recommendedSize: null,
                        potentialMonthlySavings: parseFloat(savings.toFixed(2)),
                        potentialAnnualSavings: parseFloat((savings * 12).toFixed(2)),
                        mlConfidence: 0.95,
                        utilizationPatterns: { avgCpuUsage: 0, maxCpuUsage: 0, avgMemoryUsage: 0, maxMemoryUsage: 0, peakHours: [], weekdayPattern: [], hasRealMetrics: true, dataCompleteness: bytesOutMetrics.length / 168, trend: 'stable', seasonality: 'none' },
                        resourceMetadata: { vpcId: natGw.VpcId, subnetId: natGw.SubnetId, publicIp: natGw.NatGatewayAddresses?.[0]?.PublicIp, bytesOutLast7Days: totalBytesOut, bytesInLast7Days: totalBytesIn },
                        dependencies: [],
                        autoScalingEligible: false,
                        autoScalingConfig: null,
                        implementationComplexity: 'medium',
                        implementationSteps,
                        riskAssessment: 'medium',
                        lastActivityAt: null,
                        daysSinceActivity: null,
                        analyzedAt: new Date(),
                    });
                }
            }
            catch (metricErr) {
                logging_js_1.logger.warn('Error getting metrics for NAT Gateway', { natGatewayId, error: metricErr.message });
            }
        }
    }
    catch (err) {
        logging_js_1.logger.error('Error in NAT Gateway analysis', err, { region });
    }
    return results;
}
/**
 * Analyze Lambda functions for waste
 */
async function analyzeLambdaFunctions(credentials, region, accountId, maxFunctions, remainingTime) {
    const results = [];
    const startTime = Date.now();
    try {
        const lambdaClient = new client_lambda_1.LambdaClient({ region, credentials });
        const cwClient = new client_cloudwatch_1.CloudWatchClient({ region, credentials });
        const response = await lambdaClient.send(new client_lambda_1.ListFunctionsCommand({ MaxItems: maxFunctions }));
        for (const fn of response.Functions || []) {
            if (Date.now() - startTime > remainingTime - 2000)
                break;
            const functionName = fn.FunctionName;
            const memorySize = fn.MemorySize || 128;
            try {
                const invocationMetrics = await getCloudWatchMetrics(cwClient, 'AWS/Lambda', 'Invocations', [{ Name: 'FunctionName', Value: functionName }], 7);
                const durationMetrics = await getCloudWatchMetrics(cwClient, 'AWS/Lambda', 'Duration', [{ Name: 'FunctionName', Value: functionName }], 7);
                const totalInvocations = invocationMetrics.reduce((sum, dp) => sum + (dp.Sum || 0), 0);
                const arn = (0, index_js_1.buildResourceArn)('lambda', region, accountId, 'function', functionName);
                // If no invocations in 7 days, recommend terminate
                if (totalInvocations === 0) {
                    const implementationSteps = [
                        { order: 1, action: 'Verify function is not needed', command: `aws lambda get-function --function-name ${functionName} --region ${region}`, riskLevel: 'safe' },
                        { order: 2, action: 'Delete Lambda function', command: `aws lambda delete-function --function-name ${functionName} --region ${region}`, riskLevel: 'destructive' },
                    ];
                    results.push({
                        resourceId: functionName,
                        resourceArn: arn,
                        resourceName: functionName,
                        resourceType: 'Lambda::Function',
                        resourceSubtype: fn.Runtime,
                        region,
                        accountId,
                        currentSize: `${memorySize}MB`,
                        currentMonthlyCost: 0,
                        currentHourlyCost: 0,
                        recommendationType: 'terminate',
                        recommendationPriority: 1,
                        recommendedSize: null,
                        potentialMonthlySavings: 0,
                        potentialAnnualSavings: 0,
                        mlConfidence: 0.90,
                        utilizationPatterns: { avgCpuUsage: 0, maxCpuUsage: 0, avgMemoryUsage: 0, maxMemoryUsage: 0, peakHours: [], weekdayPattern: [], hasRealMetrics: true, dataCompleteness: 1, trend: 'stable', seasonality: 'none', totalInvocations: 0, avgDuration: 0 },
                        resourceMetadata: { runtime: fn.Runtime, handler: fn.Handler, codeSize: fn.CodeSize, lastModified: fn.LastModified },
                        dependencies: [],
                        autoScalingEligible: false,
                        autoScalingConfig: null,
                        implementationComplexity: 'low',
                        implementationSteps,
                        riskAssessment: 'low',
                        lastActivityAt: null,
                        daysSinceActivity: 7,
                        analyzedAt: new Date(),
                    });
                    continue;
                }
                const avgDuration = durationMetrics.length > 0
                    ? durationMetrics.reduce((sum, dp) => sum + (dp.Average || 0), 0) / durationMetrics.length
                    : 0;
                const monthlyInvocations = (totalInvocations / 7) * 30;
                const estimatedCost = (0, pricing_js_1.getLambdaMonthlyCost)(monthlyInvocations, avgDuration, memorySize);
                // Check if memory is oversized
                if (avgDuration < 100 && memorySize > 256) {
                    const newMemory = Math.max(128, Math.floor(memorySize / 2));
                    const newCost = (0, pricing_js_1.getLambdaMonthlyCost)(monthlyInvocations, avgDuration, newMemory);
                    const savings = estimatedCost - newCost;
                    if (savings > 1) {
                        const implementationSteps = [
                            { order: 1, action: 'Update Lambda memory configuration', command: `aws lambda update-function-configuration --function-name ${functionName} --memory-size ${newMemory} --region ${region}`, riskLevel: 'review' },
                        ];
                        results.push({
                            resourceId: functionName,
                            resourceArn: arn,
                            resourceName: functionName,
                            resourceType: 'Lambda::Function',
                            resourceSubtype: fn.Runtime,
                            region,
                            accountId,
                            currentSize: `${memorySize}MB`,
                            currentMonthlyCost: parseFloat(estimatedCost.toFixed(2)),
                            currentHourlyCost: parseFloat((estimatedCost / 730).toFixed(6)),
                            recommendationType: 'downsize',
                            recommendationPriority: calculatePriority(savings, 0.70),
                            recommendedSize: `${newMemory}MB`,
                            potentialMonthlySavings: parseFloat(savings.toFixed(2)),
                            potentialAnnualSavings: parseFloat((savings * 12).toFixed(2)),
                            mlConfidence: 0.70,
                            utilizationPatterns: { avgCpuUsage: 0, maxCpuUsage: 0, avgMemoryUsage: 0, maxMemoryUsage: 0, peakHours: [], weekdayPattern: [], hasRealMetrics: true, dataCompleteness: 1, trend: 'stable', seasonality: 'none', totalInvocations, avgDuration: parseFloat(avgDuration.toFixed(2)) },
                            resourceMetadata: { runtime: fn.Runtime, handler: fn.Handler, codeSize: fn.CodeSize, lastModified: fn.LastModified },
                            dependencies: [],
                            autoScalingEligible: false,
                            autoScalingConfig: null,
                            implementationComplexity: 'low',
                            implementationSteps,
                            riskAssessment: 'low',
                            lastActivityAt: null,
                            daysSinceActivity: null,
                            analyzedAt: new Date(),
                        });
                    }
                }
            }
            catch (metricErr) {
                logging_js_1.logger.warn('Error getting metrics for Lambda function', { functionName, error: metricErr.message });
            }
        }
    }
    catch (err) {
        logging_js_1.logger.error('Error in Lambda analysis', err, { region });
    }
    return results;
}
/**
 * Get CloudWatch metrics for a resource
 */
async function getCloudWatchMetrics(client, namespace, metricName, dimensions, days) {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);
    const response = await client.send(new client_cloudwatch_1.GetMetricStatisticsCommand({
        Namespace: namespace,
        MetricName: metricName,
        Dimensions: dimensions,
        StartTime: startTime,
        EndTime: endTime,
        Period: 3600,
        Statistics: ['Average', 'Maximum', 'Minimum', 'Sum'],
    }));
    return (response.Datapoints || []).map(dp => ({
        Timestamp: dp.Timestamp,
        Average: dp.Average,
        Maximum: dp.Maximum,
        Minimum: dp.Minimum,
        Sum: dp.Sum,
        SampleCount: dp.SampleCount,
    }));
}
/**
 * Generate EC2 implementation steps
 */
function generateEC2ImplementationSteps(instanceId, recommendationType, recommendedSize, region) {
    if (recommendationType === 'terminate') {
        return [
            { order: 1, action: 'Create AMI backup', command: `aws ec2 create-image --instance-id ${instanceId} --name "backup-${instanceId}-$(date +%Y%m%d)" --no-reboot --region ${region}`, riskLevel: 'safe' },
            { order: 2, action: 'Stop instance', command: `aws ec2 stop-instances --instance-ids ${instanceId} --region ${region}`, riskLevel: 'review' },
            { order: 3, action: 'Terminate instance', command: `aws ec2 terminate-instances --instance-ids ${instanceId} --region ${region}`, riskLevel: 'destructive' },
        ];
    }
    if (recommendationType === 'downsize' && recommendedSize) {
        return [
            { order: 1, action: 'Stop instance', command: `aws ec2 stop-instances --instance-ids ${instanceId} --region ${region}`, riskLevel: 'review' },
            { order: 2, action: 'Modify instance type', command: `aws ec2 modify-instance-attribute --instance-id ${instanceId} --instance-type ${recommendedSize} --region ${region}`, riskLevel: 'review' },
            { order: 3, action: 'Start instance', command: `aws ec2 start-instances --instance-ids ${instanceId} --region ${region}`, riskLevel: 'safe' },
        ];
    }
    return [];
}
/**
 * Generate RDS implementation steps
 */
function generateRDSImplementationSteps(dbIdentifier, recommendationType, recommendedSize, region) {
    if (recommendationType === 'terminate') {
        return [
            { order: 1, action: 'Create final snapshot', command: `aws rds create-db-snapshot --db-instance-identifier ${dbIdentifier} --db-snapshot-identifier ${dbIdentifier}-final-$(date +%Y%m%d) --region ${region}`, riskLevel: 'safe' },
            { order: 2, action: 'Delete RDS instance', command: `aws rds delete-db-instance --db-instance-identifier ${dbIdentifier} --skip-final-snapshot --region ${region}`, riskLevel: 'destructive' },
        ];
    }
    if (recommendationType === 'downsize' && recommendedSize) {
        return [
            { order: 1, action: 'Modify instance class', command: `aws rds modify-db-instance --db-instance-identifier ${dbIdentifier} --db-instance-class ${recommendedSize} --apply-immediately --region ${region}`, riskLevel: 'review', notes: 'This may cause brief downtime' },
        ];
    }
    return [];
}
/**
 * Save ML results to database (v3.0 with all new fields)
 */
async function saveMLResultsV3(prisma, organizationId, accountId, awsAccountNumber, results) {
    try {
        // Delete old results for this account
        await prisma.resourceUtilizationML.deleteMany({
            where: {
                organization_id: organizationId,
                aws_account_id: accountId,
            },
        });
        // Insert new results
        for (const result of results) {
            await prisma.resourceUtilizationML.create({
                data: {
                    id: (0, crypto_1.randomUUID)(),
                    organization_id: organizationId,
                    aws_account_id: accountId,
                    // Note: aws_account_number removed until Prisma layer is updated
                    resource_id: result.resourceId,
                    resource_arn: result.resourceArn,
                    resource_name: result.resourceName,
                    resource_type: result.resourceType,
                    resource_subtype: result.resourceSubtype || null,
                    region: result.region,
                    current_size: result.currentSize,
                    current_monthly_cost: result.currentMonthlyCost,
                    current_hourly_cost: result.currentHourlyCost,
                    recommendation_type: result.recommendationType,
                    recommendation_priority: result.recommendationPriority,
                    recommended_size: result.recommendedSize,
                    potential_monthly_savings: result.potentialMonthlySavings,
                    potential_annual_savings: result.potentialAnnualSavings,
                    ml_confidence: result.mlConfidence,
                    utilization_patterns: result.utilizationPatterns,
                    resource_metadata: result.resourceMetadata,
                    dependencies: result.dependencies,
                    auto_scaling_eligible: result.autoScalingEligible,
                    auto_scaling_config: result.autoScalingConfig,
                    implementation_complexity: result.implementationComplexity,
                    implementation_steps: result.implementationSteps,
                    risk_assessment: result.riskAssessment,
                    last_activity_at: result.lastActivityAt,
                    days_since_activity: result.daysSinceActivity,
                    analyzed_at: result.analyzedAt,
                },
            });
        }
        logging_js_1.logger.info('ML results v3.0 saved to database', {
            organizationId,
            accountId,
            awsAccountNumber,
            count: results.length
        });
    }
    catch (err) {
        logging_js_1.logger.error('Error saving ML results v3.0', err);
    }
}
/**
 * Analyze S3 buckets for waste
 */
async function analyzeS3Buckets(credentials, accountId, maxBuckets, remainingTime) {
    const results = [];
    const startTime = Date.now();
    try {
        const s3Client = new client_s3_1.S3Client({ region: 'us-east-1', credentials });
        const cwClient = new client_cloudwatch_1.CloudWatchClient({ region: 'us-east-1', credentials });
        const response = await s3Client.send(new client_s3_1.ListBucketsCommand({}));
        const buckets = (response.Buckets || []).slice(0, maxBuckets);
        for (const bucket of buckets) {
            if (Date.now() - startTime > remainingTime - 2000)
                break;
            const bucketName = bucket.Name;
            try {
                // Get bucket location
                let bucketRegion = 'us-east-1';
                try {
                    const locationResponse = await s3Client.send(new client_s3_1.GetBucketLocationCommand({ Bucket: bucketName }));
                    bucketRegion = locationResponse.LocationConstraint || 'us-east-1';
                }
                catch (locErr) {
                    // Default to us-east-1 if we can't get location
                }
                // Get bucket size from CloudWatch
                const sizeMetrics = await getCloudWatchMetrics(cwClient, 'AWS/S3', 'BucketSizeBytes', [
                    { Name: 'BucketName', Value: bucketName },
                    { Name: 'StorageType', Value: 'StandardStorage' }
                ], 7);
                // Get number of objects
                const objectCountMetrics = await getCloudWatchMetrics(cwClient, 'AWS/S3', 'NumberOfObjects', [
                    { Name: 'BucketName', Value: bucketName },
                    { Name: 'StorageType', Value: 'AllStorageTypes' }
                ], 7);
                const latestSize = sizeMetrics.length > 0
                    ? sizeMetrics[sizeMetrics.length - 1].Average || 0
                    : 0;
                const sizeGB = latestSize / (1024 * 1024 * 1024);
                const objectCount = objectCountMetrics.length > 0
                    ? objectCountMetrics[objectCountMetrics.length - 1].Average || 0
                    : 0;
                const arn = (0, index_js_1.buildResourceArn)('s3', '', accountId, 'bucket', bucketName);
                const currentMonthlyCost = (0, pricing_js_1.getS3MonthlyCost)(sizeGB, 'STANDARD');
                const currentHourlyCost = currentMonthlyCost / 730;
                // Check for empty buckets
                if (objectCount === 0 || sizeGB < 0.001) {
                    const implementationSteps = [
                        { order: 1, action: 'Verify bucket is empty', command: `aws s3 ls s3://${bucketName} --summarize`, riskLevel: 'safe' },
                        { order: 2, action: 'Delete empty bucket', command: `aws s3 rb s3://${bucketName}`, riskLevel: 'destructive', notes: 'Bucket must be empty' },
                    ];
                    results.push({
                        resourceId: bucketName,
                        resourceArn: arn,
                        resourceName: bucketName,
                        resourceType: 'S3::Bucket',
                        resourceSubtype: 'empty',
                        region: bucketRegion,
                        accountId,
                        currentSize: `${sizeGB.toFixed(2)} GB (${objectCount} objects)`,
                        currentMonthlyCost: 0,
                        currentHourlyCost: 0,
                        recommendationType: 'terminate',
                        recommendationPriority: 1,
                        recommendedSize: null,
                        potentialMonthlySavings: 0,
                        potentialAnnualSavings: 0,
                        mlConfidence: 0.95,
                        utilizationPatterns: { avgCpuUsage: 0, maxCpuUsage: 0, avgMemoryUsage: 0, maxMemoryUsage: 0, peakHours: [], weekdayPattern: [], hasRealMetrics: true, dataCompleteness: 1, trend: 'stable', seasonality: 'none', objectCount: 0, sizeGB: 0 },
                        resourceMetadata: { creationDate: bucket.CreationDate?.toISOString(), region: bucketRegion },
                        dependencies: [],
                        autoScalingEligible: false,
                        autoScalingConfig: null,
                        implementationComplexity: 'low',
                        implementationSteps,
                        riskAssessment: 'low',
                        lastActivityAt: null,
                        daysSinceActivity: null,
                        analyzedAt: new Date(),
                    });
                    continue;
                }
                // Check for large buckets that could benefit from Intelligent-Tiering
                if (sizeGB > 100) {
                    const intelligentTieringCost = (0, pricing_js_1.getS3MonthlyCost)(sizeGB, 'INTELLIGENT_TIERING');
                    const savings = currentMonthlyCost - intelligentTieringCost;
                    if (savings > 5) {
                        const implementationSteps = [
                            { order: 1, action: 'Enable Intelligent-Tiering lifecycle rule', command: `aws s3api put-bucket-lifecycle-configuration --bucket ${bucketName} --lifecycle-configuration '{"Rules":[{"ID":"IntelligentTiering","Status":"Enabled","Filter":{},"Transitions":[{"Days":0,"StorageClass":"INTELLIGENT_TIERING"}]}]}'`, riskLevel: 'review' },
                        ];
                        results.push({
                            resourceId: bucketName,
                            resourceArn: arn,
                            resourceName: bucketName,
                            resourceType: 'S3::Bucket',
                            resourceSubtype: 'STANDARD',
                            region: bucketRegion,
                            accountId,
                            currentSize: `${sizeGB.toFixed(2)} GB (${objectCount.toFixed(0)} objects)`,
                            currentMonthlyCost: parseFloat(currentMonthlyCost.toFixed(2)),
                            currentHourlyCost: parseFloat(currentHourlyCost.toFixed(4)),
                            recommendationType: 'migrate',
                            recommendationPriority: calculatePriority(savings, 0.75),
                            recommendedSize: 'INTELLIGENT_TIERING',
                            potentialMonthlySavings: parseFloat(savings.toFixed(2)),
                            potentialAnnualSavings: parseFloat((savings * 12).toFixed(2)),
                            mlConfidence: 0.75,
                            utilizationPatterns: { avgCpuUsage: 0, maxCpuUsage: 0, avgMemoryUsage: 0, maxMemoryUsage: 0, peakHours: [], weekdayPattern: [], hasRealMetrics: true, dataCompleteness: 1, trend: 'stable', seasonality: 'none', objectCount, sizeGB },
                            resourceMetadata: { creationDate: bucket.CreationDate?.toISOString(), region: bucketRegion, storageClass: 'STANDARD' },
                            dependencies: [],
                            autoScalingEligible: false,
                            autoScalingConfig: null,
                            implementationComplexity: 'low',
                            implementationSteps,
                            riskAssessment: 'low',
                            lastActivityAt: null,
                            daysSinceActivity: null,
                            analyzedAt: new Date(),
                        });
                    }
                }
            }
            catch (bucketErr) {
                logging_js_1.logger.warn('Error analyzing S3 bucket', { bucketName, error: bucketErr.message });
            }
        }
    }
    catch (err) {
        logging_js_1.logger.error('Error in S3 analysis', err);
    }
    return results;
}
/**
 * Analyze DynamoDB tables for waste
 */
async function analyzeDynamoDBTables(credentials, region, accountId, maxTables, remainingTime) {
    const results = [];
    const startTime = Date.now();
    try {
        const dynamoClient = new client_dynamodb_1.DynamoDBClient({ region, credentials });
        const cwClient = new client_cloudwatch_1.CloudWatchClient({ region, credentials });
        const listResponse = await dynamoClient.send(new client_dynamodb_1.ListTablesCommand({ Limit: maxTables }));
        for (const tableName of listResponse.TableNames || []) {
            if (Date.now() - startTime > remainingTime - 2000)
                break;
            try {
                const describeResponse = await dynamoClient.send(new client_dynamodb_1.DescribeTableCommand({ TableName: tableName }));
                const table = describeResponse.Table;
                const billingMode = table.BillingModeSummary?.BillingMode || 'PROVISIONED';
                const readCapacity = table.ProvisionedThroughput?.ReadCapacityUnits || 0;
                const writeCapacity = table.ProvisionedThroughput?.WriteCapacityUnits || 0;
                const tableSizeBytes = table.TableSizeBytes || 0;
                const tableSizeGB = tableSizeBytes / (1024 * 1024 * 1024);
                const itemCount = table.ItemCount || 0;
                const arn = table.TableArn || (0, index_js_1.buildResourceArn)('dynamodb', region, accountId, 'table', tableName);
                // Get consumed capacity metrics
                const consumedReadMetrics = await getCloudWatchMetrics(cwClient, 'AWS/DynamoDB', 'ConsumedReadCapacityUnits', [{ Name: 'TableName', Value: tableName }], 7);
                const consumedWriteMetrics = await getCloudWatchMetrics(cwClient, 'AWS/DynamoDB', 'ConsumedWriteCapacityUnits', [{ Name: 'TableName', Value: tableName }], 7);
                const avgConsumedRead = consumedReadMetrics.length > 0
                    ? consumedReadMetrics.reduce((sum, dp) => sum + (dp.Average || 0), 0) / consumedReadMetrics.length
                    : 0;
                const avgConsumedWrite = consumedWriteMetrics.length > 0
                    ? consumedWriteMetrics.reduce((sum, dp) => sum + (dp.Average || 0), 0) / consumedWriteMetrics.length
                    : 0;
                // Check for unused tables (zero read/write)
                if (avgConsumedRead < 1 && avgConsumedWrite < 1 && itemCount === 0) {
                    const currentMonthlyCost = billingMode === 'PROVISIONED'
                        ? (0, pricing_js_1.getDynamoDBProvisionedMonthlyCost)(readCapacity, writeCapacity, tableSizeGB)
                        : tableSizeGB * pricing_js_1.DYNAMODB_PRICING.storagePerGBMonth;
                    const implementationSteps = [
                        { order: 1, action: 'Verify table is not needed', command: `aws dynamodb describe-table --table-name ${tableName} --region ${region}`, riskLevel: 'safe' },
                        { order: 2, action: 'Create backup before deletion', command: `aws dynamodb create-backup --table-name ${tableName} --backup-name ${tableName}-backup-$(date +%Y%m%d) --region ${region}`, riskLevel: 'safe' },
                        { order: 3, action: 'Delete DynamoDB table', command: `aws dynamodb delete-table --table-name ${tableName} --region ${region}`, riskLevel: 'destructive' },
                    ];
                    results.push({
                        resourceId: tableName,
                        resourceArn: arn,
                        resourceName: tableName,
                        resourceType: 'DynamoDB::Table',
                        resourceSubtype: billingMode,
                        region,
                        accountId,
                        currentSize: `${itemCount} items (${tableSizeGB.toFixed(2)} GB)`,
                        currentMonthlyCost: parseFloat(currentMonthlyCost.toFixed(2)),
                        currentHourlyCost: parseFloat((currentMonthlyCost / 730).toFixed(4)),
                        recommendationType: 'terminate',
                        recommendationPriority: calculatePriority(currentMonthlyCost, 0.90),
                        recommendedSize: null,
                        potentialMonthlySavings: parseFloat(currentMonthlyCost.toFixed(2)),
                        potentialAnnualSavings: parseFloat((currentMonthlyCost * 12).toFixed(2)),
                        mlConfidence: 0.90,
                        utilizationPatterns: { avgCpuUsage: 0, maxCpuUsage: 0, avgMemoryUsage: 0, maxMemoryUsage: 0, peakHours: [], weekdayPattern: [], hasRealMetrics: true, dataCompleteness: 1, trend: 'stable', seasonality: 'none', avgConsumedRead, avgConsumedWrite },
                        resourceMetadata: { billingMode, readCapacity, writeCapacity, itemCount, tableSizeGB, tableStatus: table.TableStatus },
                        dependencies: [],
                        autoScalingEligible: false,
                        autoScalingConfig: null,
                        implementationComplexity: 'medium',
                        implementationSteps,
                        riskAssessment: 'high',
                        lastActivityAt: null,
                        daysSinceActivity: 7,
                        analyzedAt: new Date(),
                    });
                    continue;
                }
                // Check for over-provisioned tables
                if (billingMode === 'PROVISIONED' && readCapacity > 0) {
                    const readUtilization = (avgConsumedRead / readCapacity) * 100;
                    const writeUtilization = writeCapacity > 0 ? (avgConsumedWrite / writeCapacity) * 100 : 0;
                    // If utilization is very low, recommend switching to on-demand
                    if (readUtilization < 20 && writeUtilization < 20) {
                        const currentMonthlyCost = (0, pricing_js_1.getDynamoDBProvisionedMonthlyCost)(readCapacity, writeCapacity, tableSizeGB);
                        // Estimate on-demand cost based on actual usage
                        const estimatedMonthlyReads = avgConsumedRead * 3600 * 24 * 30;
                        const estimatedMonthlyWrites = avgConsumedWrite * 3600 * 24 * 30;
                        const onDemandCost = (estimatedMonthlyReads / 1000000) * pricing_js_1.DYNAMODB_PRICING.onDemandReadPerMillion +
                            (estimatedMonthlyWrites / 1000000) * pricing_js_1.DYNAMODB_PRICING.onDemandWritePerMillion +
                            tableSizeGB * pricing_js_1.DYNAMODB_PRICING.storagePerGBMonth;
                        const savings = currentMonthlyCost - onDemandCost;
                        if (savings > 5) {
                            const implementationSteps = [
                                { order: 1, action: 'Switch to On-Demand billing', command: `aws dynamodb update-table --table-name ${tableName} --billing-mode PAY_PER_REQUEST --region ${region}`, riskLevel: 'review', notes: 'May take a few minutes to complete' },
                            ];
                            results.push({
                                resourceId: tableName,
                                resourceArn: arn,
                                resourceName: tableName,
                                resourceType: 'DynamoDB::Table',
                                resourceSubtype: billingMode,
                                region,
                                accountId,
                                currentSize: `${itemCount} items (${tableSizeGB.toFixed(2)} GB)`,
                                currentMonthlyCost: parseFloat(currentMonthlyCost.toFixed(2)),
                                currentHourlyCost: parseFloat((currentMonthlyCost / 730).toFixed(4)),
                                recommendationType: 'optimize',
                                recommendationPriority: calculatePriority(savings, 0.70),
                                recommendedSize: 'PAY_PER_REQUEST',
                                potentialMonthlySavings: parseFloat(savings.toFixed(2)),
                                potentialAnnualSavings: parseFloat((savings * 12).toFixed(2)),
                                mlConfidence: 0.70,
                                utilizationPatterns: { avgCpuUsage: readUtilization, maxCpuUsage: readUtilization, avgMemoryUsage: writeUtilization, maxMemoryUsage: writeUtilization, peakHours: [], weekdayPattern: [], hasRealMetrics: true, dataCompleteness: 1, trend: 'stable', seasonality: 'none', avgConsumedRead, avgConsumedWrite },
                                resourceMetadata: { billingMode, readCapacity, writeCapacity, itemCount, tableSizeGB, tableStatus: table.TableStatus, readUtilization, writeUtilization },
                                dependencies: [],
                                autoScalingEligible: false,
                                autoScalingConfig: null,
                                implementationComplexity: 'low',
                                implementationSteps,
                                riskAssessment: 'low',
                                lastActivityAt: null,
                                daysSinceActivity: null,
                                analyzedAt: new Date(),
                            });
                        }
                    }
                }
            }
            catch (tableErr) {
                logging_js_1.logger.warn('Error analyzing DynamoDB table', { tableName, error: tableErr.message });
            }
        }
    }
    catch (err) {
        logging_js_1.logger.error('Error in DynamoDB analysis', err);
    }
    return results;
}
//# sourceMappingURL=ml-waste-detection.js.map