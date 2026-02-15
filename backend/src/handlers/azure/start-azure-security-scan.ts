/**
 * Start Azure Security Scan Handler
 * 
 * Initiates an asynchronous security scan on an Azure subscription.
 * Creates a background job and invokes azure-security-scan Lambda asynchronously.
 * 
 * Includes stuck job detection: pending jobs older than 5 minutes or running jobs
 * older than 10 minutes are marked as failed. Also detects orphaned scans
 * (scan exists but background job was already cleaned up).
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
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const TEN_MINUTES = 10 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;

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
      // Pending jobs that never transitioned to running → likely Lambda never started (5min threshold)
      // Running jobs → give more time (10min threshold)
      const stuckThreshold = existingJob.status === 'pending' ? FIVE_MINUTES : TEN_MINUTES;

      if (jobAge > stuckThreshold) {
        // Mark stuck job as failed
        logger.info('Marking stuck Azure scan job as failed', {
          jobId: existingJob.id,
          jobStatus: existingJob.status,
          ageMinutes: Math.round(jobAge / 60000),
          thresholdMinutes: Math.round(stuckThreshold / 60000),
        });
        await prisma.backgroundJob.update({
          where: { id: existingJob.id },
          data: {
            status: 'failed',
            completed_at: new Date(),
            error: `Job stuck in '${existingJob.status}' for ${Math.round(jobAge / 60000)} minutes`,
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

    // Also check for orphaned scans (scan exists but background job was already cleaned up)
    const orphanedScan = await prisma.securityScan.findFirst({
      where: {
        organization_id: organizationId,
        cloud_provider: 'AZURE',
        azure_credential_id: credentialId,
        status: { in: ['pending', 'running'] },
        created_at: { lt: new Date(Date.now() - FIVE_MINUTES) },
      },
    });

    if (orphanedScan) {
      logger.info('Cleaning up orphaned Azure security scan', {
        scanId: orphanedScan.id,
        status: orphanedScan.status,
        createdAt: orphanedScan.created_at,
      });
      await prisma.securityScan.update({
        where: { id: orphanedScan.id },
        data: {
          status: 'failed',
          completed_at: new Date(),
          results: {
            error: 'Scan was orphaned (no active background job)',
            cleanup_type: 'orphan_detection',
          },
        },
      }).catch(() => {});
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

    // Create background job — mark as 'running' immediately since we invoke
    // the Lambda directly below. This prevents process-background-jobs from
    // picking up this job and invoking a duplicate Lambda execution.
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
        status: 'running',
        started_at: new Date(),
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
