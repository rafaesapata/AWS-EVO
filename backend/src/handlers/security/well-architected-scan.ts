import { getHttpMethod } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, safeHandler } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logger.js';
import { isOrganizationInDemoMode, generateDemoWellArchitectedData } from '../../lib/demo-data-service.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { cacheManager } from '../../lib/redis-cache.js';
import { z } from 'zod';
import { EC2Client, DescribeInstancesCommand, DescribeSecurityGroupsCommand } from '@aws-sdk/client-ec2';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { S3Client, ListBucketsCommand, GetBucketEncryptionCommand } from '@aws-sdk/client-s3';
import { IAMClient, ListUsersCommand, ListMFADevicesCommand } from '@aws-sdk/client-iam';
import { CloudWatchClient, DescribeAlarmsCommand } from '@aws-sdk/client-cloudwatch';

// Zod schema for well-architected scan request
const wellArchitectedScanSchema = z.object({
  accountId: z.string().min(1, 'accountId is required'),
  region: z.string().optional(),
});

interface PillarScore {
  pillar: string;
  score: number;
  checks_passed: number;
  checks_failed: number;
  critical_issues: number;
  recommendations: Record<string, unknown>[];
}

export const handler = safeHandler(async (event: AuthorizedEvent, context: LambdaContext) => {
  if (getHttpMethod(event) === 'OPTIONS') return corsOptions();
  
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationIdWithImpersonation(event, user);
  
  const prisma = getPrismaClient();
  
  // =========================================================================
  // DEMO MODE CHECK - Retorna dados de demonstração se ativado
  // FAIL-SAFE: isOrganizationInDemoMode retorna false em caso de erro
  // =========================================================================
  const isDemoMode = await isOrganizationInDemoMode(prisma, organizationId);
  if (isDemoMode === true) {
    const demoData = generateDemoWellArchitectedData();
    
    logger.info('Returning demo well-architected data', { 
      organizationId, 
      isDemo: true 
    });
    
    return success(demoData);
  }
  // =========================================================================
  
  try {
    const validation = parseAndValidateBody(wellArchitectedScanSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { accountId, region: requestedRegion } = validation.data;

    // SWR Cache - return cached data instantly if fresh
    const waCacheKey = `wa-scan:${organizationId}:${accountId}`;
    const waCached = await cacheManager.getSWR<any>(waCacheKey, { prefix: 'sec' });
    if (waCached && !waCached.stale) {
      logger.info('Well-Architected scan cache hit (fresh)', { organizationId, cacheAge: waCached.age });
      return success({ ...waCached.data, _fromCache: true });
    }
    
    const account = await prisma.awsCredential.findFirst({
      where: { id: accountId, organization_id: organizationId, is_active: true },
    });
    
    if (!account) return error('AWS account not found', 404);
    
    // Usar região solicitada, ou primeira região da conta, ou padrão
    const accountRegions = account.regions as string[] | null;
    const region = requestedRegion || 
                   (accountRegions && accountRegions.length > 0 ? accountRegions[0] : 'us-east-1');
    
    const resolvedCreds = await resolveAwsCredentials(account, region);
    const credentials = toAwsCredentials(resolvedCreds);
    
    const scan = await prisma.securityScan.create({
      data: { organization_id: organizationId, aws_account_id: accountId, scan_type: 'well_architected', status: 'running' },
    });

    const ec2 = new EC2Client({ region, credentials });
    const rds = new RDSClient({ region, credentials });
    const s3 = new S3Client({ region, credentials });
    const iam = new IAMClient({ region: 'us-east-1', credentials });
    const cw = new CloudWatchClient({ region, credentials });
    
    const [ec2Data, rdsData, s3Data, iamData, cwData, sgData] = await Promise.all([
      ec2.send(new DescribeInstancesCommand({})).catch(() => ({ Reservations: [] })),
      rds.send(new DescribeDBInstancesCommand({})).catch(() => ({ DBInstances: [] })),
      s3.send(new ListBucketsCommand({})).catch(() => ({ Buckets: [] })),
      iam.send(new ListUsersCommand({})).catch(() => ({ Users: [] })),
      cw.send(new DescribeAlarmsCommand({})).catch(() => ({ MetricAlarms: [] })),
      ec2.send(new DescribeSecurityGroupsCommand({})).catch(() => ({ SecurityGroups: [] })),
    ]);
    
    const instances = (ec2Data.Reservations || []).flatMap((r: { Instances?: unknown[] }) => r.Instances || []) as Record<string, unknown>[];
    const dbInstances = (rdsData.DBInstances || []) as Record<string, unknown>[];
    const buckets = (s3Data.Buckets || []) as Record<string, unknown>[];
    const users = (iamData.Users || []) as unknown as Record<string, unknown>[];
    const alarms = (cwData.MetricAlarms || []) as Record<string, unknown>[];
    const sgs = (sgData.SecurityGroups || []) as Record<string, unknown>[];
    
    const pillarScores: PillarScore[] = [
      analyzeOps(instances, alarms),
      await analyzeSec(users, sgs, buckets, s3, iam),
      analyzeRel(instances, dbInstances),
      analyzePerf(instances, dbInstances),
      analyzeCost(instances),
      analyzeSust(instances),
    ];
    
    const overallScore = Math.round(pillarScores.reduce((s, p) => s + p.score, 0) / pillarScores.length);
    
    // Save pillar scores using Prisma ORM
    for (const p of pillarScores) {
      try {
        await prisma.wellArchitectedScore.create({
          data: {
            organization_id: organizationId,
            scan_id: scan.id,
            pillar: p.pillar,
            score: p.score,
            checks_passed: p.checks_passed,
            checks_failed: p.checks_failed,
            critical_issues: p.critical_issues,
            recommendations: p.recommendations as any
          }
        });
        logger.info(`Saved pillar score: ${p.pillar}`, { organizationId, scanId: scan.id, pillar: p.pillar });
      } catch (insertError) {
        logger.error(`Failed to save pillar score: ${p.pillar}`, insertError as Error, { organizationId, scanId: scan.id });
      }
    }
    
    // Calculate findings counts from all pillar recommendations
    const allRecommendations = pillarScores.flatMap(p => p.recommendations);
    const findingsCount = allRecommendations.length;
    const criticalCount = allRecommendations.filter(r => r.severity === 'critical').length;
    const highCount = allRecommendations.filter(r => r.severity === 'high').length;
    const mediumCount = allRecommendations.filter(r => r.severity === 'medium').length;
    const lowCount = allRecommendations.filter(r => r.severity === 'low').length;
    
    await prisma.securityScan.update({ 
      where: { id: scan.id }, 
      data: { 
        status: 'completed', 
        completed_at: new Date(),
        findings_count: findingsCount,
        critical_count: criticalCount,
        high_count: highCount,
        medium_count: mediumCount,
        low_count: lowCount
      } 
    });
    
    logger.info('Well-Architected scan completed', { organizationId, accountId, overallScore });

    const responseData = { success: true, scan_id: scan.id, overall_score: overallScore, pillars: pillarScores };

    // Save to SWR cache (freshFor: 3600s = 1h, maxTTL: 24h)
    await cacheManager.setSWR(`wa-scan:${organizationId}:${accountId}`, responseData, { prefix: 'sec', freshFor: 3600, maxTTL: 86400 });

    return success(responseData);
  } catch (err) {
    logger.error('Well-Architected Scan error', err as Error, { organizationId });
    return error('An unexpected error occurred. Please try again.', 500);
  }
});


function analyzeOps(instances: Record<string, unknown>[], alarms: Record<string, unknown>[]): PillarScore {
  const recs: Record<string, unknown>[] = [];
  let pass = 0, fail = 0, crit = 0;
  if (alarms.length === 0) { fail++; crit++; recs.push({ check_name: 'CloudWatch Alarms', description: 'Nenhum alarme configurado', recommendation: 'Configure alarmes para CPU e erros', severity: 'critical' }); } else { pass++; }
  const untagged = instances.filter((i) => !i.Tags || (i.Tags as unknown[]).length < 3);
  if (untagged.length > 0) { fail++; recs.push({ check_name: 'Resource Tagging', description: `${untagged.length} instâncias sem tags`, recommendation: 'Adicione tags', severity: 'low' }); } else if (instances.length > 0) { pass++; }
  const total = pass + fail;
  return { pillar: 'operational_excellence', score: total > 0 ? Math.round((pass / total) * 100) : 100, checks_passed: pass, checks_failed: fail, critical_issues: crit, recommendations: recs };
}

async function analyzeSec(users: Record<string, unknown>[], sgs: Record<string, unknown>[], buckets: Record<string, unknown>[], s3: S3Client, iam: IAMClient): Promise<PillarScore> {
  const recs: Record<string, unknown>[] = [];
  let pass = 0, fail = 0, crit = 0;
  const openSGs = sgs.filter((sg) => (sg.IpPermissions as { IpRanges?: { CidrIp?: string }[], FromPort?: number }[] | undefined)?.some((p) => p.IpRanges?.some((r) => r.CidrIp === '0.0.0.0/0') && p.FromPort !== 443 && p.FromPort !== 80));
  if (openSGs.length > 0) { fail++; crit++; recs.push({ check_name: 'Security Groups Abertos', description: `${openSGs.length} SGs com 0.0.0.0/0`, recommendation: 'Restrinja acesso', severity: 'critical' }); } else { pass++; }
  let noMFA = 0;
  for (const u of users.slice(0, 5)) { try { const m = await iam.send(new ListMFADevicesCommand({ UserName: u.UserName as string })); if (!m.MFADevices?.length) noMFA++; } catch { /* skip */ } }
  if (noMFA > 0) { fail++; crit++; recs.push({ check_name: 'MFA', description: `${noMFA} usuários sem MFA`, recommendation: 'Habilite MFA', severity: 'critical' }); } else { pass++; }
  let noEnc = 0;
  for (const b of buckets.slice(0, 5)) { try { await s3.send(new GetBucketEncryptionCommand({ Bucket: b.Name as string })); } catch { noEnc++; } }
  if (noEnc > 0) { fail++; recs.push({ check_name: 'S3 Encryption', description: `${noEnc} buckets sem criptografia`, recommendation: 'Habilite SSE', severity: 'high' }); } else { pass++; }
  const total = pass + fail;
  return { pillar: 'security', score: total > 0 ? Math.round((pass / total) * 100) : 100, checks_passed: pass, checks_failed: fail, critical_issues: crit, recommendations: recs };
}


function analyzeRel(instances: Record<string, unknown>[], dbs: Record<string, unknown>[]): PillarScore {
  const recs: Record<string, unknown>[] = [];
  let pass = 0, fail = 0, crit = 0;
  const singleAZ = dbs.filter((d) => !d.MultiAZ);
  if (singleAZ.length > 0) { fail++; crit++; recs.push({ check_name: 'RDS Multi-AZ', description: `${singleAZ.length} bancos sem Multi-AZ`, recommendation: 'Habilite Multi-AZ', severity: 'critical' }); } else if (dbs.length > 0) { pass++; }
  const noBackup = dbs.filter((d) => d.BackupRetentionPeriod === 0);
  if (noBackup.length > 0) { fail++; crit++; recs.push({ check_name: 'RDS Backups', description: `${noBackup.length} bancos sem backup`, recommendation: 'Configure backup', severity: 'critical' }); } else if (dbs.length > 0) { pass++; }
  const azs = new Set(instances.map((i) => (i.Placement as { AvailabilityZone?: string } | undefined)?.AvailabilityZone));
  if (instances.length > 1 && azs.size === 1) { fail++; recs.push({ check_name: 'Multi-AZ', description: 'Instâncias em única AZ', recommendation: 'Distribua em AZs', severity: 'high' }); } else if (instances.length > 1) { pass++; }
  const total = pass + fail;
  return { pillar: 'reliability', score: total > 0 ? Math.round((pass / total) * 100) : 100, checks_passed: pass, checks_failed: fail, critical_issues: crit, recommendations: recs };
}

function analyzePerf(instances: Record<string, unknown>[], dbs: Record<string, unknown>[]): PillarScore {
  const recs: Record<string, unknown>[] = [];
  let pass = 0, fail = 0;
  const oldGen = instances.filter((i) => (i.InstanceType as string | undefined)?.match(/^(t2|m4|c4|r4)\./));
  if (oldGen.length > 0) { fail++; recs.push({ check_name: 'Instance Generation', description: `${oldGen.length} instâncias antigas`, recommendation: 'Migre para t3/m5', severity: 'medium' }); } else if (instances.length > 0) { pass++; }
  const magnetic = dbs.filter((d) => d.StorageType === 'standard');
  if (magnetic.length > 0) { fail++; recs.push({ check_name: 'RDS Storage', description: `${magnetic.length} bancos magnéticos`, recommendation: 'Migre para gp3', severity: 'high' }); } else if (dbs.length > 0) { pass++; }
  const total = pass + fail;
  return { pillar: 'performance_efficiency', score: total > 0 ? Math.round((pass / total) * 100) : 100, checks_passed: pass, checks_failed: fail, critical_issues: 0, recommendations: recs };
}

function analyzeCost(instances: Record<string, unknown>[]): PillarScore {
  const recs: Record<string, unknown>[] = [];
  let pass = 0, fail = 0;
  const stopped = instances.filter((i) => (i.State as { Name?: string } | undefined)?.Name === 'stopped');
  if (stopped.length > 0) { fail++; recs.push({ check_name: 'Stopped Instances', description: `${stopped.length} paradas`, recommendation: 'Termine ou crie AMIs', severity: 'medium' }); } else { pass++; }
  const running = instances.filter((i) => (i.State as { Name?: string } | undefined)?.Name === 'running');
  if (running.length > 3) { fail++; recs.push({ check_name: 'Reserved Instances', description: `${running.length} on-demand`, recommendation: 'Considere RI', severity: 'medium' }); } else { pass++; }
  const total = pass + fail;
  return { pillar: 'cost_optimization', score: total > 0 ? Math.round((pass / total) * 100) : 100, checks_passed: pass, checks_failed: fail, critical_issues: 0, recommendations: recs };
}

function analyzeSust(instances: Record<string, unknown>[]): PillarScore {
  const recs: Record<string, unknown>[] = [];
  let pass = 1, fail = 0; // Region OK by default
  const nonGrav = instances.filter((i) => !(i.InstanceType as string | undefined)?.includes('g') && (i.State as { Name?: string } | undefined)?.Name === 'running');
  if (nonGrav.length > 0) { fail++; recs.push({ check_name: 'Graviton', description: `${nonGrav.length} sem Graviton`, recommendation: 'Considere t4g/m6g', severity: 'low' }); } else if (instances.length > 0) { pass++; }
  const total = pass + fail;
  return { pillar: 'sustainability', score: total > 0 ? Math.round((pass / total) * 100) : 100, checks_passed: pass, checks_failed: fail, critical_issues: 0, recommendations: recs };
}
