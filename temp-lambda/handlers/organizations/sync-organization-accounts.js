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
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    const user = (0, auth_js_1.getUserFromEvent)(event);
    const organizationId = (0, auth_js_1.getOrganizationId)(user);
    logging_js_1.logger.info('Sync organization accounts started', {
        organizationId,
        userId: user.sub,
        requestId: context.awsRequestId
    });
    try {
        const prisma = (0, database_js_1.getPrismaClient)();
        // Listar contas da AWS Organizations
        const orgsClient = new client_organizations_1.OrganizationsClient({ region: 'us-east-1' });
        let allAccounts = [];
        let nextToken;
        do {
            const response = await orgsClient.send(new client_organizations_1.ListAccountsCommand({
                NextToken: nextToken,
                MaxResults: 20,
            }));
            if (response.Accounts) {
                allAccounts.push(...response.Accounts);
            }
            nextToken = response.NextToken;
        } while (nextToken);
        logging_js_1.logger.info('Found AWS Organization accounts', {
            organizationId,
            accountsCount: allAccounts.length
        });
        // Sincronizar com banco de dados
        let created = 0;
        let updated = 0;
        for (const awsAccount of allAccounts) {
            if (!awsAccount.Id)
                continue;
            const existingAccount = await prisma.awsAccount.findFirst({
                where: {
                    organization_id: organizationId,
                    account_id: awsAccount.Id,
                },
            });
            if (existingAccount) {
                // Atualizar
                await prisma.awsAccount.update({
                    where: { id: existingAccount.id },
                    data: {
                        account_name: awsAccount.Name || existingAccount.account_name,
                        email: awsAccount.Email || existingAccount.email,
                        status: awsAccount.Status || existingAccount.status,
                    },
                });
                updated++;
            }
            else {
                // Criar
                await prisma.awsAccount.create({
                    data: {
                        organization_id: organizationId,
                        account_id: awsAccount.Id,
                        account_name: awsAccount.Name || 'Unknown',
                        email: awsAccount.Email,
                        status: awsAccount.Status || 'ACTIVE',
                    },
                });
                created++;
            }
        }
        logging_js_1.logger.info('Organization accounts sync completed', {
            organizationId,
            totalAccounts: allAccounts.length,
            created,
            updated
        });
        return (0, response_js_1.success)({
            total_accounts: allAccounts.length,
            created,
            updated,
            synced_at: new Date().toISOString(),
        });
    }
    catch (err) {
        logging_js_1.logger.error('Sync organization accounts error', err, {
            organizationId,
            userId: user.sub,
            requestId: context.awsRequestId
        });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=sync-organization-accounts.js.map