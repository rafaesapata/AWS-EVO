/**
 * Security Engine V2 - Scan Manager
 * Orchestrates all security scanners with parallel execution
 */

import type { Finding, ScanResult, ScanContext, ScanSummary, ScanMetricsReport, AWSCredentials } from '../types.js';
import { ResourceCache, getGlobalCache } from './resource-cache.js';
import { ParallelExecutor } from './parallel-executor.js';
import { AWSClientFactory } from './client-factory.js';
import { GLOBAL_SERVICES, REGIONAL_SERVICES } from '../config.js';
import { logger } from '../../logging.js';
import { randomUUID } from 'crypto';

// Import all scanners
import { scanIAM } from '../scanners/iam/index.js';
import { scanS3 } from '../scanners/s3/index.js';
import { scanLambda } from '../scanners/lambda/index.js';
import { scanEC2 } from '../scanners/ec2/index.js';
import { scanRDS } from '../scanners/rds/index.js';
import { scanCloudTrail } from '../scanners/cloudtrail/index.js';
import { scanSecretsManager } from '../scanners/secrets-manager/index.js';
import { scanKMS } from '../scanners/kms/index.js';
import { scanGuardDuty } from '../scanners/guardduty/index.js';
import { scanSecurityHub } from '../scanners/security-hub/index.js';
import { scanWAF } from '../scanners/waf/index.js';
import { scanSQS } from '../scanners/sqs/index.js';
import { scanSNS } from '../scanners/sns/index.js';
import { scanDynamoDB } from '../scanners/dynamodb/index.js';
import { scanCognito } from '../scanners/cognito/index.js';
import { scanAPIGateway } from '../scanners/api-gateway/index.js';
import { scanACM } from '../scanners/acm/index.js';
import { scanCloudFront } from '../scanners/cloudfront/index.js';
import { scanElastiCache } from '../scanners/elasticache/index.js';
import { scanELB } from '../scanners/elb/index.js';
import { scanEKS } from '../scanners/eks/index.js';
import { scanECS } from '../scanners/ecs/index.js';
import { scanOpenSearch } from '../scanners/opensearch/index.js';

// New scanners - Phase 2
import { scanECR } from '../scanners/ecr/index.js';
import { scanRoute53 } from '../scanners/route53/index.js';
import { scanEFS } from '../scanners/efs/index.js';
import { scanConfig } from '../scanners/config/index.js';
import { scanBackup } from '../scanners/backup/index.js';
import { scanCloudWatch } from '../scanners/cloudwatch/index.js';
import { scanRedshift } from '../scanners/redshift/index.js';

// New scanners - Phase 3
import { scanEventBridge } from '../scanners/eventbridge/index.js';
import { scanStepFunctions } from '../scanners/stepfunctions/index.js';
import { scanSSM } from '../scanners/ssm/index.js';
import { scanKinesis } from '../scanners/kinesis/index.js';
import { scanInspector } from '../scanners/inspector/index.js';
import { scanMacie } from '../scanners/macie/index.js';
import { scanNetworkFirewall } from '../scanners/networkfirewall/index.js';
import { scanOrganizations } from '../scanners/organizations/index.js';

type ScannerFunction = (
  region: string,
  accountId: string,
  credentials: AWSCredentials,
  cache: ResourceCache
) => Promise<Finding[]>;

interface ScannerConfig {
  name: string;
  scanner: ScannerFunction;
  isGlobal: boolean;
}

