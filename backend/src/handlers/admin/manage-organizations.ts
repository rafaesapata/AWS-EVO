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
import { syncOrganizationLicenses } from '../../lib/license-service.js';

const cognitoClient = new CognitoIdentityProviderClient({ region: 'us-east-1' });

interface ManageOrganizationRequest {
  action: 'list' | 'get' | 'create' | 'update' | 'delete' | 'toggle_status' | 'list_users' | 'suspend' | 'unsuspend' | 'list_licenses' | 'list_seat_assignments' | 'release_seat' | 'update_license_config';
  id?: string;
  name?: string;
  slug?: string;
  description?: string;
  domain?: string;
  billing_email?: string;
  status?: 'active' | 'inactive' | 'suspended';
  reason?: string; // Motivo da suspensão
  seat_assignment_id?: string; // ID da atribuição de assento para liberar
  license_id?: string; // ID da licença para filtrar atribuições
  customer_id?: string; // Customer ID para configuração de licença
  auto_sync?: boolean; // Auto sync de licença
  trigger_sync?: boolean; // Disparar sincronização após atualizar config
  contact_email?: string; // Email de contato da organização
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
    return error('Authentication failed. Please login again.', 401, undefined, origin);
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
      case 'get': {
        if (!body.id) {
          return badRequest('Organization ID is required', undefined, origin);
        }

        const org = await prisma.organization.findUnique({
          where: { id: body.id },
          include: {
            _count: {
              select: {
                profiles: true,
                aws_credentials: true,
                azure_credentials: true,
                security_scans: true,
                licenses: true,
              }
            },
            licenses: {
              orderBy: { created_at: 'desc' },
              take: 1,
              include: {
                _count: {
                  select: { seat_assignments: true }
                }
              }
            }
          }
        });

        if (!org) {
          return badRequest('Organization not found', undefined, origin);
        }

        // Buscar configuração de licença
        const licenseConfig = await prisma.organizationLicenseConfig.findUnique({
          where: { organization_id: body.id }
        });

        // Buscar admins da organização
        const adminProfiles = await prisma.profile.findMany({
          where: { 
            organization_id: body.id,
            role: { in: ['org_admin', 'super_admin'] }
          },
          select: {
            user_id: true,
            full_name: true,
            role: true
          }
        });

        // Buscar emails dos admins do Cognito
        const userPoolId = process.env.COGNITO_USER_POOL_ID;
        const adminUsers: { user_id: string; full_name: string | null; email?: string; role: string | null }[] = [];
        
        for (const admin of adminProfiles) {
          let email: string | undefined;
          if (userPoolId) {
            try {
              const listResponse = await cognitoClient.send(new ListUsersCommand({
                UserPoolId: userPoolId,
                Filter: `sub = "${admin.user_id}"`,
                Limit: 1
              }));
              const cognitoUser = listResponse.Users?.[0];
              if (cognitoUser) {
                email = cognitoUser.Attributes?.find(a => a.Name === 'email')?.Value;
              }
            } catch (err) {
              logger.warn('Failed to get admin email from Cognito', { userId: admin.user_id });
            }
          }
          adminUsers.push({
            user_id: admin.user_id,
            full_name: admin.full_name,
            email,
            role: admin.role
          });
        }

        // Calcular custo mensal (soma dos custos das credenciais AWS)
        const awsCredentials = await prisma.awsCredential.findMany({
          where: { organization_id: body.id },
          select: {
            id: true,
            account_id: true,
            account_name: true,
            is_active: true,
            created_at: true
          }
        });

        // Buscar credenciais Azure
        const azureCredentials = await prisma.azureCredential.findMany({
          where: { organization_id: body.id },
          select: {
            id: true,
            subscription_id: true,
            subscription_name: true,
            tenant_id: true,
            is_active: true,
            created_at: true
          }
        });

        // Licença primária
        const primaryLicense = org.licenses[0];

        const result = {
          // Dados básicos
          id: org.id,
          name: org.name,
          slug: org.slug,
          created_at: org.created_at,
          updated_at: org.updated_at,
          
          // Demo mode
          demo_mode: org.demo_mode || false,
          demo_activated_at: org.demo_activated_at,
          demo_expires_at: org.demo_expires_at,
          demo_activated_by: org.demo_activated_by,
          
          // Contagens
          user_count: org._count.profiles,
          aws_account_count: org._count.aws_credentials,
          azure_account_count: org._count.azure_credentials,
          security_scan_count: org._count.security_scans,
          license_count: org._count.licenses,
          
          // Admins
          admin_users: adminUsers,
          
          // Credenciais AWS
          aws_credentials: awsCredentials,
          
          // Credenciais Azure
          azure_credentials: azureCredentials,
          
          // Licença primária
          primary_license: primaryLicense ? {
            id: primaryLicense.id,
            license_key: primaryLicense.license_key,
            customer_id: primaryLicense.customer_id,
            plan_type: primaryLicense.plan_type,
            product_type: primaryLicense.product_type,
            max_users: primaryLicense.max_users,
            used_seats: primaryLicense.used_seats,
            assigned_seats: primaryLicense._count.seat_assignments,
            is_active: primaryLicense.is_active,
            is_trial: primaryLicense.is_trial,
            is_expired: primaryLicense.is_expired,
            days_remaining: primaryLicense.days_remaining,
            valid_from: primaryLicense.valid_from,
            valid_until: primaryLicense.valid_until,
          } : null,
          
          // Configuração de licença
          license_config: licenseConfig ? {
            customer_id: licenseConfig.customer_id,
            auto_sync: licenseConfig.auto_sync,
            last_sync_at: licenseConfig.last_sync_at,
            sync_status: licenseConfig.sync_status,
            sync_error: licenseConfig.sync_error
          } : null,
        };

        logger.info('Organization details retrieved', {
          organizationId: body.id,
          requestedBy: user.sub || user.id,
        });

        return success(result, 200, origin);
      }

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
          // Status field from database
          status: (org as any).status || 'active',
          // Default values for fields not in schema
          description: '',
          domain: org.slug,
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
        if (body.contact_email !== undefined) updateData.contact_email = body.contact_email;
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

