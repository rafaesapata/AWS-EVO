import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { getPrismaClient } from '../../lib/database.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getOrigin } from '../../lib/middleware.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import * as crypto from 'crypto';

interface ManageTokensRequest {
  action: 'list' | 'create' | 'toggle' | 'delete';
  tokenId?: string;
  name?: string;
  expirationDays?: number;
  isActive?: boolean;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    if (!organizationId) {
      return error('Organization not found', 401, undefined, origin);
    }

    const prisma = getPrismaClient();
    const body: ManageTokensRequest = JSON.parse(event.body || '{}');
    const { action } = body;

    switch (action) {
      case 'list': {
        const tokens = await prisma.tvDisplayToken.findMany({
          where: { organization_id: organizationId },
          orderBy: { created_at: 'desc' }
        });
        return success({ tokens }, 200, origin);
      }

      case 'create': {
        const { name, expirationDays = 30 } = body;
        if (!name) {
          return badRequest('Name is required', undefined, origin);
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expirationDays);

        const newToken = await prisma.tvDisplayToken.create({
          data: {
            token,
            organization_id: organizationId,
            expires_at: expiresAt,
            is_active: true
          }
        });

        logger.info('TV token created', { tokenId: newToken.id, organizationId });
        return success({ success: true, token: newToken }, 200, origin);
      }

      case 'toggle': {
        const { tokenId, isActive } = body;
        if (!tokenId) {
          return badRequest('Token ID is required', undefined, origin);
        }

        // Verify token belongs to organization
        const existingToken = await prisma.tvDisplayToken.findFirst({
          where: { id: tokenId, organization_id: organizationId }
        });

        if (!existingToken) {
          return error('Token not found', 404, undefined, origin);
        }

        const updatedToken = await prisma.tvDisplayToken.update({
          where: { id: tokenId },
          data: { is_active: isActive }
        });

        logger.info('TV token toggled', { tokenId, isActive, organizationId });
        return success({ success: true, token: updatedToken }, 200, origin);
      }

      case 'delete': {
        const { tokenId } = body;
        if (!tokenId) {
          return badRequest('Token ID is required', undefined, origin);
        }

        // Verify token belongs to organization
        const tokenToDelete = await prisma.tvDisplayToken.findFirst({
          where: { id: tokenId, organization_id: organizationId }
        });

        if (!tokenToDelete) {
          return error('Token not found', 404, undefined, origin);
        }

        await prisma.tvDisplayToken.delete({
          where: { id: tokenId }
        });

        logger.info('TV token deleted', { tokenId, organizationId });
        return success({ success: true }, 200, origin);
      }

      default:
        return badRequest('Invalid action', undefined, origin);
    }
  } catch (err) {
    logger.error('Manage TV tokens error:', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
