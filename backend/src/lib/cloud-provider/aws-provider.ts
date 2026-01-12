/**
 * AWS Provider Implementation
 * 
 * Implements ICloudProvider interface by wrapping existing AWS functionality.
 * This provider delegates to existing aws-helpers.ts and security-engine
 * WITHOUT modifying any existing code.
 */

import type {
  ICloudProvider,
  CloudProviderType,
  AWSCredentialFields,
  ValidationResult,
  Resource,
  CostData,
  CostQueryParams,
  ScanConfig,
  ScanResult,
  SecurityFinding,
  ScanSummary,
  ActivityEvent,
  ActivityQueryParams,
} from '../../types/cloud.js';
import { CloudProviderError, CredentialValidationError } from '../../types/cloud.js';
import { logger } from '../logging.js';

// Import existing AWS helpers - we wrap them, not modify them
import { assumeRole } from '../aws-helpers.js';

import {
  STSClient,
  GetCallerIdentityCommand,
  AssumeRoleCommandOutput,
} from '@aws-sdk/client-sts';

import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeVolumesCommand,
  DescribeSecurityGroupsCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
} from '@aws-sdk/client-ec2';

import {
  S3Client,
  ListBucketsCommand,
} from '@aws-sdk/client-s3';

import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  Granularity,
} from '@aws-sdk/client-cost-explorer';

/**
 * AWS Provider
 * 
 * Wraps existing AWS functionality to implement the ICloudProvider interface.
 * All methods delegate to existing code without modification.
 */
export class AWSProvider implements ICloudProvider {
  readonly providerType: CloudProviderType = 'AWS';
  
