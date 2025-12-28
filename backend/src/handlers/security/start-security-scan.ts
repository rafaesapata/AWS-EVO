/**
 * Start Security Scan Handler - Inicia um novo scan de segurança
 */

import { getHttpMethod } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials } from '../../lib/aws-helpers.js';
import { EC2Client, DescribeSecurityGroupsCommand } from '@aws-sdk/client-ec2';
import { IAMClient, ListUsersCommand, GetAccountPasswordPolicyCommand } from '@aws-sdk/client-iam';
import { S3Client, ListBucketsCommand, GetBucketEncryptionCommand, GetPublicAccessBlockCommand } from '@aws-sdk/client-s3';

interface RequestBody {
  scanType: 'vulnerability' | 'compliance' | 'configuration' | 'network' | 'full';
  accountId?: string;
  organizationId?: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  console.log('🔍 Start Security Scan');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: RequestBody = event.body ? JSON.parse(event.body) : {};
    const { scanType, accountId } = body;
    
    if (!scanType) {
      return badRequest('Scan type is required');
    }
    
    const prisma = getPrismaClient();
    
    // Get AWS credentials from database
    const credentialRecord = await prisma.awsCredential.findFirst({
      where: {
        organization_id: organizationId,
        ...(accountId ? { id: accountId } : {}),
        is_active: true
      }
    });
    
    if (!credentialRecord) {
      return badRequest('No AWS credentials found for this account');
    }
    
    const awsCreds = await resolveAwsCredentials(credentialRecord, 'us-east-1');
    const credentialId = credentialRecord.id;
    
    // Create scan record
    const scan = await prisma.securityScan.create({
      data: {
        organization_id: organizationId,
        aws_account_id: credentialId,
        scan_type: scanType,
        status: 'running',
        started_at: new Date(),
        scan_config: { scanType, initiatedBy: user.sub }
      }
    });
    
    // Run scan asynchronously (simplified for immediate response)
    runScanAsync(scan.id, scanType, awsCreds, organizationId, credentialId, prisma).catch(err => {
      console.error('Async scan error:', err);
    });
    
    console.log('✅ Security Scan started:', scan.id);
    
