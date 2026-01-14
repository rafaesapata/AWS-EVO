/**
 * List Cloud Credentials Handler
 * 
 * Lists all cloud credentials (AWS and Azure) for the current organization.
 * Provides a unified view of all cloud accounts.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod } from '../../lib/middleware.js';

interface CloudCredential {
  id: string;
  provider: 'AWS' | 'AZURE';
  accountId: string;
  accountName: string | null;
  regions: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Provider-specific fields
  roleArn?: string | null;
  tenantId?: string | null;
  clientId?: string | null;
}

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  // Handle CORS preflight
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    logger.info('Listing all cloud credentials', { organizationId });

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const activeOnly = queryParams.activeOnly !== 'false';
    const providerFilter = queryParams.provider?.toUpperCase(); // AWS, AZURE, or undefined for all

    const credentials: CloudCredential[] = [];

    // Fetch AWS credentials if not filtered to Azure only
    if (!providerFilter || providerFilter === 'AWS') {
      const awsWhere: any = {
        organization_id: organizationId,
      };
      if (activeOnly) {
        awsWhere.is_active = true;
      }

      const awsCredentials = await prisma.awsCredential.findMany({
        where: awsWhere,
        select: {
          id: true,
          account_id: true,
          account_name: true,
          role_arn: true,
          regions: true,
          is_active: true,
          created_at: true,
          updated_at: true,
        },
        orderBy: {
          created_at: 'desc',
        },
      });

      for (const cred of awsCredentials) {
        credentials.push({
          id: cred.id,
          provider: 'AWS',
          accountId: cred.account_id || '',
          accountName: cred.account_name,
          regions: cred.regions,
          isActive: cred.is_active,
          createdAt: cred.created_at,
          updatedAt: cred.updated_at,
          roleArn: cred.role_arn,
        });
      }
    }

    // Fetch Azure credentials if not filtered to AWS only
    if (!providerFilter || providerFilter === 'AZURE') {
      const azureWhere: any = {
        organization_id: organizationId,
      };
      if (activeOnly) {
        azureWhere.is_active = true;
      }

      const azureCredentials = await prisma.azureCredential.findMany({
        where: azureWhere,
        select: {
          id: true,
          subscription_id: true,
          subscription_name: true,
          tenant_id: true,
          client_id: true,
          regions: true,
          is_active: true,
          created_at: true,
          updated_at: true,
        },
        orderBy: {
          created_at: 'desc',
        },
      });

      for (const cred of azureCredentials) {
        credentials.push({
          id: cred.id,
          provider: 'AZURE',
          accountId: cred.subscription_id,
          accountName: cred.subscription_name,
          regions: cred.regions,
          isActive: cred.is_active,
          createdAt: cred.created_at,
          updatedAt: cred.updated_at,
          tenantId: cred.tenant_id,
          clientId: cred.client_id,
        });
      }
    }

    // Sort all credentials by creation date (newest first)
    credentials.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    logger.info('Cloud credentials listed', {
      organizationId,
      total: credentials.length,
      awsCount: credentials.filter(c => c.provider === 'AWS').length,
      azureCount: credentials.filter(c => c.provider === 'AZURE').length,
    });

    return success({
      credentials,
      total: credentials.length,
      byProvider: {
        AWS: credentials.filter(c => c.provider === 'AWS').length,
        AZURE: credentials.filter(c => c.provider === 'AZURE').length,
      },
    });
  } catch (err: any) {
    logger.error('Error listing cloud credentials', { error: err.message });
    return error(err.message || 'Failed to list cloud credentials', 500);
  }
}
