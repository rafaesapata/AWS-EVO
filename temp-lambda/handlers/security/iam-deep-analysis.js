"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const aws_helpers_js_1 = require("../../lib/aws-helpers.js");
const logging_js_1 = require("../../lib/logging.js");
const client_iam_1 = require("@aws-sdk/client-iam");
async function handler(event, context) {
    const user = (0, auth_js_1.getUserFromEvent)(event);
    const organizationId = (0, auth_js_1.getOrganizationId)(user);
    logging_js_1.logger.info('IAM Deep Analysis started', {
        organizationId,
        userId: user.sub,
        requestId: context.awsRequestId
    });
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const body = event.body ? JSON.parse(event.body) : {};
        const { accountId } = body;
        if (!accountId) {
            return (0, response_js_1.error)('Missing required parameter: accountId');
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        const account = await prisma.awsCredential.findFirst({
            where: { id: accountId, organization_id: organizationId, is_active: true },
        });
        if (!account) {
            return (0, response_js_1.error)('AWS account not found');
        }
        const resolvedCreds = await (0, aws_helpers_js_1.resolveAwsCredentials)(account, 'us-east-1');
        const iamClient = new client_iam_1.IAMClient({
            region: 'us-east-1',
            credentials: (0, aws_helpers_js_1.toAwsCredentials)(resolvedCreds),
        });
        // Listar usuários
        const usersResponse = await iamClient.send(new client_iam_1.ListUsersCommand({}));
        const users = usersResponse.Users || [];
        const analysis = [];
        for (const iamUser of users) {
            const userName = iamUser.UserName;
            // Listar políticas inline
            const inlinePolicies = await iamClient.send(new client_iam_1.ListUserPoliciesCommand({ UserName: userName }));
            // Listar políticas anexadas
            const attachedPolicies = await iamClient.send(new client_iam_1.ListAttachedUserPoliciesCommand({ UserName: userName }));
            const issues = [];
            const recommendations = [];
            let riskScore = 0;
            // Análise 1: Usuário sem MFA
            if (!iamUser.PasswordLastUsed) {
                issues.push('User has never logged in');
                riskScore += 10;
            }
            // Análise 2: Muitas políticas inline
            if ((inlinePolicies.PolicyNames?.length || 0) > 3) {
                issues.push(`User has ${inlinePolicies.PolicyNames?.length} inline policies`);
                recommendations.push('Consider using managed policies instead of inline policies');
                riskScore += 15;
            }
            // Análise 3: Políticas com permissões amplas
            const hasAdminPolicy = attachedPolicies.AttachedPolicies?.some(p => p.PolicyName?.includes('Admin') || p.PolicyName?.includes('FullAccess'));
            if (hasAdminPolicy) {
                issues.push('User has administrative permissions');
                recommendations.push('Review if admin access is necessary, consider least privilege');
                riskScore += 30;
            }
            // Análise 4: Usuário inativo
            const daysSinceLastUse = iamUser.PasswordLastUsed
                ? Math.floor((Date.now() - iamUser.PasswordLastUsed.getTime()) / (1000 * 60 * 60 * 24))
                : 999;
            if (daysSinceLastUse > 90) {
                issues.push(`User inactive for ${daysSinceLastUse} days`);
                recommendations.push('Consider disabling or removing inactive user');
                riskScore += 20;
            }
            // Determinar nível de risco
            let riskLevel;
            if (riskScore >= 50)
                riskLevel = 'critical';
            else if (riskScore >= 30)
                riskLevel = 'high';
            else if (riskScore >= 15)
                riskLevel = 'medium';
            else
                riskLevel = 'low';
            analysis.push({
                userName,
                userId: iamUser.UserId,
                createdDate: iamUser.CreateDate,
                lastUsed: iamUser.PasswordLastUsed,
                inlinePoliciesCount: inlinePolicies.PolicyNames?.length || 0,
                attachedPoliciesCount: attachedPolicies.AttachedPolicies?.length || 0,
                issues,
                recommendations,
                riskScore,
                riskLevel,
            });
        }
        // Ordenar por risk score
        analysis.sort((a, b) => b.riskScore - a.riskScore);
        const summary = {
            totalUsers: users.length,
            critical: analysis.filter(a => a.riskLevel === 'critical').length,
            high: analysis.filter(a => a.riskLevel === 'high').length,
            medium: analysis.filter(a => a.riskLevel === 'medium').length,
            low: analysis.filter(a => a.riskLevel === 'low').length,
        };
        logging_js_1.logger.info('IAM Deep Analysis completed', {
            organizationId,
            accountId,
            usersAnalyzed: users.length,
            criticalRisk: summary.critical,
            highRisk: summary.high
        });
        return (0, response_js_1.success)({
            success: true,
            analysis,
            summary,
        });
    }
    catch (err) {
        logging_js_1.logger.error('IAM Deep Analysis error', err, {
            organizationId,
            userId: user.sub,
            requestId: context.awsRequestId
        });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=iam-deep-analysis.js.map