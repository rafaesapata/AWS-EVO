/**
 * Start Azure Security Scan Handler
 * 
 * Initiates an asynchronous security scan on an Azure subscription.
 * Creates a background job and invokes azure-security-scan Lambda asynchronously.
 * 
 * Includes stuck job detection: if a pending/running job is older than 10 minutes,
 * it's marked as failed and a new scan is allowed.
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
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const TEN_MINUTES = 10 * 60 * 1000;

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

    const validation = parseAndValidateBody(startScanSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const { credentialId, scanLevel, regions } = validation.data;

    // Verify credential exists and belongs to organization
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

    // Check for existing running/pending scan for this credential and handle stuck jobs
    const existingJob = await prisma.backgroundJob.findFirst({
      where: {
        organization_id: organizationId,
        job_type: 'azure-security-scan',
        status: { in: ['pending', 'running'] },
        payload: { path: ['credentialId'], equals: credentialId },
      },
    });

    if (existingJob) {
      const jobAge = Date.now() - new Date(existingJob.created_at).getTime();

      if (jobAge > TEN_MINUTES) {
        // Mark stuck job as failed
        logger.info('Marking stuck Azure scan job as failed', {
          jobId: existingJob.id,
          ageMinutes: Math.round(jobAge / 60000),
        });
        await prisma.backgroundJob.update({
          where: { id: existingJob.id },
          data: {
            status: 'failed',
            completed_at: new Date(),
            error: 'Job timed out after 10 minutes',
            result: { progress: 0, error: 'Job timed out', timed_out: true },
          },
        });
        // Also mark the associated scan as failed
        const stuckPayload = existingJob.payload as any;
        if (stuckPayload?.scanId) {
          await prisma.securityScan.update({
            where: { id: stuckPayload.scanId },
            data: { status: 'failed', completed_at: new Date() },
          }).catch(() => {}); // Ignore if scan doesn't exist
        }
      } else {
        return success({
          job_id: existingJob.id,
          status: existingJob.status,
          message: 'An Azure security scan is already in progress',
          already_running: true,
        });
      }
    }

    // Create scan record
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

    // Create background job
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

    // Invoke azure-security-scan Lambda asynchronously (fire and forget)
    const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const prefix = process.env.LAMBDA_PREFIX || `evo-uds-v3-${process.env.ENVIRONMENT || 'sandbox'}`;

    const lambdaPayload = {
      body: JSON.stringify({
        credentialId,
        scanLevel,
        regions: regions || credential.regions,
        scanId: scan.id,
        backgroundJobId: job.id,
      }),
      requestContext: {
        http: { method: 'POST' },
        authorizer: event.requestContext?.authorizer,
      },
      headers: {
        authorization: event.headers?.authorization || event.headers?.Authorization || '',
        'content-type': 'application/json',
      },
    };

    try {
      await lambdaClient.send(new InvokeCommand({
        FunctionName: `${prefix}-azure-security-scan`,
        InvocationType: 'Event', // Async - fire and forget
        Payload: Buffer.from(JSON.stringify(lambdaPayload)),
      }));
      logger.info('Invoked azure-security-scan Lambda async', {
        jobId: job.id,
        scanId: scan.id,
        functionName: `${prefix}-azure-security-scan`,
      });
    } catch (invokeErr: any) {
      logger.error('Failed to invoke azure-security-scan Lambda', { error: invokeErr.message });
      // Mark job and scan as failed since we couldn't invoke
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: `Failed to invoke scan: ${invokeErr.message}`,
          completed_at: new Date(),
        },
      });
      await prisma.securityScan.update({
        where: { id: scan.id },
        data: { status: 'failed', completed_at: new Date() },
      });
      return error('Failed to start Azure security scan. Please try again.', 500);
    }

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
      job_id: job.id,
      status: 'pending',
      message: 'Azure security scan initiated. Check status using the scan ID.',
      subscriptionId: credential.subscription_id,
      subscriptionName: credential.subscription_name,
    });
  } catch (err: any) {
    logger.error('Error starting Azure security scan', { error: err.message });
    return error('Failed to start Azure security scan', 500);
  }
}
