import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler para sincronizar contas da organização
 * AWS Lambda Handler for sync-organization-accounts
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { OrganizationsClient, ListAccountsCommand } from '@aws-sdk/client-organizations';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationId(user);
  
  logger.info('Sync organization accounts started', { 
    organizationId,
    userId: user.id,
    requestId: context.awsRequestId 
  });
  
  try {
    const prisma = getPrismaClient();
    
    // Listar contas da AWS Organizations
    const orgsClient = new OrganizationsClient({ region: 'us-east-1' });
    
    let allAccounts: any[] = [];
    let nextToken: string | undefined;
    
    do {
      const response = await orgsClient.send(
        new ListAccountsCommand({
          NextToken: nextToken,
          MaxResults: 20,
        })
      );
      
      if (response.Accounts) {
        allAccounts.push(...response.Accounts);
      }
      
      nextToken = response.NextToken;
    } while (nextToken);
    
    logger.info('Found AWS Organization accounts', { 
      organizationId, 
      accountsCount: allAccounts.length 
    });
    
    // Sincronizar com banco de dados
    let created = 0;
    let updated = 0;
    
    for (const awsAccount of allAccounts) {
      if (!awsAccount.Id) continue;
      
      const existingAccount = await prisma.awsAccount.findFirst({
        where: {
          organization_id: organizationId,
          account_id: awsAccount.Id,
        },
      });
      
      if (existingAccount) {
        // Atualizar
        await prisma.awsAccount.update({
          where: { id: existingAccount.id },
          data: {
            account_name: awsAccount.Name || existingAccount.account_name,
            email: awsAccount.Email || existingAccount.email,
            status: awsAccount.Status || existingAccount.status,
          },
        });
        updated++;
      } else {
        // Criar
        await prisma.awsAccount.create({
          data: {
            organization_id: organizationId,
            account_id: awsAccount.Id,
            account_name: awsAccount.Name || 'Unknown',
            email: awsAccount.Email,
            status: awsAccount.Status || 'ACTIVE',
          },
        });
        created++;
      }
    }
    
    logger.info('Organization accounts sync completed', { 
      organizationId,
      totalAccounts: allAccounts.length,
      created,
      updated 
    });
    
    return success({
      total_accounts: allAccounts.length,
      created,
      updated,
      synced_at: new Date().toISOString(),
    });
    
  } catch (err) {
    logger.error('Sync organization accounts error', err as Error, { 
      organizationId,
      userId: user.id,
      requestId: context.awsRequestId 
    });
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
