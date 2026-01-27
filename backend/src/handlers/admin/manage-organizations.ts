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
import { 
  CognitoIdentityProviderClient, 
  ListUsersCommand,
  AdminUpdateUserAttributesCommand
} from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({ region: 'us-east-1' });

interface ManageOrganizationRequest {
  action: 'list' | 'create' | 'update' | 'delete' | 'toggle_status' | 'list_users';
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

/**
 * Sincroniza o nome da organização no Cognito para todos os usuários
 */
async function syncOrganizationNameInCognito(
  organizationId: string, 
  newName: string
): Promise<{ updated: number; errors: number }> {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) {
    logger.warn('COGNITO_USER_POOL_ID not configured, skipping Cognito sync');
    return { updated: 0, errors: 0 };
  }

  let updated = 0;
  let errors = 0;
  let paginationToken: string | undefined;

  try {
    // Listar todos os usuários com este organization_id
    do {
      const listResponse = await cognitoClient.send(new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: `"custom:organization_id" = "${organizationId}"`,
        PaginationToken: paginationToken,
        Limit: 60
      }));

      const users = listResponse.Users || [];
      
      // Atualizar cada usuário
      for (const user of users) {
        try {
          await cognitoClient.send(new AdminUpdateUserAttributesCommand({
            UserPoolId: userPoolId,
            Username: user.Username!,
            UserAttributes: [
              { Name: 'custom:organization_name', Value: newName }
            ]
          }));
          updated++;
          logger.info('Updated user organization name in Cognito', { 
            username: user.Username, 
            newOrgName: newName 
          });
        } catch (userErr) {
          errors++;
          logger.error('Failed to update user in Cognito', userErr, { 
            username: user.Username 
          });
        }
      }

      paginationToken = listResponse.PaginationToken;
    } while (paginationToken);

  } catch (err) {
    logger.error('Failed to list users from Cognito', err);
    errors++;
  }

  return { updated, errors };
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
          // Demo mode fields
          demo_mode: org.demo_mode || false,
          demo_activated_at: org.demo_activated_at,
          demo_expires_at: org.demo_expires_at,
          demo_activated_by: org.demo_activated_by,
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
        const nameChanged = body.name && body.name !== existing.name;
        
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

        // Se o nome mudou, sincronizar no Cognito
        let cognitoSync = { updated: 0, errors: 0 };
        if (nameChanged && body.name) {
          logger.info('Organization name changed, syncing to Cognito', {
            organizationId: body.id,
            oldName: existing.name,
            newName: body.name
          });
          cognitoSync = await syncOrganizationNameInCognito(body.id, body.name);
        }

        logger.info('Organization updated', {
          organizationId: organization.id,
          updatedBy: user.sub || user.id,
          cognitoUsersUpdated: cognitoSync.updated,
          cognitoErrors: cognitoSync.errors
        });

        return success({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          created_at: organization.created_at,
          updated_at: organization.updated_at,
          cognitoSync: nameChanged ? cognitoSync : undefined
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

      case 'list_users': {
        if (!body.id) {
          return badRequest('Organization ID is required', undefined, origin);
        }

        // Get organization to verify it exists
        const org = await prisma.organization.findUnique({
          where: { id: body.id }
        });

        if (!org) {
          return badRequest('Organization not found', undefined, origin);
        }

        // Get all profiles for this organization
        const profiles = await prisma.profile.findMany({
          where: { organization_id: body.id },
          orderBy: { created_at: 'desc' }
        });

        // Try to get email from Cognito for each user
        const userPoolId = process.env.COGNITO_USER_POOL_ID;
        const usersWithEmail = await Promise.all(
          profiles.map(async (profile) => {
            let email: string | undefined;
            
            if (userPoolId) {
              try {
                const listResponse = await cognitoClient.send(new ListUsersCommand({
                  UserPoolId: userPoolId,
                  Filter: `sub = "${profile.user_id}"`,
                  Limit: 1
                }));
                
                const cognitoUser = listResponse.Users?.[0];
                if (cognitoUser) {
                  email = cognitoUser.Attributes?.find(a => a.Name === 'email')?.Value;
                }
              } catch (err) {
                logger.warn('Failed to get email from Cognito', { userId: profile.user_id, error: err });
              }
            }

            return {
              id: profile.id,
              user_id: profile.user_id,
              full_name: profile.full_name,
              avatar_url: profile.avatar_url,
              role: profile.role || 'user',
              created_at: profile.created_at,
              email
            };
          })
        );

        logger.info('Listed users for organization', {
          organizationId: body.id,
          userCount: usersWithEmail.length,
          requestedBy: user.sub || user.id,
        });

        return success(usersWithEmail, 200, origin);
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
