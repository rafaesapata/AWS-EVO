import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler para criar conta de organização
 * AWS Lambda Handler for create-organization-account
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId, requireRole } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { OrganizationsClient, CreateAccountCommand } from '@aws-sdk/client-organizations';

interface CreateAccountRequest {
  accountName: string;
  email: string;
  roleName?: string;
  iamUserAccessToBilling?: 'ALLOW' | 'DENY';
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationId(user);
  
  logger.info('Create organization account started', { 
    organizationId,
    userId: user.id,
    requestId: context.awsRequestId 
  });
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    // Apenas admins podem criar contas
    requireRole(user, 'admin');
    
    const body: CreateAccountRequest = event.body ? JSON.parse(event.body) : {};
    const { accountName, email, roleName = 'OrganizationAccountAccessRole', iamUserAccessToBilling = 'DENY' } = body;
    
    if (!accountName || !email) {
      return badRequest('accountName and email are required');
    }
    
    logger.info('Creating AWS organization account', { 
      organizationId, 
      accountName, 
      email: email.substring(0, 5) + '***' // Mask email for privacy
    });
    
    const prisma = getPrismaClient();
    
    // Criar conta na AWS Organizations
    const orgsClient = new OrganizationsClient({ region: 'us-east-1' });
    
    const createAccountResponse = await orgsClient.send(
      new CreateAccountCommand({
        AccountName: accountName,
        Email: email,
        RoleName: roleName,
        IamUserAccessToBilling: iamUserAccessToBilling,
      })
    );
    
    const requestId = createAccountResponse.CreateAccountStatus?.Id;
    
    if (!requestId) {
      throw new Error('Failed to create account: no request ID returned');
    }
    
    logger.info('AWS account creation initiated', { 
      organizationId, 
      accountName, 
      requestId 
    });
    
    // Armazenar no banco (status pending)
    const account = await prisma.awsAccount.create({
      data: {
        organization_id: organizationId,
        account_id: requestId, // Temporário, será atualizado quando a conta for criada
        account_name: accountName,
        email,
        status: 'PENDING',
      },
    });
    
    return success({
      account_id: account.id,
      request_id: requestId,
      status: 'PENDING',
      message: 'Account creation initiated. It may take a few minutes to complete.',
    });
    
  } catch (err) {
    logger.error('Create organization account error', err as Error, { 
      organizationId,
      userId: user.id,
      requestId: context.awsRequestId 
    });
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
