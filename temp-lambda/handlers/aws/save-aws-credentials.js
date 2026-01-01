"use strict";
/**
 * Lambda handler para salvar credenciais AWS
 * Cria organização automaticamente se não existir
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
    // Try to get origin from headers (case-insensitive)
    const headers = event.headers || {};
    const origin = headers['origin'] || headers['Origin'] || '*';
    return origin;
}
async function handler(event, context) {
    // Get origin for CORS - ALWAYS include in all responses
    const origin = getOriginFromEvent(event);
    // Support both REST API (httpMethod) and HTTP API (requestContext.http.method)
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    if (httpMethod === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    // DEBUG: Log the entire authorizer context to understand the structure
    logging_js_1.logger.info('DEBUG: Event authorizer context', {
        hasAuthorizer: !!event.requestContext?.authorizer,
        authorizerKeys: event.requestContext?.authorizer ? Object.keys(event.requestContext.authorizer) : [],
        hasClaims: !!event.requestContext?.authorizer?.claims,
        hasJwtClaims: !!event.requestContext?.authorizer?.jwt?.claims,
        claimsKeys: event.requestContext?.authorizer?.claims ? Object.keys(event.requestContext.authorizer.claims) : [],
        jwtClaimsKeys: event.requestContext?.authorizer?.jwt?.claims ? Object.keys(event.requestContext.authorizer.jwt.claims) : [],
        // Log specific claim values
        orgIdFromClaims: event.requestContext?.authorizer?.claims?.['custom:organization_id'],
        orgIdFromJwt: event.requestContext?.authorizer?.jwt?.claims?.['custom:organization_id'],
        origin: origin,
    });
    let organizationId;
    let userId;
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        logging_js_1.logger.info('DEBUG: User from event', {
            sub: user.sub,
            email: user.email,
            orgId: user['custom:organization_id'],
            userKeys: Object.keys(user),
        });
        userId = user.sub || user.id || 'unknown';
        organizationId = (0, auth_js_1.getOrganizationId)(user);
    }
    catch (authError) {
        logging_js_1.logger.error('Authentication error', authError, {
            authorizerContext: JSON.stringify(event.requestContext?.authorizer || {}),
        });
        return (0, response_js_1.error)('Authentication failed: ' + (authError.message || 'Unknown error'), 401, undefined, origin);
    }
    logging_js_1.logger.info('Save AWS credentials started', {
        organizationId,
        userId,
        requestId: context.awsRequestId
    });
    try {
        const body = (0, request_parser_js_1.parseEventBody)(event, {}, 'save-aws-credentials');
        // Validate required fields
        if (!body.account_name || !body.access_key_id || !body.secret_access_key || !body.account_id) {
            return (0, response_js_1.badRequest)('Missing required fields: account_name, access_key_id, secret_access_key, account_id', undefined, origin);
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        // CRITICAL: Ensure organization exists in database
        // This handles the case where user was created in Cognito but organization doesn't exist in PostgreSQL
        let organization = await prisma.organization.findUnique({
            where: { id: organizationId }
        });
        if (!organization) {
            logging_js_1.logger.info('Organization not found, creating automatically', { organizationId });
            // Create organization with a slug derived from the ID
            const slug = `org-${organizationId.substring(0, 8).toLowerCase()}`;
            try {
                organization = await prisma.organization.create({
                    data: {
                        id: organizationId,
                        name: `Organization ${organizationId.substring(0, 8)}`,
                        slug: slug,
                    }
                });
                logging_js_1.logger.info('Organization created successfully', { organizationId, slug });
            }
            catch (createError) {
                // Handle unique constraint violation on slug
                if (createError.code === 'P2002') {
                    const uniqueSlug = `org-${organizationId.substring(0, 8).toLowerCase()}-${Date.now()}`;
                    organization = await prisma.organization.create({
                        data: {
                            id: organizationId,
                            name: `Organization ${organizationId.substring(0, 8)}`,
                            slug: uniqueSlug,
                        }
                    });
                    logging_js_1.logger.info('Organization created with unique slug', { organizationId, slug: uniqueSlug });
                }
                else {
                    throw createError;
                }
            }
        }
        // Check if credentials already exist for this account
        const existingCred = await prisma.awsCredential.findFirst({
            where: {
                account_id: body.account_id,
                organization_id: organizationId,
            },
        });
        if (existingCred) {
            logging_js_1.logger.warn('AWS credentials already exist for this account', {
                accountId: body.account_id,
                organizationId
            });
            // Update existing credentials instead of failing
            const updatedCred = await prisma.awsCredential.update({
                where: { id: existingCred.id },
                data: {
                    account_name: body.account_name,
                    access_key_id: body.access_key_id,
                    secret_access_key: body.secret_access_key,
                    external_id: body.external_id,
                    regions: body.regions,
                    is_active: body.is_active !== false,
                }
            });
            logging_js_1.logger.info('AWS credentials updated successfully', {
                credentialId: updatedCred.id,
                accountId: body.account_id,
                organizationId
            });
            return (0, response_js_1.success)({
                id: updatedCred.id,
                account_id: updatedCred.account_id,
                account_name: updatedCred.account_name,
                regions: updatedCred.regions,
                is_active: updatedCred.is_active,
                created_at: updatedCred.created_at,
                updated: true,
            }, 200, origin);
        }
        // Create new credentials
        const credential = await prisma.awsCredential.create({
            data: {
                organization_id: organizationId,
                account_id: body.account_id,
                account_name: body.account_name,
                access_key_id: body.access_key_id,
                secret_access_key: body.secret_access_key,
                external_id: body.external_id,
                regions: body.regions,
                is_active: body.is_active !== false,
            },
        });
        logging_js_1.logger.info('AWS credentials saved successfully', {
            credentialId: credential.id,
            accountId: body.account_id,
            organizationId
        });
        return (0, response_js_1.success)({
            id: credential.id,
            account_id: credential.account_id,
            account_name: credential.account_name,
            regions: credential.regions,
            is_active: credential.is_active,
            created_at: credential.created_at,
        }, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Save AWS credentials error', err, {
            organizationId,
            userId,
            requestId: context.awsRequestId,
            errorCode: err.code,
            errorMessage: err.message
        });
        // Provide more specific error messages
        if (err.code === 'P2003') {
            return (0, response_js_1.error)('Organization not found. Please contact support.', 500, undefined, origin);
        }
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Failed to save AWS credentials', 500, undefined, origin);
    }
}
//# sourceMappingURL=save-aws-credentials.js.map