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
const client_sts_1 = require("@aws-sdk/client-sts");
const REQUIRED_PERMISSIONS = [
    'ec2:DescribeInstances',
    'ec2:DescribeSecurityGroups',
    'rds:DescribeDBInstances',
    's3:ListAllMyBuckets',
    's3:GetBucketLocation',
    'guardduty:ListDetectors',
    'guardduty:GetFindings',
    'cloudtrail:LookupEvents',
    'cloudwatch:GetMetricStatistics',
    'cloudwatch:ListMetrics',
    'iam:ListUsers',
    'iam:ListRoles',
    'organizations:DescribeOrganization',
    'organizations:ListAccounts',
    'ce:GetCostAndUsage',
    'wellarchitected:ListWorkloads',
];
async function handler(event, context) {
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    const user = (0, auth_js_1.getUserFromEvent)(event);
    const organizationId = (0, auth_js_1.getOrganizationId)(user);
    logging_js_1.logger.info('Validate Permissions started', {
        organizationId,
        userId: user.sub,
        requestId: context.awsRequestId
    });
    try {
        const body = event.body ? JSON.parse(event.body) : {};
        const { accountId, actions = REQUIRED_PERMISSIONS } = body;
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
        // Obter identidade atual
        const stsClient = new client_sts_1.STSClient({
            region: 'us-east-1',
            credentials: (0, aws_helpers_js_1.toAwsCredentials)(resolvedCreds),
        });
        const identityResponse = await stsClient.send(new client_sts_1.GetCallerIdentityCommand({}));
        const principalArn = identityResponse.Arn;
        logging_js_1.logger.info('Validating permissions for principal', {
            organizationId,
            accountId,
            principalArn,
            actionsCount: actions.length
        });
        // Simular políticas para validar permissões
        const iamClient = new client_iam_1.IAMClient({
            region: 'us-east-1',
            credentials: (0, aws_helpers_js_1.toAwsCredentials)(resolvedCreds),
        });
        const simulateCommand = new client_iam_1.SimulatePrincipalPolicyCommand({
            PolicySourceArn: principalArn,
            ActionNames: actions,
        });
        const simulateResponse = await iamClient.send(simulateCommand);
        // Processar resultados
        const results = (simulateResponse.EvaluationResults || []).map(result => ({
            action: result.EvalActionName,
            decision: result.EvalDecision,
            allowed: result.EvalDecision === 'allowed',
            matchedStatements: result.MatchedStatements?.length || 0,
        }));
        const allowedCount = results.filter(r => r.allowed).length;
        const deniedCount = results.filter(r => !r.allowed).length;
        const missingPermissions = results.filter(r => !r.allowed).map(r => r.action);
        const allPermissionsValid = deniedCount === 0;
        logging_js_1.logger.info('Permissions validation completed', {
            organizationId,
            accountId,
            principalArn,
            totalPermissions: results.length,
            allowedCount,
            deniedCount,
            validationSuccess: allPermissionsValid
        });
        return (0, response_js_1.success)({
            success: true,
            valid: allPermissionsValid,
            principalArn,
            summary: {
                total: results.length,
                allowed: allowedCount,
                denied: deniedCount,
                percentage: Math.round((allowedCount / results.length) * 100),
            },
            results,
            missingPermissions,
        });
    }
    catch (err) {
        logging_js_1.logger.error('Validate Permissions error', err, {
            organizationId,
            userId: user.sub,
            requestId: context.awsRequestId
        });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=validate-permissions.js.map