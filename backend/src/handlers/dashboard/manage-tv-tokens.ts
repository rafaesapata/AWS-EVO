import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logger.js';
import { getPrismaClient } from '../../lib/database.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getOrigin } from '../../lib/middleware.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { manageTvTokensSchema } from '../../lib/schemas.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { isOrganizationInDemoMode, generateDemoTvTokens } from '../../lib/demo-data-service.js';
import * as crypto from 'crypto';

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
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    if (!organizationId) {
      return error('Organization not found', 401, undefined, origin);
    }

    const prisma = getPrismaClient();
    
    // Validate request body
    const validation = parseAndValidateBody(manageTvTokensSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    const { action, tokenId, name, expirationDays, isActive } = validation.data;

    // Demo mode check
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    if (isDemo === true) {
      logger.info('Demo mode: handling TV tokens action', { action, organizationId });
      if (action === 'list') {
        return success({ tokens: generateDemoTvTokens(), _isDemo: true }, 200, origin);
      }
      // For create/toggle/delete in demo mode, return success without modifying DB
      return success({ success: true, _isDemo: true }, 200, origin);
    }

    switch (action) {
      case 'list': {
        const tokens = await prisma.tvDisplayToken.findMany({
          where: { organization_id: organizationId },
          orderBy: { created_at: 'desc' }
        });
        return success({ tokens }, 200, origin);
      }

      case 'create': {
        if (!name) {
          return badRequest('Name is required', undefined, origin);
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (expirationDays || 30));

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
