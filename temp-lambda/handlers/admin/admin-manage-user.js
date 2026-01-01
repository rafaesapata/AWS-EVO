"use strict";
/**
 * Lambda handler para gerenciar usuários (admin)
 * AWS Lambda Handler for admin-manage-user
 *
 * Uses centralized middleware for validation, auth, and rate limiting
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const middleware_js_1 = require("../../lib/middleware.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const schemas_js_1 = require("../../lib/schemas.js");
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
async function handler(event, context) {
    logging_js_1.logger.info('👤 Admin manage user started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        // Apenas admins podem gerenciar usuários
        (0, auth_js_1.requireRole)(user, 'admin');
        // Validar input com Zod
        const parseResult = schemas_js_1.manageUserSchema.safeParse(event.body ? JSON.parse(event.body) : {});
        if (!parseResult.success) {
            const errorMessages = parseResult.error.errors
                .map(err => `${err.path.join('.')}: ${err.message}`)
                .join(', ');
            return (0, response_js_1.badRequest)(`Validation error: ${errorMessages}`);
        }
        const { action, email, attributes, password } = parseResult.data;
        const userPoolId = process.env.USER_POOL_ID;
        if (!userPoolId) {
            throw new Error('USER_POOL_ID not configured');
        }
        const cognitoClient = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' });
        const prisma = (0, database_js_1.getPrismaClient)();
        logging_js_1.logger.info(`🔧 Action: ${action} for user: ${email}`);
        switch (action) {
            case 'update': {
                // Verificar que o usuário pertence à mesma organização (segurança multi-tenant)
                const targetProfile = await prisma.profile.findFirst({
                    where: {
                        user_id: email,
                        organization_id: organizationId,
                    },
                });
                if (!targetProfile) {
                    return (0, response_js_1.forbidden)('Cannot update user from another organization');
                }
                // Atualizar atributos do usuário
                const updateAttributes = [];
                if (attributes?.full_name) {
                    updateAttributes.push({ Name: 'name', Value: attributes.full_name });
                }
                // SEGURANÇA: Admin não pode mudar organization_id de usuário
                if (attributes?.organization_id && attributes.organization_id !== organizationId) {
                    return (0, response_js_1.forbidden)('Cannot change user organization');
                }
                if (attributes?.roles) {
                    updateAttributes.push({ Name: 'custom:roles', Value: JSON.stringify(attributes.roles) });
                }
                if (updateAttributes.length > 0) {
                    await cognitoClient.send(new client_cognito_identity_provider_1.AdminUpdateUserAttributesCommand({
                        UserPoolId: userPoolId,
                        Username: email,
                        UserAttributes: updateAttributes,
                    }));
                }
                // Registrar auditoria
                await prisma.auditLog.create({
                    data: {
                        organization_id: organizationId,
                        user_id: user.sub,
                        action: 'UPDATE_USER',
                        resource_type: 'user',
                        resource_id: email,
                        details: { attributes },
                    },
                });
                return (0, response_js_1.success)({ message: 'User updated successfully', email });
            }
            case 'delete': {
                // Verificar que o usuário pertence à mesma organização (segurança multi-tenant)
                const targetProfile = await prisma.profile.findFirst({
                    where: {
                        user_id: email,
                        organization_id: organizationId,
                    },
                });
                if (!targetProfile) {
                    return (0, response_js_1.forbidden)('Cannot delete user from another organization');
                }
                // Deletar usuário
                await cognitoClient.send(new client_cognito_identity_provider_1.AdminDeleteUserCommand({
                    UserPoolId: userPoolId,
                    Username: email,
                }));
                // Deletar profile do banco
                await prisma.profile.deleteMany({
                    where: {
                        user_id: email,
                        organization_id: organizationId,
                    },
                });
                // Registrar auditoria
                await prisma.auditLog.create({
                    data: {
                        organization_id: organizationId,
                        user_id: user.sub,
                        action: 'DELETE_USER',
                        resource_type: 'user',
                        resource_id: email,
                    },
                });
                return (0, response_js_1.success)({ message: 'User deleted successfully', email });
            }
            case 'enable': {
                await cognitoClient.send(new client_cognito_identity_provider_1.AdminEnableUserCommand({
                    UserPoolId: userPoolId,
                    Username: email,
                }));
                return (0, response_js_1.success)({ message: 'User enabled successfully', email });
            }
            case 'disable': {
                await cognitoClient.send(new client_cognito_identity_provider_1.AdminDisableUserCommand({
                    UserPoolId: userPoolId,
                    Username: email,
                }));
                return (0, response_js_1.success)({ message: 'User disabled successfully', email });
            }
            case 'reset_password': {
                if (!password) {
                    return (0, response_js_1.badRequest)('password is required for reset_password action');
                }
                await cognitoClient.send(new client_cognito_identity_provider_1.AdminSetUserPasswordCommand({
                    UserPoolId: userPoolId,
                    Username: email,
                    Password: password,
                    Permanent: true,
                }));
                return (0, response_js_1.success)({ message: 'Password reset successfully', email });
            }
            default:
                return (0, response_js_1.badRequest)(`Invalid action: ${action}`);
        }
    }
    catch (err) {
        logging_js_1.logger.error('❌ Manage user error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=admin-manage-user.js.map