/**
 * Azure Security Scan Handler
 * 
 * Runs a security scan on an Azure subscription and stores findings.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { AzureProvider } from '../../lib/cloud-provider/azure-provider.js';
import type { ScanConfig } from '../../types/cloud.js';
import { z } from 'zod';

// Validation schema
const azureSecurityScanSchema = z.object({
  credentialId: z.string().uuid('Invalid credential ID'),
  scanLevel: z.enum(['quick', 'standard', 'deep']).optional().default('standard'),
  regions: z.array(z.string()).optional(),
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
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    const prisma = getPrismaClient();

    logger.info('Starting Azure security scan', { organizationId });

    // Parse and validate request body
    let body: any;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return error('Invalid JSON in request body', 400);
    }

    const validation = azureSecurityScanSchema.safeParse(body);
    if (!validation.success) {
      return error(`Validation error: ${validation.error.errors.map(e => e.message).join(', ')}`, 400);
    }

    const { credentialId, scanLevel, regions } = validation.data;

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

    // Create scan record
    const scan = await prisma.securityScan.create({
      data: {
        organization_id: organizationId,
        aws_account_id: credentialId, // Reusing field for Azure credential ID
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

    // Create Azure provider and run scan
    const azureProvider = new AzureProvider(organizationId, {
      tenantId: credential.tenant_id,
      clientId: credential.client_id,
      clientSecret: credential.client_secret,
      subscriptionId: credential.subscription_id,
      subscriptionName: credential.subscription_name || undefined,
    });

    const scanConfig: ScanConfig = {
      scanLevel,
      regions: regions || credential.regions,
    };

    const result = await azureProvider.runSecurityScan(scanConfig);

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

    if (findingsToCreate.length > 0) {
      await prisma.finding.createMany({
        data: findingsToCreate,
      });
    }

    // Update scan record - convert to plain JSON for Prisma
    await prisma.securityScan.update({
      where: { id: scan.id },
      data: {
        status: result.status,
        results: JSON.parse(JSON.stringify({
          summary: result.summary,
          duration: result.duration,
        })),
        findings_count: result.summary.total,
        critical_count: result.summary.critical,
        high_count: result.summary.high,
        medium_count: result.summary.medium,
        low_count: result.summary.low,
        completed_at: new Date(),
      },
    });

    logger.info('Azure security scan completed', {
      organizationId,
      scanId: scan.id,
      findingsCount: result.summary.total,
      duration: result.duration,
    });

    return success({
      scanId: scan.id,
      status: result.status,
      summary: result.summary,
      duration: result.duration,
      subscriptionId: credential.subscription_id,
      subscriptionName: credential.subscription_name,
    });
  } catch (err: any) {
    logger.error('Error running Azure security scan', { error: err.message });
    return error(err.message || 'Failed to run Azure security scan', 500);
  }
}
