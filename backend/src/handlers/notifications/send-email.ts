/**
 * Send Email Notification Handler
 * Handles email sending requests via Amazon SES
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { success, error, badRequest } from '../../lib/response.js';
import { emailService, EmailOptions } from '../../lib/email-service.js';
import { logger } from '../../lib/logging.js';
import { withMetrics } from '../../lib/monitoring-alerting.js';

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
  
  // For specific email types
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
export const handler = withMetrics(async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info('Send email request received', {
      path: event.path,
      method: event.httpMethod,
    });

    if (!event.body) {
      return badRequest('Request body is required');
    }

    const request: SendEmailRequest = JSON.parse(event.body);

    // Validate required fields
    if (!request.type || !request.to) {
      return badRequest('type and to fields are required');
    }

    // Convert string addresses to EmailAddress format
    const normalizeEmails = (emails: string | string[]) => {
      const emailArray = Array.isArray(emails) ? emails : [emails];
      return emailArray.map(email => ({ email }));
    };

    let result: { messageId: string } | { messageIds: string[] };

    switch (request.type) {
      case 'single':
        if (!request.subject) {
          return badRequest('subject is required for single emails');
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
          return badRequest('notificationData and subject are required for notifications');
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
          return badRequest('alertData is required for alert emails');
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
          return badRequest('securityEvent is required for security emails');
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
          return badRequest('welcomeData is required and to must be a single email for welcome emails');
        }

        result = await emailService.sendWelcomeEmail(
          { email: request.to as string },
          request.welcomeData
        );
        break;

      case 'password-reset':
        if (!request.resetData || Array.isArray(request.to)) {
          return badRequest('resetData is required and to must be a single email for password reset emails');
        }

        result = await emailService.sendPasswordResetEmail(
          { email: request.to as string },
          request.resetData
        );
        break;

      default:
        return badRequest(`Unsupported email type: ${request.type}`);
    }

    logger.info('Email sent successfully', {
      type: request.type,
      recipients: Array.isArray(request.to) ? request.to.length : 1,
      messageId: 'messageId' in result ? result.messageId : (result as any).messageIds?.[0],
    });

    return success({
      message: 'Email sent successfully',
      result,
    });

  } catch (err) {
    logger.error('Failed to send email', err as Error);
    return error('Failed to send email');
  }
}, 'SendEmail');

/**
 * Send bulk email handler
 */
export const bulkHandler = withMetrics(async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info('Send bulk email request received');

    if (!event.body) {
      return badRequest('Request body is required');
    }

    const request = JSON.parse(event.body);

    if (!request.template || !request.recipients || !Array.isArray(request.recipients)) {
      return badRequest('template and recipients array are required');
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
    });

  } catch (err) {
    logger.error('Failed to send bulk email', err as Error);
    return error('Failed to send bulk email');
  }
}, 'SendBulkEmail');

/**
 * Get email statistics handler
 */
export const statsHandler = withMetrics(async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
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
    });

  } catch (err) {
    logger.error('Failed to get email stats', err as Error);
    return error('Failed to get email stats');
  }
}, 'GetEmailStats');