    return success({
      scanId: scan.id,
      status: 'running',
      message: `Scan de ${scanType} iniciado com sucesso`
    });
    
  } catch (err) {
    console.error('❌ Start Security Scan error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

async function runScanAsync(
  scanId: string,
  scanType: string,
  credentials: any,
  organizationId: string,
  awsAccountId: string,
  prisma: any
) {
  const findings: any[] = [];
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  
  try {
    const ec2Client = new EC2Client({ credentials, region: 'us-east-1' });
    const iamClient = new IAMClient({ credentials, region: 'us-east-1' });
    const s3Client = new S3Client({ credentials, region: 'us-east-1' });
    
    // Security Group Analysis
    if (['network', 'configuration', 'full'].includes(scanType)) {
      try {
        const sgResponse = await ec2Client.send(new DescribeSecurityGroupsCommand({}));
        for (const sg of sgResponse.SecurityGroups || []) {
          for (const rule of sg.IpPermissions || []) {
            for (const range of rule.IpRanges || []) {
              if (range.CidrIp === '0.0.0.0/0') {
                const severity = rule.FromPort === 22 || rule.FromPort === 3389 ? 'critical' : 'high';
                if (severity === 'critical') criticalCount++;
                else highCount++;
                
                findings.push({
                  organization_id: organizationId,
                  aws_account_id: awsAccountId,
                  severity,
                  description: `Security Group ${sg.GroupId} permite acesso público na porta ${rule.FromPort}. O Security Group ${sg.GroupName} permite tráfego de entrada de qualquer IP (0.0.0.0/0) na porta ${rule.FromPort}`,
                  details: {
                    title: `Security Group ${sg.GroupId} permite acesso público na porta ${rule.FromPort}`,
                    resource_type: 'AWS::EC2::SecurityGroup',
                    resource_id: sg.GroupId || '',
                    region: 'us-east-1',
                    remediation: 'Restrinja o acesso apenas aos IPs necessários',
                    compliance_standards: ['CIS AWS 5.2', 'SOC2']
                  }
                });
              }
            }
          }
        }
      } catch (e) {
        console.warn('Error scanning security groups:', e);
      }
    }
    
    // IAM Analysis
    if (['compliance', 'configuration', 'full'].includes(scanType)) {
      try {
        // Check password policy
        try {
          await iamClient.send(new GetAccountPasswordPolicyCommand({}));
        } catch (e: any) {
          if (e.name === 'NoSuchEntityException') {
            mediumCount++;
            findings.push({
              organization_id: organizationId,
              aws_account_id: awsAccountId,
              severity: 'medium',
              description: 'A conta AWS não possui uma política de senha configurada',
              details: {
                title: 'Política de senha não configurada',
                resource_type: 'AWS::IAM::AccountPasswordPolicy',
                resource_id: 'account',
                region: 'global',
                remediation: 'Configure uma política de senha forte para a conta',
                compliance_standards: ['CIS AWS 1.5', 'SOC2', 'PCI-DSS']
              }
            });
          }
        }
        
        // Check for users without MFA
        const usersResponse = await iamClient.send(new ListUsersCommand({}));
        for (const user of usersResponse.Users || []) {
          if (!user.PasswordLastUsed) {
            lowCount++;
            findings.push({
              organization_id: organizationId,
              aws_account_id: awsAccountId,
              severity: 'low',
              description: `O usuário ${user.UserName} não utilizou a senha recentemente`,
              details: {
                title: `Usuário IAM ${user.UserName} sem uso recente`,
                resource_type: 'AWS::IAM::User',
                resource_id: user.UserId || '',
                region: 'global',
                remediation: 'Revise se o usuário ainda é necessário',
                compliance_standards: ['CIS AWS 1.3']
              }
            });
          }
        }
      } catch (e) {
        console.warn('Error scanning IAM:', e);
      }
    }
    
    // S3 Analysis
    if (['vulnerability', 'configuration', 'full'].includes(scanType)) {
      try {
        const bucketsResponse = await s3Client.send(new ListBucketsCommand({}));
        for (const bucket of bucketsResponse.Buckets || []) {
          try {
            await s3Client.send(new GetBucketEncryptionCommand({ Bucket: bucket.Name }));
          } catch (e: any) {
            if (e.name === 'ServerSideEncryptionConfigurationNotFoundError') {
              mediumCount++;
              findings.push({
                organization_id: organizationId,
                aws_account_id: awsAccountId,
                severity: 'medium',
                description: `O bucket ${bucket.Name} não possui criptografia padrão configurada`,
                details: {
                  title: `Bucket S3 ${bucket.Name} sem criptografia`,
                  resource_type: 'AWS::S3::Bucket',
                  resource_id: bucket.Name || '',
                  region: 'us-east-1',
                  remediation: 'Habilite a criptografia padrão do bucket',
                  compliance_standards: ['CIS AWS 2.1.1', 'SOC2', 'HIPAA']
                }
              });
            }
          }
          
          try {
            await s3Client.send(new GetPublicAccessBlockCommand({ Bucket: bucket.Name }));
          } catch (e) {
            highCount++;
            findings.push({
              organization_id: organizationId,
              aws_account_id: awsAccountId,
              severity: 'high',
              description: `O bucket ${bucket.Name} não possui configuração de bloqueio de acesso público`,
              details: {
                title: `Bucket S3 ${bucket.Name} sem bloqueio de acesso público`,
                resource_type: 'AWS::S3::Bucket',
                resource_id: bucket.Name || '',
                region: 'us-east-1',
                remediation: 'Configure o bloqueio de acesso público para o bucket',
                compliance_standards: ['CIS AWS 2.1.2', 'SOC2']
              }
            });
          }
        }
      } catch (e) {
        console.warn('Error scanning S3:', e);
      }
    }
    
    // Save findings
    if (findings.length > 0) {
      await prisma.finding.createMany({
        data: findings
      });
    }
    
    // Update scan status
    await prisma.securityScan.update({
      where: { id: scanId },
      data: {
        status: 'completed',
        completed_at: new Date(),
        findings_count: findings.length,
        critical_count: criticalCount,
        high_count: highCount,
        medium_count: mediumCount,
        low_count: lowCount
      }
    });
    
    console.log(`✅ Scan ${scanId} completed with ${findings.length} findings`);
    
  } catch (err) {
    console.error('Scan execution error:', err);
    await prisma.securityScan.update({
      where: { id: scanId },
      data: {
        status: 'failed',
        completed_at: new Date()
      }
    });
  }
}
