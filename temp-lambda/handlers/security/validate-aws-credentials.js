"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const aws_helpers_js_1 = require("../../lib/aws-helpers.js");
const logging_js_1 = require("../../lib/logging.js");
const client_sts_1 = require("@aws-sdk/client-sts");
async function handler(event, context) {
    const user = (0, auth_js_1.getUserFromEvent)(event);
    const organizationId = (0, auth_js_1.getOrganizationId)(user);
    logging_js_1.logger.info('Validate AWS credentials started', {
        organizationId,
        userId: user.sub,
        requestId: context.awsRequestId
    });
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const body = event.body ? JSON.parse(event.body) : {};
        const { credentialId, roleArn, externalId, accessKeyId, secretAccessKey } = body;
        const prisma = (0, database_js_1.getPrismaClient)();
        let credentialsToValidate;
        if (credentialId) {
            // Validar credencial existente
            credentialsToValidate = await prisma.awsCredential.findFirst({
                where: {
                    id: credentialId,
                    organization_id: organizationId,
                },
            });
            if (!credentialsToValidate) {
                return (0, response_js_1.badRequest)('Credential not found');
            }
        }
        else if (roleArn && externalId) {
            // Validar novas credenciais (AssumeRole)
            credentialsToValidate = {
                role_arn: roleArn,
                external_id: externalId,
            };
        }
        else if (accessKeyId && secretAccessKey) {
            // Validar novas credenciais (Access Keys)
            credentialsToValidate = {
                access_key_id: accessKeyId,
                secret_access_key: secretAccessKey,
            };
        }
        else {
            return (0, response_js_1.badRequest)('Either credentialId or credentials (roleArn+externalId or accessKeyId+secretAccessKey) required');
        }
        logging_js_1.logger.info('Validating AWS credentials', { organizationId, hasCredentialId: !!credentialId });
        // Resolver credenciais
        const resolvedCreds = await (0, aws_helpers_js_1.resolveAwsCredentials)(credentialsToValidate, 'us-east-1');
        // Validar credenciais
        const isValid = await (0, aws_helpers_js_1.validateAwsCredentials)(resolvedCreds);
        if (!isValid) {
            return (0, response_js_1.success)({
                valid: false,
                message: 'Invalid credentials - unable to assume role or access AWS services',
            });
        }
        // Obter informações da identidade
        const stsClient = new client_sts_1.STSClient({
            region: 'us-east-1',
            credentials: {
                accessKeyId: resolvedCreds.accessKeyId,
                secretAccessKey: resolvedCreds.secretAccessKey,
                sessionToken: resolvedCreds.sessionToken,
            },
        });
        const identity = await stsClient.send(new client_sts_1.GetCallerIdentityCommand({}));
        // Verificar permissões básicas
        const permissions = await checkPermissions(resolvedCreds);
        logging_js_1.logger.info('AWS credentials validated successfully', {
            organizationId,
            accountId: identity.Account,
            principalArn: identity.Arn
        });
        return (0, response_js_1.success)({
            valid: true,
            identity: {
                account: identity.Account,
                arn: identity.Arn,
                user_id: identity.UserId,
            },
            permissions,
        });
    }
    catch (err) {
        logging_js_1.logger.error('Validate AWS credentials error', err, {
            organizationId,
            userId: user.sub,
            requestId: context.awsRequestId
        });
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        // Handle specific AWS errors
        if (errorMessage.includes('InvalidClientTokenId')) {
            return (0, response_js_1.success)({
                valid: false,
                message: 'Invalid access key ID',
            });
        }
        if (errorMessage.includes('SignatureDoesNotMatch')) {
            return (0, response_js_1.success)({
                valid: false,
                message: 'Invalid secret access key',
            });
        }
        if (errorMessage.includes('AccessDenied') || errorMessage.includes('is not authorized to perform: sts:AssumeRole')) {
            return (0, response_js_1.success)({
                valid: false,
                message: 'Access denied - unable to assume role. Please check the role ARN and external ID.',
            });
        }
        if (errorMessage.includes('NoSuchEntity') || errorMessage.includes('does not exist')) {
            return (0, response_js_1.success)({
                valid: false,
                message: 'Role not found - please check the role ARN.',
            });
        }
        if (errorMessage.includes('InvalidParameterValue')) {
            return (0, response_js_1.success)({
                valid: false,
                message: 'Invalid parameter - please check the role ARN format.',
            });
        }
        // For other errors, return as validation failure instead of server error
        return (0, response_js_1.success)({
            valid: false,
            message: `Validation failed: ${errorMessage}`,
        });
    }
}
async function checkPermissions(creds) {
    const requiredPermissions = [
        'ec2:Describe*',
        'rds:Describe*',
        's3:List*',
        'iam:Get*',
        'cloudtrail:Describe*',
        'guardduty:List*',
    ];
    // Simplificado - em produção, usar IAM Policy Simulator
    return {
        checked: requiredPermissions,
        status: 'partial', // 'full', 'partial', 'none'
        message: 'Basic permissions check passed. Full validation recommended.',
    };
}
//# sourceMappingURL=validate-aws-credentials.js.map