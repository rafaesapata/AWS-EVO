/**
 * Azure Security Scan Handler
 * 
 * Runs a security scan on an Azure subscription and stores findings.
 * Uses the new modular Azure scanners for comprehensive security analysis.
 */

// Ensure crypto is available globally for Azure SDK
import * as crypto from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = crypto.webcrypto || crypto;
}

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { AzureProvider } from '../../lib/cloud-provider/azure-provider.js';
import { validateServicePrincipalCredentials, validateCertificateCredentials, getAzureCredentialWithToken, ONE_HOUR_MS, resolveAzureTenantId, getAzureTokenUrl } from '../../lib/azure-helpers.js';
import { runAllAzureScanners, azureScannerMetadata } from '../../lib/security-engine/scanners/azure/index.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import type { AzureScanContext } from '../../lib/security-engine/scanners/azure/types.js';
import type { ScanConfig } from '../../types/cloud.js';
import { z } from 'zod';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import { computeFingerprint, computeFallbackFingerprint } from '../../lib/security-engine/fingerprint.js';
import { classifyFindings, computeLifecycleTransition, type NewScanFinding } from '../../lib/security-engine/delta-sync.js';

const AZURE_SCAN_SOURCES = ['azure-security-scan', 'azure-module-scanner'] as const;

