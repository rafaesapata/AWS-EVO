/**
 * Start Azure Security Scan Handler
 * 
 * Initiates an asynchronous security scan on an Azure subscription.
 * Creates a background job and returns immediately.
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
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';

const startScanSchema = z.object({
  credentialId: z.string().uuid('Invalid credential ID'),
  scanLevel: z.enum(['quick', 'standard', 'deep']).optional().default('standard'),
  regions: z.array(z.string()).optional(),
});

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    logger.info('Starting Azure security scan', { organizationId });

    // Parse and validate request body
    const validation = parseAndValidateBody(startScanSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const { credentialId, scanLevel, regions } = validation.data;


    // Verify credential exists and belongs to organization
    // Note: azureCredential model exists in schema but Prisma client needs regeneration
    const credential = await (prisma as any).azureCredential.findFirst({
      where: {
        id: credentialId,
        organization_id: organizationId,
        is_active: true,
      },
    });

    if (!credential) {
      return error('Azure credential not found or inactive', 404);
    }

    // Create scan record with pending status
    // Note: cloud_provider and azure_credential_id fields added in migration
    const scan = await prisma.securityScan.create({
      data: {
        organization_id: organizationId,
        cloud_provider: 'AZURE',
        azure_credential_id: credentialId,
        scan_type: `azure-security-${scanLevel}`,
        status: 'pending',
        scan_config: {
          scanLevel,
          regions: regions || credential.regions,
          async: true,
          cloudProvider: 'AZURE',
          azureCredentialId: credentialId,
        },
      },
    });

    // Create background job for async processing
    const job = await prisma.backgroundJob.create({
      data: {
        organization_id: organizationId,
        job_type: 'azure-security-scan',
        payload: {
          jobName: `Azure Security Scan - ${credential.subscription_name || credential.subscription_id}`,
          scanId: scan.id,
          credentialId,
          scanLevel,
          regions: regions || credential.regions,
        },
        status: 'pending',
      },
    });

    // Audit log
    logAuditAsync({
      organizationId,
      userId: user.sub,
      action: 'SECURITY_SCAN_START',
      resourceType: 'security_scan',
      resourceId: scan.id,
      details: {
        scan_level: scanLevel,
        cloud_provider: 'AZURE',
        subscription_id: credential.subscription_id,
        credential_id: credentialId,
        job_id: job.id,
      },
      ipAddress: getIpFromEvent(event),
      userAgent: getUserAgentFromEvent(event),
    });

    logger.info('Azure security scan initiated', {
      organizationId,
      scanId: scan.id,
      jobId: job.id,
      credentialId,
      subscriptionId: credential.subscription_id,
    });

    return success({
      scanId: scan.id,
      status: 'pending',
      message: 'Azure security scan initiated. Check status using the scan ID.',
      subscriptionId: credential.subscription_id,
      subscriptionName: credential.subscription_name,
    });
  } catch (err: any) {
    logger.error('Error starting Azure security scan', { error: err.message });
    return error(err.message || 'Failed to start Azure security scan', 500);
  }
}