      case 'suspend': {
        if (!body.id) {
          return badRequest('Organization ID is required', undefined, origin);
        }

        const orgToSuspend = await prisma.organization.findUnique({
          where: { id: body.id },
          include: {
            _count: {
              select: { profiles: true }
            }
          }
        });

        if (!orgToSuspend) {
          return badRequest('Organization not found', undefined, origin);
        }

        // Atualizar status da organização para suspended
        await prisma.organization.update({
          where: { id: body.id },
          data: { status: 'suspended' }
        });

        // Desativar todas as licenças da organização
        await prisma.license.updateMany({
          where: { organization_id: body.id },
          data: { is_active: false }
        });

        // Registrar no audit log
        await prisma.auditLog.create({
          data: {
            id: randomUUID(),
            organization_id: body.id,
            user_id: user.sub || user.id || 'system',
            action: 'ORGANIZATION_SUSPENDED',
            resource_type: 'organization',
            resource_id: body.id,
            details: {
              reason: body.reason || 'Suspended by super admin',
              suspended_by: user.email || user.sub,
              user_count: orgToSuspend._count.profiles
            },
            ip_address: event.requestContext?.identity?.sourceIp || 'unknown',
            user_agent: event.headers?.['user-agent'] || 'unknown'
          }
        });

        logger.info('Organization suspended', {
          organizationId: body.id,
          organizationName: orgToSuspend.name,
          reason: body.reason,
          suspendedBy: user.sub || user.id,
          affectedUsers: orgToSuspend._count.profiles
        });

        return success({
          message: 'Organization suspended successfully',
          organizationId: body.id,
          organizationName: orgToSuspend.name,
          licensesDeactivated: true,
          affectedUsers: orgToSuspend._count.profiles
        }, 200, origin);
      }

