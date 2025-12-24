/**
 * Lambda handler para security scan
 * AWS Lambda Handler for security-scan
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { parseAndValidateBody, securityScanSchema } from '../../lib/validation.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { withAwsCircuitBreaker } from '../../lib/circuit-breaker.js';
import { logger } from '../../lib/logging.js';
import { businessMetrics } from '../../lib/metrics.js';
import { EC2Client, DescribeInstancesCommand, DescribeSecurityGroupsCommand } from '@aws-sdk/client-ec2';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { S3Client, ListBucketsCommand, GetPublicAccessBlockCommand, GetBucketEncryptionCommand } from '@aws-sdk/client-s3';

interface Finding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  analysis: string;
  resource_id: string;
  resource_arn?: string;
  scan_type: string;
  service: string;
  category: string;
  evidence: any;
  compliance?: string[];
  remediation?: string;
  risk_vector?: string;
}

const CRITICAL_PORTS: Record<number, string> = {
  22: 'SSH',
  3389: 'RDP',
  3306: 'MySQL',
  5432: 'PostgreSQL',
  1433: 'SQL Server',
  27017: 'MongoDB',
  6379: 'Redis',
  9200: 'Elasticsearch',
};

async function securityScanHandler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  // Handle CORS preflight
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  const user = getUserFromEvent(event);
  const organizationId = getOrganizationId(user);
  const prisma = getPrismaClient();

  const startTime = Date.now();
  logger.info('Security scan started', { 
    organizationId, 
    userId: user.id,
    requestId: context.awsRequestId 
  });
  
  try {
    // Parse and validate request body
    const bodyValidation = parseAndValidateBody(securityScanSchema, event.body || null);
    if (!bodyValidation.success) {
      return bodyValidation.error;
    }
    
    const { accountId, scanLevel, regions: requestedRegions, scanTypes } = bodyValidation.data;
    
    // Get AWS credentials (tenant isolation applied automatically)
    const credential = await prisma.awsCredential.findFirst({
      where: {
        is_active: true,
        ...(accountId && { id: accountId }),
      },
      orderBy: {
        created_at: 'desc',
      },
    });
    

    
    if (!credential) {
      logger.warn('AWS credentials not found', { organizationId, accountId });
      return badRequest('AWS credentials not found');
    }
    
    const regions = credential.regions && credential.regions.length > 0
      ? credential.regions
      : ['us-east-1', 'us-west-2'];
    
    logger.info('Security scan configuration', { 
      organizationId,
      regionsCount: regions.length,
      scanLevel,
      regions: regions.slice(0, 3) // Log first 3 regions only
    });
    
    // Create scan record (organization_id applied automatically)
    const scan = await prisma.securityScan.create({
      data: {
        organization_id: organizationId,
        aws_account_id: credential.id,
        scan_type: `${scanLevel}-audit`,
        status: 'running',
        scan_config: {
          regions,
          level: scanLevel,
        },
      },
    });
    
    const findings: Finding[] = [];
    
    // Scan each region
    for (const region of regions) {
      logger.info('Scanning region', { organizationId, region, scanId: scan.id });
      
      try {
        const creds = await resolveAwsCredentials(credential, region);
        const awsCreds = toAwsCredentials(creds);
        
        // EC2 Analysis with circuit breaker
        const ec2Client = new EC2Client({ region, credentials: awsCreds });
        
        const instancesResponse = await withAwsCircuitBreaker(
          `ec2-${region}`,
          () => ec2Client.send(new DescribeInstancesCommand({})),
          async () => ({ Reservations: [], $metadata: {} }) // Fallback to empty result
        );
        const instances = instancesResponse.Reservations?.flatMap(r => r.Instances || []) || [];
        
        const sgResponse = await withAwsCircuitBreaker(
          `ec2-sg-${region}`,
          () => ec2Client.send(new DescribeSecurityGroupsCommand({})),
          async () => ({ SecurityGroups: [], $metadata: {} })
        );
        const securityGroups = sgResponse.SecurityGroups || [];
        
        // Build SG lookup
        const sgLookup = new Map(securityGroups.map(sg => [sg.GroupId!, sg]));
        
        // Analyze EC2 instances
        for (const instance of instances) {
          if (!instance.InstanceId) continue;
          
          const instanceId = instance.InstanceId;
          const publicIp = instance.PublicIpAddress;
          const accountId = credential.account_id || '000000000000';
          const instanceArn = `arn:aws:ec2:${region}:${accountId}:instance/${instanceId}`;
          
          // Check for public exposure with critical ports
          if (publicIp) {
            const sgIds = instance.SecurityGroups?.map(sg => sg.GroupId!) || [];
            
            for (const sgId of sgIds) {
              const sg = sgLookup.get(sgId);
              if (!sg) continue;
              
              // Check each critical port
              for (const [port, portName] of Object.entries(CRITICAL_PORTS)) {
                const portNum = parseInt(port);
                const isOpenToWorld = sg.IpPermissions?.some(rule =>
                  ((rule.FromPort || 0) <= portNum && (rule.ToPort || 0) >= portNum || rule.FromPort === -1) &&
                  rule.IpRanges?.some(range => range.CidrIp === '0.0.0.0/0' || range.CidrIp === '::/0')
                );
                
                if (isOpenToWorld) {
                  findings.push({
                    severity: 'critical',
                    title: `EC2 Exposta: ${portName} (${port}) Aberta ao Mundo`,
                    description: `Instância ${instanceId} (${publicIp}) com porta ${port}/${portName} acessível de 0.0.0.0/0`,
                    analysis: `RISCO CRÍTICO: Porta ${port} (${portName}) exposta globalmente. Permite ataques de força bruta e exploração de CVEs.`,
                    resource_id: instanceId,
                    resource_arn: instanceArn,
                    scan_type: 'ec2_critical_port_exposure',
                    service: 'EC2',
                    category: 'Network Exposure',
                    compliance: ['CIS 5.2', 'PCI-DSS 1.3.1', 'LGPD Art.46'],
                    remediation: `aws ec2 revoke-security-group-ingress --group-id ${sgId} --protocol tcp --port ${port} --cidr 0.0.0.0/0`,
                    risk_vector: 'network_exposure',
                    evidence: { instanceId, publicIp, port: portNum, portName, securityGroup: sgId, region },
                  });
                }
              }
            }
          }
          
          // Check IMDSv1
          if (instance.MetadataOptions?.HttpTokens !== 'required') {
            findings.push({
              severity: 'critical',
              title: `EC2 Vulnerável a SSRF (IMDSv1)`,
              description: `${instanceId} aceita IMDSv1, vulnerável a Server-Side Request Forgery`,
              analysis: `RISCO CRÍTICO: IMDSv1 permite roubo de credenciais IAM via SSRF.`,
              resource_id: instanceId,
              resource_arn: instanceArn,
              scan_type: 'ec2_imdsv1_vulnerable',
              service: 'EC2',
              category: 'Credential Theft Risk',
              compliance: ['CIS 5.6'],
              remediation: `aws ec2 modify-instance-metadata-options --instance-id ${instanceId} --http-tokens required`,
              risk_vector: 'credential_theft',
              evidence: { instanceId, httpTokens: instance.MetadataOptions?.HttpTokens || 'optional', region },
            });
          }
        }
        
        // RDS Analysis with circuit breaker
        const rdsClient = new RDSClient({ region, credentials: awsCreds });
        const dbResponse = await withAwsCircuitBreaker(
          `rds-${region}`,
          () => rdsClient.send(new DescribeDBInstancesCommand({})),
          async () => ({ DBInstances: [], $metadata: {} })
        );
        const databases = dbResponse.DBInstances || [];
        
        for (const db of databases) {
          if (!db.DBInstanceIdentifier) continue;
          
          const dbId = db.DBInstanceIdentifier;
          const accountId = credential.account_id || '000000000000';
          const dbArn = `arn:aws:rds:${region}:${accountId}:db:${dbId}`;
          
          // Public access
          if (db.PubliclyAccessible) {
            findings.push({
              severity: 'critical',
              title: `RDS PÚBLICO: ${dbId} Acessível da Internet`,
              description: `Database ${dbId} com PubliclyAccessible=true`,
              analysis: `RISCO CRÍTICO MÁXIMO: Database exposto à internet. Violação LGPD/GDPR.`,
              resource_id: dbId,
              resource_arn: dbArn,
              scan_type: 'rds_public_critical',
              service: 'RDS',
              category: 'Data Exposure',
              compliance: ['CIS 4.1.3', 'PCI-DSS 2.2.2', 'LGPD Art.46'],
              remediation: `aws rds modify-db-instance --db-instance-identifier ${dbId} --no-publicly-accessible`,
              risk_vector: 'data_exposure',
              evidence: { dbInstanceId: dbId, publiclyAccessible: true, region },
            });
          }
          
          // No encryption
          if (!db.StorageEncrypted) {
            findings.push({
              severity: 'critical',
              title: `RDS sem Criptografia: ${dbId}`,
              description: `${dbId} armazena dados sem encryption at-rest`,
              analysis: `RISCO CRÍTICO: Dados em texto puro. Violação LGPD Art.46, GDPR Art.32.`,
              resource_id: dbId,
              resource_arn: dbArn,
              scan_type: 'rds_no_encryption',
              service: 'RDS',
              category: 'Data Protection',
              compliance: ['CIS 4.1.1', 'PCI-DSS 3.4', 'LGPD Art.46'],
              risk_vector: 'unencrypted_data',
              evidence: { dbInstanceId: dbId, storageEncrypted: false, region },
            });
          }
        }
        
      } catch (regionError) {
        logger.error('Error scanning region', regionError as Error, { 
          organizationId, 
          region, 
          scanId: scan.id 
        });
        continue;
      }
    }
    
    // S3 Analysis (global)
    try {
      const globalCreds = await resolveAwsCredentials(credential, 'us-east-1');
      const s3Client = new S3Client({ region: 'us-east-1', credentials: toAwsCredentials(globalCreds) });
      
      const bucketsResponse = await withAwsCircuitBreaker(
        's3-global',
        () => s3Client.send(new ListBucketsCommand({})),
        async () => ({ Buckets: [], $metadata: {} })
      );
      const buckets = bucketsResponse.Buckets || [];
      
      for (const bucket of buckets) {
        if (!bucket.Name) continue;
        
        try {
          const publicAccessBlock = await withAwsCircuitBreaker(
            `s3-bucket-${bucket.Name}`,
            () => s3Client.send(new GetPublicAccessBlockCommand({ Bucket: bucket.Name })),
            async () => ({ PublicAccessBlockConfiguration: undefined, $metadata: {} })
          );
          
          const config = publicAccessBlock.PublicAccessBlockConfiguration;
          
          if (!config?.BlockPublicAcls || !config?.BlockPublicPolicy ||
              !config?.IgnorePublicAcls || !config?.RestrictPublicBuckets) {
            findings.push({
              severity: 'critical',
              title: `S3 Potencialmente Público: ${bucket.Name}`,
              description: `Block Public Access incompleto`,
              analysis: `RISCO CRÍTICO: Bucket pode ser exposto publicamente.`,
              resource_id: bucket.Name,
              resource_arn: `arn:aws:s3:::${bucket.Name}`,
              scan_type: 's3_incomplete_public_block',
              service: 'S3',
              category: 'Data Exposure',
              compliance: ['CIS 2.1.1', 'LGPD Art.46'],
              risk_vector: 'data_exposure',
              evidence: { bucket: bucket.Name, publicAccessBlock: config },
            });
          }
        } catch (e) {
          // Bucket pode não ter public access block configurado
          logger.warn('Could not check public access for bucket', { 
            error: (e as Error).message,
            organizationId,
            bucket: bucket.Name 
          });
        }
      }
    } catch (s3Error) {
      logger.error('Error scanning S3', s3Error as Error, { organizationId });
    }
    
    // Store findings in database (organization_id applied automatically)
    if (findings.length > 0) {
      await prisma.finding.createMany({
        data: findings.map(f => ({
          severity: f.severity,
          description: f.description,
          details: f as any,
          ai_analysis: f.analysis,
          status: 'pending',
          source: 'security_scan',
          resource_id: f.resource_id,
          resource_arn: f.resource_arn,
          scan_type: f.scan_type,
          service: f.service,
          category: f.category,
          compliance: f.compliance || [],
          remediation: f.remediation,
          risk_vector: f.risk_vector,
          evidence: f.evidence,
        })),
      });
    }
    
    // Update scan record
    await prisma.securityScan.update({
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
    
    const duration = Date.now() - startTime;
    
    // Publish metrics
    await businessMetrics.securityScanCompleted(
      duration,
      findings.length,
      organizationId,
      scanLevel || 'basic'
    );
    
    logger.info('Security scan completed', { 
      organizationId,
      scanId: scan.id,
      findingsCount: findings.length,
      duration,
      criticalCount: findings.filter(f => f.severity === 'critical').length
    });
    
    return success({
      scan_id: scan.id,
      findings_count: findings.length,
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
    });
    
  } catch (err) {
    logger.error('Security scan error', err as Error, { 
      organizationId,
      userId: user.id,
      requestId: context.awsRequestId 
    });
    
    await businessMetrics.errorOccurred(
      'security_scan_error',
      'security-scan',
      organizationId
    );
    
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

// Export handler with middleware chain
export const handler = securityScanHandler;
