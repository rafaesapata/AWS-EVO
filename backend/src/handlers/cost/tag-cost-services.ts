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
import { isOrganizationInDemoMode } from '../../lib/demo-data-service.js';

// Demo tag → service mapping (must match generateDemoCostData service names)
const DEMO_TAG_SERVICES: Record<string, string[]> = {
  'demo-tag-001': ['Amazon EC2', 'Amazon RDS', 'Amazon S3', 'AWS Lambda', 'Amazon CloudFront', 'AWS WAF', 'Amazon Route 53'], // env:production — most services
  'demo-tag-002': ['Amazon EC2', 'Amazon RDS', 'Amazon S3', 'AWS Lambda'],       // env:staging — subset
  'demo-tag-003': ['Amazon EC2', 'Amazon S3', 'AWS Lambda'],                      // env:development — smaller subset
  'demo-tag-004': ['Amazon EC2', 'Amazon RDS', 'AWS Lambda', 'Amazon DynamoDB'],  // cost-center:engineering
  'demo-tag-005': ['Amazon CloudFront', 'Amazon S3', 'Amazon Route 53'],          // cost-center:marketing
  'demo-tag-006': ['Amazon EC2', 'Amazon RDS', 'Amazon DynamoDB', 'Amazon S3'],   // cost-center:data-science
  'demo-tag-007': ['Amazon EC2', 'Amazon RDS', 'AWS Lambda', 'Amazon CloudFront', 'AWS WAF'], // team:platform
  'demo-tag-008': ['Amazon EC2', 'Amazon RDS', 'AWS Lambda', 'Amazon DynamoDB'],  // team:backend
  'demo-tag-009': ['Amazon CloudFront', 'Amazon S3', 'Amazon Route 53'],          // team:frontend
  'demo-tag-010': ['Amazon EC2', 'Amazon RDS', 'Amazon S3', 'AWS Lambda', 'Amazon CloudFront', 'Amazon DynamoDB', 'AWS WAF', 'Amazon Route 53'], // project:evo-platform — all
  'demo-tag-011': ['Amazon EC2', 'Amazon RDS', 'Amazon DynamoDB', 'Amazon S3'],   // project:data-pipeline
  'demo-tag-014': ['Amazon EC2', 'Amazon RDS', 'AWS WAF'],                        // criticality:high
  'demo-tag-015': ['Amazon S3', 'AWS Lambda', 'Amazon CloudFront'],               // criticality:medium
  'demo-tag-016': ['Amazon DynamoDB', 'Amazon Route 53'],                         // criticality:low
};

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

    // Demo mode: return mapped services for demo tags
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    if (isDemo) {
      // AND logic: intersect services across all selected tags
      const serviceSets = tagIds
        .map((id: string) => DEMO_TAG_SERVICES[id])
        .filter(Boolean);
      
      let services: string[];
      if (serviceSets.length === 0) {
        services = [];
      } else if (serviceSets.length === 1) {
        services = serviceSets[0];
      } else {
        // Intersection of all sets
        const first = new Set(serviceSets[0]);
        for (let i = 1; i < serviceSets.length; i++) {
          const current = new Set(serviceSets[i]);
          for (const s of first) {
            if (!current.has(s)) first.delete(s);
          }
        }
        services = Array.from(first);
      }

      return success({
        services,
        resourceCount: services.length * 3, // approximate
        tagCount: tagIds.length,
        _isDemo: true,
      }, 200, origin);
    }

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