      case 'unsuspend': {
        if (!body.id) {
          return badRequest('Organization ID is required', undefined, origin);
        }

        const orgToUnsuspend = await prisma.organization.findUnique({
          where: { id: body.id }
        });

        if (!orgToUnsuspend) {
          return badRequest('Organization not found', undefined, origin);
        }

        // Atualizar status da organização para active
        await prisma.organization.update({
          where: { id: body.id },
          data: { status: 'active' }
        });

        // Reativar licenças que não estão expiradas
        const now = new Date();
        await prisma.license.updateMany({
          where: { 
            organization_id: body.id,
            valid_until: { gte: now }
          },
          data: { is_active: true }
        });

        // Registrar no audit log
        await prisma.auditLog.create({
          data: {
            id: randomUUID(),
            organization_id: body.id,
            user_id: user.sub || user.id || 'system',
            action: 'ORGANIZATION_UNSUSPENDED',
            resource_type: 'organization',
            resource_id: body.id,
            details: {
              reason: body.reason || 'Unsuspended by super admin',
              unsuspended_by: user.email || user.sub
            },
            ip_address: event.requestContext?.identity?.sourceIp || 'unknown',
            user_agent: event.headers?.['user-agent'] || 'unknown'
          }
        });

        logger.info('Organization unsuspended', {
          organizationId: body.id,
          organizationName: orgToUnsuspend.name,
          unsuspendedBy: user.sub || user.id,
        });

        return success({
          message: 'Organization unsuspended successfully',
          organizationId: body.id,
          organizationName: orgToUnsuspend.name,
          licensesReactivated: true
        }, 200, origin);
      }

      case 'list_licenses': {
        if (!body.id) {
          return badRequest('Organization ID is required', undefined, origin);
        }

        const orgForLicenses = await prisma.organization.findUnique({
          where: { id: body.id }
        });

        if (!orgForLicenses) {
          return badRequest('Organization not found', undefined, origin);
        }

        // Buscar todas as licenças da organização
        const licenses = await prisma.license.findMany({
          where: { organization_id: body.id },
          orderBy: { created_at: 'desc' },
          include: {
            _count: {
              select: { seat_assignments: true }
            }
          }
        });

        // Buscar configuração de licença da organização
        const licenseConfig = await prisma.organizationLicenseConfig.findUnique({
          where: { organization_id: body.id }
        });

        const result = licenses.map(license => ({
          id: license.id,
          license_key: license.license_key,
          customer_id: license.customer_id,
          plan_type: license.plan_type,
          product_type: license.product_type,
          max_accounts: license.max_accounts,
          max_users: license.max_users,
          used_seats: license.used_seats,
          available_seats: license.available_seats,
          assigned_seats: license._count.seat_assignments,
          features: license.features,
          valid_from: license.valid_from,
          valid_until: license.valid_until,
          is_active: license.is_active,
          is_trial: license.is_trial,
          is_expired: license.is_expired,
          days_remaining: license.days_remaining,
          last_sync_at: license.last_sync_at,
          sync_error: license.sync_error,
          created_at: license.created_at,
          updated_at: license.updated_at
        }));

        logger.info('Listed licenses for organization', {
          organizationId: body.id,
          licenseCount: result.length,
          requestedBy: user.sub || user.id,
        });

        return success({
          licenses: result,
          config: licenseConfig ? {
            customer_id: licenseConfig.customer_id,
            auto_sync: licenseConfig.auto_sync,
            last_sync_at: licenseConfig.last_sync_at,
            sync_status: licenseConfig.sync_status,
            sync_error: licenseConfig.sync_error
          } : null,
          summary: {
            total_licenses: result.length,
            active_licenses: result.filter(l => l.is_active).length,
            expired_licenses: result.filter(l => l.is_expired).length,
            trial_licenses: result.filter(l => l.is_trial).length,
            total_max_users: result.reduce((sum, l) => sum + (l.max_users ?? 0), 0),
            total_used_seats: result.reduce((sum, l) => sum + (l.used_seats ?? 0), 0)
          }
        }, 200, origin);
      }

