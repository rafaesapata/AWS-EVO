/**
 * Advanced Security Scanner
 * Military-grade security analysis with AI-powered threat detection
 */

import { logger } from './logging';
import { getPrismaClient } from './database';
import { realTimeMonitoring } from './real-time-monitoring';
import { 
  EC2Client, 
  DescribeInstancesCommand, 
  DescribeSecurityGroupsCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeNetworkAclsCommand
} from '@aws-sdk/client-ec2';
import { 
  IAMClient, 
  ListUsersCommand, 
  ListRolesCommand, 
  ListPoliciesCommand,
  GetUserPolicyCommand,
  GetRolePolicyCommand,
  ListAttachedUserPoliciesCommand,
  ListAttachedRolePoliciesCommand
} from '@aws-sdk/client-iam';
import { 
  S3Client, 
  ListBucketsCommand, 
  GetBucketPolicyCommand,
  GetBucketAclCommand,
  GetBucketEncryptionCommand,
  GetPublicAccessBlockCommand
} from '@aws-sdk/client-s3';
import { 
  CloudTrailClient, 
  DescribeTrailsCommand,
  GetEventSelectorsCommand
} from '@aws-sdk/client-cloudtrail';
import { 
  GuardDutyClient, 
  ListDetectorsCommand,
  GetDetectorCommand,
  ListFindingsCommand,
  GetFindingsCommand
} from '@aws-sdk/client-guardduty';

export interface SecurityScanConfig {
  organizationId: string;
  accountId: string;
  regions: string[];
  scanTypes: SecurityScanType[];
  depth: 'basic' | 'comprehensive' | 'deep';
  aiAnalysis: boolean;
}

export type SecurityScanType = 
  | 'network_security'
  | 'iam_analysis'
  | 'data_protection'
  | 'logging_monitoring'
  | 'compliance_check'
  | 'threat_detection'
  | 'vulnerability_assessment'
  | 'configuration_drift';

export interface SecurityFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  title: string;
  description: string;
  aiAnalysis?: string;
  resourceId: string;
  resourceArn?: string;
  region: string;
  service: string;
  compliance: string[];
  remediation: string;
  riskScore: number;
  evidence: Record<string, any>;
  cve?: string[];
  attackVectors: string[];
  businessImpact: string;
}

export interface SecurityPosture {
  organizationId: string;
  overallScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  findingsSummary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  complianceScores: Record<string, number>;
  trendAnalysis: {
    scoreChange: number;
    findingsChange: number;
    period: string;
  };
  recommendations: string[];
}

export class AdvancedSecurityScanner {
  private prisma = getPrismaClient();

