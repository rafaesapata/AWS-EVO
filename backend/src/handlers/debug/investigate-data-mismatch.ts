/**
 * Lambda handler para investigar o problema de dados de custo vs credenciais AWS
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    const prisma = getPrismaClient();
    
    logger.info('Investigating data mismatch', { organizationId });
    
    // 1. Check AWS credentials
    const awsCredentials = await prisma.awsCredential.findMany({
      where: {
        organization_id: organizationId
      },
      select: {
        id: true,
        account_name: true,
        account_id: true,
        is_active: true,
        created_at: true
      }
    });
    
    // 2. Check daily costs
    const dailyCosts = await prisma.dailyCost.findMany({
      where: {
        organization_id: organizationId
      },
      orderBy: {
        date: 'desc'
      },
      take: 10,
      select: {
        id: true,
        date: true,
        service: true,
        cost: true,
        aws_account_id: true,
        created_at: true
      }
    });
    
    // 3. Get unique account IDs from costs
    const costAccountIds = [...new Set(dailyCosts.map(c => c.aws_account_id))];
    
    // 4. Check if cost account IDs match credential IDs
    const credentialIds = awsCredentials.map(c => c.id);
    const accountIdMatches = costAccountIds.map(costAccountId => ({
      costAccountId,
      existsInCredentials: credentialIds.includes(costAccountId),
      matchingCredential: awsCredentials.find(c => c.id === costAccountId)
    }));
    
    // 5. Count costs by account
    const costsByAccount = [];
    for (const accountId of costAccountIds) {
      const count = await prisma.dailyCost.count({
        where: {
          organization_id: organizationId,
          aws_account_id: accountId
        }
      });
      costsByAccount.push({
        accountId,
        count,
        hasCredentials: credentialIds.includes(accountId)
      });
    }
    
    // 6. Check if there are orphaned credentials (credentials without costs)
    const orphanedCredentials = awsCredentials.filter(cred => 
      !costAccountIds.includes(cred.id)
    );
    
    const investigation = {
      organizationId,
      summary: {
        totalCredentials: awsCredentials.length,
        activeCredentials: awsCredentials.filter(c => c.is_active).length,
        totalCostRecords: dailyCosts.length,
        uniqueCostAccounts: costAccountIds.length,
        accountIdMatches: accountIdMatches.filter(m => m.existsInCredentials).length,
        orphanedCredentials: orphanedCredentials.length
      },
      awsCredentials,
      recentCosts: dailyCosts.map(cost => ({
        date: cost.date.toISOString().split('T')[0],
        service: cost.service,
        cost: cost.cost,
        accountId: cost.aws_account_id,
        createdAt: cost.created_at
      })),
      costAccountIds,
      accountIdMatches,
      costsByAccount,
      orphanedCredentials,
      diagnosis: {
        hasCredentials: awsCredentials.length > 0,
        hasCosts: dailyCosts.length > 0,
        accountIdsMatch: accountIdMatches.some(m => m.existsInCredentials),
        possibleIssues: [] as string[]
      }
    };
    
    // Add diagnosis
    if (awsCredentials.length === 0) {
      investigation.diagnosis.possibleIssues.push('NO_AWS_CREDENTIALS');
    }
    if (dailyCosts.length === 0) {
      investigation.diagnosis.possibleIssues.push('NO_COST_DATA');
    }
    if (awsCredentials.length > 0 && dailyCosts.length > 0 && !accountIdMatches.some(m => m.existsInCredentials)) {
      investigation.diagnosis.possibleIssues.push('ACCOUNT_ID_MISMATCH');
    }
    if (orphanedCredentials.length > 0) {
      investigation.diagnosis.possibleIssues.push('ORPHANED_CREDENTIALS');
    }
    
    logger.info('Data mismatch investigation completed', investigation);
    
    return success(investigation);
    
  } catch (err) {
    logger.error('Investigation error', err as Error);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}