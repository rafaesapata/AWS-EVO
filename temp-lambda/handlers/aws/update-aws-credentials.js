"use strict";
/**
 * Lambda handler para atualizar credenciais AWS
 * Permite desativar contas e atualizar nome/regiões
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
const request_parser_js_1 = require("../../lib/request-parser.js");
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
    logging_js_1.logger.info('Update AWS credentials started', {
        organizationId,
        userId,
        requestId: context.awsRequestId
    });
    try {
        const body = (0, request_parser_js_1.parseEventBody)(event, {}, 'update-aws-credentials');
        // Validate required fields
        if (!body.id) {
            return (0, response_js_1.badRequest)('Missing required field: id', undefined, origin);
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        // CRITICAL: Verify credential belongs to user's organization (multi-tenancy)
        const existingCred = await prisma.awsCredential.findFirst({
            where: {
                id: body.id,
                organization_id: organizationId,
            },
        });
        if (!existingCred) {
            logging_js_1.logger.warn('AWS credential not found or access denied', {
                credentialId: body.id,
                organizationId
            });
            return (0, response_js_1.error)('Credential not found', 404, undefined, origin);
        }
        // Build update data
        const updateData = {
            updated_at: new Date(),
        };
        if (body.account_name !== undefined) {
            updateData.account_name = body.account_name;
        }
        if (body.regions !== undefined) {
            if (!Array.isArray(body.regions) || body.regions.length === 0) {
                return (0, response_js_1.badRequest)('regions must be a non-empty array', undefined, origin);
            }
            updateData.regions = body.regions;
        }
        if (body.is_active !== undefined) {
            updateData.is_active = body.is_active;
        }
        // Update credential
        const updatedCred = await prisma.awsCredential.update({
            where: { id: body.id },
            data: updateData,
            select: {
                id: true,
                account_id: true,
                account_name: true,
                regions: true,
                is_active: true,
                updated_at: true,
            },
        });
        logging_js_1.logger.info('AWS credentials updated successfully', {
            credentialId: updatedCred.id,
            accountId: updatedCred.account_id,
            organizationId,
            isActive: updatedCred.is_active,
        });
        return (0, response_js_1.success)(updatedCred, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Update AWS credentials error', err, {
            organizationId,
            userId,
            requestId: context.awsRequestId,
        });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Failed to update AWS credentials', 500, undefined, origin);
    }
}
//# sourceMappingURL=update-aws-credentials.js.map