      case 'list_seat_assignments': {
        if (!body.id) {
          return badRequest('Organization ID is required', undefined, origin);
        }

        const orgForSeats = await prisma.organization.findUnique({
          where: { id: body.id }
        });

        if (!orgForSeats) {
          return badRequest('Organization not found', undefined, origin);
        }

        // Buscar todas as atribuições de assento da organização
        const seatAssignments = await prisma.licenseSeatAssignment.findMany({
          where: {
            license: {
              organization_id: body.id,
              ...(body.license_id ? { id: body.license_id } : {})
            }
          },
          include: {
            license: {
              select: {
                id: true,
                license_key: true,
                plan_type: true,
                product_type: true,
                is_active: true
              }
            }
          },
          orderBy: { assigned_at: 'desc' }
        });

        // Buscar informações dos usuários
        const userPoolId = process.env.COGNITO_USER_POOL_ID;
        const seatsWithUserInfo = await Promise.all(
          seatAssignments.map(async (seat) => {
            // Buscar perfil do usuário
            const profile = await prisma.profile.findFirst({
              where: { user_id: seat.user_id },
              select: {
                full_name: true,
                role: true
              }
            });

            // Buscar email do Cognito
            let email: string | undefined;
            if (userPoolId) {
              try {
                const listResponse = await cognitoClient.send(new ListUsersCommand({
                  UserPoolId: userPoolId,
                  Filter: `sub = "${seat.user_id}"`,
                  Limit: 1
                }));
                const cognitoUser = listResponse.Users?.[0];
                if (cognitoUser) {
                  email = cognitoUser.Attributes?.find(a => a.Name === 'email')?.Value;
                }
              } catch (err) {
                logger.warn('Failed to get email from Cognito', { userId: seat.user_id });
              }
            }

            return {
              id: seat.id,
              user_id: seat.user_id,
              user_name: profile?.full_name || null,
              user_email: email || null,
              user_role: profile?.role || 'user',
              license_id: seat.license_id,
              license_key: seat.license.license_key,
              license_plan: seat.license.plan_type,
              license_product: seat.license.product_type,
              license_active: seat.license.is_active,
              assigned_at: seat.assigned_at,
              assigned_by: seat.assigned_by
            };
          })
        );

        logger.info('Listed seat assignments for organization', {
          organizationId: body.id,
          seatCount: seatsWithUserInfo.length,
          requestedBy: user.sub || user.id,
        });

        return success({
          seat_assignments: seatsWithUserInfo,
          total: seatsWithUserInfo.length
        }, 200, origin);
      }

      case 'release_seat': {
        if (!body.id) {
          return badRequest('Organization ID is required', undefined, origin);
        }

        if (!body.seat_assignment_id) {
          return badRequest('Seat assignment ID is required', undefined, origin);
        }

        // Verificar se a organização existe
        const orgForRelease = await prisma.organization.findUnique({
          where: { id: body.id }
        });

        if (!orgForRelease) {
          return badRequest('Organization not found', undefined, origin);
        }

        // Buscar a atribuição de assento
        const seatAssignment = await prisma.licenseSeatAssignment.findUnique({
          where: { id: body.seat_assignment_id },
          include: {
            license: {
              select: {
                id: true,
                organization_id: true,
                license_key: true,
                used_seats: true,
                available_seats: true
              }
            }
          }
        });

        if (!seatAssignment) {
          return badRequest('Seat assignment not found', undefined, origin);
        }

        // Verificar se a atribuição pertence à organização
        if (seatAssignment.license.organization_id !== body.id) {
          return forbidden('Seat assignment does not belong to this organization', origin);
        }

        // Buscar informações do usuário para o log
        const userProfile = await prisma.profile.findFirst({
          where: { user_id: seatAssignment.user_id },
          select: { full_name: true }
        });

        // Deletar a atribuição de assento
        await prisma.licenseSeatAssignment.delete({
          where: { id: body.seat_assignment_id }
        });

        // Atualizar contadores da licença
        await prisma.license.update({
          where: { id: seatAssignment.license_id },
          data: {
            used_seats: { decrement: 1 },
            available_seats: { increment: 1 }
          }
        });

        // Registrar no audit log
        await prisma.auditLog.create({
          data: {
            id: randomUUID(),
            organization_id: body.id,
            user_id: user.sub || user.id || 'system',
            action: 'SEAT_RELEASED',
            resource_type: 'license_seat_assignment',
            resource_id: body.seat_assignment_id,
            details: {
              released_user_id: seatAssignment.user_id,
              released_user_name: userProfile?.full_name || 'Unknown',
              license_id: seatAssignment.license_id,
              license_key: seatAssignment.license.license_key,
              reason: body.reason || 'Released by super admin',
              released_by: user.email || user.sub
            },
            ip_address: event.requestContext?.identity?.sourceIp || 'unknown',
            user_agent: event.headers?.['user-agent'] || 'unknown'
          }
        });

        logger.info('Seat assignment released', {
          organizationId: body.id,
          seatAssignmentId: body.seat_assignment_id,
          releasedUserId: seatAssignment.user_id,
          releasedUserName: userProfile?.full_name,
          licenseId: seatAssignment.license_id,
          releasedBy: user.sub || user.id,
        });

        return success({
          message: 'Seat released successfully',
          released_user_id: seatAssignment.user_id,
          released_user_name: userProfile?.full_name || 'Unknown',
          license_id: seatAssignment.license_id
        }, 200, origin);
      }

