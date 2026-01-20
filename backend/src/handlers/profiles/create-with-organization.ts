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
import { logger } from '../../lib/logging.js';

interface CreateProfileWithOrgRequest {
  userId: string;
  email: string;
  fullName?: string;
  organizationName: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  // Handle CORS preflight FIRST
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  const user = getUserFromEvent(event);
  
  logger.info('Create profile with organization started', { 
    userId: user.sub,
    requestId: context.awsRequestId 
  });

  try {
    const body: CreateProfileWithOrgRequest = event.body ? JSON.parse(event.body) : {};
    const { userId, email, fullName, organizationName } = body;

    if (!userId || !email || !organizationName) {
      return error('userId, email e organizationName são obrigatórios', 400);
    }

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
    });
  } catch (err) {
    logger.error('Create profile with organization error', err as Error, { 
      userId: user.sub,
      requestId: context.awsRequestId 
    });
    return error('Erro ao criar profile com organização');
  }
}
