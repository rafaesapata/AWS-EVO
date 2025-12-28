/**
 * Get User Organization Handler - Retorna a organização do usuário
 */

import { getHttpMethod } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, notFound, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';

interface RequestBody {
  userId?: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  console.log('🏢 Get User Organization');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: RequestBody = event.body ? JSON.parse(event.body) : {};
    const { userId } = body;
    
    const prisma = getPrismaClient();
    
    // Get organization details
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        created_at: true,
        updated_at: true
      }
    });
    
    if (!organization) {
      return notFound('Organization not found');
    }
    
    // Get user's profile in this organization
    const profile = await prisma.profile.findFirst({
      where: {
        organization_id: organizationId,
        user_id: userId || user.sub
      },
      select: {
        id: true,
        role: true,
        full_name: true,
        created_at: true
      }
    });
    
    // Get organization stats
    const [userCount, accountCount] = await Promise.all([
      prisma.profile.count({
        where: { organization_id: organizationId }
      }),
      prisma.awsCredential.count({
        where: { organization_id: organizationId, is_active: true }
      })
    ]);
    
    console.log('✅ Get User Organization completed');
    
    return success({
      organization: {
        ...organization,
        stats: {
          userCount,
          accountCount
        }
      },
      profile,
      organizationId
    });
    
  } catch (err) {
    console.error('❌ Get User Organization error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
