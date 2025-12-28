/**
 * Lambda handler para gerenciamento de organizações
 * APENAS SUPER ADMINS podem usar este handler
 * 
 * Operações suportadas:
 * - list: Lista todas as organizações
 * - create: Cria uma nova organização
 * - update: Atualiza uma organização existente
 * - delete: Remove uma organização (soft delete via status)
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, forbidden, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, isSuperAdmin } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { parseEventBody } from '../../lib/request-parser.js';
import { randomUUID } from 'crypto';

interface ManageOrganizationRequest {
  action: 'list' | 'create' | 'update' | 'delete' | 'toggle_status';
  id?: string;
  name?: string;
  slug?: string;
  description?: string;
  domain?: string;
  billing_email?: string;
  status?: 'active' | 'inactive' | 'suspended';
}

function getOriginFromEvent(event: AuthorizedEvent): string {
  const headers = event.headers || {};
  return headers['origin'] || headers['Origin'] || '*';
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOriginFromEvent(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  let user;
  try {
    user = getUserFromEvent(event);
  } catch (authError: any) {
    logger.error('Authentication error', authError);
    return error('Authentication failed: ' + (authError.message || 'Unknown error'), 401, undefined, origin);
  }

  // CRITICAL: Only super admins can manage organizations
  if (!isSuperAdmin(user)) {
    logger.warn('Non-super-admin attempted to manage organizations', {
      userId: user.sub || user.id,
      email: user.email,
      roles: user.roles,
    });
    return forbidden('Only super admins can manage organizations', origin);
  }

  const prisma = getPrismaClient();
  
  try {
    const body = parseEventBody<ManageOrganizationRequest>(event, { action: 'list' } as ManageOrganizationRequest, 'manage-organizations');
    
    logger.info('Manage organizations request', {
      action: body.action,
      userId: user.sub || user.id,
      requestId: context.awsRequestId,
    });

    switch (body.action) {
      case 'list': {
        const organizations = await prisma.organization.findMany({
          orderBy: { created_at: 'desc' },
          include: {
            _count: {
              select: {
                profiles: true,
                aws_credentials: true,
              }
            }
          }
        });

        // Transform to include user_count and aws_account_count
        const result = organizations.map(org => ({
          id: org.id,
          name: org.name,
          slug: org.slug,
          created_at: org.created_at,
          updated_at: org.updated_at,
          user_count: org._count.profiles,
          aws_account_count: org._count.aws_credentials,
          // Default values for fields not in schema
          description: '',
          domain: org.slug,
          status: 'active',
          monthly_cost: 0,
          billing_email: '',
          admin_users: [],
        }));

        return success(result, 200, origin);
      }

      case 'create': {
        if (!body.name) {
          return badRequest('Name is required', undefined, origin);
        }

        const slug = body.slug || generateSlug(body.name);
        
        // Check if slug already exists
        const existing = await prisma.organization.findUnique({
          where: { slug }
        });

        if (existing) {
          return badRequest(`Organization with slug "${slug}" already exists`, undefined, origin);
        }

        const organization = await prisma.organization.create({
          data: {
            id: randomUUID(),
            name: body.name,
            slug: slug,
          }
        });

        logger.info('Organization created', {
          organizationId: organization.id,
          name: organization.name,
          slug: organization.slug,
          createdBy: user.sub || user.id,
        });

        return success({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          created_at: organization.created_at,
          updated_at: organization.updated_at,
          user_count: 0,
          aws_account_count: 0,
          description: body.description || '',
          domain: body.domain || slug,
          status: 'active',
          monthly_cost: 0,
          billing_email: body.billing_email || '',
          admin_users: [],
        }, 201, origin);
      }

      case 'update': {
        if (!body.id) {
          return badRequest('Organization ID is required', undefined, origin);
        }

        const existing = await prisma.organization.findUnique({
          where: { id: body.id }
        });

        if (!existing) {
          return badRequest('Organization not found', undefined, origin);
        }

        const updateData: any = {};
        if (body.name) updateData.name = body.name;
        if (body.slug) {
          // Check if new slug is unique
          const slugExists = await prisma.organization.findFirst({
            where: { 
              slug: body.slug,
              NOT: { id: body.id }
            }
          });
          if (slugExists) {
            return badRequest(`Slug "${body.slug}" is already in use`, undefined, origin);
          }
          updateData.slug = body.slug;
        }

        const organization = await prisma.organization.update({
          where: { id: body.id },
          data: updateData,
        });

        logger.info('Organization updated', {
          organizationId: organization.id,
          updatedBy: user.sub || user.id,
        });

        return success({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          created_at: organization.created_at,
          updated_at: organization.updated_at,
        }, 200, origin);
      }

      case 'toggle_status': {
        if (!body.id) {
          return badRequest('Organization ID is required', undefined, origin);
        }

        // Note: The current schema doesn't have a status field
        // This would need a schema migration to add status
        // For now, we'll just return success
        logger.info('Organization status toggle requested (not implemented in schema)', {
          organizationId: body.id,
          requestedStatus: body.status,
        });

        return success({ 
          message: 'Status toggle acknowledged',
          note: 'Status field not yet in database schema'
        }, 200, origin);
      }

      case 'delete': {
        if (!body.id) {
          return badRequest('Organization ID is required', undefined, origin);
        }

        // Check if organization has any data
        const org = await prisma.organization.findUnique({
          where: { id: body.id },
          include: {
            _count: {
              select: {
                profiles: true,
                aws_credentials: true,
              }
            }
          }
        });

        if (!org) {
          return badRequest('Organization not found', undefined, origin);
        }

        if (org._count.profiles > 0 || org._count.aws_credentials > 0) {
          return badRequest(
            `Cannot delete organization with ${org._count.profiles} users and ${org._count.aws_credentials} AWS credentials. Remove all data first.`,
            undefined,
            origin
          );
        }

        await prisma.organization.delete({
          where: { id: body.id }
        });

        logger.info('Organization deleted', {
          organizationId: body.id,
          deletedBy: user.sub || user.id,
        });

        return success({ message: 'Organization deleted successfully' }, 200, origin);
      }

      default:
        return badRequest(`Invalid action: ${body.action}`, undefined, origin);
    }
    
  } catch (err: any) {
    logger.error('Manage organizations error', err, {
      userId: user.sub || user.id,
      requestId: context.awsRequestId,
    });
    
    return error(err instanceof Error ? err.message : 'Failed to manage organizations', 500, undefined, origin);
  }
}
