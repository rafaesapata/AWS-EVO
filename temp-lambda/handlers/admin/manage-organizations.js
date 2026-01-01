"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
const request_parser_js_1 = require("../../lib/request-parser.js");
const crypto_1 = require("crypto");
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const cognitoClient = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({ region: 'us-east-1' });
function getOriginFromEvent(event) {
    const headers = event.headers || {};
    return headers['origin'] || headers['Origin'] || '*';
}
function generateSlug(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);
}
/**
 * Sincroniza o nome da organização no Cognito para todos os usuários
 */
async function syncOrganizationNameInCognito(organizationId, newName) {
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    if (!userPoolId) {
        logging_js_1.logger.warn('COGNITO_USER_POOL_ID not configured, skipping Cognito sync');
        return { updated: 0, errors: 0 };
    }
    let updated = 0;
    let errors = 0;
    let paginationToken;
    try {
        // Listar todos os usuários com este organization_id
        do {
            const listResponse = await cognitoClient.send(new client_cognito_identity_provider_1.ListUsersCommand({
                UserPoolId: userPoolId,
                Filter: `"custom:organization_id" = "${organizationId}"`,
                PaginationToken: paginationToken,
                Limit: 60
            }));
            const users = listResponse.Users || [];
            // Atualizar cada usuário
            for (const user of users) {
                try {
                    await cognitoClient.send(new client_cognito_identity_provider_1.AdminUpdateUserAttributesCommand({
                        UserPoolId: userPoolId,
                        Username: user.Username,
                        UserAttributes: [
                            { Name: 'custom:organization_name', Value: newName }
                        ]
                    }));
                    updated++;
                    logging_js_1.logger.info('Updated user organization name in Cognito', {
                        username: user.Username,
                        newOrgName: newName
                    });
                }
                catch (userErr) {
                    errors++;
                    logging_js_1.logger.error('Failed to update user in Cognito', userErr, {
                        username: user.Username
                    });
                }
            }
            paginationToken = listResponse.PaginationToken;
        } while (paginationToken);
    }
    catch (err) {
        logging_js_1.logger.error('Failed to list users from Cognito', err);
        errors++;
    }
    return { updated, errors };
}
async function handler(event, context) {
    const origin = getOriginFromEvent(event);
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    if (httpMethod === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    let user;
    try {
        user = (0, auth_js_1.getUserFromEvent)(event);
    }
    catch (authError) {
        logging_js_1.logger.error('Authentication error', authError);
        return (0, response_js_1.error)('Authentication failed: ' + (authError.message || 'Unknown error'), 401, undefined, origin);
    }
    // CRITICAL: Only super admins can manage organizations
    if (!(0, auth_js_1.isSuperAdmin)(user)) {
        logging_js_1.logger.warn('Non-super-admin attempted to manage organizations', {
            userId: user.sub || user.id,
            email: user.email,
            roles: user.roles,
        });
        return (0, response_js_1.forbidden)('Only super admins can manage organizations', origin);
    }
    const prisma = (0, database_js_1.getPrismaClient)();
    try {
        const body = (0, request_parser_js_1.parseEventBody)(event, { action: 'list' }, 'manage-organizations');
        logging_js_1.logger.info('Manage organizations request', {
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
                return (0, response_js_1.success)(result, 200, origin);
            }
            case 'create': {
                if (!body.name) {
                    return (0, response_js_1.badRequest)('Name is required', undefined, origin);
                }
                const slug = body.slug || generateSlug(body.name);
                // Check if slug already exists
                const existing = await prisma.organization.findUnique({
                    where: { slug }
                });
                if (existing) {
                    return (0, response_js_1.badRequest)(`Organization with slug "${slug}" already exists`, undefined, origin);
                }
                const organization = await prisma.organization.create({
                    data: {
                        id: (0, crypto_1.randomUUID)(),
                        name: body.name,
                        slug: slug,
                    }
                });
                logging_js_1.logger.info('Organization created', {
                    organizationId: organization.id,
                    name: organization.name,
                    slug: organization.slug,
                    createdBy: user.sub || user.id,
                });
                return (0, response_js_1.success)({
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
                    return (0, response_js_1.badRequest)('Organization ID is required', undefined, origin);
                }
                const existing = await prisma.organization.findUnique({
                    where: { id: body.id }
                });
                if (!existing) {
                    return (0, response_js_1.badRequest)('Organization not found', undefined, origin);
                }
                const updateData = {};
                const nameChanged = body.name && body.name !== existing.name;
                if (body.name)
                    updateData.name = body.name;
                if (body.slug) {
                    // Check if new slug is unique
                    const slugExists = await prisma.organization.findFirst({
                        where: {
                            slug: body.slug,
                            NOT: { id: body.id }
                        }
                    });
                    if (slugExists) {
                        return (0, response_js_1.badRequest)(`Slug "${body.slug}" is already in use`, undefined, origin);
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
                    logging_js_1.logger.info('Organization name changed, syncing to Cognito', {
                        organizationId: body.id,
                        oldName: existing.name,
                        newName: body.name
                    });
                    cognitoSync = await syncOrganizationNameInCognito(body.id, body.name);
                }
                logging_js_1.logger.info('Organization updated', {
                    organizationId: organization.id,
                    updatedBy: user.sub || user.id,
                    cognitoUsersUpdated: cognitoSync.updated,
                    cognitoErrors: cognitoSync.errors
                });
                return (0, response_js_1.success)({
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
                    return (0, response_js_1.badRequest)('Organization ID is required', undefined, origin);
                }
                // Note: The current schema doesn't have a status field
                // This would need a schema migration to add status
                // For now, we'll just return success
                logging_js_1.logger.info('Organization status toggle requested (not implemented in schema)', {
                    organizationId: body.id,
                    requestedStatus: body.status,
                });
                return (0, response_js_1.success)({
                    message: 'Status toggle acknowledged',
                    note: 'Status field not yet in database schema'
                }, 200, origin);
            }
            case 'delete': {
                if (!body.id) {
                    return (0, response_js_1.badRequest)('Organization ID is required', undefined, origin);
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
                    return (0, response_js_1.badRequest)('Organization not found', undefined, origin);
                }
                if (org._count.profiles > 0 || org._count.aws_credentials > 0) {
                    return (0, response_js_1.badRequest)(`Cannot delete organization with ${org._count.profiles} users and ${org._count.aws_credentials} AWS credentials. Remove all data first.`, undefined, origin);
                }
                await prisma.organization.delete({
                    where: { id: body.id }
                });
                logging_js_1.logger.info('Organization deleted', {
                    organizationId: body.id,
                    deletedBy: user.sub || user.id,
                });
                return (0, response_js_1.success)({ message: 'Organization deleted successfully' }, 200, origin);
            }
            default:
                return (0, response_js_1.badRequest)(`Invalid action: ${body.action}`, undefined, origin);
        }
    }
    catch (err) {
        logging_js_1.logger.error('Manage organizations error', err, {
            userId: user.sub || user.id,
            requestId: context.awsRequestId,
        });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Failed to manage organizations', 500, undefined, origin);
    }
}
//# sourceMappingURL=manage-organizations.js.map