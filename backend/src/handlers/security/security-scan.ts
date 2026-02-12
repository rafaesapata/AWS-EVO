/**
 * Lambda handler para security scan - Security Engine V3
 * 23 scanners de serviços AWS com 170+ verificações de segurança
 * Suporte a 6 frameworks de compliance: CIS, Well-Architected, PCI-DSS, NIST, LGPD, SOC2
 * 
 * DEMO MODE: Suporta modo demonstração para organizações com demo_mode=true
 * 
 * @version 3.0.1
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { parseAndValidateBody, securityScanSchema } from '../../lib/validation.js';
import { resolveAwsCredentials } from '../../lib/aws-helpers.js';
import { withAwsCircuitBreaker } from '../../lib/circuit-breaker.js';
import { logger } from '../../lib/logger.js';
import { businessMetrics } from '../../lib/metrics.js';
import { getOrigin } from '../../lib/middleware.js';
import { runSecurityScan, type ScanContext, type ScanLevel, resetGlobalCache } from '../../lib/security-engine/index.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import { isOrganizationInDemoMode, generateDemoSecurityFindings } from '../../lib/demo-data-service.js';
import { computeFingerprint, computeFallbackFingerprint } from '../../lib/security-engine/fingerprint.js';
import { classifyFindings, computeLifecycleTransition, type NewScanFinding } from '../../lib/security-engine/delta-sync.js';

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
    organizationId = getOrganizationIdWithImpersonation(event, user);
  } catch (orgError) {
    return error('Unauthorized - organization not found', 401, undefined, origin);
  }
  
  const prisma = getPrismaClient();
  
  // Ensure database connection is established with retry logic
  let connectionAttempts = 0;
  const maxAttempts = 3;
  
  while (connectionAttempts < maxAttempts) {
    try {
      await prisma.$connect();
      // Test the connection with a simple query
      await prisma.$queryRaw`SELECT 1`;
      break;
    } catch (dbError) {
      connectionAttempts++;
      logger.warn(`Database connection attempt ${connectionAttempts} failed`, { 
        error: (dbError as Error).message,
        attempt: connectionAttempts,
        maxAttempts 
      });
      
      if (connectionAttempts >= maxAttempts) {
        logger.error('Database connection failed after all attempts', dbError as Error);
        return error('Database connection failed', 500, undefined, origin);
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, connectionAttempts) * 1000));
    }
  }
  const startTime = Date.now();
  
  logger.info('Security scan started', { organizationId, userId: user.sub });

  // Check for Demo Mode (FAIL-SAFE: returns false on any error)
  const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
  
  if (isDemo === true) {
    // Return demo data for organizations in demo mode
    logger.info('Returning demo security scan', {
      organizationId,
      isDemo: true
    });
    
    const demoFindings = generateDemoSecurityFindings();
    const duration = Date.now() - startTime;
    
    // Count by severity
    const critical = demoFindings.filter(f => f.severity === 'critical').length;
    const high = demoFindings.filter(f => f.severity === 'high').length;
    const medium = demoFindings.filter(f => f.severity === 'medium').length;
    const low = demoFindings.filter(f => f.severity === 'low').length;
    
    return success({
      _isDemo: true,
      scan_id: 'demo-scan-' + Date.now(),
      status: 'completed',
      duration_ms: duration,
      findings_count: demoFindings.length,
      critical,
      high,
      medium,
      low,
      summary: {
        total: demoFindings.length,
        critical,
        high,
        medium,
        low,
        info: 0,
        by_service: {
          'S3': 1,
          'EC2': 2,
          'RDS': 1,
          'CloudTrail': 1,
          'IAM': 1
        },
        by_category: {
          'Data Protection': 2,
          'Network Security': 1,
          'Logging & Monitoring': 1,
          'Identity & Access': 2
        },
      },
      metrics: {
        services_scanned: 23,
        regions_scanned: 4,
        total_duration: duration,
      },
      findings: demoFindings.map(f => ({
        ...f,
        organization_id: organizationId,
        aws_account_id: 'demo-account',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
    }, 200, origin);
  }

  // Track scanId outside try scope for error handling in catch block
  let currentScanId: string | undefined;

  try {
    const bodyValidation = parseAndValidateBody(securityScanSchema, event.body || null);
    if (!bodyValidation.success) return bodyValidation.error;
    
    const { accountId, scanLevel, scanId: inputScanId } = bodyValidation.data;
    currentScanId = inputScanId;
    
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
    
    // Create or update scan record
    let scan;
    if (inputScanId) {
      // Update existing scan record
      scan = await prisma.securityScan.update({
        where: { id: inputScanId },
        data: {
          status: 'running',
          started_at: new Date(),
        },
      });
      logger.info('Updated existing scan record', { scanId: inputScanId });
    } else {
      // Create new scan record (fallback for backward compatibility)
      scan = await prisma.securityScan.create({
        data: {
          organization_id: organizationId,
          aws_account_id: credential.id,
          scan_type: `${scanLevel}-security-scan`,
          status: 'running',
          scan_config: { regions, level: scanLevel, engine: 'v3' },
        },
      });
      logger.info('Created new scan record', { scanId: scan.id });
    }
    // Update currentScanId so catch block can reference it
    currentScanId = scan.id;
    
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
    
    // Run the security scan using Security Engine V3
    logger.info('Running Security Engine', { regions, scanLevel, scanId: scan.id });
    const scanResult = await runSecurityScan(scanContext);
    
    // === Delta Sync: fingerprint-based upsert instead of delete+recreate ===
    const now = new Date();
    
    // Compute fingerprints for all scan findings
    const newFindings: NewScanFinding[] = scanResult.findings.map(finding => {
      const fingerprint = finding.resource_arn
        ? computeFingerprint(finding.resource_arn, finding.scan_type, finding.title)
        : computeFallbackFingerprint(finding.scan_type, finding.title, finding.resource_id);
      
      return {
        fingerprint,
        title: finding.title,
        severity: finding.severity,
        description: `${finding.title}\n\n${finding.description}\n\n${finding.analysis}`,
        resource_id: finding.resource_id,
        resource_arn: finding.resource_arn,
        service: finding.service,
        category: finding.category,
        scan_type: finding.scan_type,
        region: finding.region,
        compliance: finding.compliance?.map(c => `${c.framework} ${c.control_id}: ${c.control_title}`) || [],
        remediation: finding.remediation ? JSON.stringify(finding.remediation) : undefined,
        evidence: finding.evidence || {},
        risk_vector: finding.risk_vector,
        details: {
          title: finding.title,
          analysis: finding.analysis,
          region: finding.region,
          risk_score: finding.risk_score,
          attack_vectors: finding.attack_vectors,
          business_impact: finding.business_impact,
        },
        source: 'security-engine',
      };
    });
    
    // Fetch existing findings for this org+account from security-engine
    const existingFindings = await prisma.finding.findMany({
      where: {
        organization_id: organizationId,
        aws_account_id: credential.id,
        source: 'security-engine',
      },
      select: {
        id: true,
        fingerprint: true,
        status: true,
        first_seen: true,
        last_seen: true,
        resolved_at: true,
        occurrence_count: true,
        suppressed: true,
        suppression_expires_at: true,
      },
    });
    
    // Classify findings into create/update/resolve/expired buckets
    const delta = classifyFindings(newFindings, existingFindings, now);
    
    logger.info('Delta sync classification', {
      toCreate: delta.toCreate.length,
      toUpdate: delta.toUpdate.length,
      toResolve: delta.toResolve.length,
      expiredSuppressions: delta.expiredSuppressions.length,
    });
    
    // Execute delta sync in a transaction
    let savedFindingsCount = 0;
    try {
      await prisma.$transaction(async (tx) => {
        // 1. Create new findings
        if (delta.toCreate.length > 0) {
          await tx.finding.createMany({
            data: delta.toCreate.map(f => ({
              organization_id: organizationId,
              aws_account_id: credential.id,
              scan_id: scan.id,
              fingerprint: f.fingerprint,
              title: f.title,
              severity: f.severity,
              description: f.description,
              details: f.details,
              resource_id: f.resource_id,
              resource_arn: f.resource_arn,
              service: f.service,
              category: f.category,
              scan_type: f.scan_type,
              compliance: f.compliance,
              remediation: f.remediation,
              evidence: f.evidence,
              risk_vector: f.risk_vector,
              source: 'security-engine',
              status: 'new',
              first_seen: now,
              last_seen: now,
              occurrence_count: 1,
              suppressed: false,
            })),
            skipDuplicates: true,
          });
        }
        
        // 2. Update existing findings (re-detected)
        for (const { existing, newData } of delta.toUpdate) {
          const newStatus = computeLifecycleTransition(existing.status, true);
          await tx.finding.update({
            where: { id: existing.id },
            data: {
              scan_id: scan.id,
              last_seen: now,
              occurrence_count: existing.occurrence_count + 1,
              status: newStatus,
              resolved_at: newStatus === 'reopened' ? null : existing.resolved_at,
              // Update description/details with latest scan data
              severity: newData.severity,
              description: newData.description,
              details: newData.details,
              evidence: newData.evidence,
              remediation: newData.remediation,
            },
          });
        }
        
        // 3. Resolve missing findings
        if (delta.toResolve.length > 0) {
          await tx.finding.updateMany({
            where: { id: { in: delta.toResolve.map(f => f.id) } },
            data: {
              status: 'resolved',
              resolved_at: now,
            },
          });
        }
        
        // 4. Clear expired suppressions
        if (delta.expiredSuppressions.length > 0) {
          await tx.finding.updateMany({
            where: { id: { in: delta.expiredSuppressions.map(f => f.id) } },
            data: {
              suppressed: false,
              suppressed_by: null,
              suppressed_at: null,
              suppression_reason: null,
              suppression_expires_at: null,
            },
          });
        }
      });
      
      savedFindingsCount = delta.toCreate.length + delta.toUpdate.length;
      logger.info('Delta sync completed', {
        created: delta.toCreate.length,
        updated: delta.toUpdate.length,
        resolved: delta.toResolve.length,
        expiredSuppressionsCleared: delta.expiredSuppressions.length,
      });
    } catch (deltaSyncError) {
      // Fallback to legacy delete+create on transaction failure
      logger.error('Delta sync failed, falling back to legacy mode', deltaSyncError as Error);
      
      await prisma.finding.deleteMany({
        where: {
          organization_id: organizationId,
          aws_account_id: credential.id,
          source: 'security-engine',
          status: 'pending',
        },
      });
      
      const findingsData = newFindings.map(f => ({
        organization_id: organizationId,
        aws_account_id: credential.id,
        scan_id: scan.id,
        fingerprint: f.fingerprint,
        title: f.title,
        severity: f.severity,
        description: f.description,
        details: f.details,
        resource_id: f.resource_id,
        resource_arn: f.resource_arn,
        service: f.service,
        category: f.category,
        scan_type: f.scan_type,
        compliance: f.compliance,
        remediation: f.remediation,
        evidence: f.evidence,
        risk_vector: f.risk_vector,
        source: 'security-engine',
        status: 'pending',
        first_seen: now,
        last_seen: now,
        occurrence_count: 1,
        suppressed: false,
      }));
      
      if (findingsData.length > 0) {
        const batchResult = await prisma.finding.createMany({
          data: findingsData,
          skipDuplicates: true,
        });
        savedFindingsCount = batchResult.count;
      }
    }
    
    // Fetch the saved findings for the response
    const savedFindings = await prisma.finding.findMany({
      where: {
        organization_id: organizationId,
        aws_account_id: credential.id,
        source: 'security-engine',
        status: { in: ['new', 'active', 'reopened'] },
      },
      orderBy: { created_at: 'desc' },
      take: newFindings.length || 50,
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
    
    // Audit log (fire-and-forget, won't break main flow)
    logAuditAsync({
      organizationId,
      userId: user.sub,
      action: 'SECURITY_SCAN_COMPLETE',
      resourceType: 'security_scan',
      resourceId: scan.id,
      details: {
        duration_ms: duration,
        findings_count: savedFindings.length,
        critical: scanResult.summary.critical,
        high: scanResult.summary.high,
        medium: scanResult.summary.medium,
        low: scanResult.summary.low,
        aws_account_id: awsAccountId,
        scan_level: scanLevel,
      },
      ipAddress: getIpFromEvent(event),
      userAgent: getUserAgentFromEvent(event),
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
    
    // Update scan status to failed if we have a scan record
    if (currentScanId) {
      try {
        const prisma = getPrismaClient();
        await prisma.securityScan.update({
          where: { id: currentScanId },
          data: {
            status: 'failed',
            completed_at: new Date(),
            results: { error: (err as Error).message }
          }
        });
        logger.info('Updated scan status to failed', { scanId: currentScanId });
      } catch (updateErr) {
        logger.warn('Could not update scan status to failed', { error: (updateErr as Error).message });
      }
    }
    
    return error('Security scan failed. Please try again.', 500, undefined, origin);
  }
}

export const handler = async (event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2> => {
  return withAwsCircuitBreaker('security-scan', () => securityScanHandler(event, context));
};