  private organizationId: string;
  private credentials: AWSCredentialFields;
  private assumedCredentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
  } | null = null;

  constructor(organizationId: string, credentials: AWSCredentialFields) {
    this.organizationId = organizationId;
    this.credentials = credentials;
  }

  /**
   * Get AWS credentials, assuming role if necessary
   */
  private async getCredentials(): Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  }> {
    // If we have direct credentials, use them
    if (this.credentials.accessKeyId && this.credentials.secretAccessKey) {
      return {
        accessKeyId: this.credentials.accessKeyId,
        secretAccessKey: this.credentials.secretAccessKey,
        sessionToken: this.credentials.sessionToken,
      };
    }

    // If we have a role ARN, assume the role
    if (this.credentials.roleArn) {
      if (!this.assumedCredentials) {
        const assumed = await assumeRole(
          this.credentials.roleArn,
          this.credentials.externalId || ''
        );
        
        this.assumedCredentials = {
          accessKeyId: assumed.accessKeyId,
          secretAccessKey: assumed.secretAccessKey,
          sessionToken: assumed.sessionToken || '',
        };
      }
      return this.assumedCredentials;
    }

    throw new CredentialValidationError(
      'AWS',
      'No valid credentials provided - need either access keys or role ARN'
    );
  }

  /**
   * Validate AWS credentials by calling STS GetCallerIdentity
   */
  async validateCredentials(): Promise<ValidationResult> {
    try {
      const creds = await this.getCredentials();
      
      const stsClient = new STSClient({
        region: 'us-east-1',
        credentials: {
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
          sessionToken: creds.sessionToken,
        },
      });

      const response = await stsClient.send(new GetCallerIdentityCommand({}));

      logger.info('AWS credentials validated', {
        accountId: response.Account,
        arn: response.Arn,
      });

      return {
        valid: true,
        accountId: response.Account,
        accountName: response.Arn?.split('/').pop() || response.Account,
        details: {
          arn: response.Arn,
          userId: response.UserId,
        },
      };
    } catch (error: any) {
      logger.error('AWS credential validation failed', { error: error.message });
      
      return {
        valid: false,
        error: error.message || 'Failed to validate AWS credentials',
        details: {
          code: error.code || error.name,
        },
      };
    }
  }

  /**
   * List AWS resources across services
   */
  async listResources(resourceTypes?: string[]): Promise<Resource[]> {
    const resources: Resource[] = [];
    const creds = await this.getCredentials();
    const regions = ['us-east-1']; // Default region, can be expanded

    const typesToFetch = resourceTypes || ['EC2', 'S3', 'EBS', 'VPC', 'SecurityGroup'];

    for (const region of regions) {
      const ec2Client = new EC2Client({
        region,
        credentials: {
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
          sessionToken: creds.sessionToken,
        },
      });

      const s3Client = new S3Client({
        region,
        credentials: {
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
          sessionToken: creds.sessionToken,
        },
      });

      // EC2 Instances
      if (typesToFetch.includes('EC2')) {
        try {
          const instances = await ec2Client.send(new DescribeInstancesCommand({}));
          for (const reservation of instances.Reservations || []) {
            for (const instance of reservation.Instances || []) {
              resources.push({
                id: instance.InstanceId || '',
                provider: 'AWS',
                type: 'EC2',
                name: instance.Tags?.find(t => t.Key === 'Name')?.Value || instance.InstanceId || '',
                region,
                tags: instance.Tags?.reduce((acc, t) => {
                  if (t.Key && t.Value) acc[t.Key] = t.Value;
                  return acc;
                }, {} as Record<string, string>),
                metadata: {
                  instanceType: instance.InstanceType,
                  state: instance.State?.Name,
                  launchTime: instance.LaunchTime,
                  privateIp: instance.PrivateIpAddress,
                  publicIp: instance.PublicIpAddress,
                },
              });
            }
          }
        } catch (error: any) {
          logger.warn('Failed to list EC2 instances', { region, error: error.message });
        }
      }

      // S3 Buckets (global, only fetch once)
      if (typesToFetch.includes('S3') && region === 'us-east-1') {
        try {
          const buckets = await s3Client.send(new ListBucketsCommand({}));
          for (const bucket of buckets.Buckets || []) {
            resources.push({
              id: bucket.Name || '',
              provider: 'AWS',
              type: 'S3',
              name: bucket.Name || '',
              region: 'global',
              metadata: {
                creationDate: bucket.CreationDate,
              },
            });
          }
        } catch (error: any) {
          logger.warn('Failed to list S3 buckets', { error: error.message });
        }
      }

      // EBS Volumes
      if (typesToFetch.includes('EBS')) {
        try {
          const volumes = await ec2Client.send(new DescribeVolumesCommand({}));
          for (const volume of volumes.Volumes || []) {
            resources.push({
              id: volume.VolumeId || '',
              provider: 'AWS',
              type: 'EBS',
              name: volume.Tags?.find(t => t.Key === 'Name')?.Value || volume.VolumeId || '',
              region,
              tags: volume.Tags?.reduce((acc, t) => {
                if (t.Key && t.Value) acc[t.Key] = t.Value;
                return acc;
              }, {} as Record<string, string>),
              metadata: {
                size: volume.Size,
                volumeType: volume.VolumeType,
                state: volume.State,
                encrypted: volume.Encrypted,
              },
            });
          }
        } catch (error: any) {
          logger.warn('Failed to list EBS volumes', { region, error: error.message });
        }
      }

      // VPCs
      if (typesToFetch.includes('VPC')) {
        try {
          const vpcs = await ec2Client.send(new DescribeVpcsCommand({}));
          for (const vpc of vpcs.Vpcs || []) {
            resources.push({
              id: vpc.VpcId || '',
              provider: 'AWS',
              type: 'VPC',
              name: vpc.Tags?.find(t => t.Key === 'Name')?.Value || vpc.VpcId || '',
              region,
              tags: vpc.Tags?.reduce((acc, t) => {
                if (t.Key && t.Value) acc[t.Key] = t.Value;
                return acc;
              }, {} as Record<string, string>),
              metadata: {
                cidrBlock: vpc.CidrBlock,
                isDefault: vpc.IsDefault,
                state: vpc.State,
              },
            });
          }
        } catch (error: any) {
          logger.warn('Failed to list VPCs', { region, error: error.message });
        }
      }

      // Security Groups
      if (typesToFetch.includes('SecurityGroup')) {
        try {
          const sgs = await ec2Client.send(new DescribeSecurityGroupsCommand({}));
          for (const sg of sgs.SecurityGroups || []) {
            resources.push({
              id: sg.GroupId || '',
              provider: 'AWS',
              type: 'SecurityGroup',
              name: sg.GroupName || sg.GroupId || '',
              region,
              tags: sg.Tags?.reduce((acc, t) => {
                if (t.Key && t.Value) acc[t.Key] = t.Value;
                return acc;
              }, {} as Record<string, string>),
              metadata: {
                description: sg.Description,
                vpcId: sg.VpcId,
                ingressRulesCount: sg.IpPermissions?.length || 0,
                egressRulesCount: sg.IpPermissionsEgress?.length || 0,
              },
            });
          }
        } catch (error: any) {
          logger.warn('Failed to list Security Groups', { region, error: error.message });
        }
      }
    }

    logger.info('AWS resources listed', { count: resources.length });
    return resources;
  }

  /**
   * Get AWS cost data using Cost Explorer
   */
  async getCosts(params: CostQueryParams): Promise<CostData[]> {
    const costs: CostData[] = [];
    const creds = await this.getCredentials();

    const ceClient = new CostExplorerClient({
      region: 'us-east-1', // Cost Explorer is only available in us-east-1
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      },
    });

    try {
      const granularity: Granularity = params.granularity === 'MONTHLY' ? 'MONTHLY' : 'DAILY';
      const groupBy = params.groupBy || ['SERVICE'];

      const response = await ceClient.send(new GetCostAndUsageCommand({
        TimePeriod: {
          Start: params.startDate,
          End: params.endDate,
        },
        Granularity: granularity,
        Metrics: ['UnblendedCost', 'UsageQuantity'],
        GroupBy: groupBy.map(g => ({
          Type: 'DIMENSION',
          Key: g.toUpperCase(),
        })),
      }));

      for (const result of response.ResultsByTime || []) {
        const date = result.TimePeriod?.Start || '';
        
        for (const group of result.Groups || []) {
          const service = group.Keys?.[0] || 'Unknown';
          const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
          
          costs.push({
            date,
            service,
            cost,
            currency: 'USD',
            provider: 'AWS',
            accountId: '', // Will be filled by caller
          });
        }
      }

      logger.info('AWS costs retrieved', { 
        count: costs.length,
        startDate: params.startDate,
        endDate: params.endDate,
      });
    } catch (error: any) {
      logger.error('Failed to get AWS costs', { error: error.message });
      throw new CloudProviderError(
        `Failed to retrieve AWS costs: ${error.message}`,
        'AWS',
        'COST_RETRIEVAL_ERROR',
        500
      );
    }

    return costs;
  }

  /**
   * Run security scan on AWS account
   * 
   * Note: This is a simplified implementation. The full security scan
   * uses the existing security-engine which should be called directly
   * for comprehensive scanning.
   */
  async runSecurityScan(config: ScanConfig): Promise<ScanResult> {
    const startTime = Date.now();
    const findings: SecurityFinding[] = [];
    
    try {
      const creds = await this.getCredentials();
      const regions = config.regions || ['us-east-1'];

      for (const region of regions) {
        const ec2Client = new EC2Client({
          region,
          credentials: {
            accessKeyId: creds.accessKeyId,
            secretAccessKey: creds.secretAccessKey,
            sessionToken: creds.sessionToken,
          },
        });

        // Check for overly permissive security groups
        try {
          const sgs = await ec2Client.send(new DescribeSecurityGroupsCommand({}));
          
          for (const sg of sgs.SecurityGroups || []) {
            for (const rule of sg.IpPermissions || []) {
              for (const ipRange of rule.IpRanges || []) {
                if (ipRange.CidrIp === '0.0.0.0/0') {
                  const isSSH = rule.FromPort === 22 && rule.ToPort === 22;
                  const isRDP = rule.FromPort === 3389 && rule.ToPort === 3389;
                  const isAllPorts = rule.FromPort === 0 && rule.ToPort === 65535;

                  if (isSSH || isRDP || isAllPorts) {
                    findings.push({
                      id: `${sg.GroupId}-${rule.FromPort}-${rule.ToPort}`,
                      provider: 'AWS',
                      severity: isAllPorts ? 'critical' : 'high',
                      title: isSSH ? 'SSH Open to Internet' : 
                             isRDP ? 'RDP Open to Internet' : 
                             'All Ports Open to Internet',
                      description: `Security group ${sg.GroupName} (${sg.GroupId}) allows inbound traffic from 0.0.0.0/0 on port(s) ${rule.FromPort}-${rule.ToPort}`,
                      resourceId: sg.GroupId || '',
                      resourceArn: `arn:aws:ec2:${region}::security-group/${sg.GroupId}`,
                      service: 'EC2',
                      category: 'Network Security',
                      compliance: [
                        {
                          framework: 'CIS',
                          controlId: '5.2',
                          controlTitle: 'Ensure no security groups allow ingress from 0.0.0.0/0 to port 22',
                          status: 'failed',
                        },
                      ],
                      remediation: {
                        description: 'Restrict inbound access to specific IP ranges',
                        steps: [
                          'Open the EC2 console',
                          `Navigate to Security Groups and select ${sg.GroupId}`,
                          'Edit inbound rules',
                          'Replace 0.0.0.0/0 with specific IP ranges',
                        ],
                        automatable: true,
                      },
                      detectedAt: new Date(),
                    });
                  }
                }
              }
            }
          }
        } catch (error: any) {
          logger.warn('Failed to scan security groups', { region, error: error.message });
        }

        // Check for unencrypted EBS volumes
        try {
          const volumes = await ec2Client.send(new DescribeVolumesCommand({}));
          
          for (const volume of volumes.Volumes || []) {
            if (!volume.Encrypted) {
              findings.push({
                id: volume.VolumeId || '',
                provider: 'AWS',
                severity: 'medium',
                title: 'Unencrypted EBS Volume',
                description: `EBS volume ${volume.VolumeId} is not encrypted`,
                resourceId: volume.VolumeId || '',
                resourceArn: `arn:aws:ec2:${region}::volume/${volume.VolumeId}`,
                service: 'EC2',
                category: 'Data Protection',
                compliance: [
                  {
                    framework: 'CIS',
                    controlId: '2.2.1',
                    controlTitle: 'Ensure EBS volume encryption is enabled',
                    status: 'failed',
                  },
                ],
                remediation: {
                  description: 'Enable encryption for EBS volumes',
                  steps: [
                    'Create a snapshot of the volume',
                    'Copy the snapshot with encryption enabled',
                    'Create a new volume from the encrypted snapshot',
                    'Replace the original volume with the encrypted one',
                  ],
                  automatable: false,
                  estimatedTime: '30 minutes',
                },
                detectedAt: new Date(),
              });
            }
          }
        } catch (error: any) {
          logger.warn('Failed to scan EBS volumes', { region, error: error.message });
        }
      }

      const summary: ScanSummary = {
        total: findings.length,
        critical: findings.filter(f => f.severity === 'critical').length,
        high: findings.filter(f => f.severity === 'high').length,
        medium: findings.filter(f => f.severity === 'medium').length,
        low: findings.filter(f => f.severity === 'low').length,
        info: findings.filter(f => f.severity === 'info').length,
        byService: findings.reduce((acc, f) => {
          acc[f.service] = (acc[f.service] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };

      logger.info('AWS security scan completed', { 
        findingsCount: findings.length,
        duration: Date.now() - startTime,
      });

      return {
        scanId: `aws-scan-${Date.now()}`,
        provider: 'AWS',
        status: 'completed',
        findings,
        summary,
        duration: Date.now() - startTime,
        startedAt: new Date(startTime),
        completedAt: new Date(),
      };
    } catch (error: any) {
      logger.error('AWS security scan failed', { error: error.message });
      
      return {
        scanId: `aws-scan-${Date.now()}`,
        provider: 'AWS',
        status: 'failed',
        findings: [],
        summary: {
          total: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          info: 0,
        },
        duration: Date.now() - startTime,
        startedAt: new Date(startTime),
        completedAt: new Date(),
        error: error.message,
      };
    }
  }

  /**
   * Get AWS activity logs
   * 
   * Note: This is a placeholder. Full CloudTrail integration should use
   * the existing cloudtrail handlers.
   */
  async getActivityLogs(params: ActivityQueryParams): Promise<ActivityEvent[]> {
    // This would integrate with CloudTrail
    // For now, return empty array as CloudTrail integration exists separately
    logger.info('AWS activity logs requested', { params });
    
    return [];
  }
}