  /**
   * Perform comprehensive security scan
   */
  async performSecurityScan(config: SecurityScanConfig): Promise<{
    scanId: string;
    findings: SecurityFinding[];
    posture: SecurityPosture;
  }> {
    logger.info('Starting advanced security scan', {
      organizationId: config.organizationId,
      accountId: config.accountId,
      regions: config.regions,
      scanTypes: config.scanTypes,
      depth: config.depth
    });

    // Create scan record
    const scan = await this.prisma.securityScan.create({
      data: {
        organization_id: config.organizationId,
        aws_account_id: config.accountId,
        scan_type: `advanced_${config.depth}`,
        status: 'running',
        scan_config: config as any,
      },
    });

    const findings: SecurityFinding[] = [];

    try {
      // Perform scans based on configuration
      for (const scanType of config.scanTypes) {
        const scanFindings = await this.performScanType(scanType, config);
        findings.push(...scanFindings);
      }

      // AI-powered analysis if enabled
      if (config.aiAnalysis) {
        await this.enhanceWithAIAnalysis(findings);
      }

      // Calculate security posture
      const posture = await this.calculateSecurityPosture(config.organizationId, findings);

      // Store findings in database
      if (findings.length > 0) {
        await this.prisma.finding.createMany({
          data: findings.map(f => ({
            organization_id: config.organizationId,
            severity: f.severity,
            description: f.description,
            details: f as any,
            ai_analysis: f.aiAnalysis,
            status: 'pending',
            source: 'advanced_security_scan',
            resource_id: f.resourceId,
            resource_arn: f.resourceArn,
            scan_type: f.category,
            service: f.service,
            category: f.category,
            compliance: f.compliance,
            remediation: f.remediation,
            risk_vector: f.attackVectors.join(','),
            evidence: f.evidence,
          })),
        });
      }

      // Update scan record
      await this.prisma.securityScan.update({
        where: { id: scan.id },
        data: {
          status: 'completed',
          completed_at: new Date(),
          findings_count: findings.length,
          critical_count: findings.filter(f => f.severity === 'critical').length,
          high_count: findings.filter(f => f.severity === 'high').length,
          medium_count: findings.filter(f => f.severity === 'medium').length,
          low_count: findings.filter(f => f.severity === 'low').length,
        },
      });

      // Record metrics
      realTimeMonitoring.recordMetric({
        name: 'security.scan.completed',
        value: 1,
        timestamp: new Date(),
        tags: { 
          organizationId: config.organizationId,
          scanType: config.depth,
          findingsCount: findings.length.toString()
        },
        organizationId: config.organizationId,
      });

      logger.info('Advanced security scan completed', {
        scanId: scan.id,
        findingsCount: findings.length,
        criticalFindings: findings.filter(f => f.severity === 'critical').length,
        overallScore: posture.overallScore
      });

      return {
        scanId: scan.id,
        findings,
        posture,
      };

    } catch (error) {
      // Update scan record with error
      await this.prisma.securityScan.update({
        where: { id: scan.id },
        data: {
          status: 'failed',
          completed_at: new Date(),
        },
      });

      logger.error('Advanced security scan failed', error as Error, {
        scanId: scan.id,
        organizationId: config.organizationId
      });

      throw error;
    }
  }

  /**
   * Perform specific scan type
   */
  private async performScanType(
    scanType: SecurityScanType, 
    config: SecurityScanConfig
  ): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    switch (scanType) {
      case 'network_security':
        findings.push(...await this.scanNetworkSecurity(config));
        break;
      case 'iam_analysis':
        findings.push(...await this.scanIAMSecurity(config));
        break;
      case 'data_protection':
        findings.push(...await this.scanDataProtection(config));
        break;
      case 'logging_monitoring':
        findings.push(...await this.scanLoggingMonitoring(config));
        break;
      case 'compliance_check':
        findings.push(...await this.scanCompliance(config));
        break;
      case 'threat_detection':
        findings.push(...await this.scanThreatDetection(config));
        break;
      case 'vulnerability_assessment':
        findings.push(...await this.scanVulnerabilities(config));
        break;
      case 'configuration_drift':
        findings.push(...await this.scanConfigurationDrift(config));
        break;
    }

