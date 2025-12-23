/**
 * Lambda handler para salvar credenciais AWS
 * Usa DynamoDB para Organizations e PostgreSQL para Credentials
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { parseEventBody } from '../../lib/request-parser.js';
// DynamoDB imports removed - organization comes from auth context

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

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationId(user);
  
  logger.info('Save AWS credentials started', { 
    organizationId,
    userId: user.id,
    requestId: context.awsRequestId 
  });
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const body = parseEventBody<SaveCredentialsRequest>(event, {} as SaveCredentialsRequest, 'save-aws-credentials');
    
    // Validate required fields
    if (!body.account_name || !body.access_key_id || !body.secret_access_key || !body.account_id) {
      return badRequest('Missing required fields: account_name, access_key_id, secret_access_key, account_id');
    }
    
    // Use organizationId directly - it comes from the authenticated user
    // No need to check DynamoDB as the organization is managed by the auth system
    logger.info('Using organization from authenticated user', { organizationId });
    
    const organization = {
      id: organizationId,
      name: `Organization ${organizationId.substring(0, 8)}`
    };
    
    // Save credentials to PostgreSQL
    const prisma = getPrismaClient();
    
    // Check if credentials already exist for this account
    const existingCred = await prisma.awsCredential.findFirst({
      where: {
        account_id: body.account_id,
        organization_id: organization.id,
      },
    });
    
    if (existingCred) {
      logger.warn('AWS credentials already exist for this account', { 
        accountId: body.account_id,
        organizationId: organization.id 
      });
      return badRequest(`AWS account ${body.account_id} is already connected to this organization`);
    }
    
    // Create new credentials
    const credential = await prisma.awsCredential.create({
      data: {
        organization_id: organization.id,
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
      organizationId: organization.id 
    });
    
    return success({
      id: credential.id,
      account_id: credential.account_id,
      account_name: credential.account_name,
      regions: credential.regions,
      is_active: credential.is_active,
      created_at: credential.created_at,
    });
    
  } catch (err) {
    logger.error('Save AWS credentials error', err as Error, { 
      organizationId,
      userId: user.id,
      requestId: context.awsRequestId 
    });
    
    return error(err instanceof Error ? err.message : 'Failed to save AWS credentials');
  }
}