// Validation schema
const azureSecurityScanSchema = z.object({
  credentialId: z.string().uuid('Invalid credential ID'),
  scanLevel: z.enum(['quick', 'standard', 'deep']).optional().default('standard'),
  regions: z.array(z.string()).optional(),
  // Background job parameters
  scanId: z.string().uuid().optional(),
  backgroundJobId: z.string().uuid().optional(),
  scheduledExecution: z.boolean().optional(),
});

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  // Handle CORS preflight
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }

  // These are hoisted so the outer catch block can reference them for cleanup
  let scanRef: string | undefined;
  let backgroundJobId: string | undefined;

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    const prisma = getPrismaClient();

    logger.info('Starting Azure security scan', { organizationId });

    // Parse and validate request body
    const validation = parseAndValidateBody(azureSecurityScanSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const { credentialId, scanLevel = 'standard', regions, scanId: existingScanId, backgroundJobId: bjId } = validation.data;
    backgroundJobId = bjId;
    scanRef = existingScanId;
    const scanType = `azure-security-${scanLevel}`;

    // Helper to mark background job and scan as failed on early exit
    // scanRef is updated after scan creation to also cover locally-created scans
    const failBackgroundJob = async (errorMsg: string) => {
      if (backgroundJobId) {
        await prisma.backgroundJob.update({
          where: { id: backgroundJobId },
          data: { status: 'failed', completed_at: new Date(), error: errorMsg },
        }).catch(() => {});
      }
      if (scanRef) {
        await prisma.securityScan.update({
          where: { id: scanRef },
          data: { status: 'failed', completed_at: new Date() },
        }).catch(() => {});
      }
    };

    // Update background job to running (only if not already finalized)
    if (backgroundJobId) {
      try {
        const existingJob = await prisma.backgroundJob.findUnique({
          where: { id: backgroundJobId },
          select: { status: true },
        });

        if (existingJob && (existingJob.status === 'failed' || existingJob.status === 'completed')) {
          logger.info('Background job already finalized, skipping update', {
            backgroundJobId,
            status: existingJob.status,
          });
        } else {
          await prisma.backgroundJob.update({
            where: { id: backgroundJobId },
            data: {
              status: 'running',
              started_at: new Date(),
              result: { progress: 0, message: 'Initializing Azure security scan...' },
            },
          });
          logger.info('Background job updated to running', { backgroundJobId });
        }
      } catch (jobErr: any) {
        logger.warn('Failed to update background job to running', { backgroundJobId, error: jobErr.message });
      }
    }

    // Fetch Azure credential
    logger.info('Fetching Azure credential', { credentialId, organizationId });
    
    const credential = await prisma.azureCredential.findFirst({
      where: {
        id: credentialId,
        organization_id: organizationId,
        is_active: true,
      },
    });

    if (!credential) {
      // Debug: check if credential exists at all (without org filter)
      const credentialAny = await prisma.azureCredential.findUnique({
        where: { id: credentialId },
        select: { id: true, organization_id: true, is_active: true },
      });
      
      const debugMsg = credentialAny
        ? `Credential exists but mismatch: org=${credentialAny.organization_id}, active=${credentialAny.is_active}, expected_org=${organizationId}`
        : `Credential ${credentialId} does not exist in database`;
      
      logger.error('Azure credential lookup failed', { credentialId, organizationId, debug: debugMsg });
      
      await failBackgroundJob(`Azure credential not found or inactive. ${debugMsg}`);
      return error('Azure credential not found or inactive', 404);
    }

    // Handle both OAuth and Service Principal credentials
    let spCredentials: any;
    
    if (credential.auth_type === 'oauth') {
      const tokenResult = await getAzureCredentialWithToken(prisma, credentialId, organizationId);
      
      if (!tokenResult.success) {
        await failBackgroundJob(tokenResult.error);
        return error(tokenResult.error, 400);
      }
      
      // For OAuth, create credentials object with access token
      spCredentials = {
        tenantId: resolveAzureTenantId(credential),
        subscriptionId: credential.subscription_id,
        subscriptionName: credential.subscription_name || undefined,
        accessToken: tokenResult.accessToken,
        isOAuth: true,
      };
    } else if (credential.auth_type === 'certificate') {
      const certValidation = await validateCertificateCredentials(credential);
      if (!certValidation.valid) {
        await failBackgroundJob(certValidation.error);
        return error(certValidation.error, 400);
      }
      spCredentials = certValidation.credentials;
    } else {
      const spValidation = await validateServicePrincipalCredentials(credential);
      if (!spValidation.valid) {
        await failBackgroundJob(spValidation.error);
        return error(spValidation.error, 400);
      }
      spCredentials = spValidation.credentials;
    }

    // Use existing scan if this is a background job, otherwise create new
    let scan: any;
    
    if (existingScanId) {
      // Check if scan was already completed or failed (e.g., by cleanup or a previous retry)
      // If so, do NOT reset to running — abort gracefully
      const existingScan = await prisma.securityScan.findUnique({
        where: { id: existingScanId },
        select: { id: true, status: true },
      });

      if (!existingScan) {
        await failBackgroundJob('Scan record not found');
        return error('Scan record not found', 404);
      }

      if (existingScan.status === 'failed' || existingScan.status === 'completed') {
        logger.info('Azure security scan already finalized, skipping retry', {
          scanId: existingScanId,
          status: existingScan.status,
          backgroundJobId,
        });
        return success({
          scanId: existingScanId,
          status: existingScan.status,
          message: `Scan already ${existingScan.status}, not re-executing`,
          skipped: true,
        });
      }

      // Update existing scan to running status
      scan = await prisma.securityScan.update({
        where: { id: existingScanId },
        data: {
          status: 'running',
          started_at: new Date(),
        },
      });
      logger.info('Azure security scan resumed from background job', {
        organizationId,
        scanId: scan.id,
        credentialId,
        backgroundJobId,
      });
      scanRef = scan.id;
    } else {
      // Create new scan record
      scan = await prisma.securityScan.create({
        data: {
          organization_id: organizationId,
          cloud_provider: 'AZURE',
          azure_credential_id: credentialId,
          scan_type: scanType,
          status: 'running',
          scan_config: {
            scanLevel,
            regions: regions || credential.regions,
          },
          started_at: new Date(),
        },
      });
      logger.info('Azure security scan created', {
        organizationId,
        scanId: scan.id,
        credentialId,
        subscriptionId: credential.subscription_id,
      });
      scanRef = scan.id;
    }

    // Create Azure provider and run scan
    let azureProvider: AzureProvider;
    
    if (spCredentials.isOAuth) {
      azureProvider = AzureProvider.withOAuthToken(
        organizationId,
        spCredentials.subscriptionId,
        spCredentials.subscriptionName,
        spCredentials.tenantId,
        spCredentials.accessToken,
        new Date(Date.now() + ONE_HOUR_MS)
      );
    } else {
      azureProvider = new AzureProvider(organizationId, spCredentials);
    }

    const scanConfig: ScanConfig = {
      scanLevel,
      regions: regions || credential.regions,
    };

    // Run the original provider scan (legacy - uses Azure SDK dynamic imports)
    // This is non-fatal: if it fails, we still run the modular scanners
    let providerResult: Awaited<ReturnType<AzureProvider['runSecurityScan']>>;
    let providerScanFailed = false;
    
    try {
      providerResult = await azureProvider.runSecurityScan(scanConfig);
      
      if (providerResult.status === 'failed') {
        const failMsg = providerResult.error || 'Azure provider security scan failed';
        logger.warn('Azure provider scan returned failed status, continuing with modular scanners', {
          scanId: scan.id,
          error: failMsg,
          duration: providerResult.duration,
        });
        providerScanFailed = true;
      }
    } catch (providerErr: any) {
      logger.warn('Azure provider scan threw exception, continuing with modular scanners', {
        scanId: scan.id,
        error: providerErr.message,
      });
      providerResult = {
        scanId: `azure-scan-${Date.now()}`,
        provider: 'AZURE',
        status: 'failed',
        findings: [],
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        duration: 0,
        startedAt: new Date(),
        completedAt: new Date(),
        error: providerErr.message,
      };
      providerScanFailed = true;
    }

    // Run the modular scanners (REST API based - more reliable than SDK dynamic imports)
    // These run regardless of provider scan result
    let moduleScannerFindings: any[] = [];
    let moduleScannerResourcesScanned = 0;
    let moduleScannerError: string | null = null;
    
    try {
      // Get access token - for OAuth we already have it, for SP we need to fetch
      let accessToken: string | null = null;
      
      if (spCredentials.isOAuth) {
        accessToken = spCredentials.accessToken;
      } else {
        accessToken = await azureProvider.getAccessToken();
      }
      
      if (accessToken && credential.subscription_id) {
        // Try to acquire a Microsoft Graph API token for Entra ID scanner
        // Graph API requires a different scope (graph.microsoft.com) than management API
        let graphAccessToken: string | undefined;
        if (!spCredentials.isOAuth && spCredentials.tenantId && spCredentials.clientId && spCredentials.clientSecret) {
          try {
            const graphTokenUrl = getAzureTokenUrl(spCredentials.tenantId);
            const graphParams = new URLSearchParams({
              client_id: spCredentials.clientId,
              client_secret: spCredentials.clientSecret,
              grant_type: 'client_credentials',
              scope: 'https://graph.microsoft.com/.default',
            });
            const graphResp = await fetch(graphTokenUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: graphParams.toString(),
            });
            if (graphResp.ok) {
              const graphData = await graphResp.json() as { access_token: string };
              graphAccessToken = graphData.access_token;
              logger.info('Graph API token acquired for Entra ID scanner');
            } else {
              logger.warn('Failed to acquire Graph API token, Entra ID scanner will be skipped', {
                status: graphResp.status,
              });
            }
          } catch (graphErr: any) {
            logger.warn('Error acquiring Graph API token', { error: graphErr.message });
          }
        }

        const scanContext: AzureScanContext = {
          subscriptionId: credential.subscription_id,
          tenantId: resolveAzureTenantId(credential),
          accessToken,
          organizationId,
          credentialId,
          graphAccessToken,
        };

        const moduleScanResult = await runAllAzureScanners(scanContext);
        moduleScannerFindings = moduleScanResult.findings;
        moduleScannerResourcesScanned = moduleScanResult.totalResourcesScanned;

        logger.info('Module scanners completed', {
          findingsCount: moduleScannerFindings.length,
          resourcesScanned: moduleScannerResourcesScanned,
          durationMs: moduleScanResult.totalDurationMs,
          scannersSucceeded: moduleScanResult.scannersSucceeded,
          scannersFailed: moduleScanResult.scannersFailed,
        });
      } else {
        moduleScannerError = !accessToken 
          ? 'Could not obtain Azure access token for modular scanners'
          : 'Missing subscription_id for modular scanners';
        logger.warn(moduleScannerError, { scanId: scan.id });
      }
    } catch (moduleScanErr: any) {
      moduleScannerError = moduleScanErr.message;
      logger.error('Module scanners failed', {
        scanId: scan.id,
        error: moduleScanErr.message,
        stack: moduleScanErr.stack?.split('\n').slice(0, 3).join('\n'),
      });
    }

    // If BOTH provider scan and modular scanners failed, mark scan as failed
    if (providerScanFailed && moduleScannerFindings.length === 0 && moduleScannerError) {
      const combinedError = `Provider: ${providerResult.error || 'failed'}; Modules: ${moduleScannerError}`;
      logger.error('Both scan engines failed', { scanId: scan.id, error: combinedError });

      await prisma.securityScan.update({
        where: { id: scan.id },
        data: {
          status: 'failed',
          completed_at: new Date(),
          results: JSON.parse(JSON.stringify({
            error: combinedError,
            providerError: providerResult.error,
            moduleScannerError,
            duration: providerResult.duration,
          })),
        },
      });

      await failBackgroundJob(combinedError);
      return error(`Azure security scan failed: ${combinedError}`, 500);
    }

    // Combine findings from both sources (provider scan may have failed)
    const result = providerResult;

    // Store findings - convert to plain JSON objects for Prisma
    // Build NewScanFinding[] for delta sync
    const now = new Date();
    
    const azureFindings: NewScanFinding[] = result.findings.map(finding => {
      const resourceArn = finding.resourceUri || finding.resourceId || '';
      const title = finding.title || finding.description?.substring(0, 200) || 'Azure Security Finding';
      const fp = resourceArn
        ? computeFingerprint(resourceArn, scanType, title)
        : computeFallbackFingerprint(scanType, title, finding.resourceId || '');
      
      return {
        fingerprint: fp,
        title,
        severity: finding.severity,
        description: finding.description,
        resource_id: finding.resourceId,
        resource_arn: finding.resourceUri || '',
        service: finding.service,
        category: finding.category,
        scan_type: scanType,
        region: '',
        compliance: finding.compliance.map(c => `${c.framework}:${c.controlId}`),
        remediation: finding.remediation.description,
        evidence: {},
        risk_vector: '',
        details: JSON.parse(JSON.stringify({
          title: finding.title,
          resourceId: finding.resourceId,
          resourceUri: finding.resourceUri,
          service: finding.service,
          category: finding.category,
          compliance: finding.compliance,
          remediation: finding.remediation,
          evidence: finding.evidence,
        })),
        source: 'azure-security-scan',
      };
    });

    // Add findings from module scanners
    const moduleFindings: NewScanFinding[] = moduleScannerFindings.map(finding => {
      const resourceId = finding.resourceId || '';
      const title = finding.title || finding.description?.substring(0, 200) || 'Azure Module Finding';
      const fp = resourceId
        ? computeFingerprint(resourceId, scanType, title)
        : computeFallbackFingerprint(scanType, title, resourceId);
      
      return {
        fingerprint: fp,
        title,
        severity: finding.severity,
        description: finding.description,
        resource_id: resourceId,
        resource_arn: resourceId,
        service: finding.resourceType?.split('/')[0] || 'Azure',
        category: finding.resourceType?.split('/')[1] || 'General',
        scan_type: scanType,
        region: finding.region || '',
        compliance: finding.complianceFrameworks || [],
        remediation: finding.remediation || '',
        evidence: {},
        risk_vector: '',
        details: JSON.parse(JSON.stringify({
          title: finding.title,
          resourceId: finding.resourceId,
          resourceName: finding.resourceName,
          resourceGroup: finding.resourceGroup,
          region: finding.region,
          remediation: finding.remediation,
          complianceFrameworks: finding.complianceFrameworks,
          metadata: finding.metadata,
        })),
        source: 'azure-module-scanner',
      };
    });

    const allNewFindings = [...azureFindings, ...moduleFindings];

    if (allNewFindings.length > 0) {
      // Fetch existing findings for this org+credential from Azure scans
      const existingFindings = await prisma.finding.findMany({
        where: {
          organization_id: organizationId,
          azure_credential_id: credentialId,
          source: { in: [...AZURE_SCAN_SOURCES] },
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
      const delta = classifyFindings(allNewFindings, existingFindings, now);

      logger.info('Azure delta sync classification', {
        toCreate: delta.toCreate.length,
        toUpdate: delta.toUpdate.length,
        toResolve: delta.toResolve.length,
        expiredSuppressions: delta.expiredSuppressions.length,
      });

      try {
        await prisma.$transaction(async (tx) => {
          // 1. Create new findings
          if (delta.toCreate.length > 0) {
            await tx.finding.createMany({
              data: delta.toCreate.map(f => ({
                organization_id: organizationId,
                cloud_provider: 'AZURE' as const,
                azure_credential_id: credentialId,
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
                source: f.source,
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
              data: { status: 'resolved', resolved_at: now },
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

        logger.info('Azure delta sync completed', {
          created: delta.toCreate.length,
          updated: delta.toUpdate.length,
          resolved: delta.toResolve.length,
        });
      } catch (deltaSyncError) {
        // Fallback to legacy delete+create
        logger.error('Azure delta sync failed, falling back to legacy mode', deltaSyncError as Error);

        await prisma.finding.deleteMany({
          where: {
            organization_id: organizationId,
            azure_credential_id: credentialId,
            source: { in: [...AZURE_SCAN_SOURCES] },
            status: { in: ['pending', 'new'] },
          },
        });

        await prisma.finding.createMany({
          data: allNewFindings.map(f => ({
            organization_id: organizationId,
            cloud_provider: 'AZURE' as const,
            azure_credential_id: credentialId,
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
            source: f.source,
            status: 'new',
            first_seen: now,
            last_seen: now,
            occurrence_count: 1,
            suppressed: false,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Calculate combined summary (single pass over module findings)
    const moduleSeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of moduleScannerFindings) {
      const key = f.severity?.toLowerCase() as keyof typeof moduleSeverityCounts;
      if (key in moduleSeverityCounts) moduleSeverityCounts[key]++;
    }
    const combinedSummary = {
      total: result.summary.total + moduleScannerFindings.length,
      critical: result.summary.critical + moduleSeverityCounts.critical,
      high: result.summary.high + moduleSeverityCounts.high,
      medium: result.summary.medium + moduleSeverityCounts.medium,
      low: result.summary.low + moduleSeverityCounts.low,
      resourcesScanned: ((result.summary as any).resourcesScanned || 0) + moduleScannerResourcesScanned,
    };

    // Update scan record - convert to plain JSON for Prisma
    const finalStatus = providerScanFailed ? 'completed' : result.status;
    await prisma.securityScan.update({
      where: { id: scan.id },
      data: {
        status: finalStatus,
        results: JSON.parse(JSON.stringify({
          summary: combinedSummary,
          duration: result.duration,
          scannersUsed: azureScannerMetadata.map(s => s.name),
          providerScanFailed,
          providerError: providerScanFailed ? (providerResult.error || 'Provider scan failed') : undefined,
        })),
        findings_count: combinedSummary.total,
        critical_count: combinedSummary.critical,
        high_count: combinedSummary.high,
        medium_count: combinedSummary.medium,
        low_count: combinedSummary.low,
        completed_at: new Date(),
      },
    });

    // Update background job to completed
    if (backgroundJobId) {
      try {
        await prisma.backgroundJob.update({
          where: { id: backgroundJobId },
          data: {
            status: 'completed',
            completed_at: new Date(),
            result: {
              progress: 100,
              message: providerScanFailed 
                ? 'Azure security scan completed (modular scanners only, provider scan failed)'
                : 'Azure security scan completed',
              scanId: scan.id,
              findings_count: combinedSummary.total,
              critical_count: combinedSummary.critical,
              high_count: combinedSummary.high,
              duration: result.duration,
              providerScanFailed,
            },
          },
        });
      } catch (jobErr: any) {
        logger.warn('Failed to update background job to completed', { backgroundJobId, error: jobErr.message });
      }
    }

    logger.info('Azure security scan completed', {
      organizationId,
      scanId: scan.id,
      findingsCount: combinedSummary.total,
      duration: result.duration,
      moduleScannerFindings: moduleScannerFindings.length,
    });

    // Audit log
    logAuditAsync({
      organizationId,
      userId: user.sub,
      action: 'SECURITY_SCAN_COMPLETE',
      resourceType: 'security_scan',
      resourceId: scan.id,
      details: {
        cloud_provider: 'AZURE',
        subscription_id: credential.subscription_id,
        findings_count: combinedSummary.total,
        critical_count: combinedSummary.critical,
        high_count: combinedSummary.high,
        duration: result.duration,
      },
      ipAddress: getIpFromEvent(event),
      userAgent: getUserAgentFromEvent(event),
    });

    return success({
      scanId: scan.id,
      status: finalStatus,
      summary: combinedSummary,
      duration: result.duration,
      subscriptionId: credential.subscription_id,
      subscriptionName: credential.subscription_name,
      scannersUsed: azureScannerMetadata,
      providerScanFailed,
    });
  } catch (err: any) {
    logger.error('Error running Azure security scan', { 
      error: err.message, 
      stack: err.stack?.split('\n').slice(0, 5).join('\n'),
      name: err.name,
      code: err.code,
    });

    // Try to mark background job and scan as failed using closure variables
    try {
      const db = getPrismaClient();
      if (backgroundJobId) {
        await db.backgroundJob.update({
          where: { id: backgroundJobId },
          data: {
            status: 'failed',
            completed_at: new Date(),
            error: err.message || 'Unknown error',
            result: { progress: 0, error: err.message },
          },
        }).catch(() => {});
      }
      if (scanRef) {
        await db.securityScan.update({
          where: { id: scanRef },
          data: { status: 'failed', completed_at: new Date() },
        }).catch(() => {});
      }
    } catch (cleanupErr) {
      logger.error('Failed to update job/scan status on error', { error: (cleanupErr as Error).message });
    }

    return error('Failed to run Azure security scan', 500);
  }
}
