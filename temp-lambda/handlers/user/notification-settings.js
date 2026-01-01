"use strict";
/**
 * User Notification Settings Handler
 * Manages user notification preferences
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHandler = getHandler;
exports.postHandler = postHandler;
exports.deleteHandler = deleteHandler;
const response_js_1 = require("../../lib/response.js");
const logging_js_1 = require("../../lib/logging.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const middleware_js_1 = require("../../lib/middleware.js");
/**
 * Get user notification settings
 */
async function getHandler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    if (httpMethod === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    let userId;
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        userId = user.sub || user.id || 'unknown';
        (0, auth_js_1.getOrganizationId)(user); // Validate auth
    }
    catch (authError) {
        logging_js_1.logger.error('Authentication error', authError);
        return (0, response_js_1.error)('Unauthorized', 401, undefined, origin);
    }
    try {
        const prisma = (0, database_js_1.getPrismaClient)();
        const existingSettings = await prisma.notificationSettings.findUnique({
            where: { userId },
        });
        if (!existingSettings) {
            const defaultSettings = {
                email_enabled: true,
                webhook_enabled: false,
                slack_enabled: false,
                datadog_enabled: false,
                graylog_enabled: false,
                zabbix_enabled: false,
                notify_on_critical: true,
                notify_on_high: true,
                notify_on_medium: false,
                notify_on_scan_complete: true,
            };
            return (0, response_js_1.success)(defaultSettings, 200, origin);
        }
        logging_js_1.logger.info('Notification settings retrieved', { userId });
        return (0, response_js_1.success)(existingSettings, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Failed to get notification settings', err);
        return (0, response_js_1.error)('Failed to get notification settings', 500, undefined, origin);
    }
}
/**
 * Update user notification settings
 */
async function postHandler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    if (httpMethod === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    let userId;
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        userId = user.sub || user.id || 'unknown';
        (0, auth_js_1.getOrganizationId)(user);
    }
    catch (authError) {
        logging_js_1.logger.error('Authentication error', authError);
        return (0, response_js_1.error)('Unauthorized', 401, undefined, origin);
    }
    try {
        if (!event.body) {
            return (0, response_js_1.badRequest)('Request body is required', undefined, origin);
        }
        const settings = JSON.parse(event.body);
        if (typeof settings.email_enabled !== 'boolean') {
            return (0, response_js_1.badRequest)('email_enabled is required and must be boolean', undefined, origin);
        }
        // Validate URLs
        if (settings.webhook_enabled && settings.webhook_url) {
            try {
                new URL(settings.webhook_url);
            }
            catch {
                return (0, response_js_1.badRequest)('Invalid webhook URL format', undefined, origin);
            }
        }
        if (settings.slack_enabled && settings.slack_webhook_url) {
            if (!settings.slack_webhook_url.startsWith('https://hooks.slack.com/')) {
                return (0, response_js_1.badRequest)('Invalid Slack webhook URL format', undefined, origin);
            }
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        const updatedSettings = await prisma.notificationSettings.upsert({
            where: { userId },
            update: { ...settings, updated_at: new Date() },
            create: { userId, ...settings, created_at: new Date(), updated_at: new Date() },
        });
        logging_js_1.logger.info('Notification settings updated', { userId, settingsId: updatedSettings.id });
        return (0, response_js_1.success)({ message: 'Notification settings updated successfully', settings: updatedSettings }, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Failed to update notification settings', err);
        return (0, response_js_1.error)('Failed to update notification settings', 500, undefined, origin);
    }
}
/**
 * Delete user notification settings (reset to defaults)
 */
async function deleteHandler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    if (httpMethod === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    let userId;
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        userId = user.sub || user.id || 'unknown';
        (0, auth_js_1.getOrganizationId)(user);
    }
    catch (authError) {
        logging_js_1.logger.error('Authentication error', authError);
        return (0, response_js_1.error)('Unauthorized', 401, undefined, origin);
    }
    try {
        const prisma = (0, database_js_1.getPrismaClient)();
        await prisma.notificationSettings.deleteMany({ where: { userId } });
        logging_js_1.logger.info('Notification settings deleted (reset to defaults)', { userId });
        return (0, response_js_1.success)({ message: 'Notification settings reset to defaults' }, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Failed to delete notification settings', err);
        return (0, response_js_1.error)('Failed to delete notification settings', 500, undefined, origin);
    }
}
//# sourceMappingURL=notification-settings.js.map