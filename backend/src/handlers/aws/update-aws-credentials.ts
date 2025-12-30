/**
 * Lambda handler para atualizar credenciais AWS
 * Permite desativar contas e atualizar nome/regiões
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { parseEventBody } from '../../lib/request-parser.js';

interface UpdateCredentialsRequest {
  id: string;
  account_name?: string;
  regions?: string[];
  is_active?: boolean;
}

/**
 * Get origin from event for CORS headers
 */
function getOriginFromEvent(event: AuthorizedEvent): string {
  const headers = event.headers || {};
  return headers['origin'] || headers['Origin'] || '*';
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOriginFromEvent(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  let organizationId: string;
  let userId: string;

  try {
    const user = getUserFromEvent(event);
    userId = user.sub || user.id || 'unknown';
    organizationId = getOrganizationId(user);
  } catch (authError: any) {
    logger.error('Authentication error', authError);
    return error('Authentication failed: ' + (authError.message || 'Unknown error'), 401, undefined, origin);
  }
  
  logger.info('Update AWS credentials started', { 
    organizationId,
    userId,
    requestId: context.awsRequestId 
  });
  
  try {
    const body = parseEventBody<UpdateCredentialsRequest>(event, {} as UpdateCredentialsRequest, 'update-aws-credentials');
    
    // Validate required fields
    if (!body.id) {
      return badRequest('Missing required field: id', undefined, origin);
    }
    
    const prisma = getPrismaClient();
    
    // CRITICAL: Verify credential belongs to user's organization (multi-tenancy)
    const existingCred = await prisma.awsCredential.findFirst({
      where: {
        id: body.id,
        organization_id: organizationId,
      },
    });
    
    if (!existingCred) {
      logger.warn('AWS credential not found or access denied', { 
        credentialId: body.id,
        organizationId 
      });
      return error('Credential not found', 404, undefined, origin);
    }
    
    // Build update data
    const updateData: Record<string, any> = {
      updated_at: new Date(),
    };
    
    if (body.account_name !== undefined) {
      updateData.account_name = body.account_name;
    }
    
    if (body.regions !== undefined) {
      if (!Array.isArray(body.regions) || body.regions.length === 0) {
        return badRequest('regions must be a non-empty array', undefined, origin);
      }
      updateData.regions = body.regions;
    }
    
    if (body.is_active !== undefined) {
      updateData.is_active = body.is_active;
    }
    
    // Update credential
    const updatedCred = await prisma.awsCredential.update({
      where: { id: body.id },
      data: updateData,
      select: {
        id: true,
        aws_account_number: true,
        account_name: true,
        regions: true,
        is_active: true,
        updated_at: true,
      },
    });
    
    logger.info('AWS credentials updated successfully', { 
      credentialId: updatedCred.id,
      accountId: updatedCred.aws_account_number,
      organizationId,
      isActive: updatedCred.is_active,
    });
    
    return success(updatedCred, 200, origin);
    
  } catch (err: any) {
    logger.error('Update AWS credentials error', err, { 
      organizationId,
      userId,
      requestId: context.awsRequestId,
    });
    
    return error(err instanceof Error ? err.message : 'Failed to update AWS credentials', 500, undefined, origin);
  }
}
