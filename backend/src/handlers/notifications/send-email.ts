/**
 * Send Email Notification Handler
 * Handles email sending requests via Amazon SES
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { emailService, EmailOptions } from '../../lib/email-service.js';
import { logger } from '../../lib/logger.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation, checkUserRateLimit, RateLimitError } from '../../lib/auth.js';
import { getOrigin } from '../../lib/middleware.js';
import { sanitizeStringAdvanced, parseAndValidateBody } from '../../lib/validation.js';
import { sendEmailSchema } from '../../lib/schemas.js';
import { z } from 'zod';

// Allowed domains for password reset URLs
const ALLOWED_RESET_DOMAINS = [
  'evo.ai.udstec.io',
  'api-evo.ai.udstec.io',
  'localhost',
  process.env.ALLOWED_RESET_DOMAIN
].filter(Boolean) as string[];

// Rate limits by email type
const EMAIL_RATE_LIMITS: Record<string, { type: 'default' | 'auth' | 'sensitive' | 'export' }> = {
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
function validateResetUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_RESET_DOMAINS.some(domain => 
      parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

/**
 * Sanitize HTML content to prevent injection
 */
function sanitizeHtmlContent(html: string): string {
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
export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  let organizationId: string;
  
  try {
    const user = getUserFromEvent(event);
    organizationId = getOrganizationIdWithImpersonation(event, user);
  } catch (authError) {
    logger.error('Authentication error', authError);
    return error('Unauthorized', 401, undefined, origin);
  }

  try {
    logger.info('Send email request received', {
      organizationId,
      method: httpMethod,
    });

    if (!event.body) {
      return badRequest('Request body is required', undefined, origin);
    }

    // Validate request body with Zod
    const validation = parseAndValidateBody(sendEmailSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    const request = validation.data;

    // SECURITY: Rate limiting by email type
    const rateConfig = EMAIL_RATE_LIMITS[request.type] || EMAIL_RATE_LIMITS['single'];
    try {
      checkUserRateLimit(`${organizationId}:email`, rateConfig.type);
    } catch (e) {
      if (e instanceof RateLimitError) {
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

    const normalizeEmails = (emails: string | string[]) => {
      const emailArray = Array.isArray(emails) ? emails : [emails];
      return emailArray.map(email => ({ email }));
    };

    let result: { messageId: string } | { messageIds: string[] };

    switch (request.type) {
      case 'single':
        if (!request.subject) {
          return badRequest('subject is required for single emails', undefined, origin);
        }

        const emailOptions: EmailOptions = {
          to: normalizeEmails(request.to),
          cc: request.cc ? normalizeEmails(request.cc) : undefined,
          bcc: request.bcc ? normalizeEmails(request.bcc) : undefined,
          subject: sanitizeStringAdvanced(request.subject),
          htmlBody: request.htmlBody ? sanitizeHtmlContent(request.htmlBody) : undefined,
          textBody: request.textBody ? sanitizeStringAdvanced(request.textBody) : undefined,
          priority: request.priority,
          tags: request.tags,
        };

        result = await emailService.sendEmail(emailOptions);
        break;

      case 'notification':
        if (!request.notificationData || !request.subject) {
          return badRequest('notificationData and subject are required for notifications', undefined, origin);
        }

        result = await emailService.sendNotification(
          normalizeEmails(request.to),
          request.subject,
          request.notificationData.message,
          request.notificationData.severity
        );
        break;

      case 'alert':
        if (!request.alertData) {
          return badRequest('alertData is required for alert emails', undefined, origin);
        }

        result = await emailService.sendAlert(
          normalizeEmails(request.to),
          {
            ...request.alertData,
            timestamp: new Date(request.alertData.timestamp),
          }
        );
        break;

      case 'security':
        if (!request.securityEvent) {
          return badRequest('securityEvent is required for security emails', undefined, origin);
        }

        result = await emailService.sendSecurityNotification(
          normalizeEmails(request.to),
          {
            ...request.securityEvent,
            timestamp: new Date(request.securityEvent.timestamp),
          }
        );
        break;

      case 'welcome':
        if (!request.welcomeData || Array.isArray(request.to)) {
          return badRequest('welcomeData is required and to must be a single email for welcome emails', undefined, origin);
        }

        result = await emailService.sendWelcomeEmail(
          { email: request.to as string },
          request.welcomeData
        );
        break;

      case 'password-reset':
        if (!request.resetData || Array.isArray(request.to)) {
          return badRequest('resetData is required and to must be a single email for password reset emails', undefined, origin);
        }

        // SECURITY: Validate reset URL against whitelist
        if (!validateResetUrl(request.resetData.resetUrl)) {
          logger.warn('Invalid reset URL domain attempted', { 
            url: request.resetData.resetUrl,
            organizationId 
          });
          return badRequest('Invalid reset URL domain', undefined, origin);
        }

        result = await emailService.sendPasswordResetEmail(
          { email: request.to as string },
          request.resetData
        );
        break;

      default:
        return badRequest(`Unsupported email type: ${request.type}`, undefined, origin);
    }

    logger.info('Email sent successfully', {
      type: request.type,
      recipients: Array.isArray(request.to) ? request.to.length : 1,
      messageId: 'messageId' in result ? result.messageId : (result as any).messageIds?.[0],
    });

    return success({
      message: 'Email sent successfully',
      result,
    }, 200, origin);

  } catch (err) {
    logger.error('Failed to send email', err as Error);
    return error('Failed to send email', 500, undefined, origin);
  }
}

/**
 * Send bulk email handler
 */
export async function bulkHandler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const user = getUserFromEvent(event);
    getOrganizationIdWithImpersonation(event, user); // Validate auth
  } catch (authError) {
    logger.error('Authentication error', authError);
    return error('Unauthorized', 401, undefined, origin);
  }

  try {
    logger.info('Send bulk email request received');

    if (!event.body) {
      return badRequest('Request body is required', undefined, origin);
    }

    const request = JSON.parse(event.body);

    if (!request.template || !request.recipients || !Array.isArray(request.recipients)) {
      return badRequest('template and recipients array are required', undefined, origin);
    }

    const result = await emailService.sendBulkEmail({
      template: request.template,
      recipients: request.recipients.map((recipient: any) => ({
        email: { email: recipient.email },
        templateData: recipient.templateData,
      })),
      defaultTemplateData: request.defaultTemplateData,
      tags: request.tags,
    });

    logger.info('Bulk email sent successfully', {
      template: request.template,
      recipientCount: request.recipients.length,
    });

    return success({
      message: 'Bulk email sent successfully',
      result,
    }, 200, origin);

  } catch (err) {
    logger.error('Failed to send bulk email', err as Error);
    return error('Failed to send bulk email', 500, undefined, origin);
  }
}

/**
 * Get email statistics handler
 */
export async function statsHandler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const user = getUserFromEvent(event);
    getOrganizationIdWithImpersonation(event, user); // Validate auth
  } catch (authError) {
    logger.error('Authentication error', authError);
    return error('Unauthorized', 401, undefined, origin);
  }

  try {
    logger.info('Get email stats request received');

    const queryParams = event.queryStringParameters || {};
    const startDate = queryParams.start ? new Date(queryParams.start) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const endDate = queryParams.end ? new Date(queryParams.end) : new Date();

    const stats = await emailService.getEmailStats({
      start: startDate,
      end: endDate,
    });

    return success({
      stats,
      timeRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    }, 200, origin);

  } catch (err) {
    logger.error('Failed to get email stats', err as Error);
    return error('Failed to get email stats', 500, undefined, origin);
  }
}
