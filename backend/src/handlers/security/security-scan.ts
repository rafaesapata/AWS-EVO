/**
 * Lambda handler para security scan - Security Engine V2
 * 23 scanners de serviços AWS com 170+ verificações de segurança
 * Suporte a 6 frameworks de compliance: CIS, Well-Architected, PCI-DSS, NIST, LGPD, SOC2
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { parseAndValidateBody, securityScanSchema } from '../../lib/validation.js';
import { resolveAwsCredentials } from '../../lib/aws-helpers.js';
import { withAwsCircuitBreaker } from '../../lib/circuit-breaker.js';
import { logger } from '../../lib/logging.js';
import { businessMetrics } from '../../lib/metrics.js';
import { getOrigin } from '../../lib/middleware.js';
import { runSecurityScan, type ScanContext, type ScanLevel, resetGlobalCache } from '../../lib/security-engine/index.js';

async function securityScanHandler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  if (event.requestContext?.http?.method === 'OPTIONS' || (event as any).httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  let user: ReturnType<typeof getUserFromEvent>;
  let organizationId: string;
  
  try {
    user = getUserFromEvent(event);
  } catch (authError) {
    return error('Unauthorized - user not found', 401, undefined, origin);
  }
  
  try {
    organizationId = getOrganizationId(user);
  } catch (orgError) {
    return error('Unauthorized - organization not found', 401, undefined, origin);
  }
  
  const prisma = getPrismaClient();
  const startTime = Date.now();
  
  logger.info('Security scan started', { organizationId, userId: user.sub });

  try {
    const bodyValidation = parseAndValidateBody(securityScanSchema, event.body || null);
    if (!bodyValidation.success) return bodyValidation.error;
    
    const { accountId, scanLevel } = bodyValidation.data;
    
    const credential = await prisma.awsCredential.findFirst({
      where: { 
        organization_id: organizationId,
        is_active: true, 
        ...(accountId && { id: accountId }) 
      },
      orderBy: { created_at: 'desc' },
    });
    
    if (!credential) {
      return badRequest('AWS credentials not found', undefined, origin);
    }
    
    const regions = credential.regions?.length ? credential.regions : ['us-east-1'];
    
    // Obter AWS Account ID de forma segura
    let awsAccountId: string = credential.account_id || '';
    if (!awsAccountId || awsAccountId === '000000000000') {
      // Tentar obter via STS se não tiver account_id válido
      try {
        const { STSClient, GetCallerIdentityCommand } = await import('@aws-sdk/client-sts');
        const resolvedCredsForSts = await resolveAwsCredentials(credential, 'us-east-1');
        const stsClient = new STSClient({ 
          region: 'us-east-1',
          credentials: {
            accessKeyId: resolvedCredsForSts.accessKeyId,
            secretAccessKey: resolvedCredsForSts.secretAccessKey,
            sessionToken: resolvedCredsForSts.sessionToken,
          }
        });
        const identity = await stsClient.send(new GetCallerIdentityCommand({}));
        if (identity.Account) {
          awsAccountId = identity.Account;
          // Atualizar no banco para próximas consultas
          await prisma.awsCredential.update({
            where: { id: credential.id },
            data: { account_id: identity.Account }
          });
          logger.info('AWS Account ID obtained via STS', { accountId: awsAccountId });
        }
      } catch (stsError) {
        logger.warn('Could not obtain AWS Account ID via STS', { error: stsError });
        awsAccountId = 'unknown';
      }
    }
    
    // Create scan record
    const scan = await prisma.securityScan.create({
      data: {
        organization_id: organizationId,
        aws_account_id: credential.id,
        scan_type: `${scanLevel}-security-scan`,
        status: 'running',
        scan_config: { regions, level: scanLevel, engine: 'v2' },
      },
    });
    
    // Resolve AWS credentials
    const resolvedCreds = await resolveAwsCredentials(credential, 'us-east-1');
    
    // IMPORTANT: Reset global cache to avoid mixing findings from previous scans (Lambda warm start)
    resetGlobalCache();
    logger.info('Global cache reset for new scan');
    
    // Build scan context
    const scanContext: ScanContext = {
      organizationId,
      awsAccountId,
      regions,
      credentials: {
        accessKeyId: resolvedCreds.accessKeyId,
        secretAccessKey: resolvedCreds.secretAccessKey,
        sessionToken: resolvedCreds.sessionToken,
        roleArn: credential.role_arn || undefined,
        externalId: credential.external_id || undefined,
      },
      scanLevel: scanLevel as ScanLevel,
    };
    
    // Run the security scan using Security Engine V2
    logger.info('Running Security Engine', { regions, scanLevel, scanId: scan.id });
    const scanResult = await runSecurityScan(scanContext);
    
    // Save findings to database using batch insert for efficiency
    // Strategy: Delete old pending findings from this scan source and create new ones
    // This ensures we don't accumulate duplicate findings across scans
    
    // Delete old pending findings from security-engine for this account
    const deletedCount = await prisma.finding.deleteMany({
      where: {
        organization_id: organizationId,
        aws_account_id: credential.id,
        source: 'security-engine',
        status: 'pending',
      },
    });
    logger.info('Deleted old pending findings', { deletedCount: deletedCount.count });
    
    // Prepare findings data for batch insert
    const findingsData = scanResult.findings.map(finding => ({
      organization_id: organizationId,
      aws_account_id: credential.id,
      severity: finding.severity,
      description: `${finding.title}\n\n${finding.description}\n\n${finding.analysis}`,
      details: {
        title: finding.title,
        analysis: finding.analysis,
        region: finding.region,
        risk_score: finding.risk_score,
        attack_vectors: finding.attack_vectors,
        business_impact: finding.business_impact,
      },
      resource_id: finding.resource_id,
      resource_arn: finding.resource_arn,
      service: finding.service,
      category: finding.category,
      scan_type: finding.scan_type,
      compliance: finding.compliance?.map(c => `${c.framework} ${c.control_id}: ${c.control_title}`) || [],
      remediation: finding.remediation ? JSON.stringify(finding.remediation) : undefined,
      evidence: finding.evidence,
      risk_vector: finding.risk_vector,
      source: 'security-engine',
      status: 'pending',
    }));
    
    // Batch insert - much more efficient than individual creates
    let savedFindingsCount = 0;
    if (findingsData.length > 0) {
      const batchResult = await prisma.finding.createMany({
        data: findingsData,
        skipDuplicates: true,
      });
      savedFindingsCount = batchResult.count;
      logger.info('Batch inserted findings', { count: savedFindingsCount });
    }
    
    // Fetch the saved findings for the response
    const savedFindings = await prisma.finding.findMany({
      where: {
        organization_id: organizationId,
        aws_account_id: credential.id,
        source: 'security-engine',
        status: 'pending',
      },
      orderBy: { created_at: 'desc' },
      take: findingsData.length,
    });
    
    // Update scan status
    const duration = Date.now() - startTime;
    
    await prisma.securityScan.update({
      where: { id: scan.id },
      data: {
        status: 'completed',
        completed_at: new Date(),
        findings_count: savedFindingsCount,
        critical_count: scanResult.summary.critical,
        high_count: scanResult.summary.high,
        medium_count: scanResult.summary.medium,
        low_count: scanResult.summary.low,
        results: {
          duration_ms: duration,
          services_scanned: scanResult.metrics.servicesScanned,
          regions_scanned: scanResult.metrics.regionsScanned,
          by_service: scanResult.summary.byService,
          by_category: scanResult.summary.byCategory,
        },
      },
    });
    
    // Log metrics
    await businessMetrics.securityScanCompleted(
      duration,
      savedFindings.length,
      organizationId,
      scan.scan_type
    );
    
    logger.info('Security scan completed', {
      organizationId,
      scanId: scan.id,
      duration,
      totalFindings: savedFindings.length,
      summary: scanResult.summary,
    });
    
    return success({
      scan_id: scan.id,
      status: 'completed',
      duration_ms: duration,
      findings_count: savedFindings.length,
      critical: scanResult.summary.critical,
      high: scanResult.summary.high,
      medium: scanResult.summary.medium,
      low: scanResult.summary.low,
      summary: {
        total: savedFindings.length,
        critical: scanResult.summary.critical,
        high: scanResult.summary.high,
        medium: scanResult.summary.medium,
        low: scanResult.summary.low,
        info: scanResult.summary.info,
        by_service: scanResult.summary.byService,
        by_category: scanResult.summary.byCategory,
      },
      metrics: {
        services_scanned: scanResult.metrics.servicesScanned,
        regions_scanned: scanResult.metrics.regionsScanned,
        total_duration: scanResult.metrics.totalDuration,
      },
      findings: savedFindings,
    }, 200, origin);
    
  } catch (err) {
    logger.error('Security scan failed', { error: (err as Error).message, stack: (err as Error).stack });
    return error('Security scan failed: ' + (err as Error).message, 500, undefined, origin);
  }
}

export const handler = async (event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2> => {
  return withAwsCircuitBreaker('security-scan', () => securityScanHandler(event, context));
};
