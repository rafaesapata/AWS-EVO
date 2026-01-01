"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const aws_helpers_js_1 = require("../../lib/aws-helpers.js");
const logging_js_1 = require("../../lib/logging.js");
const client_wafv2_1 = require("@aws-sdk/client-wafv2");
async function handler(event, context) {
    const user = (0, auth_js_1.getUserFromEvent)(event);
    const organizationId = (0, auth_js_1.getOrganizationId)(user);
    logging_js_1.logger.info('Validate WAF Security started', {
        organizationId,
        userId: user.sub,
        requestId: context.awsRequestId
    });
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const body = event.body ? JSON.parse(event.body) : {};
        const { accountId, region: requestedRegion, scope = 'REGIONAL' } = body;
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
        // Usar região solicitada, ou primeira região da conta, ou padrão
        const accountRegions = account.regions;
        const region = requestedRegion ||
            (accountRegions && accountRegions.length > 0 ? accountRegions[0] : 'us-east-1');
        const resolvedCreds = await (0, aws_helpers_js_1.resolveAwsCredentials)(account, region);
        const wafClient = new client_wafv2_1.WAFV2Client({
            region: scope === 'CLOUDFRONT' ? 'us-east-1' : region,
            credentials: (0, aws_helpers_js_1.toAwsCredentials)(resolvedCreds),
        });
        const listResponse = await wafClient.send(new client_wafv2_1.ListWebACLsCommand({ Scope: scope }));
        const webACLs = listResponse.WebACLs || [];
        const analysis = [];
        for (const acl of webACLs) {
            const getResponse = await wafClient.send(new client_wafv2_1.GetWebACLCommand({
                Name: acl.Name,
                Scope: scope,
                Id: acl.Id,
            }));
            const webACL = getResponse.WebACL;
            const issues = [];
            if (!webACL.Rules || webACL.Rules.length === 0) {
                issues.push('No rules configured');
            }
            if (webACL.DefaultAction?.Allow) {
                issues.push('Default action is Allow (should be Block)');
            }
            analysis.push({
                name: webACL.Name,
                id: webACL.Id,
                rulesCount: webACL.Rules?.length || 0,
                defaultAction: webACL.DefaultAction?.Allow ? 'Allow' : 'Block',
                issues,
                status: issues.length === 0 ? 'secure' : 'needs_review',
            });
        }
        logging_js_1.logger.info('WAF security validation completed', {
            organizationId,
            accountId,
            region,
            scope,
            webACLsCount: webACLs.length,
            secureCount: analysis.filter(a => a.status === 'secure').length,
            needsReviewCount: analysis.filter(a => a.status === 'needs_review').length
        });
        return (0, response_js_1.success)({
            success: true,
            webACLs: analysis,
            summary: {
                total: webACLs.length,
                secure: analysis.filter(a => a.status === 'secure').length,
                needsReview: analysis.filter(a => a.status === 'needs_review').length,
            },
        });
    }
    catch (err) {
        logging_js_1.logger.error('Validate WAF Security error', err, {
            organizationId,
            userId: user.sub,
            requestId: context.awsRequestId
        });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=validate-waf-security.js.map