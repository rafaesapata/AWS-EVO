"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
const client_organizations_1 = require("@aws-sdk/client-organizations");
async function handler(event, context) {
    const user = (0, auth_js_1.getUserFromEvent)(event);
    const organizationId = (0, auth_js_1.getOrganizationId)(user);
    logging_js_1.logger.info('Create organization account started', {
        organizationId,
        userId: user.sub,
        requestId: context.awsRequestId
    });
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        // Apenas admins podem criar contas
        (0, auth_js_1.requireRole)(user, 'admin');
        const body = event.body ? JSON.parse(event.body) : {};
        const { accountName, email, roleName = 'OrganizationAccountAccessRole', iamUserAccessToBilling = 'DENY' } = body;
        if (!accountName || !email) {
            return (0, response_js_1.badRequest)('accountName and email are required');
        }
        logging_js_1.logger.info('Creating AWS organization account', {
            organizationId,
            accountName,
            email: email.substring(0, 5) + '***' // Mask email for privacy
        });
        const prisma = (0, database_js_1.getPrismaClient)();
        // Criar conta na AWS Organizations
        const orgsClient = new client_organizations_1.OrganizationsClient({ region: 'us-east-1' });
        const createAccountResponse = await orgsClient.send(new client_organizations_1.CreateAccountCommand({
            AccountName: accountName,
            Email: email,
            RoleName: roleName,
            IamUserAccessToBilling: iamUserAccessToBilling,
        }));
        const requestId = createAccountResponse.CreateAccountStatus?.Id;
        if (!requestId) {
            throw new Error('Failed to create account: no request ID returned');
        }
        logging_js_1.logger.info('AWS account creation initiated', {
            organizationId,
            accountName,
            requestId
        });
        // Armazenar no banco (status pending)
        const account = await prisma.awsAccount.create({
            data: {
                organization_id: organizationId,
                account_id: requestId, // Temporário, será atualizado quando a conta for criada
                account_name: accountName,
                email,
                status: 'PENDING',
            },
        });
        return (0, response_js_1.success)({
            account_id: account.id,
            request_id: requestId,
            status: 'PENDING',
            message: 'Account creation initiated. It may take a few minutes to complete.',
        });
    }
    catch (err) {
        logging_js_1.logger.error('Create organization account error', err, {
            organizationId,
            userId: user.sub,
            requestId: context.awsRequestId
        });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=create-organization-account.js.map