import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Create Profile with Organization Handler
 * Cria um profile de usuário vinculado a uma organização
 * Se a organização não existir, cria automaticamente
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

// Zod schema for create profile with organization
const createProfileWithOrgSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  email: z.string().email('Invalid email format'),
  fullName: z.string().max(100).optional(),
  organizationName: z.string().min(2, 'organizationName must be at least 2 characters').max(100),
});

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.['origin'] || event.headers?.['Origin'] || '*';
  // Handle CORS preflight FIRST
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  let user;
  try {
    user = getUserFromEvent(event);
  } catch (authErr) {
    return error('Authentication failed', 401, undefined, origin);
  }
  
  logger.info('Create profile with organization started', { 
    userId: user.sub,
    requestId: context.awsRequestId 
  });

  try {
    // Validate input with Zod
    const validation = parseAndValidateBody(createProfileWithOrgSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { userId, email, fullName, organizationName } = validation.data;

    const prisma = getPrismaClient();
    
    // Verificar se já existe profile
    const existingProfile = await prisma.profile.findFirst({
      where: { user_id: userId },
    });

    if (existingProfile) {
      logger.info('Profile already exists', { userId, profileId: existingProfile.id });
      return success({
        message: 'Profile já existe',
        profileId: existingProfile.id,
        organizationId: existingProfile.organization_id,
      });
    }

    // Buscar ou criar organização
    const slug = organizationName.toLowerCase().replace(/\s+/g, '-');
    
    let organization = await prisma.organization.findUnique({
      where: { slug },
    });

    if (!organization) {
      logger.info('Creating new organization', { organizationName, slug });
      organization = await prisma.organization.create({
        data: {
          name: organizationName,
          slug,
        },
      });
    }

    // Criar profile vinculado à organização
    const profile = await prisma.profile.create({
      data: {
        user_id: userId,
        email: user.email || `${userId}@placeholder.local`,
        organization_id: organization.id,
        full_name: fullName,
        role: 'user',
      },
      include: {
        organization: true,
      },
    });

    logger.info('Profile created with organization', { 
      userId,
      profileId: profile.id,
      organizationId: organization.id,
      organizationName: organization.name,
    });

    return success({
      message: 'Profile criado com sucesso',
      profileId: profile.id,
      organizationId: organization.id,
      organizationName: organization.name,
    }, 200, origin);
  } catch (err) {
    logger.error('Create profile with organization error', err as Error, { 
      userId: user.sub,
      requestId: context.awsRequestId 
    });
    return error('Erro ao criar profile com organização', 500, undefined, origin);
  }
}