const SCANNERS: ScannerConfig[] = [
  // Global services (run once)
  { name: 'IAM', scanner: scanIAM, isGlobal: true },
  { name: 'S3', scanner: scanS3, isGlobal: true },
  { name: 'CloudFront', scanner: scanCloudFront, isGlobal: true },
  { name: 'Route53', scanner: scanRoute53, isGlobal: true },
  
  // Regional services
  { name: 'Lambda', scanner: scanLambda, isGlobal: false },
  { name: 'EC2', scanner: scanEC2, isGlobal: false },
  { name: 'RDS', scanner: scanRDS, isGlobal: false },
  { name: 'CloudTrail', scanner: scanCloudTrail, isGlobal: false },
  { name: 'SecretsManager', scanner: scanSecretsManager, isGlobal: false },
  { name: 'KMS', scanner: scanKMS, isGlobal: false },
  { name: 'GuardDuty', scanner: scanGuardDuty, isGlobal: false },
  { name: 'SecurityHub', scanner: scanSecurityHub, isGlobal: false },
  { name: 'WAF', scanner: scanWAF, isGlobal: false },
  { name: 'SQS', scanner: scanSQS, isGlobal: false },
  { name: 'SNS', scanner: scanSNS, isGlobal: false },
  { name: 'DynamoDB', scanner: scanDynamoDB, isGlobal: false },
  { name: 'Cognito', scanner: scanCognito, isGlobal: false },
  { name: 'APIGateway', scanner: scanAPIGateway, isGlobal: false },
  { name: 'ACM', scanner: scanACM, isGlobal: false },
  { name: 'ElastiCache', scanner: scanElastiCache, isGlobal: false },
  { name: 'ELB', scanner: scanELB, isGlobal: false },
  { name: 'EKS', scanner: scanEKS, isGlobal: false },
  { name: 'ECS', scanner: scanECS, isGlobal: false },
  { name: 'OpenSearch', scanner: scanOpenSearch, isGlobal: false },
  // New scanners - Phase 2
  { name: 'ECR', scanner: scanECR, isGlobal: false },
  { name: 'EFS', scanner: scanEFS, isGlobal: false },
  { name: 'Config', scanner: scanConfig, isGlobal: false },
  { name: 'Backup', scanner: scanBackup, isGlobal: false },
  { name: 'CloudWatch', scanner: scanCloudWatch, isGlobal: false },
  { name: 'Redshift', scanner: scanRedshift, isGlobal: false },
  // New scanners - Phase 3
  { name: 'EventBridge', scanner: scanEventBridge, isGlobal: false },
  { name: 'StepFunctions', scanner: scanStepFunctions, isGlobal: false },
  { name: 'SSM', scanner: scanSSM, isGlobal: false },
  { name: 'Kinesis', scanner: scanKinesis, isGlobal: false },
  { name: 'Inspector', scanner: scanInspector, isGlobal: false },
  { name: 'Macie', scanner: scanMacie, isGlobal: false },
  { name: 'NetworkFirewall', scanner: scanNetworkFirewall, isGlobal: false },
  { name: 'Organizations', scanner: scanOrganizations, isGlobal: true },
];

export class ScanManager {
  private context: ScanContext;
  private cache: ResourceCache;
  private executor: ParallelExecutor;
  private clientFactory: AWSClientFactory;

  constructor(context: ScanContext) {
    this.context = context;
    this.cache = getGlobalCache();
    this.executor = new ParallelExecutor();
    this.clientFactory = new AWSClientFactory(context.credentials);
  }

  async scan(): Promise<ScanResult> {
    const scanId = randomUUID();
    const startTime = Date.now();
    const allFindings: Finding[] = [];
    let totalErrors = 0;

    logger.info('Starting security scan', {
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
        logger.info(`Scanning region: ${region}`);
        const regionalFindings = await this.runScanners(regionalScanners, region, accountId);
        allFindings.push(...regionalFindings);
      }
    } catch (error) {
      logger.error('Scan failed', error as Error);
      totalErrors++;
    }

    const duration = Date.now() - startTime;
    const summary = this.calculateSummary(allFindings);
    const metrics = this.calculateMetrics(duration, allFindings, totalErrors);

    logger.info('Security scan completed', {
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

  private getEnabledScanners(): ScannerConfig[] {
    let scanners = [...SCANNERS];

    // Filter by enabled services if specified
    if (this.context.enabledServices && this.context.enabledServices.length > 0) {
      scanners = scanners.filter(s => 
        this.context.enabledServices!.includes(s.name)
      );
    }

    // Filter out excluded services
    if (this.context.excludedServices && this.context.excludedServices.length > 0) {
      scanners = scanners.filter(s => 
        !this.context.excludedServices!.includes(s.name)
      );
    }

    // Adjust based on scan level
    if (this.context.scanLevel === 'quick') {
      // Quick scan: only critical services
      const quickServices = ['IAM', 'S3', 'EC2', 'RDS', 'Lambda', 'GuardDuty'];
      scanners = scanners.filter(s => quickServices.includes(s.name));
    }

    return scanners;
  }

  private async runScanners(
    scanners: ScannerConfig[],
    region: string,
    accountId: string
  ): Promise<Finding[]> {
    const findings: Finding[] = [];

    const results = await Promise.allSettled(
      scanners.map(async (config) => {
        const startTime = Date.now();
        try {
          const scannerFindings = await config.scanner(
            region,
            accountId,
            this.context.credentials,
            this.cache
          );
          
          const duration = Date.now() - startTime;
          this.executor.recordMetric(config.name, region, duration, scannerFindings.length);
          
          return scannerFindings;
        } catch (error) {
          const duration = Date.now() - startTime;
          this.executor.recordMetric(config.name, region, duration, 0, 1);
          logger.warn(`Scanner ${config.name} failed in ${region}`, { error: (error as Error).message });
          return [];
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        findings.push(...result.value);
      }
    }

    return findings;
  }

  private calculateSummary(findings: Finding[]): ScanSummary {
    const summary: ScanSummary = {
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

  private calculateMetrics(
    totalDuration: number,
    findings: Finding[],
    totalErrors: number
  ): ScanMetricsReport {
    const executorMetrics = this.executor.getMetrics();
    const serviceDetails: Record<string, any> = {};

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

export async function runSecurityScan(context: ScanContext): Promise<ScanResult> {
  const manager = new ScanManager(context);
  return manager.scan();
}
