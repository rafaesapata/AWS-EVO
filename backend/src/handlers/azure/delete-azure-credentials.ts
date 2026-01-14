/**
 * Delete Azure Credentials Handler
 * 
 * Deletes or deactivates Azure credentials for the current organization.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { z } from 'zod';

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
    let body: any;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return error('Invalid JSON in request body', 400);
    }

    const validation = deleteAzureCredentialsSchema.safeParse(body);
    if (!validation.success) {
      return error(`Validation error: ${validation.error.errors.map(e => e.message).join(', ')}`, 400);
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

      return success({
        deactivated: true,
        credentialId,
        subscriptionId: credential.subscription_id,
      });
    }
  } catch (err: any) {
    logger.error('Error deleting Azure credentials', { error: err.message });
    return error(err.message || 'Failed to delete Azure credentials', 500);
  }
}
