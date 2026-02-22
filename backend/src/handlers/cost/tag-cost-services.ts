/**
 * Tag Cost Services Handler
 * POST /api/functions/tag-cost-services
 * 
 * Given multiple tag IDs, returns the service names associated with those tags
 * via ResourceTagAssignment. Used by CostAnalysisPage to filter costs by tags.
 * AND logic: returns services that match ALL provided tags.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.['origin'] || event.headers?.['Origin'] || '*';
  const method = event.requestContext?.http?.method || event.httpMethod || '';

  if (method === 'OPTIONS') return corsOptions(origin);

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const body = JSON.parse(event.body || '{}');
    const { tagIds, accountId } = body;

    if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0) {
      return error('tagIds array is required', 400, undefined, origin);
    }

    const prisma = getPrismaClient();

    // Resolve accountId: frontend sends aws_credentials.id (UUID),
    // but resource_tag_assignments uses the AWS account number
    let awsAccountNumber: string | undefined;
    if (accountId && accountId !== 'all') {
      const cred = await prisma.awsCredential.findUnique({
        where: { id: accountId },
        select: { account_id: true },
      });
      awsAccountNumber = cred?.account_id || undefined;
    }

    // AND logic: find resources that have ALL specified tags
    const resourceGroups = await prisma.resourceTagAssignment.groupBy({
      by: ['resource_id', 'resource_type', 'cloud_provider'],
      where: {
        organization_id: organizationId,
        tag_id: { in: tagIds },
        ...(awsAccountNumber ? { aws_account_id: awsAccountNumber } : {}),
      },
      having: {
        resource_id: { _count: { equals: tagIds.length } },
      },
    });

    // resource_type in assignments already matches billing service names in daily_costs
    // (e.g., "Amazon Relational Database Service", "EC2 - Other", "Amazon GuardDuty")
    // Use them directly for exact matching
    const serviceNames = new Set<string>();
    for (const group of resourceGroups) {
      if (group.resource_type) {
        serviceNames.add(group.resource_type);
      }
    }

    return success({
      services: Array.from(serviceNames),
      resourceCount: resourceGroups.length,
      tagCount: tagIds.length,
    }, 200, origin);
  } catch (err: any) {
    logger.error('tag-cost-services handler error', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
