"use strict";
/**
 * Send Email Notification Handler
 * Handles email sending requests via Amazon SES
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
exports.bulkHandler = bulkHandler;
exports.statsHandler = statsHandler;
const response_js_1 = require("../../lib/response.js");
const email_service_js_1 = require("../../lib/email-service.js");
const logging_js_1 = require("../../lib/logging.js");
const auth_js_1 = require("../../lib/auth.js");
const middleware_js_1 = require("../../lib/middleware.js");
const validation_js_1 = require("../../lib/validation.js");
// Allowed domains for password reset URLs
const ALLOWED_RESET_DOMAINS = [
    'evo.ai.udstec.io',
    'api-evo.ai.udstec.io',
    'localhost',
    process.env.ALLOWED_RESET_DOMAIN
].filter(Boolean);
// Rate limits by email type
const EMAIL_RATE_LIMITS = {
    'single': { type: 'default' },
    'bulk': { type: 'export' },
    'notification': { type: 'default' },
    'alert': { type: 'default' },
    'security': { type: 'sensitive' },
    'welcome': { type: 'auth' },
    'password-reset': { type: 'auth' }
};
/**
 * Validate reset URL against whitelist
 */
function validateResetUrl(url) {
    try {
        const parsed = new URL(url);
        return ALLOWED_RESET_DOMAINS.some(domain => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`));
    }
    catch {
        return false;
    }
}
/**
 * Sanitize HTML content to prevent injection
 */
function sanitizeHtmlContent(html) {
    // Remove script tags and event handlers
    let sanitized = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/vbscript:/gi, '')
        .replace(/data:text\/html/gi, '');
    return sanitized;
}
/**
 * Send email handler
 */
async function handler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    if (httpMethod === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    let organizationId;
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        organizationId = (0, auth_js_1.getOrganizationId)(user);
    }
    catch (authError) {
        logging_js_1.logger.error('Authentication error', authError);
        return (0, response_js_1.error)('Unauthorized', 401, undefined, origin);
    }
    try {
        logging_js_1.logger.info('Send email request received', {
            organizationId,
            method: httpMethod,
        });
        if (!event.body) {
            return (0, response_js_1.badRequest)('Request body is required', undefined, origin);
        }
        let request;
        try {
            request = JSON.parse(event.body);
        }
        catch {
            return (0, response_js_1.badRequest)('Invalid JSON in request body', undefined, origin);
        }
        if (!request.type || !request.to) {
            return (0, response_js_1.badRequest)('type and to fields are required', undefined, origin);
        }
        // SECURITY: Rate limiting by email type
        const rateConfig = EMAIL_RATE_LIMITS[request.type] || EMAIL_RATE_LIMITS['single'];
        try {
            (0, auth_js_1.checkUserRateLimit)(`${organizationId}:email`, rateConfig.type);
        }
        catch (e) {
            if (e instanceof auth_js_1.RateLimitError) {
                return {
                    statusCode: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        'Retry-After': e.retryAfter.toString(),
                        'Access-Control-Allow-Origin': origin || '*',
                    },
                    body: JSON.stringify({
                        error: 'Email rate limit exceeded',
                        retryAfter: e.retryAfter
                    })
                };
            }
            throw e;
        }
        const normalizeEmails = (emails) => {
            const emailArray = Array.isArray(emails) ? emails : [emails];
            return emailArray.map(email => ({ email }));
        };
        let result;
        switch (request.type) {
            case 'single':
                if (!request.subject) {
                    return (0, response_js_1.badRequest)('subject is required for single emails', undefined, origin);
                }
                const emailOptions = {
                    to: normalizeEmails(request.to),
                    cc: request.cc ? normalizeEmails(request.cc) : undefined,
                    bcc: request.bcc ? normalizeEmails(request.bcc) : undefined,
                    subject: (0, validation_js_1.sanitizeStringAdvanced)(request.subject),
                    htmlBody: request.htmlBody ? sanitizeHtmlContent(request.htmlBody) : undefined,
                    textBody: request.textBody ? (0, validation_js_1.sanitizeStringAdvanced)(request.textBody) : undefined,
                    priority: request.priority,
                    tags: request.tags,
                };
                result = await email_service_js_1.emailService.sendEmail(emailOptions);
                break;
            case 'notification':
                if (!request.notificationData || !request.subject) {
                    return (0, response_js_1.badRequest)('notificationData and subject are required for notifications', undefined, origin);
                }
                result = await email_service_js_1.emailService.sendNotification(normalizeEmails(request.to), request.subject, request.notificationData.message, request.notificationData.severity);
                break;
            case 'alert':
                if (!request.alertData) {
                    return (0, response_js_1.badRequest)('alertData is required for alert emails', undefined, origin);
                }
                result = await email_service_js_1.emailService.sendAlert(normalizeEmails(request.to), {
                    ...request.alertData,
                    timestamp: new Date(request.alertData.timestamp),
                });
                break;
            case 'security':
                if (!request.securityEvent) {
                    return (0, response_js_1.badRequest)('securityEvent is required for security emails', undefined, origin);
                }
                result = await email_service_js_1.emailService.sendSecurityNotification(normalizeEmails(request.to), {
                    ...request.securityEvent,
                    timestamp: new Date(request.securityEvent.timestamp),
                });
                break;
            case 'welcome':
                if (!request.welcomeData || Array.isArray(request.to)) {
                    return (0, response_js_1.badRequest)('welcomeData is required and to must be a single email for welcome emails', undefined, origin);
                }
                result = await email_service_js_1.emailService.sendWelcomeEmail({ email: request.to }, request.welcomeData);
                break;
            case 'password-reset':
                if (!request.resetData || Array.isArray(request.to)) {
                    return (0, response_js_1.badRequest)('resetData is required and to must be a single email for password reset emails', undefined, origin);
                }
                // SECURITY: Validate reset URL against whitelist
                if (!validateResetUrl(request.resetData.resetUrl)) {
                    logging_js_1.logger.warn('Invalid reset URL domain attempted', {
                        url: request.resetData.resetUrl,
                        organizationId
                    });
                    return (0, response_js_1.badRequest)('Invalid reset URL domain', undefined, origin);
                }
                result = await email_service_js_1.emailService.sendPasswordResetEmail({ email: request.to }, request.resetData);
                break;
            default:
                return (0, response_js_1.badRequest)(`Unsupported email type: ${request.type}`, undefined, origin);
        }
        logging_js_1.logger.info('Email sent successfully', {
            type: request.type,
            recipients: Array.isArray(request.to) ? request.to.length : 1,
            messageId: 'messageId' in result ? result.messageId : result.messageIds?.[0],
        });
        return (0, response_js_1.success)({
            message: 'Email sent successfully',
            result,
        }, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Failed to send email', err);
        return (0, response_js_1.error)('Failed to send email', 500, undefined, origin);
    }
}
/**
 * Send bulk email handler
 */
async function bulkHandler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    if (httpMethod === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        (0, auth_js_1.getOrganizationId)(user); // Validate auth
    }
    catch (authError) {
        logging_js_1.logger.error('Authentication error', authError);
        return (0, response_js_1.error)('Unauthorized', 401, undefined, origin);
    }
    try {
        logging_js_1.logger.info('Send bulk email request received');
        if (!event.body) {
            return (0, response_js_1.badRequest)('Request body is required', undefined, origin);
        }
        const request = JSON.parse(event.body);
        if (!request.template || !request.recipients || !Array.isArray(request.recipients)) {
            return (0, response_js_1.badRequest)('template and recipients array are required', undefined, origin);
        }
        const result = await email_service_js_1.emailService.sendBulkEmail({
            template: request.template,
            recipients: request.recipients.map((recipient) => ({
                email: { email: recipient.email },
                templateData: recipient.templateData,
            })),
            defaultTemplateData: request.defaultTemplateData,
            tags: request.tags,
        });
        logging_js_1.logger.info('Bulk email sent successfully', {
            template: request.template,
            recipientCount: request.recipients.length,
        });
        return (0, response_js_1.success)({
            message: 'Bulk email sent successfully',
            result,
        }, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Failed to send bulk email', err);
        return (0, response_js_1.error)('Failed to send bulk email', 500, undefined, origin);
    }
}
/**
 * Get email statistics handler
 */
async function statsHandler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    if (httpMethod === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        (0, auth_js_1.getOrganizationId)(user); // Validate auth
    }
    catch (authError) {
        logging_js_1.logger.error('Authentication error', authError);
        return (0, response_js_1.error)('Unauthorized', 401, undefined, origin);
    }
    try {
        logging_js_1.logger.info('Get email stats request received');
        const queryParams = event.queryStringParameters || {};
        const startDate = queryParams.start ? new Date(queryParams.start) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const endDate = queryParams.end ? new Date(queryParams.end) : new Date();
        const stats = await email_service_js_1.emailService.getEmailStats({
            start: startDate,
            end: endDate,
        });
        return (0, response_js_1.success)({
            stats,
            timeRange: {
                start: startDate.toISOString(),
                end: endDate.toISOString(),
            },
        }, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Failed to get email stats', err);
        return (0, response_js_1.error)('Failed to get email stats', 500, undefined, origin);
    }
}
//# sourceMappingURL=send-email.js.map