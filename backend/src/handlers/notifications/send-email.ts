/**
 * Send Email Notification Handler
 * Handles email sending requests via Amazon SES
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { emailService, EmailOptions } from '../../lib/email-service.js';
import { logger } from '../../lib/logging.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getOrigin } from '../../lib/middleware.js';

interface SendEmailRequest {
  type: 'single' | 'bulk' | 'notification' | 'alert' | 'security' | 'welcome' | 'password-reset';
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string;
  htmlBody?: string;
  textBody?: string;
  template?: string;
  templateData?: Record<string, any>;
  priority?: 'high' | 'normal' | 'low';
  tags?: Record<string, string>;
  
  alertData?: {
    id: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    metric: string;
    currentValue: number;
    threshold: number;
    message: string;
    timestamp: string;
  };
  
  securityEvent?: {
    type: string;
    description: string;
    timestamp: string;
    sourceIp?: string;
    userAgent?: string;
    userId?: string;
  };
  
  welcomeData?: {
    name: string;
    organizationName: string;
    loginUrl: string;
  };
  
  resetData?: {
    name: string;
    resetUrl: string;
    expiresIn: string;
  };
  
  notificationData?: {
    message: string;
    severity?: 'info' | 'warning' | 'error' | 'critical';
  };
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
    organizationId = getOrganizationId(user);
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

    const request: SendEmailRequest = JSON.parse(event.body);

    if (!request.type || !request.to) {
      return badRequest('type and to fields are required', undefined, origin);
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
          subject: request.subject,
          htmlBody: request.htmlBody,
          textBody: request.textBody,
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
    getOrganizationId(user); // Validate auth
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
    getOrganizationId(user); // Validate auth
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
