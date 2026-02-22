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

    // AND logic: find resources that have ALL specified tags
    const resourceGroups = await prisma.resourceTagAssignment.groupBy({
      by: ['resource_id', 'resource_type', 'cloud_provider'],
      where: {
        organization_id: organizationId,
        tag_id: { in: tagIds },
        ...(accountId && accountId !== 'all' ? { aws_account_id: accountId } : {}),
      },
      having: {
        resource_id: { _count: { equals: tagIds.length } },
      },
    });

    // Extract short service identifiers from resource_type (e.g., "aws:ec2:instance" → "ec2")
    const shortNames = new Set<string>();
    for (const group of resourceGroups) {
      const parts = (group.resource_type || '').split(':');
      if (parts.length >= 2) {
        shortNames.add(parts[1].toLowerCase());
      } else {
        shortNames.add((group.resource_type || '').toLowerCase());
      }
    }

    // Map short identifiers to actual billing service names from daily_costs
    // This ensures exact matching with cost data's service_breakdown keys
    let billingServiceNames: string[] = [];
    if (shortNames.size > 0) {
      const shortArr = Array.from(shortNames);
      // Build OR conditions to find billing services containing the short names
      const orConditions = shortArr.map(s => ({
        service: { contains: s, mode: 'insensitive' as const },
      }));
      const billingServices = await prisma.dailyCost.findMany({
        where: {
          organization_id: organizationId,
          OR: orConditions,
          ...(accountId && accountId !== 'all' ? { aws_account_id: accountId } : {}),
        },
        select: { service: true },
        distinct: ['service'],
      });
      billingServiceNames = billingServices.map(s => s.service);
    }

    return success({
      services: billingServiceNames.length > 0 ? billingServiceNames : Array.from(shortNames),
      shortNames: Array.from(shortNames),
      resourceCount: resourceGroups.length,
      tagCount: tagIds.length,
    }, 200, origin);
  } catch (err: any) {
    logger.error('tag-cost-services handler error', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
