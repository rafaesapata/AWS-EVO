"use strict";
/**
 * Lambda handler para investigar o problema de dados de custo vs credenciais AWS
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
async function handler(event, context) {
    if (event.requestContext?.http?.method === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const prisma = (0, database_js_1.getPrismaClient)();
        logging_js_1.logger.info('Investigating data mismatch', { organizationId });
        // 1. Check AWS credentials
        const awsCredentials = await prisma.awsCredential.findMany({
            where: {
                organization_id: organizationId
            },
            select: {
                id: true,
                account_name: true,
                account_id: true,
                is_active: true,
                created_at: true
            }
        });
        // 2. Check daily costs
        const dailyCosts = await prisma.dailyCost.findMany({
            where: {
                organization_id: organizationId
            },
            orderBy: {
                date: 'desc'
            },
            take: 10,
            select: {
                id: true,
                date: true,
                service: true,
                cost: true,
                aws_account_id: true,
                created_at: true
            }
        });
        // 3. Get unique account IDs from costs
        const costAccountIds = [...new Set(dailyCosts.map(c => c.aws_account_id))];
        // 4. Check if cost account IDs match credential IDs
        const credentialIds = awsCredentials.map(c => c.id);
        const accountIdMatches = costAccountIds.map(costAccountId => ({
            costAccountId,
            existsInCredentials: credentialIds.includes(costAccountId),
            matchingCredential: awsCredentials.find(c => c.id === costAccountId)
        }));
        // 5. Count costs by account
        const costsByAccount = [];
        for (const accountId of costAccountIds) {
            const count = await prisma.dailyCost.count({
                where: {
                    organization_id: organizationId,
                    aws_account_id: accountId
                }
            });
            costsByAccount.push({
                accountId,
                count,
                hasCredentials: credentialIds.includes(accountId)
            });
        }
        // 6. Check if there are orphaned credentials (credentials without costs)
        const orphanedCredentials = awsCredentials.filter(cred => !costAccountIds.includes(cred.id));
        const investigation = {
            organizationId,
            summary: {
                totalCredentials: awsCredentials.length,
                activeCredentials: awsCredentials.filter(c => c.is_active).length,
                totalCostRecords: dailyCosts.length,
                uniqueCostAccounts: costAccountIds.length,
                accountIdMatches: accountIdMatches.filter(m => m.existsInCredentials).length,
                orphanedCredentials: orphanedCredentials.length
            },
            awsCredentials,
            recentCosts: dailyCosts.map(cost => ({
                date: cost.date.toISOString().split('T')[0],
                service: cost.service,
                cost: cost.cost,
                accountId: cost.aws_account_id,
                createdAt: cost.created_at
            })),
            costAccountIds,
            accountIdMatches,
            costsByAccount,
            orphanedCredentials,
            diagnosis: {
                hasCredentials: awsCredentials.length > 0,
                hasCosts: dailyCosts.length > 0,
                accountIdsMatch: accountIdMatches.some(m => m.existsInCredentials),
                possibleIssues: []
            }
        };
        // Add diagnosis
        if (awsCredentials.length === 0) {
            investigation.diagnosis.possibleIssues.push('NO_AWS_CREDENTIALS');
        }
        if (dailyCosts.length === 0) {
            investigation.diagnosis.possibleIssues.push('NO_COST_DATA');
        }
        if (awsCredentials.length > 0 && dailyCosts.length > 0 && !accountIdMatches.some(m => m.existsInCredentials)) {
            investigation.diagnosis.possibleIssues.push('ACCOUNT_ID_MISMATCH');
        }
        if (orphanedCredentials.length > 0) {
            investigation.diagnosis.possibleIssues.push('ORPHANED_CREDENTIALS');
        }
        logging_js_1.logger.info('Data mismatch investigation completed', investigation);
        return (0, response_js_1.success)(investigation);
    }
    catch (err) {
        logging_js_1.logger.error('Investigation error', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=investigate-data-mismatch.js.map