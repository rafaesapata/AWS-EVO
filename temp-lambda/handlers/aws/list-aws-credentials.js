"use strict";
/**
 * Lambda handler para listar credenciais AWS da organização
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
/**
 * Get origin from event for CORS headers
 */
function getOriginFromEvent(event) {
    const headers = event.headers || {};
    return headers['origin'] || headers['Origin'] || '*';
}
async function handler(event, context) {
    const origin = getOriginFromEvent(event);
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    if (httpMethod === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    let organizationId;
    let userId;
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        userId = user.sub || user.id || 'unknown';
        organizationId = (0, auth_js_1.getOrganizationId)(user);
    }
    catch (authError) {
        logging_js_1.logger.error('Authentication error', authError);
        return (0, response_js_1.error)('Authentication failed: ' + (authError.message || 'Unknown error'), 401, undefined, origin);
    }
    logging_js_1.logger.info('List AWS credentials started', {
        organizationId,
        userId,
        requestId: context.awsRequestId
    });
    try {
        const prisma = (0, database_js_1.getPrismaClient)();
        // Get all active credentials for the organization
        const credentials = await prisma.awsCredential.findMany({
            where: {
                organization_id: organizationId,
                is_active: true,
            },
            orderBy: {
                created_at: 'desc',
            },
            select: {
                id: true,
                account_id: true,
                account_name: true,
                access_key_id: true,
                external_id: true,
                regions: true,
                is_active: true,
                created_at: true,
                updated_at: true,
                // Don't return secret_access_key for security
            },
        });
        // Map account_id to aws_account_number for frontend compatibility
        const mappedCredentials = credentials.map(cred => ({
            ...cred,
            aws_account_number: cred.account_id,
        }));
        logging_js_1.logger.info('AWS credentials listed successfully', {
            organizationId,
            count: credentials.length,
        });
        return (0, response_js_1.success)(mappedCredentials, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('List AWS credentials error', err, {
            organizationId,
            userId,
            requestId: context.awsRequestId,
        });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Failed to list AWS credentials', 500, undefined, origin);
    }
}
//# sourceMappingURL=list-aws-credentials.js.map