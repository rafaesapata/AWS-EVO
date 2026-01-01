"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const logging_js_1 = require("../../lib/logging.js");
async function handler(event, context) {
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        logging_js_1.logger.info('Check organization binding started', {
            userId: user.sub,
            requestId: context.awsRequestId
        });
        // Get organization ID from the authenticated user's token
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const organizationName = user['custom:organization_name'] || `Organization ${organizationId.substring(0, 8)}`;
        logging_js_1.logger.info('Organization check completed', {
            userId: user.sub,
            hasOrganization: true,
            organizationId,
        });
        return (0, response_js_1.success)({
            hasOrganization: true,
            organizationId,
            organizationName,
        });
    }
    catch (err) {
        logging_js_1.logger.error('Check organization error', err, {
            requestId: context.awsRequestId,
            errorMessage: err.message,
        });
        // Return specific error for organization not found
        if (err.message?.includes('Organization not found') || err.message?.includes('Invalid organization ID')) {
            return (0, response_js_1.error)('Organization not found. Please logout and login again to refresh your session.', 401);
        }
        return (0, response_js_1.error)('Erro ao verificar vínculo de organização');
    }
}
//# sourceMappingURL=check-organization.js.map