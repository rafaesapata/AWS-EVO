"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const logging_js_1 = require("../../lib/logging.js");
const database_js_1 = require("../../lib/database.js");
const auth_js_1 = require("../../lib/auth.js");
const response_js_1 = require("../../lib/response.js");
const request_parser_js_1 = require("../../lib/request-parser.js");
const middleware_js_1 = require("../../lib/middleware.js");
const crypto = __importStar(require("crypto"));
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const cognitoClient = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({});
async function handler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    if (httpMethod === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    let adminUserId;
    let authOrganizationId;
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        adminUserId = user.sub || user.id || 'unknown';
        authOrganizationId = (0, auth_js_1.getOrganizationId)(user);
    }
    catch (authError) {
        logging_js_1.logger.error('Authentication error', authError);
        return (0, response_js_1.error)('Unauthorized', 401, undefined, origin);
    }
    try {
        const prisma = (0, database_js_1.getPrismaClient)();
        // Verificar se é admin
        const adminProfile = await prisma.profile.findFirst({
            where: {
                user_id: adminUserId,
                organization_id: authOrganizationId
            }
        });
        if (!adminProfile || !adminProfile.role || !['ADMIN', 'SUPER_ADMIN'].includes(adminProfile.role)) {
            return (0, response_js_1.forbidden)('Admin access required', origin);
        }
        const body = (0, request_parser_js_1.safeParseJSON)(event.body, {}, 'create-user');
        const { email, name, role, temporaryPassword, sendInvite = true } = body;
        // Use auth organization - CRITICAL: Multi-tenancy enforcement
        const organizationId = authOrganizationId;
        if (!email || !name || !role) {
            return (0, response_js_1.badRequest)('Missing required fields: email, name, role', undefined, origin);
        }
        if (!isValidEmail(email)) {
            return (0, response_js_1.badRequest)('Invalid email format', undefined, origin);
        }
        // Verificar se organização existe
        const organization = await prisma.organization.findUnique({
            where: { id: organizationId }
        });
        if (!organization) {
            return (0, response_js_1.notFound)('Organization not found', origin);
        }
        // Verificar se email já existe
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return (0, response_js_1.badRequest)('User with this email already exists', undefined, origin);
        }
        // Verificar limite de usuários
        const userCount = await prisma.profile.count({ where: { organization_id: organizationId } });
        const license = await prisma.license.findFirst({
            where: { organization_id: organizationId, is_active: true }
        });
        if (license && userCount >= license.max_users) {
            return (0, response_js_1.forbidden)('User limit reached for this organization', origin);
        }
        // Criar usuário no Cognito
        const userPoolId = process.env.COGNITO_USER_POOL_ID;
        if (!userPoolId) {
            return (0, response_js_1.error)('Cognito not configured', 500, undefined, origin);
        }
        const password = temporaryPassword || generateSecurePassword();
        const cognitoResponse = await cognitoClient.send(new client_cognito_identity_provider_1.AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: email,
            UserAttributes: [
                { Name: 'email', Value: email },
                { Name: 'email_verified', Value: 'true' },
                { Name: 'name', Value: name },
                { Name: 'custom:organizationId', Value: organizationId },
                { Name: 'custom:role', Value: role }
            ],
            TemporaryPassword: password,
            MessageAction: sendInvite ? 'RESEND' : 'SUPPRESS'
        }));
        const cognitoId = cognitoResponse.User?.Username;
        if (!sendInvite && temporaryPassword) {
            await cognitoClient.send(new client_cognito_identity_provider_1.AdminSetUserPasswordCommand({
                UserPoolId: userPoolId,
                Username: email,
                Password: temporaryPassword,
                Permanent: true
            }));
        }
        // Adicionar ao grupo do Cognito
        const groupName = `${organizationId}-${role.toLowerCase()}`;
        try {
            await cognitoClient.send(new client_cognito_identity_provider_1.AdminAddUserToGroupCommand({
                UserPoolId: userPoolId,
                Username: email,
                GroupName: groupName
            }));
        }
        catch {
            logging_js_1.logger.info(`Group ${groupName} may not exist, skipping`);
        }
        // Criar usuário no banco
        const newUser = await prisma.user.create({
            data: { email, full_name: name, is_active: true }
        });
        // Criar profile
        await prisma.profile.create({
            data: {
                user_id: newUser.id,
                organization_id: organizationId,
                role: role
            }
        });
        // Registrar auditoria
        await prisma.auditLog.create({
            data: {
                organization_id: organizationId,
                user_id: adminUserId,
                action: 'CREATE_USER',
                resource_type: 'USER',
                resource_id: newUser.id,
                details: { email, role, createdBy: adminUserId },
                ip_address: event.requestContext?.identity?.sourceIp || event.headers?.['x-forwarded-for']?.split(',')[0],
                user_agent: event.headers?.['user-agent']
            }
        });
        return (0, response_js_1.success)({
            user: {
                id: newUser.id,
                email: newUser.email,
                name: newUser.full_name,
                isActive: newUser.is_active
            },
            inviteSent: sendInvite
        }, 201, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Create user error:', err);
        return (0, response_js_1.error)('Internal server error', 500, undefined, origin);
    }
}
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
function generateSecurePassword() {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*';
    const all = upper + lower + numbers + special;
    // Garantir pelo menos um de cada tipo
    let password = '';
    password += upper[crypto.randomInt(upper.length)];
    password += lower[crypto.randomInt(lower.length)];
    password += numbers[crypto.randomInt(numbers.length)];
    password += special[crypto.randomInt(special.length)];
    // Completar com caracteres aleatórios
    for (let i = 4; i < 16; i++) {
        password += all[crypto.randomInt(all.length)];
    }
    // Embaralhar (Fisher-Yates)
    const arr = password.split('');
    for (let i = arr.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.join('');
}
//# sourceMappingURL=create-user.js.map