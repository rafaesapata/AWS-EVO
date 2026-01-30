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
import { logger } from '../../lib/logging.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { AzureProvider } from '../../lib/cloud-provider/azure-provider.js';
import { validateServicePrincipalCredentials } from '../../lib/azure-helpers.js';
import { runAllAzureScanners, azureScannerMetadata } from '../../lib/security-engine/scanners/azure/index.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import type { AzureScanContext } from '../../lib/security-engine/scanners/azure/types.js';
import type { ScanConfig } from '../../types/cloud.js';
import { z } from 'zod';

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

  try {
    // Check if this is a background job execution
    const isBackgroundJob = event.requestContext?.authorizer?.claims?.sub === 'background-job-processor';
    
    let organizationId: string;
    
    if (isBackgroundJob) {
      // For background jobs, get org ID from claims
      organizationId = event.requestContext?.authorizer?.claims?.['custom:organization_id'] || '';
      if (!organizationId) {
        logger.error('Background job missing organization_id');
        return error('Missing organization_id for background job', 400);
      }
      logger.info('Processing Azure security scan as background job', { organizationId });
    } else {
      const user = getUserFromEvent(event);
      organizationId = getOrganizationIdWithImpersonation(event, user);
    }
    
    const prisma = getPrismaClient();

    logger.info('Starting Azure security scan', { organizationId, isBackgroundJob });

    // Parse and validate request body
    const validation = parseAndValidateBody(azureSecurityScanSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const { credentialId, scanLevel = 'standard', regions, scanId: existingScanId, backgroundJobId } = validation.data;

    // Fetch Azure credential
    const credential = await prisma.azureCredential.findFirst({
      where: {
        id: credentialId,
        organization_id: organizationId,
        is_active: true,
      },
    });

    if (!credential) {
      return error('Azure credential not found or inactive', 404);
    }

    // Handle both OAuth and Service Principal credentials
    let spCredentials: any;
    
    if (credential.auth_type === 'oauth') {
      const { getAzureCredentialWithToken } = await import('../../lib/azure-helpers.js');
      const tokenResult = await getAzureCredentialWithToken(prisma, credentialId, organizationId);
      
      if (!tokenResult.success) {
        return error(tokenResult.error, 400);
      }
      
      // For OAuth, create credentials object with access token
      spCredentials = {
        tenantId: credential.oauth_tenant_id || credential.tenant_id || '',
        subscriptionId: credential.subscription_id,
        subscriptionName: credential.subscription_name || undefined,
        accessToken: tokenResult.accessToken,
        isOAuth: true,
      };
    } else {
      const spValidation = validateServicePrincipalCredentials(credential);
      if (!spValidation.valid) {
        return error(spValidation.error, 400);
      }
      spCredentials = spValidation.credentials;
    }

    // Use existing scan if this is a background job, otherwise create new
    let scan: any;
    
    if (existingScanId) {
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
    } else {
      // Create new scan record
      scan = await prisma.securityScan.create({
        data: {
          organization_id: organizationId,
          cloud_provider: 'AZURE',
          azure_credential_id: credentialId,
          scan_type: `azure-security-${scanLevel}`,
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
        new Date(Date.now() + 3600 * 1000)
      );
    } else {
      azureProvider = new AzureProvider(organizationId, spCredentials);
    }

    const scanConfig: ScanConfig = {
      scanLevel,
      regions: regions || credential.regions,
    };

    // Run the original provider scan
    const providerResult = await azureProvider.runSecurityScan(scanConfig);

    // Also run the new modular scanners if we have an access token
    let moduleScannerFindings: any[] = [];
    let moduleScannerResourcesScanned = 0;
    
    try {
      // Get access token for Azure Management API
      const accessToken = await azureProvider.getAccessToken();
      
      if (accessToken && credential.subscription_id) {
        const scanContext: AzureScanContext = {
          subscriptionId: credential.subscription_id,
          tenantId: credential.tenant_id || '',
          accessToken,
          organizationId,
          credentialId,
        };

        const moduleScanResult = await runAllAzureScanners(scanContext);
        moduleScannerFindings = moduleScanResult.findings;
        moduleScannerResourcesScanned = moduleScanResult.totalResourcesScanned;

        logger.info('Module scanners completed', {
          findingsCount: moduleScannerFindings.length,
          resourcesScanned: moduleScannerResourcesScanned,
          durationMs: moduleScanResult.totalDurationMs,
        });
      }
    } catch (moduleScanErr: any) {
      logger.warn('Module scanners failed, continuing with provider scan only', {
        error: moduleScanErr.message,
      });
    }

    // Combine findings from both sources
    const result = providerResult;

    // Store findings - convert to plain JSON objects for Prisma
    const findingsToCreate = result.findings.map(finding => ({
      organization_id: organizationId,
      cloud_provider: 'AZURE' as const,
      azure_credential_id: credentialId,
      severity: finding.severity,
      description: finding.description,
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
      resource_id: finding.resourceId,
      resource_arn: finding.resourceUri,
      service: finding.service,
      category: finding.category,
      compliance: finding.compliance.map(c => `${c.framework}:${c.controlId}`),
      remediation: finding.remediation.description,
      status: 'pending',
      source: 'azure-security-scan',
      scan_type: `azure-security-${scanLevel}`,
    }));

    // Add findings from module scanners
    const moduleFindingsToCreate = moduleScannerFindings.map(finding => ({
      organization_id: organizationId,
      cloud_provider: 'AZURE' as const,
      azure_credential_id: credentialId,
      severity: finding.severity,
      description: finding.description,
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
      resource_id: finding.resourceId,
      resource_arn: finding.resourceId,
      service: finding.resourceType?.split('/')[0] || 'Azure',
      category: finding.resourceType?.split('/')[1] || 'General',
      compliance: finding.complianceFrameworks || [],
      remediation: finding.remediation || '',
      status: 'pending',
      source: 'azure-module-scanner',
      scan_type: `azure-security-${scanLevel}`,
    }));

    const allFindings = [...findingsToCreate, ...moduleFindingsToCreate];

    if (allFindings.length > 0) {
      // Delete old pending findings from Azure scans for this credential
      // This prevents accumulating duplicate findings across scans
      const deletedCount = await prisma.finding.deleteMany({
        where: {
          organization_id: organizationId,
          azure_credential_id: credentialId,
          source: { in: ['azure-security-scan', 'azure-module-scanner'] },
          status: 'pending',
        },
      });
      logger.info('Deleted old pending Azure findings', { deletedCount: deletedCount.count });

      await prisma.finding.createMany({
        data: allFindings,
      });
    }

    // Calculate combined summary
    const combinedSummary = {
      total: result.summary.total + moduleScannerFindings.length,
      critical: result.summary.critical + moduleScannerFindings.filter(f => f.severity === 'CRITICAL').length,
      high: result.summary.high + moduleScannerFindings.filter(f => f.severity === 'HIGH').length,
      medium: result.summary.medium + moduleScannerFindings.filter(f => f.severity === 'MEDIUM').length,
      low: result.summary.low + moduleScannerFindings.filter(f => f.severity === 'LOW').length,
      resourcesScanned: (result.summary as any).resourcesScanned || 0 + moduleScannerResourcesScanned,
    };

    // Update scan record - convert to plain JSON for Prisma
    await prisma.securityScan.update({
      where: { id: scan.id },
      data: {
        status: result.status,
        results: JSON.parse(JSON.stringify({
          summary: combinedSummary,
          duration: result.duration,
          scannersUsed: azureScannerMetadata.map(s => s.name),
        })),
        findings_count: combinedSummary.total,
        critical_count: combinedSummary.critical,
        high_count: combinedSummary.high,
        medium_count: combinedSummary.medium,
        low_count: combinedSummary.low,
        completed_at: new Date(),
      },
    });

    logger.info('Azure security scan completed', {
      organizationId,
      scanId: scan.id,
      findingsCount: combinedSummary.total,
      duration: result.duration,
      moduleScannerFindings: moduleScannerFindings.length,
    });

    return success({
      scanId: scan.id,
      status: result.status,
      summary: combinedSummary,
      duration: result.duration,
      subscriptionId: credential.subscription_id,
      subscriptionName: credential.subscription_name,
      scannersUsed: azureScannerMetadata,
    });
  } catch (err: any) {
    logger.error('Error running Azure security scan', { error: err.message });
    return error(err.message || 'Failed to run Azure security scan', 500);
  }
}
