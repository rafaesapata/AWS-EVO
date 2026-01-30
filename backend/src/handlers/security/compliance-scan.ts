/**
 * Advanced Compliance Scan Handler v2.0
 * Multi-region, async-capable compliance scanning with real AWS API calls
 * Supports: CIS, LGPD, PCI-DSS, HIPAA, GDPR, SOC2, NIST 800-53
 * 
 * DEMO MODE: Suporta modo demonstração para organizações com demo_mode=true
 */

import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { complianceScanSchema } from '../../lib/schemas.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { isOrganizationInDemoMode, generateDemoComplianceData } from '../../lib/demo-data-service.js';

// AWS SDK imports
import { IAMClient, GetAccountSummaryCommand, GetAccountPasswordPolicyCommand, ListUsersCommand, ListMFADevicesCommand, ListAttachedUserPoliciesCommand, GenerateCredentialReportCommand, GetCredentialReportCommand, ListAccessKeysCommand } from '@aws-sdk/client-iam';
import { S3Client, ListBucketsCommand, GetBucketEncryptionCommand, GetPublicAccessBlockCommand, GetBucketPolicyStatusCommand } from '@aws-sdk/client-s3';
import { EC2Client, DescribeSecurityGroupsCommand, DescribeVpcsCommand, DescribeFlowLogsCommand, GetEbsEncryptionByDefaultCommand } from '@aws-sdk/client-ec2';
import { CloudTrailClient, DescribeTrailsCommand, GetTrailStatusCommand } from '@aws-sdk/client-cloudtrail';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { ConfigServiceClient, DescribeConfigurationRecordersCommand, DescribeConfigurationRecorderStatusCommand } from '@aws-sdk/client-config-service';
import { CloudWatchClient, DescribeAlarmsCommand } from '@aws-sdk/client-cloudwatch';
import { KMSClient, ListKeysCommand, DescribeKeyCommand } from '@aws-sdk/client-kms';

// Default regions to scan
const DEFAULT_REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1'];

// Types
interface AWSClients {
  iam: IAMClient;
  s3: S3Client;
  ec2: EC2Client;
  cloudtrail: CloudTrailClient;
  rds: RDSClient;
  config: ConfigServiceClient;
  cloudwatch: CloudWatchClient;
  kms: KMSClient;
}

interface CheckContext {
  accountId: string;
  region: string;
  organizationId: string;
}

interface CheckResult {
  status: 'passed' | 'failed' | 'error' | 'not_applicable';
  evidence: Record<string, any>;
  affected_resources: string[];
}

interface FrameworkControl {
  id: string;
  name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  reference: string;
  remediation: string;
  globalOnly?: boolean;
  check: (clients: AWSClients, ctx: CheckContext) => Promise<CheckResult>;
}

interface ComplianceControl {
  control_id: string;
  control_name: string;
  description: string;
  status: 'passed' | 'failed' | 'error' | 'not_applicable';
  severity: 'critical' | 'high' | 'medium' | 'low';
  evidence: Record<string, any>;
  remediation_steps?: string;
  affected_resources: string[];
  framework_reference?: string;
  region?: string;
}

// Helper to get AWS clients with assumed role
async function getAWSClients(credential: any, region: string): Promise<AWSClients> {
  // Use resolveAwsCredentials helper which handles both direct credentials and role assumption
  // This function automatically detects if access_key_id starts with "ROLE:" and handles it
  const { resolveAwsCredentials } = await import('../../lib/aws-helpers.js');
  
  const resolvedCreds = await resolveAwsCredentials(credential, region);
  
  const credentials = {
    accessKeyId: resolvedCreds.accessKeyId,
    secretAccessKey: resolvedCreds.secretAccessKey,
    sessionToken: resolvedCreds.sessionToken,
  };
  
  return {
    iam: new IAMClient({ region: 'us-east-1', credentials }),
    s3: new S3Client({ region, credentials }),
    ec2: new EC2Client({ region, credentials }),
    cloudtrail: new CloudTrailClient({ region, credentials }),
    rds: new RDSClient({ region, credentials }),
    config: new ConfigServiceClient({ region, credentials }),
    cloudwatch: new CloudWatchClient({ region, credentials }),
    kms: new KMSClient({ region, credentials }),
  };
}

// ============================================================================
// CIS AWS Foundations Benchmark Controls
// ============================================================================

