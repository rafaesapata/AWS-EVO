import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, safeHandler} from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

export const handler = safeHandler(async (
  event: AuthorizedEvent,
  context: LambdaContext
) => {
  if (event.requestContext.http?.method === 'OPTIONS') {
    return corsOptions();
  }
  
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationIdWithImpersonation(event, user);
  const prisma = getPrismaClient();
  
  logger.info('List Background Jobs started', { 
    requestId: context.awsRequestId,
    organizationId 
  });
  
  try {
    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const status = queryParams.status;
    const limit = parseInt(queryParams.limit || '50');
    const offset = parseInt(queryParams.offset || '0');
    
    // Build where clause
    const whereClause: any = {
      organization_id: organizationId
    };
    
    if (status && status !== 'all') {
      whereClause.status = status;
    }
    
    // Get background jobs for the organization
    const jobs = await prisma.backgroundJob.findMany({
      where: whereClause,
      orderBy: {
        created_at: 'desc'
      },
      take: limit,
      skip: offset,
      select: {
        id: true,
        job_type: true,
        status: true,
        created_at: true,
        started_at: true,
        completed_at: true,
        error: true,
        result: true,
        organization_id: true
      }
    });
    
    // Get total count for pagination
    const totalCount = await prisma.backgroundJob.count({
      where: whereClause
    });
    
    logger.info('Background jobs retrieved', { 
      organizationId,
      jobsCount: jobs.length,
      totalCount,
      status: status || 'all'
    });
    
    return success({
      jobs,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + jobs.length < totalCount
      }
    });
    
  } catch (err) {
    logger.error('List Background Jobs error', err as Error, { 
      requestId: context.awsRequestId,
      organizationId 
    });
    return error('An unexpected error occurred. Please try again.', 500);
  }
});