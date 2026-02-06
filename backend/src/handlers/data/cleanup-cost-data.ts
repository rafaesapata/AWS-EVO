/**
 * Cleanup Cost Data Handler
 * Removes all daily_costs for an organization/account to allow fresh re-sync
 * Admin-only operation
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions, unauthorized } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation, isSuperAdmin } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event) || '*';
  logger.info('Cleanup Cost Data started', { requestId: context.awsRequestId });
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    // Parse body
    let body: { 
      accountId?: string;
      startDate?: string;
      endDate?: string;
      confirmDelete?: boolean;
    } = {};
    
    if (event.body) {
      try {
        body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      } catch {
        return badRequest('Invalid JSON body', undefined, origin);
      }
    }
    
    const { accountId, startDate, endDate, confirmDelete } = body;
    
    if (!confirmDelete) {
      return badRequest('Must set confirmDelete: true to proceed', undefined, origin);
    }
    
    const prisma = getPrismaClient();
    
    // Build where clause
    const whereClause: any = {
      organization_id: organizationId,
    };
    
    if (accountId) {
      whereClause.aws_account_id = accountId;
    }
    
    if (startDate) {
      whereClause.date = { ...whereClause.date, gte: new Date(startDate) };
    }
    
    if (endDate) {
      whereClause.date = { ...whereClause.date, lte: new Date(endDate) };
    }
    
    // Count records to be deleted
    const countBefore = await prisma.dailyCost.count({
      where: whereClause,
    });
    
    logger.info('Deleting cost records', {
      organizationId,
      accountId,
      startDate,
      endDate,
      recordsToDelete: countBefore,
    });
    
    // Delete records
    const deleteResult = await prisma.dailyCost.deleteMany({
      where: whereClause,
    });
    
    logger.info('Cost data cleanup completed', {
      organizationId,
      accountId,
      deletedCount: deleteResult.count,
      requestId: context.awsRequestId,
    });
    
    return success({
      success: true,
      message: `Deleted ${deleteResult.count} cost records`,
      deletedCount: deleteResult.count,
      filters: {
        organizationId,
        accountId: accountId || 'all',
        startDate: startDate || 'all',
        endDate: endDate || 'all',
      },
    }, 200, origin);
    
  } catch (err) {
    logger.error('Cleanup Cost Data error', err as Error, { requestId: context.awsRequestId });
    return error('An unexpected error occurred. Please try again.', 500, undefined, origin);
  }
}
