/**
 * Lambda para seed inicial do banco de dados
 * Cria organização default e dados iniciais
 */

import type { APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

export async function handler(): Promise<APIGatewayProxyResultV2> {
  const startTime = Date.now();
  
  try {
    logger.info('Starting database seed');
    
    const prisma = getPrismaClient();
    
    // Verificar se já existe organização
    const existingOrg = await prisma.organization.findFirst();
    
    if (existingOrg) {
      logger.info('Database already seeded', { organizationId: existingOrg.id });
      return success({
        success: true,
        message: 'Database already seeded',
        organization: {
          id: existingOrg.id,
          name: existingOrg.name,
          slug: existingOrg.slug
        }
      });
    }
    
    // Criar organização default
    const organization = await prisma.organization.create({
      data: {
        name: 'Default Organization',
        slug: 'default',
        status: 'active'
      }
    });
    
    logger.info('Organization created', { organizationId: organization.id });
    
    const duration = Date.now() - startTime;
    
    return success({
      success: true,
      message: 'Database seeded successfully',
      duration_ms: duration,
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug
      }
    });
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Seed failed', { error: errorMessage });
    
    return error('Seed failed. Check logs for details.', 500);
  }
}
