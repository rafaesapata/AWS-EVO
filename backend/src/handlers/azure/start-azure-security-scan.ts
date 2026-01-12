/**
 * Start Azure Security Scan Handler
 * 
 * Initiates an asynchronous security scan on an Azure subscription.
 * Creates a background job and returns immediately.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { z } from 'zod';

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
    const organizationId = getOrganizationId(user);
    const prisma = getPrismaClient();

    logger.info('Starting Azure security scan', { organizationId });

    let body: any;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return error('Invalid JSON in request body', 400);
    }

    const validation = startScanSchema.safeParse(body);
    if (!validation.success) {
      return error(`Validation error: ${validation.error.errors.map(e => e.message).join(', ')}`, 400);
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
        aws_account_id: credentialId, // Reusing for Azure credential ID
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
    await prisma.backgroundJob.create({
      data: {
        organization_id: organizationId,
        job_type: 'azure-security-scan',
        job_name: `Azure Security Scan - ${credential.subscription_name || credential.subscription_id}`,
        parameters: {
          scanId: scan.id,
          credentialId,
          scanLevel,
          regions: regions || credential.regions,
        },
        status: 'pending',
      },
    });

    logger.info('Azure security scan initiated', {
      organizationId,
      scanId: scan.id,
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