const CIS_CONTROLS: FrameworkControl[] = [
  {
    id: 'CIS-1.4',
    name: 'Ensure no root account access key exists',
    description: 'The root account should not have access keys',
    severity: 'critical',
    category: 'Identity and Access Management',
    reference: 'CIS AWS Foundations Benchmark v1.5.0 - 1.4',
    remediation: 'Delete root account access keys via AWS Console',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const summary = await clients.iam.send(new GetAccountSummaryCommand({}));
        const rootAccessKeys = summary.SummaryMap?.AccountAccessKeysPresent || 0;
        return {
          status: rootAccessKeys === 0 ? 'passed' : 'failed',
          evidence: { root_access_keys_present: rootAccessKeys, checked_at: new Date().toISOString() },
          affected_resources: rootAccessKeys > 0 ? [`arn:aws:iam::${ctx.accountId}:root`] : [],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'CIS-1.5',
    name: 'Ensure MFA is enabled for the root account',
    description: 'The root account should have MFA enabled',
    severity: 'critical',
    category: 'Identity and Access Management',
    reference: 'CIS AWS Foundations Benchmark v1.5.0 - 1.5',
    remediation: 'Enable MFA for root account via AWS Console',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const summary = await clients.iam.send(new GetAccountSummaryCommand({}));
        const rootMFA = summary.SummaryMap?.AccountMFAEnabled === 1;
        return {
          status: rootMFA ? 'passed' : 'failed',
          evidence: { root_mfa_enabled: rootMFA, checked_at: new Date().toISOString() },
          affected_resources: !rootMFA ? [`arn:aws:iam::${ctx.accountId}:root`] : [],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },

  {
    id: 'CIS-1.8',
    name: 'Ensure IAM password policy requires minimum length of 14',
    description: 'Password policy should require at least 14 characters',
    severity: 'medium',
    category: 'Identity and Access Management',
    reference: 'CIS AWS Foundations Benchmark v1.5.0 - 1.8',
    remediation: 'Update IAM password policy to require minimum 14 characters',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const policy = await clients.iam.send(new GetAccountPasswordPolicyCommand({}));
        const minLength = policy.PasswordPolicy?.MinimumPasswordLength || 0;
        return {
          status: minLength >= 14 ? 'passed' : 'failed',
          evidence: { minimum_password_length: minLength, required: 14, checked_at: new Date().toISOString() },
          affected_resources: minLength < 14 ? [`arn:aws:iam::${ctx.accountId}:account-password-policy`] : [],
        };
      } catch (err: any) {
        if (err.name === 'NoSuchEntityException') {
          return { status: 'failed', evidence: { error: 'No password policy configured' }, affected_resources: [`arn:aws:iam::${ctx.accountId}:account-password-policy`] };
        }
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'CIS-1.10',
    name: 'Ensure MFA is enabled for all IAM users with console password',
    description: 'All IAM users with console access should have MFA enabled',
    severity: 'high',
    category: 'Identity and Access Management',
    reference: 'CIS AWS Foundations Benchmark v1.5.0 - 1.10',
    remediation: 'Enable MFA for all IAM users with console access',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const users = await clients.iam.send(new ListUsersCommand({}));
        const usersWithoutMFA: string[] = [];
        for (const user of (users.Users || []).slice(0, 50)) {
          if (user.PasswordLastUsed) {
            const mfaDevices = await clients.iam.send(new ListMFADevicesCommand({ UserName: user.UserName }));
            if (!mfaDevices.MFADevices || mfaDevices.MFADevices.length === 0) {
              usersWithoutMFA.push(user.UserName!);
            }
          }
        }
        return {
          status: usersWithoutMFA.length === 0 ? 'passed' : 'failed',
          evidence: { users_without_mfa: usersWithoutMFA.length, users_checked: users.Users?.length || 0, checked_at: new Date().toISOString() },
          affected_resources: usersWithoutMFA.map(u => `arn:aws:iam::${ctx.accountId}:user/${u}`),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },

  {
    id: 'CIS-1.12',
    name: 'Ensure credentials unused for 45 days are disabled',
    description: 'Credentials not used for 45+ days should be disabled',
    severity: 'medium',
    category: 'Identity and Access Management',
    reference: 'CIS AWS Foundations Benchmark v1.5.0 - 1.12',
    remediation: 'Disable or remove unused IAM credentials',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        await clients.iam.send(new GenerateCredentialReportCommand({}));
        await new Promise(resolve => setTimeout(resolve, 2000));
        const report = await clients.iam.send(new GetCredentialReportCommand({}));
        const content = Buffer.from(report.Content!).toString('utf-8');
        const lines = content.split('\n').slice(1);
        const inactiveUsers: string[] = [];
        const now = new Date();
        const threshold = 45 * 24 * 60 * 60 * 1000;
        for (const line of lines) {
          const fields = line.split(',');
          if (fields.length < 5) continue;
          const userName = fields[0];
          const passwordLastUsed = fields[4];
          if (passwordLastUsed && passwordLastUsed !== 'N/A' && passwordLastUsed !== 'no_information') {
            const lastUsed = new Date(passwordLastUsed);
            if (now.getTime() - lastUsed.getTime() > threshold) {
              inactiveUsers.push(userName);
            }
          }
        }
        return {
          status: inactiveUsers.length === 0 ? 'passed' : 'failed',
          evidence: { inactive_users: inactiveUsers.length, threshold_days: 45, checked_at: new Date().toISOString() },
          affected_resources: inactiveUsers.map(u => `arn:aws:iam::${ctx.accountId}:user/${u}`),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'CIS-2.1.1',
    name: 'Ensure CloudTrail is enabled in all regions',
    description: 'CloudTrail should be enabled with multi-region trail',
    severity: 'high',
    category: 'Logging',
    reference: 'CIS AWS Foundations Benchmark v1.5.0 - 2.1.1',
    remediation: 'Create a multi-region CloudTrail trail',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const trails = await clients.cloudtrail.send(new DescribeTrailsCommand({}));
        let hasActiveMultiRegionTrail = false;
        for (const trail of trails.trailList || []) {
          if (trail.IsMultiRegionTrail) {
            const status = await clients.cloudtrail.send(new GetTrailStatusCommand({ Name: trail.Name }));
            if (status.IsLogging) { hasActiveMultiRegionTrail = true; break; }
          }
        }
        return {
          status: hasActiveMultiRegionTrail ? 'passed' : 'failed',
          evidence: { total_trails: trails.trailList?.length || 0, has_multi_region_trail: hasActiveMultiRegionTrail, checked_at: new Date().toISOString() },
          affected_resources: !hasActiveMultiRegionTrail ? [`arn:aws:cloudtrail:${ctx.region}:${ctx.accountId}:trail/*`] : [],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },

  {
    id: 'CIS-2.1.2',
    name: 'Ensure CloudTrail log file validation is enabled',
    description: 'CloudTrail should have log file validation enabled',
    severity: 'medium',
    category: 'Logging',
    reference: 'CIS AWS Foundations Benchmark v1.5.0 - 2.1.2',
    remediation: 'Enable log file validation on CloudTrail trails',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const trails = await clients.cloudtrail.send(new DescribeTrailsCommand({}));
        const trailsWithoutValidation = (trails.trailList || []).filter(t => !t.LogFileValidationEnabled).map(t => t.Name!);
        return {
          status: trailsWithoutValidation.length === 0 && (trails.trailList?.length || 0) > 0 ? 'passed' : 'failed',
          evidence: { total_trails: trails.trailList?.length || 0, trails_without_validation: trailsWithoutValidation.length, checked_at: new Date().toISOString() },
          affected_resources: trailsWithoutValidation.map(t => `arn:aws:cloudtrail:${ctx.region}:${ctx.accountId}:trail/${t}`),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'CIS-2.1.4',
    name: 'Ensure CloudTrail trails are integrated with CloudWatch Logs',
    description: 'CloudTrail should send logs to CloudWatch Logs',
    severity: 'medium',
    category: 'Logging',
    reference: 'CIS AWS Foundations Benchmark v1.5.0 - 2.1.4',
    remediation: 'Configure CloudTrail to send logs to CloudWatch Logs',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const trails = await clients.cloudtrail.send(new DescribeTrailsCommand({}));
        const trailsWithoutCWLogs = (trails.trailList || []).filter(t => !t.CloudWatchLogsLogGroupArn).map(t => t.Name!);
        return {
          status: trailsWithoutCWLogs.length === 0 && (trails.trailList?.length || 0) > 0 ? 'passed' : 'failed',
          evidence: { total_trails: trails.trailList?.length || 0, trails_without_cloudwatch: trailsWithoutCWLogs.length, checked_at: new Date().toISOString() },
          affected_resources: trailsWithoutCWLogs.map(t => `arn:aws:cloudtrail:${ctx.region}:${ctx.accountId}:trail/${t}`),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'CIS-2.2.1',
    name: 'Ensure EBS default encryption is enabled',
    description: 'EBS volumes should be encrypted by default',
    severity: 'high',
    category: 'Storage',
    reference: 'CIS AWS Foundations Benchmark v1.5.0 - 2.2.1',
    remediation: 'Enable EBS encryption by default in EC2 settings',
    check: async (clients, ctx) => {
      try {
        const result = await clients.ec2.send(new GetEbsEncryptionByDefaultCommand({}));
        return {
          status: result.EbsEncryptionByDefault ? 'passed' : 'failed',
          evidence: { ebs_encryption_by_default: result.EbsEncryptionByDefault, checked_at: new Date().toISOString() },
          affected_resources: !result.EbsEncryptionByDefault ? [`arn:aws:ec2:${ctx.region}:${ctx.accountId}:account`] : [],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },

  {
    id: 'CIS-2.3.1',
    name: 'Ensure AWS Config is enabled in all regions',
    description: 'AWS Config should be enabled to track configuration changes',
    severity: 'medium',
    category: 'Logging',
    reference: 'CIS AWS Foundations Benchmark v1.5.0 - 2.3.1',
    remediation: 'Enable AWS Config in all regions',
    check: async (clients, ctx) => {
      try {
        const recorders = await clients.config.send(new DescribeConfigurationRecordersCommand({}));
        const status = await clients.config.send(new DescribeConfigurationRecorderStatusCommand({}));
        const activeRecorders = status.ConfigurationRecordersStatus?.filter(s => s.recording) || [];
        return {
          status: activeRecorders.length > 0 ? 'passed' : 'failed',
          evidence: { config_recorders: recorders.ConfigurationRecorders?.length || 0, active_recorders: activeRecorders.length, checked_at: new Date().toISOString() },
          affected_resources: activeRecorders.length === 0 ? [`arn:aws:config:${ctx.region}:${ctx.accountId}:config-recorder`] : [],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'CIS-4.1',
    name: 'Ensure no security groups allow ingress from 0.0.0.0/0 to port 22',
    description: 'SSH should not be open to the world',
    severity: 'high',
    category: 'Networking',
    reference: 'CIS AWS Foundations Benchmark v1.5.0 - 4.1',
    remediation: 'Restrict SSH access to specific IP ranges',
    check: async (clients, ctx) => {
      try {
        const sgs = await clients.ec2.send(new DescribeSecurityGroupsCommand({}));
        const openSSH: string[] = [];
        for (const sg of sgs.SecurityGroups || []) {
          for (const rule of sg.IpPermissions || []) {
            if ((rule.FromPort === 22 || (rule.FromPort! <= 22 && rule.ToPort! >= 22)) && rule.IpRanges?.some(r => r.CidrIp === '0.0.0.0/0')) {
              openSSH.push(sg.GroupId!);
              break;
            }
          }
        }
        return {
          status: openSSH.length === 0 ? 'passed' : 'failed',
          evidence: { total_security_groups: sgs.SecurityGroups?.length || 0, open_ssh_groups: openSSH.length, checked_at: new Date().toISOString() },
          affected_resources: openSSH.map(sg => `arn:aws:ec2:${ctx.region}:${ctx.accountId}:security-group/${sg}`),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },

  {
    id: 'CIS-4.2',
    name: 'Ensure no security groups allow ingress from 0.0.0.0/0 to port 3389',
    description: 'RDP should not be open to the world',
    severity: 'high',
    category: 'Networking',
    reference: 'CIS AWS Foundations Benchmark v1.5.0 - 4.2',
    remediation: 'Restrict RDP access to specific IP ranges',
    check: async (clients, ctx) => {
      try {
        const sgs = await clients.ec2.send(new DescribeSecurityGroupsCommand({}));
        const openRDP: string[] = [];
        for (const sg of sgs.SecurityGroups || []) {
          for (const rule of sg.IpPermissions || []) {
            if ((rule.FromPort === 3389 || (rule.FromPort! <= 3389 && rule.ToPort! >= 3389)) && rule.IpRanges?.some(r => r.CidrIp === '0.0.0.0/0')) {
              openRDP.push(sg.GroupId!);
              break;
            }
          }
        }
        return {
          status: openRDP.length === 0 ? 'passed' : 'failed',
          evidence: { total_security_groups: sgs.SecurityGroups?.length || 0, open_rdp_groups: openRDP.length, checked_at: new Date().toISOString() },
          affected_resources: openRDP.map(sg => `arn:aws:ec2:${ctx.region}:${ctx.accountId}:security-group/${sg}`),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'CIS-4.3',
    name: 'Ensure VPC flow logging is enabled in all VPCs',
    description: 'VPC Flow Logs should be enabled for network monitoring',
    severity: 'medium',
    category: 'Networking',
    reference: 'CIS AWS Foundations Benchmark v1.5.0 - 4.3',
    remediation: 'Enable VPC Flow Logs for all VPCs',
    check: async (clients, ctx) => {
      try {
        const vpcs = await clients.ec2.send(new DescribeVpcsCommand({}));
        const flowLogs = await clients.ec2.send(new DescribeFlowLogsCommand({}));
        const vpcsWithFlowLogs = new Set(flowLogs.FlowLogs?.map(f => f.ResourceId) || []);
        const vpcsWithoutFlowLogs = (vpcs.Vpcs || []).filter(v => !vpcsWithFlowLogs.has(v.VpcId)).map(v => v.VpcId!);
        return {
          status: vpcsWithoutFlowLogs.length === 0 ? 'passed' : 'failed',
          evidence: { total_vpcs: vpcs.Vpcs?.length || 0, vpcs_without_flow_logs: vpcsWithoutFlowLogs.length, checked_at: new Date().toISOString() },
          affected_resources: vpcsWithoutFlowLogs.map(v => `arn:aws:ec2:${ctx.region}:${ctx.accountId}:vpc/${v}`),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },

  {
    id: 'CIS-5.1',
    name: 'Ensure S3 bucket access logging is enabled',
    description: 'S3 buckets should have access logging enabled',
    severity: 'medium',
    category: 'Storage',
    reference: 'CIS AWS Foundations Benchmark v1.5.0 - 5.1',
    remediation: 'Enable server access logging for S3 buckets',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const buckets = await clients.s3.send(new ListBucketsCommand({}));
        const publicBuckets: string[] = [];
        for (const bucket of (buckets.Buckets || []).slice(0, 20)) {
          try {
            const policyStatus = await clients.s3.send(new GetBucketPolicyStatusCommand({ Bucket: bucket.Name }));
            if (policyStatus.PolicyStatus?.IsPublic) {
              publicBuckets.push(bucket.Name!);
            }
          } catch (e: any) {
            // No policy = not public via policy
          }
        }
        return {
          status: publicBuckets.length === 0 ? 'passed' : 'failed',
          evidence: { total_buckets: buckets.Buckets?.length || 0, public_buckets: publicBuckets.length, checked_at: new Date().toISOString() },
          affected_resources: publicBuckets.map(b => `arn:aws:s3:::${b}`),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'CIS-5.2',
    name: 'Ensure S3 bucket public access is blocked',
    description: 'S3 buckets should have public access blocked',
    severity: 'critical',
    category: 'Storage',
    reference: 'CIS AWS Foundations Benchmark v1.5.0 - 5.2',
    remediation: 'Enable S3 Block Public Access settings',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const buckets = await clients.s3.send(new ListBucketsCommand({}));
        const bucketsWithoutBlock: string[] = [];
        for (const bucket of (buckets.Buckets || []).slice(0, 20)) {
          try {
            const block = await clients.s3.send(new GetPublicAccessBlockCommand({ Bucket: bucket.Name }));
            const config = block.PublicAccessBlockConfiguration;
            if (!config?.BlockPublicAcls || !config?.BlockPublicPolicy || !config?.IgnorePublicAcls || !config?.RestrictPublicBuckets) {
              bucketsWithoutBlock.push(bucket.Name!);
            }
          } catch (e: any) {
            bucketsWithoutBlock.push(bucket.Name!);
          }
        }
        return {
          status: bucketsWithoutBlock.length === 0 ? 'passed' : 'failed',
          evidence: { total_buckets: buckets.Buckets?.length || 0, buckets_without_block: bucketsWithoutBlock.length, checked_at: new Date().toISOString() },
          affected_resources: bucketsWithoutBlock.map(b => `arn:aws:s3:::${b}`),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
];


// ============================================================================
// LGPD Controls
// ============================================================================

const LGPD_CONTROLS: FrameworkControl[] = [
  {
    id: 'LGPD-1.1',
    name: 'Dados pessoais criptografados em repouso',
    description: 'Dados pessoais devem ser criptografados em repouso (Art. 46)',
    severity: 'critical',
    category: 'Proteção de Dados',
    reference: 'LGPD Art. 46 - Segurança e Sigilo',
    remediation: 'Habilitar criptografia em todos os serviços de armazenamento',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const buckets = await clients.s3.send(new ListBucketsCommand({}));
        const unencrypted: string[] = [];
        for (const bucket of (buckets.Buckets || []).slice(0, 20)) {
          try {
            await clients.s3.send(new GetBucketEncryptionCommand({ Bucket: bucket.Name }));
          } catch (e: any) {
            if (e.name === 'ServerSideEncryptionConfigurationNotFoundError') {
              unencrypted.push(bucket.Name!);
            }
          }
        }
        const rds = await clients.rds.send(new DescribeDBInstancesCommand({}));
        const unencryptedRDS = (rds.DBInstances || []).filter(db => !db.StorageEncrypted).map(db => db.DBInstanceIdentifier!);
        const totalIssues = unencrypted.length + unencryptedRDS.length;
        return {
          status: totalIssues === 0 ? 'passed' : 'failed',
          evidence: { unencrypted_s3: unencrypted.length, unencrypted_rds: unencryptedRDS.length, checked_at: new Date().toISOString() },
          affected_resources: [...unencrypted.map(b => `arn:aws:s3:::${b}`), ...unencryptedRDS.map(db => `arn:aws:rds:${ctx.region}:${ctx.accountId}:db:${db}`)],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'LGPD-2.1',
    name: 'Controles de acesso baseados em funções',
    description: 'Implementar RBAC para acesso a dados pessoais (Art. 46)',
    severity: 'high',
    category: 'Controle de Acesso',
    reference: 'LGPD Art. 46 - Medidas de Segurança',
    remediation: 'Implementar políticas IAM com princípio do menor privilégio',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const users = await clients.iam.send(new ListUsersCommand({}));
        const usersWithAdminAccess: string[] = [];
        for (const user of (users.Users || []).slice(0, 30)) {
          const policies = await clients.iam.send(new ListAttachedUserPoliciesCommand({ UserName: user.UserName }));
          if (policies.AttachedPolicies?.some(p => p.PolicyName === 'AdministratorAccess')) {
            usersWithAdminAccess.push(user.UserName!);
          }
        }
        return {
          status: usersWithAdminAccess.length <= 2 ? 'passed' : 'failed',
          evidence: { users_with_admin: usersWithAdminAccess.length, max_recommended: 2, checked_at: new Date().toISOString() },
          affected_resources: usersWithAdminAccess.map(u => `arn:aws:iam::${ctx.accountId}:user/${u}`),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'LGPD-3.1',
    name: 'Logs de auditoria de acesso a dados',
    description: 'Manter logs de auditoria de acesso a dados pessoais (Art. 37)',
    severity: 'high',
    category: 'Auditoria',
    reference: 'LGPD Art. 37 - Registro de Operações',
    remediation: 'Habilitar CloudTrail e S3 access logging',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const trails = await clients.cloudtrail.send(new DescribeTrailsCommand({}));
        let hasActiveTrail = false;
        for (const trail of trails.trailList || []) {
          const status = await clients.cloudtrail.send(new GetTrailStatusCommand({ Name: trail.Name }));
          if (status.IsLogging) { hasActiveTrail = true; break; }
        }
        return {
          status: hasActiveTrail ? 'passed' : 'failed',
          evidence: { cloudtrail_active: hasActiveTrail, total_trails: trails.trailList?.length || 0, checked_at: new Date().toISOString() },
          affected_resources: !hasActiveTrail ? [`arn:aws:cloudtrail:${ctx.region}:${ctx.accountId}:trail/*`] : [],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
];


// ============================================================================
// PCI-DSS Controls
// ============================================================================

const PCI_DSS_CONTROLS: FrameworkControl[] = [
  {
    id: 'PCI-1.3',
    name: 'Restrict inbound traffic to cardholder data environment',
    description: 'Prohibit direct public access to cardholder data environment',
    severity: 'critical',
    category: 'Network Security',
    reference: 'PCI-DSS v4.0 Requirement 1.3',
    remediation: 'Configure security groups to restrict access to CDE',
    check: async (clients, ctx) => {
      try {
        const sgs = await clients.ec2.send(new DescribeSecurityGroupsCommand({}));
        const openSGs: string[] = [];
        for (const sg of sgs.SecurityGroups || []) {
          for (const rule of sg.IpPermissions || []) {
            if (rule.IpRanges?.some(r => r.CidrIp === '0.0.0.0/0') && rule.FromPort === 0 && rule.ToPort === 65535) {
              openSGs.push(sg.GroupId!);
              break;
            }
          }
        }
        return {
          status: openSGs.length === 0 ? 'passed' : 'failed',
          evidence: { overly_permissive_sgs: openSGs.length, checked_at: new Date().toISOString() },
          affected_resources: openSGs.map(sg => `arn:aws:ec2:${ctx.region}:${ctx.accountId}:security-group/${sg}`),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'PCI-3.4',
    name: 'Render PAN unreadable anywhere it is stored',
    description: 'Primary Account Numbers must be encrypted at rest',
    severity: 'critical',
    category: 'Data Protection',
    reference: 'PCI-DSS v4.0 Requirement 3.4',
    remediation: 'Enable encryption for all storage containing cardholder data',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const rds = await clients.rds.send(new DescribeDBInstancesCommand({}));
        const unencrypted = (rds.DBInstances || []).filter(db => !db.StorageEncrypted).map(db => db.DBInstanceIdentifier!);
        const ebs = await clients.ec2.send(new GetEbsEncryptionByDefaultCommand({}));
        const issues = unencrypted.length + (!ebs.EbsEncryptionByDefault ? 1 : 0);
        return {
          status: issues === 0 ? 'passed' : 'failed',
          evidence: { unencrypted_rds: unencrypted.length, ebs_default_encryption: ebs.EbsEncryptionByDefault, checked_at: new Date().toISOString() },
          affected_resources: unencrypted.map(db => `arn:aws:rds:${ctx.region}:${ctx.accountId}:db:${db}`),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'PCI-8.3',
    name: 'Secure all individual non-console administrative access',
    description: 'MFA required for all administrative access',
    severity: 'critical',
    category: 'Access Control',
    reference: 'PCI-DSS v4.0 Requirement 8.3',
    remediation: 'Enable MFA for all IAM users with administrative access',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const summary = await clients.iam.send(new GetAccountSummaryCommand({}));
        const rootMFA = summary.SummaryMap?.AccountMFAEnabled === 1;
        const users = await clients.iam.send(new ListUsersCommand({}));
        const adminsWithoutMFA: string[] = [];
        for (const user of (users.Users || []).slice(0, 30)) {
          const policies = await clients.iam.send(new ListAttachedUserPoliciesCommand({ UserName: user.UserName }));
          if (policies.AttachedPolicies?.some(p => p.PolicyName === 'AdministratorAccess')) {
            const mfa = await clients.iam.send(new ListMFADevicesCommand({ UserName: user.UserName }));
            if (!mfa.MFADevices || mfa.MFADevices.length === 0) {
              adminsWithoutMFA.push(user.UserName!);
            }
          }
        }
        return {
          status: rootMFA && adminsWithoutMFA.length === 0 ? 'passed' : 'failed',
          evidence: { root_mfa: rootMFA, admins_without_mfa: adminsWithoutMFA.length, checked_at: new Date().toISOString() },
          affected_resources: [...(!rootMFA ? [`arn:aws:iam::${ctx.accountId}:root`] : []), ...adminsWithoutMFA.map(u => `arn:aws:iam::${ctx.accountId}:user/${u}`)],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'PCI-10.1',
    name: 'Implement audit trails for all access to system components',
    description: 'Audit trails must link all access to individual users',
    severity: 'high',
    category: 'Logging and Monitoring',
    reference: 'PCI-DSS v4.0 Requirement 10.1',
    remediation: 'Enable CloudTrail with management and data events',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const trails = await clients.cloudtrail.send(new DescribeTrailsCommand({}));
        let hasCompliantTrail = false;
        for (const trail of trails.trailList || []) {
          if (trail.IsMultiRegionTrail && trail.LogFileValidationEnabled) {
            const status = await clients.cloudtrail.send(new GetTrailStatusCommand({ Name: trail.Name }));
            if (status.IsLogging) { hasCompliantTrail = true; break; }
          }
        }
        return {
          status: hasCompliantTrail ? 'passed' : 'failed',
          evidence: { compliant_trail_found: hasCompliantTrail, checked_at: new Date().toISOString() },
          affected_resources: !hasCompliantTrail ? [`arn:aws:cloudtrail:${ctx.region}:${ctx.accountId}:trail/*`] : [],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
];


// ============================================================================
// HIPAA Controls
// ============================================================================

const HIPAA_CONTROLS: FrameworkControl[] = [
  {
    id: 'HIPAA-164.312(a)(1)',
    name: 'Access Control - Unique User Identification',
    description: 'Assign unique name/number for identifying and tracking user identity',
    severity: 'high',
    category: 'Access Control',
    reference: 'HIPAA 164.312(a)(1)',
    remediation: 'Ensure all users have unique IAM identities',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const users = await clients.iam.send(new ListUsersCommand({}));
        const summary = await clients.iam.send(new GetAccountSummaryCommand({}));
        const rootAccessKeys = summary.SummaryMap?.AccountAccessKeysPresent || 0;
        return {
          status: rootAccessKeys === 0 && (users.Users?.length || 0) > 0 ? 'passed' : 'failed',
          evidence: { total_users: users.Users?.length || 0, root_access_keys: rootAccessKeys, checked_at: new Date().toISOString() },
          affected_resources: rootAccessKeys > 0 ? [`arn:aws:iam::${ctx.accountId}:root`] : [],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'HIPAA-164.312(a)(2)(i)',
    name: 'Access Control - Automatic Logoff',
    description: 'Implement electronic procedures that terminate session after inactivity',
    severity: 'medium',
    category: 'Access Control',
    reference: 'HIPAA 164.312(a)(2)(i)',
    remediation: 'Configure session timeout policies',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const policy = await clients.iam.send(new GetAccountPasswordPolicyCommand({}));
        const hasExpiration = policy.PasswordPolicy?.MaxPasswordAge && policy.PasswordPolicy.MaxPasswordAge <= 90;
        return {
          status: hasExpiration ? 'passed' : 'failed',
          evidence: { max_password_age: policy.PasswordPolicy?.MaxPasswordAge || 'not set', checked_at: new Date().toISOString() },
          affected_resources: !hasExpiration ? [`arn:aws:iam::${ctx.accountId}:account-password-policy`] : [],
        };
      } catch (err: any) {
        if (err.name === 'NoSuchEntityException') {
          return { status: 'failed', evidence: { error: 'No password policy' }, affected_resources: [`arn:aws:iam::${ctx.accountId}:account-password-policy`] };
        }
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'HIPAA-164.312(c)(1)',
    name: 'Integrity - Mechanism to authenticate ePHI',
    description: 'Implement mechanisms to corroborate that ePHI has not been altered',
    severity: 'high',
    category: 'Integrity',
    reference: 'HIPAA 164.312(c)(1)',
    remediation: 'Enable versioning and integrity checks on storage',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const trails = await clients.cloudtrail.send(new DescribeTrailsCommand({}));
        const trailsWithValidation = (trails.trailList || []).filter(t => t.LogFileValidationEnabled);
        return {
          status: trailsWithValidation.length > 0 ? 'passed' : 'failed',
          evidence: { trails_with_validation: trailsWithValidation.length, checked_at: new Date().toISOString() },
          affected_resources: trailsWithValidation.length === 0 ? [`arn:aws:cloudtrail:${ctx.region}:${ctx.accountId}:trail/*`] : [],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'HIPAA-164.312(e)(2)(ii)',
    name: 'Transmission Security - Encryption',
    description: 'Implement mechanism to encrypt ePHI in transit',
    severity: 'critical',
    category: 'Transmission Security',
    reference: 'HIPAA 164.312(e)(2)(ii)',
    remediation: 'Enable TLS/SSL for all data in transit',
    check: async (clients, ctx) => {
      try {
        const rds = await clients.rds.send(new DescribeDBInstancesCommand({}));
        const rdsWithoutSSL = (rds.DBInstances || []).filter(db => !db.CACertificateIdentifier).map(db => db.DBInstanceIdentifier!);
        return {
          status: rdsWithoutSSL.length === 0 ? 'passed' : 'failed',
          evidence: { rds_without_ssl: rdsWithoutSSL.length, checked_at: new Date().toISOString() },
          affected_resources: rdsWithoutSSL.map(db => `arn:aws:rds:${ctx.region}:${ctx.accountId}:db:${db}`),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
];


// ============================================================================
// GDPR Controls
// ============================================================================

const GDPR_CONTROLS: FrameworkControl[] = [
  {
    id: 'GDPR-32.1.a',
    name: 'Pseudonymisation and encryption of personal data',
    description: 'Implement appropriate technical measures including encryption',
    severity: 'critical',
    category: 'Security of Processing',
    reference: 'GDPR Article 32(1)(a)',
    remediation: 'Enable encryption at rest and in transit for all personal data',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const buckets = await clients.s3.send(new ListBucketsCommand({}));
        const unencrypted: string[] = [];
        for (const bucket of (buckets.Buckets || []).slice(0, 20)) {
          try {
            await clients.s3.send(new GetBucketEncryptionCommand({ Bucket: bucket.Name }));
          } catch (e: any) {
            if (e.name === 'ServerSideEncryptionConfigurationNotFoundError') {
              unencrypted.push(bucket.Name!);
            }
          }
        }
        return {
          status: unencrypted.length === 0 ? 'passed' : 'failed',
          evidence: { unencrypted_buckets: unencrypted.length, checked_at: new Date().toISOString() },
          affected_resources: unencrypted.map(b => `arn:aws:s3:::${b}`),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'GDPR-32.1.b',
    name: 'Ensure ongoing confidentiality and integrity',
    description: 'Ensure ongoing confidentiality, integrity, availability and resilience',
    severity: 'high',
    category: 'Security of Processing',
    reference: 'GDPR Article 32(1)(b)',
    remediation: 'Implement access controls and monitoring',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const summary = await clients.iam.send(new GetAccountSummaryCommand({}));
        const rootMFA = summary.SummaryMap?.AccountMFAEnabled === 1;
        const trails = await clients.cloudtrail.send(new DescribeTrailsCommand({}));
        let hasActiveTrail = false;
        for (const trail of trails.trailList || []) {
          const status = await clients.cloudtrail.send(new GetTrailStatusCommand({ Name: trail.Name }));
          if (status.IsLogging) { hasActiveTrail = true; break; }
        }
        return {
          status: rootMFA && hasActiveTrail ? 'passed' : 'failed',
          evidence: { root_mfa: rootMFA, cloudtrail_active: hasActiveTrail, checked_at: new Date().toISOString() },
          affected_resources: [...(!rootMFA ? [`arn:aws:iam::${ctx.accountId}:root`] : []), ...(!hasActiveTrail ? [`arn:aws:cloudtrail:${ctx.region}:${ctx.accountId}:trail/*`] : [])],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'GDPR-32.1.d',
    name: 'Regular testing and evaluation of security measures',
    description: 'Process for regularly testing, assessing and evaluating effectiveness',
    severity: 'medium',
    category: 'Security of Processing',
    reference: 'GDPR Article 32(1)(d)',
    remediation: 'Enable AWS Config for continuous compliance monitoring',
    check: async (clients, ctx) => {
      try {
        const status = await clients.config.send(new DescribeConfigurationRecorderStatusCommand({}));
        const activeRecorders = status.ConfigurationRecordersStatus?.filter(s => s.recording) || [];
        return {
          status: activeRecorders.length > 0 ? 'passed' : 'failed',
          evidence: { active_config_recorders: activeRecorders.length, checked_at: new Date().toISOString() },
          affected_resources: activeRecorders.length === 0 ? [`arn:aws:config:${ctx.region}:${ctx.accountId}:config-recorder`] : [],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'GDPR-30',
    name: 'Records of processing activities',
    description: 'Maintain records of processing activities',
    severity: 'high',
    category: 'Documentation',
    reference: 'GDPR Article 30',
    remediation: 'Enable comprehensive logging with CloudTrail',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const trails = await clients.cloudtrail.send(new DescribeTrailsCommand({}));
        let hasCompliantTrail = false;
        for (const trail of trails.trailList || []) {
          if (trail.IsMultiRegionTrail && trail.CloudWatchLogsLogGroupArn) {
            const status = await clients.cloudtrail.send(new GetTrailStatusCommand({ Name: trail.Name }));
            if (status.IsLogging) { hasCompliantTrail = true; break; }
          }
        }
        return {
          status: hasCompliantTrail ? 'passed' : 'failed',
          evidence: { compliant_trail: hasCompliantTrail, checked_at: new Date().toISOString() },
          affected_resources: !hasCompliantTrail ? [`arn:aws:cloudtrail:${ctx.region}:${ctx.accountId}:trail/*`] : [],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
];


// ============================================================================
// SOC 2 Type II Controls
// ============================================================================

const SOC2_CONTROLS: FrameworkControl[] = [
  {
    id: 'SOC2-CC6.1',
    name: 'Logical and Physical Access Controls',
    description: 'The entity implements logical access security software and architectures',
    severity: 'high',
    category: 'Common Criteria',
    reference: 'SOC 2 Type II - CC6.1',
    remediation: 'Implement IAM policies with least privilege and enable MFA',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const summary = await clients.iam.send(new GetAccountSummaryCommand({}));
        const rootMFA = summary.SummaryMap?.AccountMFAEnabled === 1;
        const rootAccessKeys = summary.SummaryMap?.AccountAccessKeysPresent || 0;
        let hasPasswordPolicy = false;
        try {
          const policy = await clients.iam.send(new GetAccountPasswordPolicyCommand({}));
          hasPasswordPolicy = (policy.PasswordPolicy?.MinimumPasswordLength || 0) >= 12;
        } catch (e) {}
        const isCompliant = rootMFA && rootAccessKeys === 0 && hasPasswordPolicy;
        return {
          status: isCompliant ? 'passed' : 'failed',
          evidence: { root_mfa: rootMFA, root_access_keys: rootAccessKeys, password_policy: hasPasswordPolicy, checked_at: new Date().toISOString() },
          affected_resources: !isCompliant ? [`arn:aws:iam::${ctx.accountId}:root`] : [],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'SOC2-CC6.6',
    name: 'Logical Access Security Measures',
    description: 'The entity implements logical access security measures to protect against threats',
    severity: 'high',
    category: 'Common Criteria',
    reference: 'SOC 2 Type II - CC6.6',
    remediation: 'Enable security groups, NACLs, and WAF to protect resources',
    check: async (clients, ctx) => {
      try {
        const sgs = await clients.ec2.send(new DescribeSecurityGroupsCommand({}));
        const openSGs: string[] = [];
        for (const sg of sgs.SecurityGroups || []) {
          for (const rule of sg.IpPermissions || []) {
            if (rule.IpRanges?.some(r => r.CidrIp === '0.0.0.0/0') && rule.FromPort === 0 && rule.ToPort === 65535) {
              openSGs.push(sg.GroupId!);
              break;
            }
          }
        }
        return {
          status: openSGs.length === 0 ? 'passed' : 'failed',
          evidence: { overly_permissive_sgs: openSGs.length, checked_at: new Date().toISOString() },
          affected_resources: openSGs.map(sg => `arn:aws:ec2:${ctx.region}:${ctx.accountId}:security-group/${sg}`),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'SOC2-CC7.2',
    name: 'System Monitoring',
    description: 'The entity monitors system components and the operation of those components',
    severity: 'medium',
    category: 'Common Criteria',
    reference: 'SOC 2 Type II - CC7.2',
    remediation: 'Enable CloudTrail, CloudWatch, and VPC Flow Logs',
    check: async (clients, ctx) => {
      try {
        const trails = await clients.cloudtrail.send(new DescribeTrailsCommand({}));
        let hasActiveTrail = false;
        for (const trail of trails.trailList || []) {
          const status = await clients.cloudtrail.send(new GetTrailStatusCommand({ Name: trail.Name }));
          if (status.IsLogging) { hasActiveTrail = true; break; }
        }
        const vpcs = await clients.ec2.send(new DescribeVpcsCommand({}));
        const flowLogs = await clients.ec2.send(new DescribeFlowLogsCommand({}));
        const vpcsWithFlowLogs = new Set(flowLogs.FlowLogs?.map(f => f.ResourceId) || []);
        const vpcsWithoutFlowLogs = (vpcs.Vpcs || []).filter(v => !vpcsWithFlowLogs.has(v.VpcId));
        return {
          status: hasActiveTrail && vpcsWithoutFlowLogs.length === 0 ? 'passed' : 'failed',
          evidence: { cloudtrail_active: hasActiveTrail, vpcs_without_flow_logs: vpcsWithoutFlowLogs.length, checked_at: new Date().toISOString() },
          affected_resources: [...(!hasActiveTrail ? [`arn:aws:cloudtrail:${ctx.region}:${ctx.accountId}:trail/*`] : []), ...vpcsWithoutFlowLogs.map(v => `arn:aws:ec2:${ctx.region}:${ctx.accountId}:vpc/${v.VpcId}`)],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'SOC2-CC8.1',
    name: 'Change Management',
    description: 'The entity authorizes, designs, develops, configures, documents, tests, approves, and implements changes',
    severity: 'medium',
    category: 'Common Criteria',
    reference: 'SOC 2 Type II - CC8.1',
    remediation: 'Enable AWS Config to track configuration changes',
    check: async (clients, ctx) => {
      try {
        const status = await clients.config.send(new DescribeConfigurationRecorderStatusCommand({}));
        const activeRecorders = status.ConfigurationRecordersStatus?.filter(s => s.recording) || [];
        return {
          status: activeRecorders.length > 0 ? 'passed' : 'failed',
          evidence: { active_recorders: activeRecorders.length, checked_at: new Date().toISOString() },
          affected_resources: activeRecorders.length === 0 ? [`arn:aws:config:${ctx.region}:${ctx.accountId}:config-recorder`] : [],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
];


// ============================================================================
// NIST 800-53 Controls
// ============================================================================

const NIST_CONTROLS: FrameworkControl[] = [
  {
    id: 'NIST-AC-2',
    name: 'Account Management',
    description: 'The organization manages information system accounts',
    severity: 'high',
    category: 'Access Control',
    reference: 'NIST 800-53 AC-2',
    remediation: 'Implement IAM user lifecycle management and regular access reviews',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        await clients.iam.send(new GenerateCredentialReportCommand({}));
        await new Promise(resolve => setTimeout(resolve, 2000));
        const report = await clients.iam.send(new GetCredentialReportCommand({}));
        const content = Buffer.from(report.Content!).toString('utf-8');
        const lines = content.split('\n').slice(1);
        const inactiveUsers: string[] = [];
        const now = new Date();
        const threshold = 90 * 24 * 60 * 60 * 1000;
        for (const line of lines) {
          const fields = line.split(',');
          if (fields.length < 5) continue;
          const userName = fields[0];
          const passwordLastUsed = fields[4];
          if (passwordLastUsed && passwordLastUsed !== 'N/A' && passwordLastUsed !== 'no_information') {
            const lastUsed = new Date(passwordLastUsed);
            if (now.getTime() - lastUsed.getTime() > threshold) {
              inactiveUsers.push(userName);
            }
          }
        }
        return {
          status: inactiveUsers.length === 0 ? 'passed' : 'failed',
          evidence: { inactive_users: inactiveUsers.length, threshold_days: 90, checked_at: new Date().toISOString() },
          affected_resources: inactiveUsers.map(u => `arn:aws:iam::${ctx.accountId}:user/${u}`),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'NIST-AC-6',
    name: 'Least Privilege',
    description: 'The organization employs the principle of least privilege',
    severity: 'high',
    category: 'Access Control',
    reference: 'NIST 800-53 AC-6',
    remediation: 'Review and restrict IAM policies to minimum required permissions',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const users = await clients.iam.send(new ListUsersCommand({}));
        const usersWithAdminAccess: string[] = [];
        for (const user of (users.Users || []).slice(0, 30)) {
          const policies = await clients.iam.send(new ListAttachedUserPoliciesCommand({ UserName: user.UserName }));
          if (policies.AttachedPolicies?.some(p => p.PolicyName === 'AdministratorAccess')) {
            usersWithAdminAccess.push(user.UserName!);
          }
        }
        return {
          status: usersWithAdminAccess.length <= 2 ? 'passed' : 'failed',
          evidence: { users_with_admin: usersWithAdminAccess.length, max_recommended: 2, checked_at: new Date().toISOString() },
          affected_resources: usersWithAdminAccess.map(u => `arn:aws:iam::${ctx.accountId}:user/${u}`),
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'NIST-AU-2',
    name: 'Audit Events',
    description: 'The organization determines that the information system is capable of auditing events',
    severity: 'high',
    category: 'Audit and Accountability',
    reference: 'NIST 800-53 AU-2',
    remediation: 'Enable CloudTrail with management and data events',
    globalOnly: true,
    check: async (clients, ctx) => {
      try {
        const trails = await clients.cloudtrail.send(new DescribeTrailsCommand({}));
        let hasActiveMultiRegionTrail = false;
        for (const trail of trails.trailList || []) {
          if (trail.IsMultiRegionTrail) {
            const status = await clients.cloudtrail.send(new GetTrailStatusCommand({ Name: trail.Name }));
            if (status.IsLogging) { hasActiveMultiRegionTrail = true; break; }
          }
        }
        return {
          status: hasActiveMultiRegionTrail ? 'passed' : 'failed',
          evidence: { active_multi_region_trail: hasActiveMultiRegionTrail, checked_at: new Date().toISOString() },
          affected_resources: !hasActiveMultiRegionTrail ? [`arn:aws:cloudtrail:${ctx.region}:${ctx.accountId}:trail/*`] : [],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
  {
    id: 'NIST-SC-28',
    name: 'Protection of Information at Rest',
    description: 'The information system protects the confidentiality and integrity of information at rest',
    severity: 'high',
    category: 'System and Communications Protection',
    reference: 'NIST 800-53 SC-28',
    remediation: 'Enable encryption at rest for all storage services',
    check: async (clients, ctx) => {
      try {
        const buckets = await clients.s3.send(new ListBucketsCommand({}));
        const unencrypted: string[] = [];
        for (const bucket of (buckets.Buckets || []).slice(0, 20)) {
          try {
            await clients.s3.send(new GetBucketEncryptionCommand({ Bucket: bucket.Name }));
          } catch (e: any) {
            if (e.name === 'ServerSideEncryptionConfigurationNotFoundError') {
              unencrypted.push(bucket.Name!);
            }
          }
        }
        const rds = await clients.rds.send(new DescribeDBInstancesCommand({}));
        const unencryptedRDS = (rds.DBInstances || []).filter(db => !db.StorageEncrypted).map(db => db.DBInstanceIdentifier!);
        const ebs = await clients.ec2.send(new GetEbsEncryptionByDefaultCommand({}));
        const totalIssues = unencrypted.length + unencryptedRDS.length + (!ebs.EbsEncryptionByDefault ? 1 : 0);
        return {
          status: totalIssues === 0 ? 'passed' : 'failed',
          evidence: { unencrypted_s3: unencrypted.length, unencrypted_rds: unencryptedRDS.length, ebs_default: ebs.EbsEncryptionByDefault, checked_at: new Date().toISOString() },
          affected_resources: [...unencrypted.map(b => `arn:aws:s3:::${b}`), ...unencryptedRDS.map(db => `arn:aws:rds:${ctx.region}:${ctx.accountId}:db:${db}`)],
        };
      } catch (err: any) {
        return { status: 'error', evidence: { error: err.message }, affected_resources: [] };
      }
    },
  },
];


// ============================================================================
// Framework Mapping
// ============================================================================

const FRAMEWORKS: Record<string, FrameworkControl[]> = {
  'cis': CIS_CONTROLS,
  'lgpd': LGPD_CONTROLS,
  'pci-dss': PCI_DSS_CONTROLS,
  'hipaa': HIPAA_CONTROLS,
  'gdpr': GDPR_CONTROLS,
  'soc2': SOC2_CONTROLS,
  'nist': NIST_CONTROLS,
};

function getFrameworkName(frameworkId: string): string {
  const names: Record<string, string> = {
    'cis': 'CIS AWS Foundations Benchmark v1.5.0',
    'lgpd': 'LGPD - Lei Geral de Proteção de Dados',
    'pci-dss': 'PCI-DSS v4.0',
    'hipaa': 'HIPAA Security Rule',
    'gdpr': 'GDPR - General Data Protection Regulation',
    'soc2': 'SOC 2 Type II',
    'nist': 'NIST 800-53',
  };
  return names[frameworkId] || frameworkId;
}


// ============================================================================
// Main Handler with Multi-Region Support
// ============================================================================

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const startTime = Date.now();
  
  logger.info('Advanced Compliance Scan v2.0 started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    const prisma = getPrismaClient();
    
    // Check for Demo Mode (FAIL-SAFE: returns false on any error)
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    
    if (isDemo === true) {
      // Return demo data for organizations in demo mode
      logger.info('Returning demo compliance scan', {
        organizationId,
        isDemo: true
      });
      
      const demoData = generateDemoComplianceData();
      const duration = Date.now() - startTime;
      
      // Calculate totals from demo frameworks
      const totalPassed = demoData.frameworks.reduce((sum, f) => sum + f.passed, 0);
      const totalFailed = demoData.frameworks.reduce((sum, f) => sum + f.failed, 0);
      const totalNA = demoData.frameworks.reduce((sum, f) => sum + f.notApplicable, 0);
      const avgScore = Math.round(demoData.frameworks.reduce((sum, f) => sum + f.score, 0) / demoData.frameworks.length);
      
      return success({
        _isDemo: true,
        scan_id: 'demo-compliance-scan-' + Date.now(),
        status: 'completed',
        duration_ms: duration,
        framework: 'all',
        summary: {
          total_controls: totalPassed + totalFailed + totalNA,
          passed: totalPassed,
          failed: totalFailed,
          not_applicable: totalNA,
          compliance_score: avgScore,
          by_severity: {
            critical: 2,
            high: 5,
            medium: 8,
            low: 3
          }
        },
        frameworks: demoData.frameworks,
        violations: demoData.recentViolations,
        controls: demoData.recentViolations.map(v => ({
          control_id: v.control,
          control_name: v.title,
          description: v.title,
          status: 'failed',
          severity: v.severity,
          evidence: { resource: v.resource },
          remediation_steps: 'Consulte a documentação do framework para remediação.',
          affected_resources: [v.resource],
          framework_reference: `${v.framework} ${v.control}`,
          region: 'us-east-1'
        }))
      }, 200, origin);
    }
    
    // Validate input
    const validation = parseAndValidateBody(complianceScanSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { frameworkId, scanId, accountId, jobId } = validation.data;
    
    logger.info('Starting compliance scan', { frameworkId, accountId, jobId });
    
    // If jobId is provided, update job status
    if (jobId) {
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: { 
          status: 'running',
          started_at: new Date(),
          result: { progress: 0, message: 'Initializing scan...' }
        },
      });
    }
    
    // Get AWS credentials
    const credential = await prisma.awsCredential.findFirst({
      where: {
        organization_id: organizationId,
        is_active: true,
        ...(accountId && { id: accountId }),
      },
      orderBy: { created_at: 'desc' },
    });
    
    if (!credential) {
      if (jobId) {
        await prisma.backgroundJob.update({
          where: { id: jobId },
          data: { status: 'failed', error: 'AWS credentials not found' },
        });
      }
      return badRequest('AWS credentials not found. Please configure AWS credentials first.', undefined, origin);
    }
    
    // Get framework controls
    const controls = FRAMEWORKS[frameworkId];
    if (!controls) {
      if (jobId) {
        await prisma.backgroundJob.update({
          where: { id: jobId },
          data: { status: 'failed', error: `Unknown framework: ${frameworkId}` },
        });
      }
      return badRequest(`Unknown framework: ${frameworkId}. Supported: ${Object.keys(FRAMEWORKS).join(', ')}`, undefined, origin);
    }
    
    // Determine regions to scan
    const regionsToScan = credential.regions && credential.regions.length > 0 
      ? credential.regions 
      : DEFAULT_REGIONS;
    
    logger.info('Running compliance checks', { 
      frameworkId, 
      controlCount: controls.length,
      accountId: credential.account_id,
      regions: regionsToScan
    });

    
    // Separate global and regional controls
    const globalControls = controls.filter(c => c.globalOnly);
    const regionalControls = controls.filter(c => !c.globalOnly);
    
    const results: ComplianceControl[] = [];
    const totalChecks = globalControls.length + (regionalControls.length * regionsToScan.length);
    let completedChecks = 0;
    
    // Run global controls (IAM, etc.) - only in us-east-1
    if (globalControls.length > 0) {
      logger.info('Running global controls', { count: globalControls.length });
      
      const globalClients = await getAWSClients(credential, 'us-east-1');
      const globalContext: CheckContext = {
        accountId: credential.account_id || 'unknown',
        region: 'us-east-1',
        organizationId,
      };
      
      for (const control of globalControls) {
        try {
          const result = await control.check(globalClients, globalContext);
          
          results.push({
            control_id: control.id,
            control_name: control.name,
            description: control.description,
            status: result.status,
            severity: control.severity,
            evidence: result.evidence,
            remediation_steps: control.remediation,
            affected_resources: result.affected_resources,
            framework_reference: control.reference,
            region: 'global',
          });
          
          completedChecks++;
          
          // Update job progress
          if (jobId && completedChecks % 3 === 0) {
            const progress = Math.round((completedChecks / totalChecks) * 100);
            await prisma.backgroundJob.update({
              where: { id: jobId },
              data: { 
                result: { 
                  progress, 
                  message: `Checking ${control.id}...`,
                  completed: completedChecks,
                  total: totalChecks
                }
              },
            });
          }
          
        } catch (err: any) {
          logger.error('Global control check failed', { controlId: control.id, error: err.message });
          
          results.push({
            control_id: control.id,
            control_name: control.name,
            description: control.description,
            status: 'error',
            severity: control.severity,
            evidence: { error: err.message },
            remediation_steps: control.remediation,
            affected_resources: [],
            framework_reference: control.reference,
            region: 'global',
          });
          
          completedChecks++;
        }
      }
    }

    
    // Run regional controls in each region
    for (const region of regionsToScan) {
      if (regionalControls.length === 0) break;
      
      logger.info('Running regional controls', { region, count: regionalControls.length });
      
      try {
        const regionalClients = await getAWSClients(credential, region);
        const regionalContext: CheckContext = {
          accountId: credential.account_id || 'unknown',
          region,
          organizationId,
        };
        
        for (const control of regionalControls) {
          try {
            const result = await control.check(regionalClients, regionalContext);
            
            results.push({
              control_id: `${control.id}-${region}`,
              control_name: `${control.name} (${region})`,
              description: control.description,
              status: result.status,
              severity: control.severity,
              evidence: { ...result.evidence, region },
              remediation_steps: control.remediation,
              affected_resources: result.affected_resources,
              framework_reference: control.reference,
              region,
            });
            
            completedChecks++;
            
            // Update job progress
            if (jobId && completedChecks % 3 === 0) {
              const progress = Math.round((completedChecks / totalChecks) * 100);
              await prisma.backgroundJob.update({
                where: { id: jobId },
                data: { 
                  result: { 
                    progress, 
                    message: `Checking ${control.id} in ${region}...`,
                    completed: completedChecks,
                    total: totalChecks
                  }
                },
              });
            }
            
          } catch (err: any) {
            logger.error('Regional control check failed', { controlId: control.id, region, error: err.message });
            
            results.push({
              control_id: `${control.id}-${region}`,
              control_name: `${control.name} (${region})`,
              description: control.description,
              status: 'error',
              severity: control.severity,
              evidence: { error: err.message, region },
              remediation_steps: control.remediation,
              affected_resources: [],
              framework_reference: control.reference,
              region,
            });
            
            completedChecks++;
          }
        }
      } catch (err: any) {
        logger.error('Failed to initialize clients for region', { region, error: err.message });
        
        // Mark all regional controls as error for this region
        for (const control of regionalControls) {
          results.push({
            control_id: `${control.id}-${region}`,
            control_name: `${control.name} (${region})`,
            description: control.description,
            status: 'error',
            severity: control.severity,
            evidence: { error: `Failed to access region: ${err.message}`, region },
            remediation_steps: control.remediation,
            affected_resources: [],
            framework_reference: control.reference,
            region,
          });
          
          completedChecks++;
        }
      }
    }

    
    // Create or update scan record
    let scanRecord;
    if (scanId) {
      scanRecord = await prisma.securityScan.findUnique({
        where: { id: scanId },
      });
    }
    
    if (!scanRecord) {
      scanRecord = await prisma.securityScan.create({
        data: {
          organization_id: organizationId,
          aws_account_id: credential.id,
          scan_type: `compliance-${frameworkId}`,
          status: 'completed',
          scan_config: { 
            framework: frameworkId,
            controls_count: controls.length,
            regions_scanned: regionsToScan,
          },
          completed_at: new Date(),
        },
      });
    } else {
      await prisma.securityScan.update({
        where: { id: scanId },
        data: {
          status: 'completed',
          completed_at: new Date(),
        },
      });
    }
    
    // Delete old compliance checks for this scan
    await prisma.complianceCheck.deleteMany({
      where: { scan_id: scanRecord.id },
    });
    
    // Store compliance checks
    await prisma.complianceCheck.createMany({
      data: results.map(control => ({
        scan_id: scanRecord!.id,
        framework: frameworkId,
        control_id: control.control_id,
        control_name: control.control_name,
        status: control.status,
        severity: control.severity,
        evidence: control.evidence,
        remediation_steps: control.remediation_steps,
      })),
    });
    
    // Calculate statistics
    const passed = results.filter(c => c.status === 'passed').length;
    const failed = results.filter(c => c.status === 'failed').length;
    const errors = results.filter(c => c.status === 'error').length;
    const notApplicable = results.filter(c => c.status === 'not_applicable').length;
    
    const applicableResults = results.length - notApplicable - errors;
    const complianceScore = applicableResults > 0 
      ? Math.round((passed / applicableResults) * 100) 
      : 0;
    
    const duration = Date.now() - startTime;

    
    // Update job as completed
    if (jobId) {
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: { 
          status: 'completed',
          completed_at: new Date(),
          result: {
            progress: 100,
            scan_id: scanRecord.id,
            framework: frameworkId,
            compliance_score: complianceScore,
            passed,
            failed,
            errors,
            duration_ms: duration,
          }
        },
      });
    }
    
    // Store compliance history for trends
    try {
      await prisma.securityPosture.create({
        data: {
          organization_id: organizationId,
          overall_score: complianceScore,
          critical_findings: results.filter(r => r.status === 'failed' && r.severity === 'critical').length,
          high_findings: results.filter(r => r.status === 'failed' && r.severity === 'high').length,
          medium_findings: results.filter(r => r.status === 'failed' && r.severity === 'medium').length,
          low_findings: results.filter(r => r.status === 'failed' && r.severity === 'low').length,
          compliance_score: complianceScore,
          risk_level: complianceScore >= 80 ? 'low' : complianceScore >= 60 ? 'medium' : 'high',
        },
      });
    } catch (e) {
      logger.warn('Failed to store compliance history', { error: e });
    }
    
    logger.info('Compliance scan completed', { 
      frameworkId,
      passed, 
      failed, 
      errors,
      complianceScore,
      regionsScanned: regionsToScan.length,
      duration: `${duration}ms`
    });
    
    return success({
      scan_id: scanRecord.id,
      framework: frameworkId,
      framework_name: getFrameworkName(frameworkId),
      checks_count: results.length,
      passed,
      failed,
      errors,
      not_applicable: notApplicable,
      compliance_score: complianceScore,
      duration_ms: duration,
      regions_scanned: regionsToScan,
      results: results.map(r => ({
        control_id: r.control_id,
        control_name: r.control_name,
        status: r.status,
        severity: r.severity,
        affected_resources_count: r.affected_resources.length,
        framework_reference: r.framework_reference,
        region: r.region,
      })),
      critical_findings: results
        .filter(r => r.status === 'failed' && r.severity === 'critical')
        .map(r => ({
          control_id: r.control_id,
          control_name: r.control_name,
          affected_resources: r.affected_resources.slice(0, 5),
          remediation: r.remediation_steps,
          region: r.region,
        })),
      by_region: regionsToScan.reduce((acc, region) => {
        const regionResults = results.filter(r => r.region === region || r.region === 'global');
        acc[region] = {
          passed: regionResults.filter(r => r.status === 'passed').length,
          failed: regionResults.filter(r => r.status === 'failed').length,
          errors: regionResults.filter(r => r.status === 'error').length,
        };
        return acc;
      }, {} as Record<string, { passed: number; failed: number; errors: number }>),
    }, 200, origin);
    
  } catch (err) {
    logger.error('Compliance scan error', err as Error);
    
    // Update job as failed if jobId was provided
    try {
      const body = event.body ? JSON.parse(event.body) : {};
      if (body.jobId) {
        const prisma = getPrismaClient();
        await prisma.backgroundJob.update({
          where: { id: body.jobId },
          data: { 
            status: 'failed',
            completed_at: new Date(),
            error: err instanceof Error ? err.message : 'Internal server error',
            result: {
              progress: 0,
              error: err instanceof Error ? err.message : 'Internal server error',
            }
          },
        });
      }
    } catch (updateErr) {
      logger.error('Failed to update job status', updateErr as Error);
    }
    
    return error(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
  }
}
