/**
 * Delete Azure Credentials Handler
 * 
 * Deletes or deactivates Azure credentials for the current organization.
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
import { z } from 'zod';
import { parseAndValidateBody } from '../../lib/validation.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';

// Validation schema
const deleteAzureCredentialsSchema = z.object({
  credentialId: z.string().uuid('Invalid credential ID'),
  hardDelete: z.boolean().optional().default(false),
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
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    logger.info('Deleting Azure credentials', { organizationId });

    // Parse and validate request body
    const validation = parseAndValidateBody(deleteAzureCredentialsSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const { credentialId, hardDelete } = validation.data;

    // Verify credential exists and belongs to organization
    const credential = await prisma.azureCredential.findFirst({
      where: {
        id: credentialId,
        organization_id: organizationId,
      },
    });

    if (!credential) {
      return error('Azure credential not found', 404);
    }

    if (hardDelete) {
      // Hard delete - remove from database
      await prisma.azureCredential.delete({
        where: { id: credentialId },
      });

      logger.info('Azure credentials hard deleted', {
        organizationId,
        credentialId,
        subscriptionId: credential.subscription_id,
      });

      logAuditAsync({
        organizationId,
        userId: user.sub,
        action: 'CREDENTIAL_DELETE',
        resourceType: 'azure_credential',
        resourceId: credentialId,
        details: {
          subscription_id: credential.subscription_id,
          hard_delete: true,
        },
        ipAddress: getIpFromEvent(event),
        userAgent: getUserAgentFromEvent(event),
      });

      return success({
        deleted: true,
        credentialId,
        subscriptionId: credential.subscription_id,
      });
    } else {
      // Soft delete - deactivate
      await prisma.azureCredential.update({
        where: { id: credentialId },
        data: {
          is_active: false,
          updated_at: new Date(),
        },
      });

      logger.info('Azure credentials deactivated', {
        organizationId,
        credentialId,
        subscriptionId: credential.subscription_id,
      });

      logAuditAsync({
        organizationId,
        userId: user.sub,
        action: 'CREDENTIAL_DELETE',
        resourceType: 'azure_credential',
        resourceId: credentialId,
        details: {
          subscription_id: credential.subscription_id,
          hard_delete: false,
          deactivated: true,
        },
        ipAddress: getIpFromEvent(event),
        userAgent: getUserAgentFromEvent(event),
      });

      return success({
        deactivated: true,
        credentialId,
        subscriptionId: credential.subscription_id,
      });
    }
  } catch (err: any) {
    logger.error('Error deleting Azure credentials', { error: err.message });
    return error('Failed to delete Azure credentials', 500);
  }
}
