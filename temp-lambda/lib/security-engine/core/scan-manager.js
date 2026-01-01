"use strict";
/**
 * Security Engine V3 - Scan Manager
 * Orchestrates all security scanners with parallel execution
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScanManager = void 0;
exports.runSecurityScan = runSecurityScan;
const resource_cache_js_1 = require("./resource-cache.js");
const parallel_executor_js_1 = require("./parallel-executor.js");
const client_factory_js_1 = require("./client-factory.js");
const logging_js_1 = require("../../logging.js");
const crypto_1 = require("crypto");
// Import all scanners
const index_js_1 = require("../scanners/iam/index.js");
const index_js_2 = require("../scanners/s3/index.js");
const index_js_3 = require("../scanners/lambda/index.js");
const index_js_4 = require("../scanners/ec2/index.js");
const index_js_5 = require("../scanners/rds/index.js");
const index_js_6 = require("../scanners/cloudtrail/index.js");
const index_js_7 = require("../scanners/secrets-manager/index.js");
const index_js_8 = require("../scanners/kms/index.js");
const index_js_9 = require("../scanners/guardduty/index.js");
const index_js_10 = require("../scanners/security-hub/index.js");
const index_js_11 = require("../scanners/waf/index.js");
const index_js_12 = require("../scanners/sqs/index.js");
const index_js_13 = require("../scanners/sns/index.js");
const index_js_14 = require("../scanners/dynamodb/index.js");
const index_js_15 = require("../scanners/cognito/index.js");
const index_js_16 = require("../scanners/api-gateway/index.js");
const index_js_17 = require("../scanners/acm/index.js");
const index_js_18 = require("../scanners/cloudfront/index.js");
const index_js_19 = require("../scanners/elasticache/index.js");
const index_js_20 = require("../scanners/elb/index.js");
const index_js_21 = require("../scanners/eks/index.js");
const index_js_22 = require("../scanners/ecs/index.js");
const index_js_23 = require("../scanners/opensearch/index.js");
// New scanners - Phase 2
const index_js_24 = require("../scanners/ecr/index.js");
const index_js_25 = require("../scanners/route53/index.js");
const index_js_26 = require("../scanners/efs/index.js");
const index_js_27 = require("../scanners/config/index.js");
const index_js_28 = require("../scanners/backup/index.js");
const index_js_29 = require("../scanners/cloudwatch/index.js");
const index_js_30 = require("../scanners/redshift/index.js");
// New scanners - Phase 3
const index_js_31 = require("../scanners/eventbridge/index.js");
const index_js_32 = require("../scanners/stepfunctions/index.js");
const index_js_33 = require("../scanners/ssm/index.js");
const index_js_34 = require("../scanners/kinesis/index.js");
const index_js_35 = require("../scanners/inspector/index.js");
const index_js_36 = require("../scanners/macie/index.js");
const index_js_37 = require("../scanners/networkfirewall/index.js");
const index_js_38 = require("../scanners/organizations/index.js");
// New scanners - Sprint 1 Evolution (Missing Services)
const index_js_39 = require("../scanners/glue/index.js");
const SCANNERS = [
    // Global services (run once)
    { name: 'IAM', scanner: index_js_1.scanIAM, isGlobal: true },
    { name: 'S3', scanner: index_js_2.scanS3, isGlobal: true },
    { name: 'CloudFront', scanner: index_js_18.scanCloudFront, isGlobal: true },
    { name: 'Route53', scanner: index_js_25.scanRoute53, isGlobal: true },
    // Regional services
    { name: 'Lambda', scanner: index_js_3.scanLambda, isGlobal: false },
    { name: 'EC2', scanner: index_js_4.scanEC2, isGlobal: false },
    { name: 'RDS', scanner: index_js_5.scanRDS, isGlobal: false },
    { name: 'CloudTrail', scanner: index_js_6.scanCloudTrail, isGlobal: false },
    { name: 'SecretsManager', scanner: index_js_7.scanSecretsManager, isGlobal: false },
    { name: 'KMS', scanner: index_js_8.scanKMS, isGlobal: false },
    { name: 'GuardDuty', scanner: index_js_9.scanGuardDuty, isGlobal: false },
    { name: 'SecurityHub', scanner: index_js_10.scanSecurityHub, isGlobal: false },
    { name: 'WAF', scanner: index_js_11.scanWAF, isGlobal: false },
    { name: 'SQS', scanner: index_js_12.scanSQS, isGlobal: false },
    { name: 'SNS', scanner: index_js_13.scanSNS, isGlobal: false },
    { name: 'DynamoDB', scanner: index_js_14.scanDynamoDB, isGlobal: false },
    { name: 'Cognito', scanner: index_js_15.scanCognito, isGlobal: false },
    { name: 'APIGateway', scanner: index_js_16.scanAPIGateway, isGlobal: false },
    { name: 'ACM', scanner: index_js_17.scanACM, isGlobal: false },
    { name: 'ElastiCache', scanner: index_js_19.scanElastiCache, isGlobal: false },
    { name: 'ELB', scanner: index_js_20.scanELB, isGlobal: false },
    { name: 'EKS', scanner: index_js_21.scanEKS, isGlobal: false },
    { name: 'ECS', scanner: index_js_22.scanECS, isGlobal: false },
    { name: 'OpenSearch', scanner: index_js_23.scanOpenSearch, isGlobal: false },
    // New scanners - Phase 2
    { name: 'ECR', scanner: index_js_24.scanECR, isGlobal: false },
    { name: 'EFS', scanner: index_js_26.scanEFS, isGlobal: false },
    { name: 'Config', scanner: index_js_27.scanConfig, isGlobal: false },
    { name: 'Backup', scanner: index_js_28.scanBackup, isGlobal: false },
    { name: 'CloudWatch', scanner: index_js_29.scanCloudWatch, isGlobal: false },
    { name: 'Redshift', scanner: index_js_30.scanRedshift, isGlobal: false },
    // New scanners - Phase 3
    { name: 'EventBridge', scanner: index_js_31.scanEventBridge, isGlobal: false },
    { name: 'StepFunctions', scanner: index_js_32.scanStepFunctions, isGlobal: false },
    { name: 'SSM', scanner: index_js_33.scanSSM, isGlobal: false },
    { name: 'Kinesis', scanner: index_js_34.scanKinesis, isGlobal: false },
    { name: 'Inspector', scanner: index_js_35.scanInspector, isGlobal: false },
    { name: 'Macie', scanner: index_js_36.scanMacie, isGlobal: false },
    { name: 'NetworkFirewall', scanner: index_js_37.scanNetworkFirewall, isGlobal: false },
    { name: 'Organizations', scanner: index_js_38.scanOrganizations, isGlobal: true },
    // New scanners - Sprint 1 Evolution (Missing Services)
    { name: 'Glue', scanner: index_js_39.scanGlue, isGlobal: false },
];
class ScanManager {
    constructor(context) {
        this.context = context;
        this.cache = (0, resource_cache_js_1.getGlobalCache)();
        this.executor = new parallel_executor_js_1.ParallelExecutor();
        this.clientFactory = new client_factory_js_1.AWSClientFactory(context.credentials);
    }
    async scan() {
        const scanId = (0, crypto_1.randomUUID)();
        const startTime = Date.now();
        const allFindings = [];
        let totalErrors = 0;
        logging_js_1.logger.info('Starting security scan', {
            scanId,
            accountId: this.context.awsAccountId,
            regions: this.context.regions,
            scanLevel: this.context.scanLevel,
        });
        try {
            // Get account ID if not provided
            let accountId = this.context.awsAccountId;
            if (!accountId) {
                accountId = await this.clientFactory.getAccountId();
            }
            // Filter scanners based on enabled/excluded services
            const enabledScanners = this.getEnabledScanners();
            // Run global scanners first (only once)
            const globalScanners = enabledScanners.filter(s => s.isGlobal);
            const globalFindings = await this.runScanners(globalScanners, 'us-east-1', accountId);
            allFindings.push(...globalFindings);
            // Run regional scanners for each region
            const regionalScanners = enabledScanners.filter(s => !s.isGlobal);
            for (const region of this.context.regions) {
                logging_js_1.logger.info(`Scanning region: ${region}`);
                const regionalFindings = await this.runScanners(regionalScanners, region, accountId);
                allFindings.push(...regionalFindings);
            }
        }
        catch (error) {
            logging_js_1.logger.error('Scan failed', error);
            totalErrors++;
        }
        const duration = Date.now() - startTime;
        const summary = this.calculateSummary(allFindings);
        const metrics = this.calculateMetrics(duration, allFindings, totalErrors);
        logging_js_1.logger.info('Security scan completed', {
            scanId,
            duration,
            totalFindings: allFindings.length,
            summary,
        });
        return {
            success: true,
            scanId,
            totalFindings: allFindings.length,
            duration,
            findings: allFindings,
            summary,
            metrics,
        };
    }
    getEnabledScanners() {
        let scanners = [...SCANNERS];
        // Filter by enabled services if specified
        if (this.context.enabledServices && this.context.enabledServices.length > 0) {
            scanners = scanners.filter(s => this.context.enabledServices.includes(s.name));
        }
        // Filter out excluded services
        if (this.context.excludedServices && this.context.excludedServices.length > 0) {
            scanners = scanners.filter(s => !this.context.excludedServices.includes(s.name));
        }
        // Normalize scan level (frontend uses basic/advanced/military, backend uses quick/standard/deep)
        const scanLevel = this.context.scanLevel;
        const isQuick = scanLevel === 'quick' || scanLevel === 'basic';
        const isStandard = scanLevel === 'standard' || scanLevel === 'advanced';
        // Deep/Military is the default (all scanners)
        // Adjust based on scan level
        // Quick/Basic: Only critical security services (~6 scanners, ~2 min)
        // Standard/Advanced: Core AWS services (~20 scanners, ~5 min)
        // Deep/Military: All services including advanced security tools (~38 scanners, ~10 min)
        if (isQuick) {
            // Quick scan: only critical services (6 scanners)
            const quickServices = ['IAM', 'S3', 'EC2', 'RDS', 'Lambda', 'GuardDuty'];
            scanners = scanners.filter(s => quickServices.includes(s.name));
            logging_js_1.logger.info('Quick/Basic scan: using 6 critical scanners');
        }
        else if (isStandard) {
            // Standard scan: core AWS services (20 scanners)
            const standardServices = [
                // Critical (from quick)
                'IAM', 'S3', 'EC2', 'RDS', 'Lambda', 'GuardDuty',
                // Network & Security
                'SecurityHub', 'WAF', 'CloudTrail', 'KMS', 'SecretsManager', 'ACM',
                // Compute & Containers
                'ECS', 'EKS', 'ELB',
                // Data & Messaging
                'DynamoDB', 'SQS', 'SNS',
                // API & Identity
                'APIGateway', 'Cognito'
            ];
            scanners = scanners.filter(s => standardServices.includes(s.name));
            logging_js_1.logger.info('Standard/Advanced scan: using 20 core scanners');
        }
        else {
            // Deep/Military scan: all scanners
            logging_js_1.logger.info('Deep/Military scan: using all 38 scanners');
        }
        return scanners;
    }
    async runScanners(scanners, region, accountId) {
        const findings = [];
        const results = await Promise.allSettled(scanners.map(async (config) => {
            const startTime = Date.now();
            try {
                const scannerFindings = await config.scanner(region, accountId, this.context.credentials, this.cache);
                const duration = Date.now() - startTime;
                this.executor.recordMetric(config.name, region, duration, scannerFindings.length);
                return scannerFindings;
            }
            catch (error) {
                const duration = Date.now() - startTime;
                this.executor.recordMetric(config.name, region, duration, 0, 1);
                logging_js_1.logger.warn(`Scanner ${config.name} failed in ${region}`, { error: error.message });
                return [];
            }
        }));
        for (const result of results) {
            if (result.status === 'fulfilled') {
                findings.push(...result.value);
            }
        }
        return findings;
    }
    calculateSummary(findings) {
        const summary = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            total: findings.length,
            byService: {},
            byCategory: {},
        };
        for (const finding of findings) {
            // Count by severity
            summary[finding.severity]++;
            // Count by service
            summary.byService[finding.service] = (summary.byService[finding.service] || 0) + 1;
            // Count by category
            summary.byCategory[finding.category] = (summary.byCategory[finding.category] || 0) + 1;
        }
        return summary;
    }
    calculateMetrics(totalDuration, findings, totalErrors) {
        const executorMetrics = this.executor.getMetrics();
        const serviceDetails = {};
        for (const [key, metric] of executorMetrics) {
            serviceDetails[key] = metric;
        }
        return {
            totalDuration,
            totalFindings: findings.length,
            totalErrors,
            servicesScanned: executorMetrics.size,
            regionsScanned: this.context.regions.length,
            serviceDetails,
        };
    }
}
exports.ScanManager = ScanManager;
async function runSecurityScan(context) {
    const manager = new ScanManager(context);
    return manager.scan();
}
//# sourceMappingURL=scan-manager.js.map