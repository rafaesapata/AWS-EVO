/**
 * Lambda handler para salvar credenciais AWS
 * Cria organização automaticamente se não existir
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { parseEventBody } from '../../lib/request-parser.js';

interface SaveCredentialsRequest {
  account_name: string;
  access_key_id: string;
  secret_access_key: string;
  external_id?: string;
  external_id_expires_at?: string;
  regions: string[];
  account_id: string;
  is_active?: boolean;
}

/**
 * Get origin from event for CORS headers
 */
function getOriginFromEvent(event: AuthorizedEvent): string {
  // Try to get origin from headers (case-insensitive)
  const headers = event.headers || {};
  const origin = headers['origin'] || headers['Origin'] || '*';
  return origin;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  // Get origin for CORS - ALWAYS include in all responses
  const origin = getOriginFromEvent(event);
  
  // Support both REST API (httpMethod) and HTTP API (requestContext.http.method)
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  // DEBUG: Log the entire authorizer context to understand the structure
  logger.info('DEBUG: Event authorizer context', {
    hasAuthorizer: !!event.requestContext?.authorizer,
    authorizerKeys: event.requestContext?.authorizer ? Object.keys(event.requestContext.authorizer) : [],
    hasClaims: !!event.requestContext?.authorizer?.claims,
    hasJwtClaims: !!event.requestContext?.authorizer?.jwt?.claims,
    claimsKeys: event.requestContext?.authorizer?.claims ? Object.keys(event.requestContext.authorizer.claims) : [],
    jwtClaimsKeys: event.requestContext?.authorizer?.jwt?.claims ? Object.keys(event.requestContext.authorizer.jwt.claims) : [],
    // Log specific claim values
    orgIdFromClaims: event.requestContext?.authorizer?.claims?.['custom:organization_id'],
    orgIdFromJwt: event.requestContext?.authorizer?.jwt?.claims?.['custom:organization_id'],
    origin: origin,
  });

  let organizationId: string;
  let userId: string;

  try {
    const user = getUserFromEvent(event);
    logger.info('DEBUG: User from event', {
      sub: user.sub,
      email: user.email,
      orgId: user['custom:organization_id'],
      userKeys: Object.keys(user),
    });
    userId = user.sub || user.id || 'unknown';
    organizationId = getOrganizationId(user);
  } catch (authError: any) {
    logger.error('Authentication error', authError, {
      authorizerContext: JSON.stringify(event.requestContext?.authorizer || {}),
    });
    return error('Authentication failed: ' + (authError.message || 'Unknown error'), 401, undefined, origin);
  }
  
  logger.info('Save AWS credentials started', { 
    organizationId,
    userId,
    requestId: context.awsRequestId 
  });
  
  try {
    const body = parseEventBody<SaveCredentialsRequest>(event, {} as SaveCredentialsRequest, 'save-aws-credentials');
    
    // Validate required fields
    if (!body.account_name || !body.access_key_id || !body.secret_access_key || !body.account_id) {
      return badRequest('Missing required fields: account_name, access_key_id, secret_access_key, account_id', undefined, origin);
    }
    
    const prisma = getPrismaClient();
    
    // CRITICAL: Ensure organization exists in database
    // This handles the case where user was created in Cognito but organization doesn't exist in PostgreSQL
    let organization = await prisma.organization.findUnique({
      where: { id: organizationId }
    });

    if (!organization) {
      logger.info('Organization not found, creating automatically', { organizationId });
      
      // Create organization with a slug derived from the ID
      const slug = `org-${organizationId.substring(0, 8).toLowerCase()}`;
      
      try {
        organization = await prisma.organization.create({
          data: {
            id: organizationId,
            name: `Organization ${organizationId.substring(0, 8)}`,
            slug: slug,
          }
        });
        logger.info('Organization created successfully', { organizationId, slug });
      } catch (createError: any) {
        // Handle unique constraint violation on slug
        if (createError.code === 'P2002') {
          const uniqueSlug = `org-${organizationId.substring(0, 8).toLowerCase()}-${Date.now()}`;
          organization = await prisma.organization.create({
            data: {
              id: organizationId,
              name: `Organization ${organizationId.substring(0, 8)}`,
              slug: uniqueSlug,
            }
          });
          logger.info('Organization created with unique slug', { organizationId, slug: uniqueSlug });
        } else {
          throw createError;
        }
      }
    }
    
    // Check if credentials already exist for this account
    const existingCred = await prisma.awsCredential.findFirst({
      where: {
        account_id: body.account_id,
        organization_id: organizationId,
      },
    });
    
    if (existingCred) {
      logger.warn('AWS credentials already exist for this account', { 
        accountId: body.account_id,
        organizationId 
      });
      
      // Update existing credentials instead of failing
      const updatedCred = await prisma.awsCredential.update({
        where: { id: existingCred.id },
        data: {
          account_name: body.account_name,
          access_key_id: body.access_key_id,
          secret_access_key: body.secret_access_key,
          external_id: body.external_id,
          regions: body.regions,
          is_active: body.is_active !== false,
        }
      });

      logger.info('AWS credentials updated successfully', { 
        credentialId: updatedCred.id,
        accountId: body.account_id,
        organizationId 
      });

      return success({
        id: updatedCred.id,
        account_id: updatedCred.account_id,
        account_name: updatedCred.account_name,
        regions: updatedCred.regions,
        is_active: updatedCred.is_active,
        created_at: updatedCred.created_at,
        updated: true,
      }, 200, origin);
    }
    
    // Create new credentials
    const credential = await prisma.awsCredential.create({
      data: {
        organization_id: organizationId,
        account_id: body.account_id,
        account_name: body.account_name,
        access_key_id: body.access_key_id,
        secret_access_key: body.secret_access_key,
        external_id: body.external_id,
        regions: body.regions,
        is_active: body.is_active !== false,
      },
    });
    
    logger.info('AWS credentials saved successfully', { 
      credentialId: credential.id,
      accountId: body.account_id,
      organizationId 
    });
    
    return success({
      id: credential.id,
      account_id: credential.account_id,
      account_name: credential.account_name,
      regions: credential.regions,
      is_active: credential.is_active,
      created_at: credential.created_at,
    }, 200, origin);
    
  } catch (err: any) {
    logger.error('Save AWS credentials error', err, { 
      organizationId,
      userId,
      requestId: context.awsRequestId,
      errorCode: err.code,
      errorMessage: err.message
    });
    
    // Provide more specific error messages
    if (err.code === 'P2003') {
      return error('Organization not found. Please contact support.', 500, undefined, origin);
    }
    
    return error(err instanceof Error ? err.message : 'Failed to save AWS credentials', 500, undefined, origin);
  }
}