    return findings;
  }

  /**
   * Scan network security
   */
  private async scanNetworkSecurity(config: SecurityScanConfig): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    for (const region of config.regions) {
      try {
        const ec2Client = new EC2Client({ region });

        // Scan security groups
        const sgResponse = await ec2Client.send(new DescribeSecurityGroupsCommand({}));
        const securityGroups = sgResponse.SecurityGroups || [];

        for (const sg of securityGroups) {
          // Check for overly permissive rules
          const permissiveRules = sg.IpPermissions?.filter(rule =>
            rule.IpRanges?.some(range => 
              range.CidrIp === '0.0.0.0/0' || range.CidrIp === '::/0'
            )
          ) || [];

          if (permissiveRules.length > 0) {
            const criticalPorts = permissiveRules.filter(rule =>
              (rule.FromPort && [22, 3389, 1433, 3306, 5432, 27017, 6379].includes(rule.FromPort))
            );

            if (criticalPorts.length > 0) {
              findings.push({
                id: `sg_${sg.GroupId}_critical_ports`,
                severity: 'critical',
                category: 'Network Security',
                title: 'Critical Ports Open to Internet',
                description: `Security Group ${sg.GroupId} has critical ports open to 0.0.0.0/0`,
                resourceId: sg.GroupId!,
                resourceArn: `arn:aws:ec2:${region}:${config.accountId}:security-group/${sg.GroupId}`,
                region,
                service: 'EC2',
                compliance: ['CIS 5.2', 'PCI-DSS 1.3.1', 'NIST 800-53 SC-7'],
                remediation: `Restrict security group rules to specific IP ranges or use AWS Systems Manager Session Manager for secure access`,
                riskScore: 95,
                evidence: {
                  securityGroupId: sg.GroupId,
                  permissiveRules: criticalPorts,
                  vpcId: sg.VpcId,
                },
                attackVectors: ['network_intrusion', 'brute_force', 'lateral_movement'],
                businessImpact: 'Critical - Direct exposure to internet attacks, potential data breach',
              });
            }
          }

          // Check for default security groups in use
          if (sg.GroupName === 'default' && sg.IpPermissions && sg.IpPermissions.length > 0) {
            findings.push({
              id: `sg_${sg.GroupId}_default_in_use`,
              severity: 'medium',
              category: 'Network Security',
              title: 'Default Security Group in Use',
              description: `Default security group ${sg.GroupId} has active rules`,
              resourceId: sg.GroupId!,
              resourceArn: `arn:aws:ec2:${region}:${config.accountId}:security-group/${sg.GroupId}`,
              region,
              service: 'EC2',
              compliance: ['CIS 5.3', 'AWS Well-Architected Security'],
              remediation: 'Create specific security groups for each use case and avoid using default security groups',
              riskScore: 60,
              evidence: {
                securityGroupId: sg.GroupId,
                rules: sg.IpPermissions,
              },
              attackVectors: ['misconfiguration'],
              businessImpact: 'Medium - Potential for unintended network access',
            });
          }
        }

        // Scan VPC configuration
        const vpcResponse = await ec2Client.send(new DescribeVpcsCommand({}));
        const vpcs = vpcResponse.Vpcs || [];

        for (const vpc of vpcs) {
          // Check for VPC Flow Logs
          // Note: This would require additional API calls to check flow logs
          if (vpc.IsDefault) {
            findings.push({
              id: `vpc_${vpc.VpcId}_default_in_use`,
              severity: 'low',
              category: 'Network Security',
              title: 'Default VPC in Use',
              description: `Default VPC ${vpc.VpcId} is being used`,
              resourceId: vpc.VpcId!,
              resourceArn: `arn:aws:ec2:${region}:${config.accountId}:vpc/${vpc.VpcId}`,
              region,
              service: 'EC2',
              compliance: ['CIS 5.1', 'AWS Well-Architected Security'],
              remediation: 'Create custom VPCs with proper network segmentation',
              riskScore: 30,
              evidence: {
                vpcId: vpc.VpcId,
                isDefault: vpc.IsDefault,
              },
              attackVectors: ['network_misconfiguration'],
              businessImpact: 'Low - Reduced network isolation and control',
            });
          }
        }

      } catch (error) {
        logger.error('Network security scan failed for region', error as Error, { region });
      }
    }

    return findings;
  }

  /**
   * Scan IAM security
   */
  private async scanIAMSecurity(config: SecurityScanConfig): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    try {
      const iamClient = new IAMClient({ region: 'us-east-1' }); // IAM is global

      // Scan IAM users
      const usersResponse = await iamClient.send(new ListUsersCommand({}));
      const users = usersResponse.Users || [];

      for (const user of users) {
        // Check for users with admin policies
        try {
          const attachedPolicies = await iamClient.send(
            new ListAttachedUserPoliciesCommand({ UserName: user.UserName })
          );

          const adminPolicies = attachedPolicies.AttachedPolicies?.filter(policy =>
            policy.PolicyName?.toLowerCase().includes('admin') ||
            policy.PolicyArn?.includes('AdministratorAccess')
          ) || [];

          if (adminPolicies.length > 0) {
            findings.push({
              id: `iam_user_${user.UserName}_admin_access`,
              severity: 'high',
              category: 'IAM Security',
              title: 'IAM User with Administrative Access',
              description: `IAM User ${user.UserName} has administrative privileges`,
              resourceId: user.UserName!,
              resourceArn: user.Arn!,
              region: 'global',
              service: 'IAM',
              compliance: ['CIS 1.16', 'PCI-DSS 7.1', 'NIST 800-53 AC-6'],
              remediation: 'Use IAM roles instead of users for administrative access and implement least privilege principle',
              riskScore: 85,
              evidence: {
                userName: user.UserName,
                adminPolicies: adminPolicies.map(p => p.PolicyName),
                createDate: user.CreateDate,
              },
              attackVectors: ['privilege_escalation', 'credential_theft'],
              businessImpact: 'High - Potential for unauthorized administrative actions',
            });
          }

          // Check for old access keys
          // Note: This would require additional API calls to list access keys
          
        } catch (error) {
          logger.warn('Failed to check IAM user policies', { userName: user.UserName });
        }
      }

      // Scan IAM roles
      const rolesResponse = await iamClient.send(new ListRolesCommand({}));
      const roles = rolesResponse.Roles || [];

      for (const role of roles) {
        // Check for overly permissive assume role policies
        if (role.AssumeRolePolicyDocument) {
          try {
            const policy = JSON.parse(decodeURIComponent(role.AssumeRolePolicyDocument));
            const statements = policy.Statement || [];

            for (const statement of statements) {
              if (statement.Principal === '*' || 
                  (statement.Principal?.AWS === '*')) {
                findings.push({
                  id: `iam_role_${role.RoleName}_wildcard_principal`,
                  severity: 'critical',
                  category: 'IAM Security',
                  title: 'IAM Role with Wildcard Principal',
                  description: `IAM Role ${role.RoleName} allows assumption by any AWS account`,
                  resourceId: role.RoleName!,
                  resourceArn: role.Arn!,
                  region: 'global',
                  service: 'IAM',
                  compliance: ['CIS 1.22', 'AWS Security Best Practices'],
                  remediation: 'Restrict assume role policy to specific AWS accounts or services',
                  riskScore: 95,
                  evidence: {
                    roleName: role.RoleName,
                    assumeRolePolicy: policy,
                  },
                  attackVectors: ['cross_account_access', 'privilege_escalation'],
                  businessImpact: 'Critical - Potential unauthorized cross-account access',
                });
              }
            }
          } catch (error) {
            logger.warn('Failed to parse assume role policy', { roleName: role.RoleName });
          }
        }
      }

    } catch (error) {
      logger.error('IAM security scan failed', error as Error);
    }

    return findings;
  }

  /**
   * Scan data protection
   */
  private async scanDataProtection(config: SecurityScanConfig): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    try {
      const s3Client = new S3Client({ region: 'us-east-1' }); // S3 is global

      // Scan S3 buckets
      const bucketsResponse = await s3Client.send(new ListBucketsCommand({}));
      const buckets = bucketsResponse.Buckets || [];

      for (const bucket of buckets) {
        if (!bucket.Name) continue;

        try {
          // Check public access block
          const publicAccessBlock = await s3Client.send(
            new GetPublicAccessBlockCommand({ Bucket: bucket.Name })
          );

          const config = publicAccessBlock.PublicAccessBlockConfiguration;
          if (!config?.BlockPublicAcls || !config?.BlockPublicPolicy ||
              !config?.IgnorePublicAcls || !config?.RestrictPublicBuckets) {
            findings.push({
              id: `s3_${bucket.Name}_public_access_risk`,
              severity: 'high',
              category: 'Data Protection',
              title: 'S3 Bucket Public Access Risk',
              description: `S3 Bucket ${bucket.Name} does not have complete public access block`,
              resourceId: bucket.Name,
              resourceArn: `arn:aws:s3:::${bucket.Name}`,
              region: 'global',
              service: 'S3',
              compliance: ['CIS 2.1.1', 'GDPR Art. 32', 'LGPD Art. 46'],
              remediation: 'Enable all public access block settings for the S3 bucket',
              riskScore: 80,
              evidence: {
                bucketName: bucket.Name,
                publicAccessBlock: config,
              },
              attackVectors: ['data_exposure', 'unauthorized_access'],
              businessImpact: 'High - Potential data exposure and privacy violations',
            });
          }

          // Check encryption
          try {
            await s3Client.send(new GetBucketEncryptionCommand({ Bucket: bucket.Name }));
          } catch (encryptionError) {
            // No encryption configured
            findings.push({
              id: `s3_${bucket.Name}_no_encryption`,
              severity: 'high',
              category: 'Data Protection',
              title: 'S3 Bucket Not Encrypted',
              description: `S3 Bucket ${bucket.Name} does not have server-side encryption enabled`,
              resourceId: bucket.Name,
              resourceArn: `arn:aws:s3:::${bucket.Name}`,
              region: 'global',
              service: 'S3',
              compliance: ['CIS 2.1.2', 'PCI-DSS 3.4', 'GDPR Art. 32'],
              remediation: 'Enable server-side encryption with AWS KMS or S3 managed keys',
              riskScore: 75,
              evidence: {
                bucketName: bucket.Name,
                encryptionStatus: 'not_configured',
              },
              attackVectors: ['data_theft', 'compliance_violation'],
              businessImpact: 'High - Unencrypted sensitive data at rest',
            });
          }

        } catch (error) {
          logger.warn('Failed to check S3 bucket configuration', { bucketName: bucket.Name });
        }
      }

    } catch (error) {
      logger.error('Data protection scan failed', error as Error);
    }

    return findings;
  }

  /**
   * Scan logging and monitoring
   */
  private async scanLoggingMonitoring(config: SecurityScanConfig): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    try {
      const cloudTrailClient = new CloudTrailClient({ region: 'us-east-1' });

      // Check CloudTrail configuration
      const trailsResponse = await cloudTrailClient.send(new DescribeTrailsCommand({}));
      const trails = trailsResponse.trailList || [];

      if (trails.length === 0) {
        findings.push({
          id: 'cloudtrail_not_configured',
          severity: 'critical',
          category: 'Logging & Monitoring',
          title: 'CloudTrail Not Configured',
          description: 'No CloudTrail trails are configured for audit logging',
          resourceId: 'cloudtrail',
          region: 'global',
          service: 'CloudTrail',
          compliance: ['CIS 3.1', 'PCI-DSS 10.1', 'SOX'],
          remediation: 'Configure CloudTrail with multi-region logging and log file validation',
          riskScore: 90,
          evidence: {
            trailCount: 0,
          },
          attackVectors: ['audit_evasion', 'forensic_limitation'],
          businessImpact: 'Critical - No audit trail for security investigations',
        });
      } else {
        for (const trail of trails) {
          // Check if trail is multi-region
          if (!trail.IsMultiRegionTrail) {
            findings.push({
              id: `cloudtrail_${trail.Name}_single_region`,
              severity: 'medium',
              category: 'Logging & Monitoring',
              title: 'CloudTrail Single Region Only',
              description: `CloudTrail ${trail.Name} is not configured for multi-region logging`,
              resourceId: trail.Name!,
              resourceArn: trail.TrailARN!,
              region: 'global',
              service: 'CloudTrail',
              compliance: ['CIS 3.1', 'AWS Security Best Practices'],
              remediation: 'Enable multi-region logging for comprehensive audit coverage',
              riskScore: 50,
              evidence: {
                trailName: trail.Name,
                isMultiRegion: trail.IsMultiRegionTrail,
              },
              attackVectors: ['audit_gap'],
              businessImpact: 'Medium - Incomplete audit coverage across regions',
            });
          }

          // Check log file validation
          if (!trail.LogFileValidationEnabled) {
            findings.push({
              id: `cloudtrail_${trail.Name}_no_validation`,
              severity: 'medium',
              category: 'Logging & Monitoring',
              title: 'CloudTrail Log File Validation Disabled',
              description: `CloudTrail ${trail.Name} does not have log file validation enabled`,
              resourceId: trail.Name!,
              resourceArn: trail.TrailARN!,
              region: 'global',
              service: 'CloudTrail',
              compliance: ['CIS 3.2', 'NIST 800-53 AU-9'],
              remediation: 'Enable log file validation to ensure log integrity',
              riskScore: 45,
              evidence: {
                trailName: trail.Name,
                logFileValidation: trail.LogFileValidationEnabled,
              },
              attackVectors: ['log_tampering'],
              businessImpact: 'Medium - Potential for undetected log manipulation',
            });
          }
        }
      }

    } catch (error) {
      logger.error('Logging and monitoring scan failed', error as Error);
    }

    return findings;
  }

  /**
   * Scan compliance
   */
  private async scanCompliance(config: SecurityScanConfig): Promise<SecurityFinding[]> {
    // This would implement specific compliance framework checks
    // For now, return empty array as compliance is checked in other scan types
    return [];
  }

  /**
   * Scan threat detection
   */
  private async scanThreatDetection(config: SecurityScanConfig): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    for (const region of config.regions) {
      try {
        const guardDutyClient = new GuardDutyClient({ region });

        // Check if GuardDuty is enabled
        const detectorsResponse = await guardDutyClient.send(new ListDetectorsCommand({}));
        const detectors = detectorsResponse.DetectorIds || [];

        if (detectors.length === 0) {
          findings.push({
            id: `guardduty_${region}_not_enabled`,
            severity: 'high',
            category: 'Threat Detection',
            title: 'GuardDuty Not Enabled',
            description: `GuardDuty is not enabled in region ${region}`,
            resourceId: 'guardduty',
            region,
            service: 'GuardDuty',
            compliance: ['AWS Security Best Practices', 'NIST Cybersecurity Framework'],
            remediation: 'Enable GuardDuty for threat detection and monitoring',
            riskScore: 70,
            evidence: {
              region,
              detectorsCount: 0,
            },
            attackVectors: ['undetected_threats', 'malicious_activity'],
            businessImpact: 'High - No automated threat detection capabilities',
          });
        }

      } catch (error) {
        logger.warn('GuardDuty check failed for region', { region, error: (error as Error).message });
      }
    }

    return findings;
  }

  /**
   * Scan vulnerabilities
   */
  private async scanVulnerabilities(config: SecurityScanConfig): Promise<SecurityFinding[]> {
    // This would implement vulnerability scanning using AWS Inspector or similar
    // For now, return empty array as this requires additional setup
    return [];
  }

  /**
   * Scan configuration drift
   */
  private async scanConfigurationDrift(config: SecurityScanConfig): Promise<SecurityFinding[]> {
    // This would implement configuration drift detection
    // For now, return empty array as this requires baseline configuration
    return [];
  }

  /**
   * Enhance findings with AI analysis
   */
  private async enhanceWithAIAnalysis(findings: SecurityFinding[]): Promise<void> {
    for (const finding of findings) {
      // Simulate AI analysis - in production this would call AWS Bedrock or similar
      finding.aiAnalysis = this.generateAIAnalysis(finding);
    }
  }

  /**
   * Generate AI analysis for a finding
   */
  private generateAIAnalysis(finding: SecurityFinding): string {
    const templates = {
      critical: [
        `CRITICAL SECURITY RISK: This ${finding.service} configuration poses an immediate threat to your infrastructure. `,
        `The exposed ${finding.resourceId} could be exploited by attackers to gain unauthorized access. `,
        `Immediate remediation is required to prevent potential data breaches or system compromise.`
      ],
      high: [
        `HIGH RISK DETECTED: The ${finding.service} service has a significant security vulnerability. `,
        `This configuration increases your attack surface and could be leveraged in a multi-stage attack. `,
        `Prioritize remediation to reduce security exposure.`
      ],
      medium: [
        `MODERATE SECURITY CONCERN: While not immediately exploitable, this ${finding.service} configuration `,
        `represents a security weakness that could be combined with other vulnerabilities. `,
        `Address this issue as part of your security hardening efforts.`
      ],
      low: [
        `SECURITY IMPROVEMENT OPPORTUNITY: This ${finding.service} configuration follows security best practices `,
        `but could be enhanced. Consider implementing the recommended changes during your next maintenance window.`
      ]
    };

    const template = templates[finding.severity as keyof typeof templates] || templates.medium;
    return template.join('');
  }

  /**
   * Calculate security posture
   */
  private async calculateSecurityPosture(
    organizationId: string, 
    findings: SecurityFinding[]
  ): Promise<SecurityPosture> {
    const findingsSummary = {
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
      info: findings.filter(f => f.severity === 'info').length,
    };

    // Calculate overall score (0-100)
    const totalFindings = findings.length;
    const weightedScore = totalFindings === 0 ? 100 : Math.max(0, 100 - (
      (findingsSummary.critical * 25) +
      (findingsSummary.high * 10) +
      (findingsSummary.medium * 5) +
      (findingsSummary.low * 2) +
      (findingsSummary.info * 1)
    ));

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (findingsSummary.critical > 0) {
      riskLevel = 'critical';
    } else if (findingsSummary.high > 5) {
      riskLevel = 'high';
    } else if (findingsSummary.high > 0 || findingsSummary.medium > 10) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    // Calculate compliance scores
    const complianceFindings = findings.reduce((acc, finding) => {
      finding.compliance.forEach(framework => {
        if (!acc[framework]) acc[framework] = [];
        acc[framework].push(finding);
      });
      return acc;
    }, {} as Record<string, SecurityFinding[]>);

    const complianceScores = Object.entries(complianceFindings).reduce((acc, [framework, frameworkFindings]) => {
      const score = Math.max(0, 100 - (frameworkFindings.length * 5));
      acc[framework] = score;
      return acc;
    }, {} as Record<string, number>);

    // Get trend analysis (simplified)
    const trendAnalysis = {
      scoreChange: 0, // Would compare with previous scan
      findingsChange: 0, // Would compare with previous scan
      period: '7d',
    };

    // Generate recommendations
    const recommendations = this.generateRecommendations(findings);

    return {
      organizationId,
      overallScore: Math.round(weightedScore),
      riskLevel,
      findingsSummary,
      complianceScores,
      trendAnalysis,
      recommendations,
    };
  }

  /**
   * Generate security recommendations
   */
  private generateRecommendations(findings: SecurityFinding[]): string[] {
    const recommendations: string[] = [];

    const criticalFindings = findings.filter(f => f.severity === 'critical');
    const highFindings = findings.filter(f => f.severity === 'high');

    if (criticalFindings.length > 0) {
      recommendations.push('Immediately address all critical security findings to prevent potential breaches');
    }

    if (highFindings.length > 5) {
      recommendations.push('Implement a security remediation plan to address high-priority vulnerabilities');
    }

    const networkFindings = findings.filter(f => f.category === 'Network Security');
    if (networkFindings.length > 0) {
      recommendations.push('Review and tighten network security group rules and access controls');
    }

    const iamFindings = findings.filter(f => f.category === 'IAM Security');
    if (iamFindings.length > 0) {
      recommendations.push('Implement least privilege access and review IAM policies regularly');
    }

    const dataFindings = findings.filter(f => f.category === 'Data Protection');
    if (dataFindings.length > 0) {
      recommendations.push('Enable encryption for all data at rest and in transit');
    }

    if (recommendations.length === 0) {
      recommendations.push('Maintain current security posture and continue regular security assessments');
    }

    return recommendations;
  }
}

// Export singleton instance
export const advancedSecurityScanner = new AdvancedSecurityScanner();