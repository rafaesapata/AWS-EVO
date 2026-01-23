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
    
    // Get organization details, create if not exists (for development)
    let organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        created_at: true,
        updated_at: true,
        // Demo Mode fields
        demo_mode: true,
        demo_activated_at: true,
        demo_expires_at: true,
        demo_activated_by: true
      }
    });
    
    if (!organization) {
      console.log('📝 Creating organization for first time:', organizationId);
      const orgName = user['custom:organization_name'] || 'Default Organization';
      organization = await prisma.organization.create({
        data: {
          id: organizationId,
          name: orgName,
          slug: orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        },
        select: {
          id: true,
          name: true,
          slug: true,
          created_at: true,
          updated_at: true,
          // Demo Mode fields
          demo_mode: true,
          demo_activated_at: true,
          demo_expires_at: true,
          demo_activated_by: true
        }
      });
      console.log('✅ Organization created:', organization.name);
    }
    
    // Get user's profile in this organization, or create if not exists
    const targetUserId = userId || user.sub;
    let profile = await prisma.profile.findFirst({
      where: {
        organization_id: organizationId,
        user_id: targetUserId
      },
      select: {
        id: true,
        role: true,
        full_name: true,
        created_at: true
      }
    });
    
    // Auto-create profile if it doesn't exist (first login)
    if (!profile && targetUserId) {
      console.log('📝 Creating profile for user:', targetUserId);
      const userName = user.name || user.email?.split('@')[0] || 'User';
      const userRole = user['custom:roles'] ? 
        (JSON.parse(user['custom:roles'])[0] || 'user') : 'user';
      
      profile = await prisma.profile.create({
        data: {
          user_id: targetUserId,
          organization_id: organizationId,
          full_name: userName,
          role: userRole,
        },
        select: {
          id: true,
          role: true,
          full_name: true,
          created_at: true
        }
      });
      console.log('✅ Profile created:', profile.id);
    }
    
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