      case 'update_license_config': {
        if (!body.id) {
          return badRequest('Organization ID is required', undefined, origin);
        }

        const orgForLicenseConfig = await prisma.organization.findUnique({
          where: { id: body.id }
        });

        if (!orgForLicenseConfig) {
          return badRequest('Organization not found', undefined, origin);
        }

        if (!body.customer_id) {
          return badRequest('customer_id is required', undefined, origin);
        }

        // Validate customer_id format (UUID)
        const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
        if (!uuidRegex.test(body.customer_id)) {
          return badRequest('Invalid customer_id format. Must be a valid UUID.', undefined, origin);
        }

        // Upsert license config
        const licenseConfig = await prisma.organizationLicenseConfig.upsert({
          where: { organization_id: body.id },
          create: {
            organization_id: body.id,
            customer_id: body.customer_id,
            auto_sync: body.auto_sync ?? true,
            sync_status: 'pending',
          },
          update: {
            customer_id: body.customer_id,
            auto_sync: body.auto_sync ?? true,
            sync_status: 'pending',
            sync_error: null,
          },
        });

        // Registrar no audit log
        await prisma.auditLog.create({
          data: {
            id: randomUUID(),
            organization_id: body.id,
            user_id: user.sub || user.id || 'system',
            action: 'SETTINGS_UPDATE',
            resource_type: 'organization_license_config',
            resource_id: licenseConfig.id,
            details: {
              customer_id: body.customer_id,
              auto_sync: body.auto_sync ?? true,
              updated_by: user.email || user.sub,
              trigger_sync: body.trigger_sync ?? false
            },
            ip_address: event.requestContext?.identity?.sourceIp || 'unknown',
            user_agent: event.headers?.['user-agent'] || 'unknown'
          }
        });

        logger.info('License config updated by super admin', {
          organizationId: body.id,
          customerId: body.customer_id,
          autoSync: body.auto_sync,
          triggerSync: body.trigger_sync,
          updatedBy: user.sub || user.id,
        });

        // Trigger sync if requested
        let syncResult = null;
        if (body.trigger_sync) {
          try {
            syncResult = await syncOrganizationLicenses(body.id);
            logger.info('License sync triggered by super admin', {
              organizationId: body.id,
              syncResult,
            });
          } catch (syncErr) {
            logger.error('License sync failed', syncErr, { organizationId: body.id });
            syncResult = { success: false, error: 'Sync failed' };
          }
        }

        return success({
          message: 'License configuration updated successfully',
          config: {
            customer_id: licenseConfig.customer_id,
            auto_sync: licenseConfig.auto_sync,
            last_sync_at: licenseConfig.last_sync_at,
            sync_status: licenseConfig.sync_status,
            sync_error: licenseConfig.sync_error,
          },
          sync_result: syncResult,
        }, 200, origin);
      }

      default:
        return badRequest(`Invalid action: ${body.action}`, undefined, origin);
    }
    
  } catch (err: any) {
    logger.error('Manage organizations error', err, {
      userId: user.sub || user.id,
      requestId: context.awsRequestId,
    });
    
    return error('Failed to manage organizations. Please try again.', 500, undefined, origin);
  }
}
