"use strict";
/**
 * Delete WebAuthn Credential Handler
 * Removes a WebAuthn/Passkey credential for the authenticated user
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
async function handler(event, context) {
    // Handle CORS preflight
    if (event.requestContext?.http?.method === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    const requestId = context.awsRequestId;
    logging_js_1.logger.info('Delete WebAuthn credential request', { requestId });
    try {
        // Get authenticated user
        const user = (0, auth_js_1.getUserFromEvent)(event);
        if (!user || !user.sub) {
            return (0, response_js_1.error)('Unauthorized', 401);
        }
        const userId = user.sub;
        // Parse request body
        let body;
        try {
            body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        }
        catch (e) {
            return (0, response_js_1.error)('Invalid request body', 400);
        }
        const { credentialId } = body;
        if (!credentialId) {
            return (0, response_js_1.error)('credentialId is required', 400);
        }
        logging_js_1.logger.info('Deleting WebAuthn credential', { userId, credentialId });
        const prisma = (0, database_js_1.getPrismaClient)();
        // First verify the credential belongs to this user
        const credential = await prisma.webAuthnCredential.findFirst({
            where: {
                id: credentialId,
                user_id: userId
            }
        });
        if (!credential) {
            logging_js_1.logger.warn('Credential not found or does not belong to user', { userId, credentialId });
            return (0, response_js_1.error)('Credential not found', 404);
        }
        // Delete the credential
        await prisma.webAuthnCredential.delete({
            where: { id: credentialId }
        });
        logging_js_1.logger.info('WebAuthn credential deleted successfully', { userId, credentialId });
        return (0, response_js_1.success)({
            message: 'Credential deleted successfully',
            credentialId
        });
    }
    catch (err) {
        logging_js_1.logger.error('Error deleting WebAuthn credential', { error: err.message, stack: err.stack });
        return (0, response_js_1.error)('Failed to delete credential: ' + err.message, 500);
    }
}
//# sourceMappingURL=delete-webauthn-credential.js.map