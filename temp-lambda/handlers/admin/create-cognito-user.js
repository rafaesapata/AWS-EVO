"use strict";
/**
 * Lambda handler para criar usuário no Cognito
 * Endpoint: POST /api/functions/create-cognito-user
 *
 * Super admins podem criar usuários em qualquer organização
 * Admins regulares só podem criar usuários na própria organização
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
const request_parser_js_1 = require("../../lib/request-parser.js");
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const crypto_1 = require("crypto");
const cognitoClient = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({ region: 'us-east-1' });
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
/**
 * Generate cryptographically secure temporary password
 * Meets Cognito requirements: uppercase, lowercase, number, special char, min 12 chars
 */
function generateTemporaryPassword() {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*';
    const allChars = uppercase + lowercase + numbers + special;
    // Use crypto.randomBytes for secure randomness
    const bytes = (0, crypto_1.randomBytes)(16);
    let password = '';
    // Ensure at least one of each required type
    password += uppercase[bytes[0] % uppercase.length];
    password += lowercase[bytes[1] % lowercase.length];
    password += numbers[bytes[2] % numbers.length];
    password += special[bytes[3] % special.length];
    // Fill remaining with random chars
    for (let i = 4; i < 16; i++) {
        password += allChars[bytes[i] % allChars.length];
    }
    // Shuffle the password using Fisher-Yates
    const shuffleBytes = (0, crypto_1.randomBytes)(password.length);
    const arr = password.split('');
    for (let i = arr.length - 1; i > 0; i--) {
        const j = shuffleBytes[i] % (i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.join('');
}
async function handler(event, context) {
    if (event.requestContext?.http?.method === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    const user = (0, auth_js_1.getUserFromEvent)(event);
    const userOrganizationId = (0, auth_js_1.getOrganizationId)(user);
    const userIsSuperAdmin = (0, auth_js_1.isSuperAdmin)(user);
    const userIsAdmin = (0, auth_js_1.isAdmin)(user);
    logging_js_1.logger.info('Create Cognito user started', {
        organizationId: userOrganizationId,
        userId: user.sub,
        isSuperAdmin: userIsSuperAdmin,
        requestId: context.awsRequestId
    });
    try {
        const body = (0, request_parser_js_1.parseEventBody)(event, {}, 'create-cognito-user');
        const { email, name, temporaryPassword, sendInvite = true, role, organizationId: targetOrgId } = body;
        // Validações
        if (!email || !name) {
            return (0, response_js_1.badRequest)('Missing required fields: email and name');
        }
        if (!isValidEmail(email)) {
            return (0, response_js_1.badRequest)('Invalid email format');
        }
        // Verificar permissões de admin
        if (!userIsAdmin) {
            logging_js_1.logger.warn('Non-admin attempted to create user', {
                userId: user.sub,
                email: user.email
            });
            return (0, response_js_1.forbidden)('Only admins can create users');
        }
        // Determinar organização alvo
        let organizationId = userOrganizationId;
        // Se foi especificada uma organização diferente, verificar se é super_admin
        if (targetOrgId && targetOrgId !== userOrganizationId) {
            if (!userIsSuperAdmin) {
                logging_js_1.logger.warn('Non-super-admin attempted to create user in different organization', {
                    userId: user.sub,
                    userOrg: userOrganizationId,
                    targetOrg: targetOrgId
                });
                return (0, response_js_1.forbidden)('Only super admins can create users in other organizations');
            }
            organizationId = targetOrgId;
        }
        const userPoolId = process.env.COGNITO_USER_POOL_ID;
        if (!userPoolId) {
            logging_js_1.logger.error('COGNITO_USER_POOL_ID not configured');
            return (0, response_js_1.error)('Cognito not configured', 500);
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        // Verificar se a organização alvo existe
        const targetOrg = await prisma.organization.findUnique({
            where: { id: organizationId }
        });
        if (!targetOrg) {
            return (0, response_js_1.badRequest)('Target organization not found');
        }
        // Verificar se usuário já existe no banco
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });
        if (existingUser) {
            return (0, response_js_1.error)('User with this email already exists', 409);
        }
        // Gerar senha temporária se não fornecida
        const password = temporaryPassword || generateTemporaryPassword();
        // Criar usuário no Cognito com nome da organização sincronizado
        const userAttributes = [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'name', Value: name },
            { Name: 'custom:organization_id', Value: organizationId },
            { Name: 'custom:organization_name', Value: targetOrg.name } // Sincroniza nome da org
        ];
        if (role) {
            userAttributes.push({ Name: 'custom:roles', Value: role });
        }
        logging_js_1.logger.info('Creating Cognito user', { email, organizationId });
        const cognitoResponse = await cognitoClient.send(new client_cognito_identity_provider_1.AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: email,
            UserAttributes: userAttributes,
            TemporaryPassword: password,
            // Don't use RESEND for new users - it's only for existing users
            // SUPPRESS = don't send email, undefined = send welcome email
            MessageAction: sendInvite ? undefined : 'SUPPRESS',
            DesiredDeliveryMediums: sendInvite ? ['EMAIL'] : undefined
        }));
        const cognitoUserId = cognitoResponse.User?.Username;
        if (!cognitoUserId) {
            logging_js_1.logger.error('Failed to get Cognito user ID');
            return (0, response_js_1.error)('Failed to create user in Cognito', 500);
        }
        // Se não enviar invite, definir senha permanente
        if (!sendInvite && temporaryPassword) {
            await cognitoClient.send(new client_cognito_identity_provider_1.AdminSetUserPasswordCommand({
                UserPoolId: userPoolId,
                Username: email,
                Password: temporaryPassword,
                Permanent: true
            }));
        }
        logging_js_1.logger.info('Cognito user created successfully', {
            email,
            cognitoUserId,
            organizationId
        });
        return (0, response_js_1.success)({
            userId: cognitoUserId,
            email,
            name,
            temporaryPassword: sendInvite ? undefined : password,
            inviteSent: sendInvite
        }, 201);
    }
    catch (err) {
        logging_js_1.logger.error('Create Cognito user error', err, {
            organizationId: userOrganizationId,
            userId: user.sub,
            requestId: context.awsRequestId
        });
        // Handle Cognito-specific errors
        if (err.name === 'UsernameExistsException') {
            return (0, response_js_1.error)('User already exists in Cognito', 409);
        }
        if (err.name === 'InvalidPasswordException') {
            return (0, response_js_1.error)('Invalid password format', 400);
        }
        if (err.name === 'InvalidParameterException') {
            return (0, response_js_1.error)('Invalid parameters: ' + err.message, 400);
        }
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error', 500);
    }
}
//# sourceMappingURL=create-cognito-user.js.map