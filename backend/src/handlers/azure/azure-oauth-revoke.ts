/**
 * Azure OAuth Revoke Handler
 * 
 * Revokes OAuth credentials by deleting stored tokens and stopping scheduled scans.
 * Returns the Azure portal URL for the user to manually revoke app permissions.
 * 
 * @endpoint POST /api/functions/azure-oauth-revoke
 * @auth Required (Cognito)
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
import { z } from 'zod';
import { parseAndValidateBody } from '../../lib/validation.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import { ensureNotDemoMode } from '../../lib/demo-data-service.js';

// Validation schema
const revokeSchema = z.object({
  credentialId: z.string().uuid('Invalid credential ID'),
});

// Azure portal URL for revoking app permissions
const AZURE_REVOKE_URL = 'https://myapps.microsoft.com';

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
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const userId = user.sub;
    const prisma = getPrismaClient();

    // Parse and validate request body
    const validation = parseAndValidateBody(revokeSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const { credentialId } = validation.data;

    logger.info('Revoking Azure OAuth credential', {
      organizationId,
      userId,
      credentialId,
    });

    // SECURITY: Block write operations in demo mode
    const demoCheck = await ensureNotDemoMode(prisma, organizationId);
    if (demoCheck.blocked) return demoCheck.response;

    // Fetch credential to verify ownership and type
    const credential = await prisma.azureCredential.findFirst({
      where: {
        id: credentialId,
        organization_id: organizationId,
      },
    });

    if (!credential) {
      return error('Azure credential not found', 404);
    }

    // Verify this is an OAuth credential
    if (credential.auth_type !== 'oauth') {
      return error('This credential does not use OAuth authentication. Use delete-azure-credentials instead.', 400);
    }

    // Stop any scheduled scans for this credential
    const stoppedScans = await prisma.scanSchedule.updateMany({
      where: {
        organization_id: organizationId,
        azure_credential_id: credentialId,
        is_active: true,
      },
      data: {
        is_active: false,
      },
    });

    logger.info('Stopped scheduled scans', {
      credentialId,
      stoppedCount: stoppedScans.count,
    });

    // Delete the credential (this will cascade delete related data)
    await prisma.azureCredential.delete({
      where: { id: credentialId },
    });

    // Log the disconnection event for audit
    try {
      await prisma.communicationLog.create({
        data: {
          organization_id: organizationId,
          channel: 'audit',
          recipient: userId,
          subject: 'Azure OAuth Disconnected',
          message: `Azure subscription ${credential.subscription_id} (${credential.subscription_name || 'unnamed'}) was disconnected by user.`,
          status: 'sent',
          metadata: {
            action: 'azure_oauth_revoke',
            credential_id: credentialId,
            subscription_id: credential.subscription_id,
            subscription_name: credential.subscription_name,
            user_email: credential.oauth_user_email,
            tenant_id: credential.oauth_tenant_id,
          },
        },
      });
    } catch (auditErr) {
      // Don't fail the revoke if audit logging fails
      logger.warn('Failed to log audit event', { error: (auditErr as Error).message });
    }

    // Audit log
    logAuditAsync({
      organizationId,
      userId,
      action: 'CREDENTIAL_DELETE',
      resourceType: 'azure_credential',
      resourceId: credentialId,
      details: {
        subscription_id: credential.subscription_id,
        auth_type: 'oauth',
        revoked: true,
        stopped_scans: stoppedScans.count,
      },
      ipAddress: getIpFromEvent(event),
      userAgent: getUserAgentFromEvent(event),
    });

    logger.info('Azure OAuth credential revoked successfully', {
      organizationId,
      userId,
      credentialId,
      subscriptionId: credential.subscription_id,
    });

    return success({
      success: true,
      message: 'Azure connection has been removed.',
      revokeUrl: AZURE_REVOKE_URL,
      instructions: 'To fully revoke access, visit the Azure portal and remove the EVO Platform app from your authorized applications.',
    });
  } catch (err: any) {
    logger.error('Error revoking Azure OAuth credential', {
      error: err.message,
      stack: err.stack,
    });
    return error('Failed to revoke Azure credential', 500);
  }
}
