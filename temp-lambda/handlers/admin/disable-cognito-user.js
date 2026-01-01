"use strict";
/**
 * Lambda handler for Disable Cognito User
 * Desabilita um usuário no Cognito e atualiza status no banco
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const middleware_js_1 = require("../../lib/middleware.js");
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const cognitoClient = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({});
async function handler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const adminUserId = user.sub || user.id || 'unknown';
        const prisma = (0, database_js_1.getPrismaClient)();
        // Verificar se é admin
        const adminProfile = await prisma.profile.findFirst({
            where: {
                user_id: adminUserId,
                organization_id: organizationId
            }
        });
        if (!adminProfile || !adminProfile.role || !['ADMIN', 'SUPER_ADMIN'].includes(adminProfile.role)) {
            return (0, response_js_1.forbidden)('Admin access required', origin);
        }
        const body = event.body ? JSON.parse(event.body) : {};
        const { userId, email } = body;
        if (!userId && !email) {
            return (0, response_js_1.badRequest)('Missing required field: userId or email', undefined, origin);
        }
        const userPoolId = process.env.COGNITO_USER_POOL_ID;
        if (!userPoolId) {
            return (0, response_js_1.error)('Cognito not configured', 500, undefined, origin);
        }
        // Buscar usuário no banco para obter email se necessário
        let targetEmail = email;
        let targetUserId = userId;
        if (!targetEmail && userId) {
            const dbUser = await prisma.user.findUnique({
                where: { id: userId }
            });
            if (dbUser) {
                targetEmail = dbUser.email;
            }
        }
        if (!targetEmail) {
            return (0, response_js_1.badRequest)('User not found', undefined, origin);
        }
        // Buscar usuário pelo email
        const targetUser = await prisma.user.findUnique({
            where: { email: targetEmail }
        });
        if (!targetUser) {
            return (0, response_js_1.badRequest)('User not found', undefined, origin);
        }
        // Verificar se o usuário tem profile na mesma organização
        const targetProfile = await prisma.profile.findFirst({
            where: {
                user_id: targetUser.id,
                organization_id: organizationId
            }
        });
        if (!targetProfile) {
            return (0, response_js_1.forbidden)('Cannot disable user from another organization', origin);
        }
        // Desabilitar no Cognito
        try {
            await cognitoClient.send(new client_cognito_identity_provider_1.AdminDisableUserCommand({
                UserPoolId: userPoolId,
                Username: targetEmail
            }));
        }
        catch (cognitoError) {
            if (cognitoError.name !== 'UserNotFoundException') {
                throw cognitoError;
            }
            logging_js_1.logger.warn(`User ${targetEmail} not found in Cognito, continuing with DB update`);
        }
        // Atualizar status no banco
        await prisma.user.update({
            where: { email: targetEmail },
            data: { is_active: false }
        });
        // Registrar auditoria
        await prisma.auditLog.create({
            data: {
                organization_id: organizationId,
                user_id: adminUserId,
                action: 'DISABLE_USER',
                resource_type: 'USER',
                resource_id: targetUser.id,
                details: {
                    email: targetEmail,
                    disabledBy: adminUserId
                },
                ip_address: event.requestContext?.identity?.sourceIp ||
                    event.headers?.['x-forwarded-for']?.split(',')[0],
                user_agent: event.headers?.['user-agent']
            }
        });
        logging_js_1.logger.info(`✅ User disabled: ${targetEmail}`);
        return (0, response_js_1.success)({
            success: true,
            message: 'User disabled successfully',
            userId: targetUser.id
        }, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('❌ Disable user error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
    }
}
//# sourceMappingURL=disable-cognito-user.js.map