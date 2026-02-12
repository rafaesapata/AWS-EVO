/**
 * Amazon SES Email Service
 * Provides comprehensive email functionality using AWS SES
 */

import { SESClient, SendEmailCommand, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { logger } from './logger.js';

// SES Configuration from environment variables
const SES_CONFIG = {
  region: process.env.AWS_SES_REGION || process.env.AWS_REGION || 'us-east-1',
  fromEmail: process.env.AWS_SES_FROM_EMAIL || 'evo@udstec.io',
  fromName: process.env.AWS_SES_FROM_NAME || 'EVO Platform',
  domain: process.env.AWS_SES_DOMAIN || 'udstec.io',
  // Optional dedicated credentials for SES
  accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY,
};

/**
 * Create SES client with optional dedicated credentials
 */
function createSESClient(): SESClient {
  const config: any = {
    region: SES_CONFIG.region,
  };

  // Use dedicated SES credentials if provided
  if (SES_CONFIG.accessKeyId && SES_CONFIG.secretAccessKey) {
    config.credentials = {
      accessKeyId: SES_CONFIG.accessKeyId,
      secretAccessKey: SES_CONFIG.secretAccessKey,
    };
    logger.info('SES client initialized with dedicated credentials', {
      region: SES_CONFIG.region,
      fromEmail: SES_CONFIG.fromEmail,
    });
  } else {
    logger.info('SES client initialized with default AWS credentials', {
      region: SES_CONFIG.region,
      fromEmail: SES_CONFIG.fromEmail,
    });
  }

  return new SESClient(config);
}

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType: string;
  encoding?: 'base64' | 'binary';
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  variables?: string[];
}

export interface EmailOptions {
  to: EmailAddress | EmailAddress[];
  cc?: EmailAddress | EmailAddress[];
  bcc?: EmailAddress | EmailAddress[];
  subject: string;
  htmlBody?: string;
  textBody?: string;
  attachments?: EmailAttachment[];
  replyTo?: EmailAddress;
  priority?: 'high' | 'normal' | 'low';
  tags?: Record<string, string>;
}

export interface BulkEmailOptions {
  template: string;
  recipients: {
    email: EmailAddress;
    templateData?: Record<string, any>;
  }[];
  defaultTemplateData?: Record<string, any>;
  tags?: Record<string, string>;
}

export interface EmailStats {
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  rejected: number;
}

/**
 * Amazon SES Email Service
 */
export class EmailService {
  private sesClient: SESClient;
  private fromAddress: EmailAddress;
  private templates: Map<string, EmailTemplate> = new Map();

  constructor(
    fromAddress?: EmailAddress,
    region?: string
  ) {
    // Use provided values or fall back to environment config
    this.fromAddress = fromAddress || {
      email: SES_CONFIG.fromEmail,
      name: SES_CONFIG.fromName,
    };
    
    // Create SES client (uses dedicated credentials if available)
    this.sesClient = createSESClient();
    
    this.loadDefaultTemplates();
  }

  /**
   * Send a single email
   */
  async sendEmail(options: EmailOptions): Promise<{ messageId: string }> {
    try {
      const toAddresses = this.normalizeAddresses(options.to);
      const ccAddresses = options.cc ? this.normalizeAddresses(options.cc) : [];
      const bccAddresses = options.bcc ? this.normalizeAddresses(options.bcc) : [];

      // If attachments are present, use raw email
      if (options.attachments && options.attachments.length > 0) {
        return await this.sendRawEmail(options);
      }

      const command = new SendEmailCommand({
        Source: this.formatEmailAddress(this.fromAddress),
        Destination: {
          ToAddresses: toAddresses.map(addr => this.formatEmailAddress(addr)),
          CcAddresses: ccAddresses.map(addr => this.formatEmailAddress(addr)),
          BccAddresses: bccAddresses.map(addr => this.formatEmailAddress(addr)),
        },
        Message: {
          Subject: {
            Data: options.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: options.htmlBody ? {
              Data: options.htmlBody,
              Charset: 'UTF-8',
            } : undefined,
            Text: options.textBody ? {
              Data: options.textBody,
              Charset: 'UTF-8',
            } : undefined,
          },
        },
        ReplyToAddresses: options.replyTo ? [this.formatEmailAddress(options.replyTo)] : undefined,
        Tags: options.tags ? Object.entries(options.tags).map(([Name, Value]) => ({ Name, Value })) : undefined,
      });

      const response = await this.sesClient.send(command);

      logger.info('Email sent successfully', {
        messageId: response.MessageId,
        to: toAddresses.map(addr => addr.email),
        subject: options.subject,
      });

      return { messageId: response.MessageId! };

    } catch (error) {
      logger.error('Failed to send email', error as Error, {
        to: this.normalizeAddresses(options.to).map(addr => addr.email),
        subject: options.subject,
      });
      throw error;
    }
  }

  /**
   * Send bulk emails using templates
   */
  async sendBulkEmail(options: BulkEmailOptions): Promise<{ messageIds: string[] }> {
    try {
      const template = this.templates.get(options.template);
      if (!template) {
        throw new Error(`Template not found: ${options.template}`);
      }

      const destinations = options.recipients.map(recipient => ({
        Destination: {
          ToAddresses: [this.formatEmailAddress(recipient.email)],
        },
        ReplacementTemplateData: JSON.stringify(recipient.templateData || {}),
      }));

      // Use SendEmailCommand for bulk emails (simplified)
      const results = [];
      for (const recipient of options.recipients) {
        const emailCommand = new SendEmailCommand({
          Source: this.formatEmailAddress(this.fromAddress),
          Destination: {
            ToAddresses: [this.formatEmailAddress(recipient.email)],
          },
          Message: {
            Subject: { Data: template.subject },
            Body: {
              Html: { Data: template.htmlBody },
              Text: { Data: template.textBody },
            },
          },
        });

        const response = await this.sesClient.send(emailCommand);
        if (response.MessageId) {
          results.push(response.MessageId);
        }
      }

      logger.info('Bulk email sent successfully', {
        template: options.template,
        recipientCount: options.recipients.length,
        messageIds: results,
      });

      return { messageIds: results };

    } catch (error) {
      logger.error('Failed to send bulk email', error as Error, {
        template: options.template,
        recipientCount: options.recipients.length,
      });
      throw error;
    }
  }

  /**
   * Send raw email with attachments
   */
  private async sendRawEmail(options: EmailOptions): Promise<{ messageId: string }> {
    const rawMessage = this.buildRawMessage(options);

    const command = new SendRawEmailCommand({
      Source: this.formatEmailAddress(this.fromAddress),
      Destinations: [
        ...this.normalizeAddresses(options.to).map(addr => addr.email),
        ...(options.cc ? this.normalizeAddresses(options.cc).map(addr => addr.email) : []),
        ...(options.bcc ? this.normalizeAddresses(options.bcc).map(addr => addr.email) : []),
      ],
      RawMessage: {
        Data: Buffer.from(rawMessage),
      },
      Tags: options.tags ? Object.entries(options.tags).map(([Name, Value]) => ({ Name, Value })) : undefined,
    });

    const response = await this.sesClient.send(command);

    logger.info('Raw email sent successfully', {
      messageId: response.MessageId,
      attachmentCount: options.attachments?.length || 0,
    });

    return { messageId: response.MessageId! };
  }

  /**
   * Send notification email
   */
  async sendNotification(
    to: EmailAddress | EmailAddress[],
    subject: string,
    message: string,
    severity: 'info' | 'warning' | 'error' | 'critical' = 'info'
  ): Promise<{ messageId: string }> {
    const template = this.getNotificationTemplate(severity);
    const htmlBody = template.replace('{message}', message).replace('{severity}', severity);

    return await this.sendEmail({
      to,
      subject: `[${severity.toUpperCase()}] ${subject}`,
      htmlBody,
      textBody: message,
      tags: {
        type: 'notification',
        severity,
      },
    });
  }

  /**
   * Send alert email
   */
  async sendAlert(
    to: EmailAddress | EmailAddress[],
    alertData: {
      id: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      metric: string;
      currentValue: number;
      threshold: number;
      message: string;
      timestamp: Date;
    }
  ): Promise<{ messageId: string }> {
    const template = this.templates.get('alert');
    if (!template) {
      throw new Error('Alert template not found');
    }

    const templateData = {
      alertId: alertData.id,
      severity: alertData.severity,
      metric: alertData.metric,
      currentValue: alertData.currentValue.toString(),
      threshold: alertData.threshold.toString(),
      message: alertData.message,
      timestamp: alertData.timestamp.toISOString(),
      severityColor: this.getSeverityColor(alertData.severity),
    };

    const htmlBody = this.processTemplate(template.htmlBody, templateData);
    const textBody = this.processTemplate(template.textBody || template.htmlBody, templateData);

    return await this.sendEmail({
      to,
      subject: `[${alertData.severity.toUpperCase()}] EVO-UDS Alert: ${alertData.metric}`,
      htmlBody,
      textBody,
      priority: alertData.severity === 'critical' ? 'high' : 'normal',
      tags: {
        type: 'alert',
        severity: alertData.severity,
        metric: alertData.metric,
      },
    });
  }

  /**
   * Send security notification
   */
  async sendSecurityNotification(
    to: EmailAddress | EmailAddress[],
    event: {
      type: string;
      description: string;
      timestamp: Date;
      sourceIp?: string;
      userAgent?: string;
      userId?: string;
    }
  ): Promise<{ messageId: string }> {
    const template = this.templates.get('security');
    if (!template) {
      throw new Error('Security template not found');
    }

    const templateData = {
      eventType: event.type,
      description: event.description,
      timestamp: event.timestamp.toISOString(),
      sourceIp: event.sourceIp || 'Unknown',
      userAgent: event.userAgent || 'Unknown',
      userId: event.userId || 'Unknown',
    };

    const htmlBody = this.processTemplate(template.htmlBody, templateData);
    const textBody = this.processTemplate(template.textBody || template.htmlBody, templateData);

    return await this.sendEmail({
      to,
      subject: `[SECURITY] EVO-UDS Security Event: ${event.type}`,
      htmlBody,
      textBody,
      priority: 'high',
      tags: {
        type: 'security',
        eventType: event.type,
      },
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(
    to: EmailAddress,
    userData: {
      name: string;
      organizationName: string;
      loginUrl: string;
    }
  ): Promise<{ messageId: string }> {
    const template = this.templates.get('welcome');
    if (!template) {
      throw new Error('Welcome template not found');
    }

    const templateData = {
      userName: userData.name,
      organizationName: userData.organizationName,
      loginUrl: userData.loginUrl,
    };

    const htmlBody = this.processTemplate(template.htmlBody, templateData);
    const textBody = this.processTemplate(template.textBody || template.htmlBody, templateData);

    return await this.sendEmail({
      to,
      subject: `Bem-vindo ao EVO-UDS, ${userData.name}!`,
      htmlBody,
      textBody,
      tags: {
        type: 'welcome',
        organization: userData.organizationName,
      },
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    to: EmailAddress,
    resetData: {
      name: string;
      resetUrl: string;
      expiresIn: string;
    }
  ): Promise<{ messageId: string }> {
    const template = this.templates.get('password-reset');
    if (!template) {
      throw new Error('Password reset template not found');
    }

    const templateData = {
      userName: resetData.name,
      resetUrl: resetData.resetUrl,
      expiresIn: resetData.expiresIn,
    };

    const htmlBody = this.processTemplate(template.htmlBody, templateData);
    const textBody = this.processTemplate(template.textBody || template.htmlBody, templateData);

    return await this.sendEmail({
      to,
      subject: 'Redefinição de Senha - EVO-UDS',
      htmlBody,
      textBody,
      tags: {
        type: 'password-reset',
      },
    });
  }

  /**
   * Send password changed notification email
   */
  async sendPasswordChangedEmail(
    to: EmailAddress,
    data: {
      userName: string;
      changeTime: string;
      ipAddress: string;
      userAgent: string;
    }
  ): Promise<{ messageId: string }> {
    const template = this.templates.get('password-changed');
    if (!template) {
      throw new Error('Password changed template not found');
    }

    const templateData = {
      userName: data.userName,
      changeTime: data.changeTime,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      supportUrl: process.env.PLATFORM_BASE_URL || 'https://evo.nuevacore.com',
    };

    const htmlBody = this.processTemplate(template.htmlBody, templateData);
    const textBody = this.processTemplate(template.textBody || '', templateData);

    return await this.sendEmail({
      to,
      subject: template.subject,
      htmlBody,
      textBody: textBody || undefined,
      tags: {
        type: 'password-changed',
      },
    });
  }

  /**
   * Add email template
   */
  addTemplate(template: EmailTemplate): void {
    this.templates.set(template.id, template);
    logger.info('Email template added', {
      templateId: template.id,
      templateName: template.name,
    });
  }

  /**
   * Remove email template
   */
  removeTemplate(templateId: string): void {
    this.templates.delete(templateId);
    logger.info('Email template removed', { templateId });
  }

  /**
   * Get email statistics from CloudWatch metrics
   */
  async getEmailStats(timeRange: { start: Date; end: Date }): Promise<EmailStats> {
    try {
      const { CloudWatchClient, GetMetricStatisticsCommand } = await import('@aws-sdk/client-cloudwatch');
      const cloudwatch = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });
      
      const getMetric = async (metricName: string): Promise<number> => {
        try {
          const response = await cloudwatch.send(new GetMetricStatisticsCommand({
            Namespace: 'AWS/SES',
            MetricName: metricName,
            StartTime: timeRange.start,
            EndTime: timeRange.end,
            Period: Math.ceil((timeRange.end.getTime() - timeRange.start.getTime()) / 1000),
            Statistics: ['Sum'],
          }));
          
          return response.Datapoints?.[0]?.Sum || 0;
        } catch {
          return 0;
        }
      };
      
      const [sent, delivered, bounced, complained, rejected] = await Promise.all([
        getMetric('Send'),
        getMetric('Delivery'),
        getMetric('Bounce'),
        getMetric('Complaint'),
        getMetric('Reject'),
      ]);
      
      return { sent, delivered, bounced, complained, rejected };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn('Could not fetch email stats from CloudWatch:', { error: errMsg });
      return {
        sent: 0,
        delivered: 0,
        bounced: 0,
        complained: 0,
        rejected: 0,
      };
    }
  }

  /**
   * Normalize email addresses
   */
  private normalizeAddresses(addresses: EmailAddress | EmailAddress[]): EmailAddress[] {
    return Array.isArray(addresses) ? addresses : [addresses];
  }

  /**
   * Format email address for SES
   */
  private formatEmailAddress(address: EmailAddress): string {
    return address.name ? `${address.name} <${address.email}>` : address.email;
  }

  /**
   * Build raw email message with attachments
   */
  private buildRawMessage(options: EmailOptions): string {
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const toAddresses = this.normalizeAddresses(options.to);
    const ccAddresses = options.cc ? this.normalizeAddresses(options.cc) : [];
    const bccAddresses = options.bcc ? this.normalizeAddresses(options.bcc) : [];

    let message = '';

    // Headers
    message += `From: ${this.formatEmailAddress(this.fromAddress)}\r\n`;
    message += `To: ${toAddresses.map(addr => this.formatEmailAddress(addr)).join(', ')}\r\n`;
    
    if (ccAddresses.length > 0) {
      message += `Cc: ${ccAddresses.map(addr => this.formatEmailAddress(addr)).join(', ')}\r\n`;
    }
    
    if (bccAddresses.length > 0) {
      message += `Bcc: ${bccAddresses.map(addr => this.formatEmailAddress(addr)).join(', ')}\r\n`;
    }

    message += `Subject: ${options.subject}\r\n`;
    message += `MIME-Version: 1.0\r\n`;
    message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n`;
    
    if (options.replyTo) {
      message += `Reply-To: ${this.formatEmailAddress(options.replyTo)}\r\n`;
    }

    message += '\r\n';

    // Body
    message += `--${boundary}\r\n`;
    message += `Content-Type: multipart/alternative; boundary="${boundary}_alt"\r\n\r\n`;

    // Text body
    if (options.textBody) {
      message += `--${boundary}_alt\r\n`;
      message += `Content-Type: text/plain; charset=UTF-8\r\n\r\n`;
      message += `${options.textBody}\r\n\r\n`;
    }

    // HTML body
    if (options.htmlBody) {
      message += `--${boundary}_alt\r\n`;
      message += `Content-Type: text/html; charset=UTF-8\r\n\r\n`;
      message += `${options.htmlBody}\r\n\r\n`;
    }

    message += `--${boundary}_alt--\r\n`;

    // Attachments
    if (options.attachments) {
      for (const attachment of options.attachments) {
        message += `--${boundary}\r\n`;
        message += `Content-Type: ${attachment.contentType}\r\n`;
        message += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
        message += `Content-Transfer-Encoding: ${attachment.encoding || 'base64'}\r\n\r\n`;
        
        const content = Buffer.isBuffer(attachment.content) 
          ? attachment.content.toString(attachment.encoding as BufferEncoding || 'base64')
          : attachment.content;
        
        message += `${content}\r\n\r\n`;
      }
    }

    message += `--${boundary}--\r\n`;

    return message;
  }

  /**
   * Process template with variables
   */
  private processTemplate(template: string, data: Record<string, string>): string {
    let processed = template;
    
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`{${key}}`, 'g');
      processed = processed.replace(regex, value);
    }

    return processed;
  }

  /**
   * Get notification template
   */
  private getNotificationTemplate(severity: string): string {
    const severityColor = this.getSeverityColor(severity);
    
    return `
      <html>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="background-color: ${severityColor}; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">EVO-UDS Notification</h1>
              <p style="margin: 5px 0 0 0; opacity: 0.9;">Severity: {severity}</p>
            </div>
            <div style="padding: 30px;">
              <div style="background-color: #f8f9fa; border-left: 4px solid ${severityColor}; padding: 15px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 16px; line-height: 1.5;">{message}</p>
              </div>
              <p style="color: #666; font-size: 14px; margin: 0;">
                This is an automated notification from EVO-UDS monitoring system.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Get severity color
   */
  private getSeverityColor(severity: string): string {
    const colors = {
      info: '#17a2b8',
      low: '#28a745',
      warning: '#ffc107',
      medium: '#fd7e14',
      error: '#dc3545',
      high: '#dc3545',
      critical: '#721c24',
    };

    return colors[severity as keyof typeof colors] || colors.info;
  }

  /**
   * Load default email templates
   */
  private loadDefaultTemplates(): void {
    // Alert template
    this.addTemplate({
      id: 'alert',
      name: 'System Alert',
      subject: '[{severity}] EVO-UDS Alert: {metric}',
      htmlBody: `
        <html>
          <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <div style="background-color: {severityColor}; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px;">🚨 System Alert</h1>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">Severity: {severity}</p>
              </div>
              <div style="padding: 30px;">
                <h2 style="color: #333; margin-top: 0;">Alert Details</h2>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold; width: 30%;">Alert ID:</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">{alertId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Metric:</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">{metric}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Current Value:</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">{currentValue}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Threshold:</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">{threshold}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Timestamp:</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">{timestamp}</td>
                  </tr>
                </table>
                <div style="background-color: #f8f9fa; border-left: 4px solid {severityColor}; padding: 15px; margin-bottom: 20px;">
                  <p style="margin: 0; font-size: 16px; line-height: 1.5;">{message}</p>
                </div>
                <p style="color: #666; font-size: 14px; margin: 0;">
                  Please investigate this alert and take appropriate action if necessary.
                </p>
              </div>
            </div>
          </body>
        </html>
      `,
      textBody: `
SYSTEM ALERT - {severity}

Alert ID: {alertId}
Metric: {metric}
Current Value: {currentValue}
Threshold: {threshold}
Timestamp: {timestamp}

Message: {message}

Please investigate this alert and take appropriate action if necessary.
      `,
    });

    // Security notification template
    this.addTemplate({
      id: 'security',
      name: 'Security Notification',
      subject: '[SECURITY] EVO-UDS Security Event: {eventType}',
      htmlBody: `
        <html>
          <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px;">🔒 Security Alert</h1>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">Event Type: {eventType}</p>
              </div>
              <div style="padding: 30px;">
                <h2 style="color: #333; margin-top: 0;">Security Event Details</h2>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold; width: 30%;">Event Type:</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">{eventType}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Timestamp:</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">{timestamp}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Source IP:</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">{sourceIp}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">User Agent:</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">{userAgent}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">User ID:</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">{userId}</td>
                  </tr>
                </table>
                <div style="background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin-bottom: 20px;">
                  <p style="margin: 0; font-size: 16px; line-height: 1.5; color: #721c24;">{description}</p>
                </div>
                <p style="color: #666; font-size: 14px; margin: 0;">
                  This security event requires immediate attention. Please review and investigate.
                </p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    // Welcome template
    this.addTemplate({
      id: 'welcome',
      name: 'Welcome Email',
      subject: 'Bem-vindo ao EVO-UDS, {userName}!',
      htmlBody: `
        <html>
          <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <div style="background-color: #007bff; color: white; padding: 30px; text-align: center;">
                <h1 style="margin: 0; font-size: 28px;">🎉 Bem-vindo ao EVO-UDS!</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 18px;">Olá, {userName}</p>
              </div>
              <div style="padding: 30px;">
                <h2 style="color: #333; margin-top: 0;">Sua conta foi criada com sucesso!</h2>
                <p style="font-size: 16px; line-height: 1.6; color: #555;">
                  Bem-vindo à plataforma EVO-UDS da <strong>{organizationName}</strong>. 
                  Sua conta foi configurada e você já pode começar a usar todos os recursos disponíveis.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="{loginUrl}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                    Acessar Plataforma
                  </a>
                </div>
                <h3 style="color: #333;">O que você pode fazer:</h3>
                <ul style="color: #555; line-height: 1.6;">
                  <li>Monitorar recursos em tempo real</li>
                  <li>Receber alertas de segurança e performance</li>
                  <li>Analisar custos e otimizações</li>
                  <li>Gerenciar compliance e governança</li>
                </ul>
                <p style="color: #666; font-size: 14px; margin-top: 30px;">
                  Se você tiver dúvidas, nossa equipe de suporte está sempre disponível para ajudar.
                </p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    // Password changed notification template
    this.addTemplate({
      id: 'password-changed',
      name: 'Password Changed Notification',
      subject: 'Sua senha foi alterada - EVO Platform',
      htmlBody: `
        <html>
          <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px;">🔒 Senha Alterada</h1>
              </div>
              <div style="padding: 30px;">
                <h2 style="color: #333; margin-top: 0;">Olá, {userName}</h2>
                <p style="font-size: 16px; line-height: 1.6; color: #555;">
                  Sua senha da plataforma EVO foi alterada com sucesso.
                </p>
                <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 8px 0; font-weight: bold; color: #333; width: 40%;">Data/Hora:</td>
                      <td style="padding: 8px 0; color: #555;">{changeTime}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; font-weight: bold; color: #333;">Endereço IP:</td>
                      <td style="padding: 8px 0; color: #555;">{ipAddress}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; font-weight: bold; color: #333;">Navegador:</td>
                      <td style="padding: 8px 0; color: #555; word-break: break-all;">{userAgent}</td>
                    </tr>
                  </table>
                </div>
                <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0; font-size: 14px; color: #856404;">
                    <strong>⚠️ Não foi você?</strong> Se você não realizou esta alteração, sua conta pode estar comprometida. 
                    Acesse a plataforma imediatamente e redefina sua senha, ou entre em contato com o suporte.
                  </p>
                </div>
                <div style="text-align: center; margin: 25px 0;">
                  <a href="{supportUrl}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                    Acessar Plataforma
                  </a>
                </div>
                <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
                  Este é um email automático de segurança. Não responda a este email.
                </p>
              </div>
            </div>
          </body>
        </html>
      `,
      textBody: `Olá, {userName}

Sua senha da plataforma EVO foi alterada com sucesso.

Data/Hora: {changeTime}
Endereço IP: {ipAddress}
Navegador: {userAgent}

Se você não realizou esta alteração, acesse a plataforma imediatamente: {supportUrl}

Este é um email automático de segurança.`,
    });

    // Password reset template
    this.addTemplate({
      id: 'password-reset',
      name: 'Password Reset',
      subject: 'Redefinição de Senha - EVO-UDS',
      htmlBody: `
        <html>
          <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <div style="background-color: #6c757d; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px;">🔑 Redefinição de Senha</h1>
              </div>
              <div style="padding: 30px;">
                <h2 style="color: #333; margin-top: 0;">Olá, {userName}</h2>
                <p style="font-size: 16px; line-height: 1.6; color: #555;">
                  Recebemos uma solicitação para redefinir a senha da sua conta EVO-UDS.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="{resetUrl}" style="background-color: #6c757d; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                    Redefinir Senha
                  </a>
                </div>
                <p style="color: #666; font-size: 14px;">
                  Este link expira em <strong>{expiresIn}</strong>. Se você não solicitou esta redefinição, pode ignorar este email.
                </p>
                <p style="color: #666; font-size: 14px; margin-top: 20px;">
                  Por segurança, não compartilhe este link com ninguém.
                </p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    logger.info('Default email templates loaded', {
      templateCount: this.templates.size,
    });
  }
}

// Global email service instance (uses environment configuration)
export const emailService = new EmailService();

/**
 * Email service factory for different environments
 */
export function createEmailService(config?: {
  fromEmail?: string;
  fromName?: string;
  region?: string;
}): EmailService {
  return new EmailService(
    config?.fromEmail ? {
      email: config.fromEmail,
      name: config.fromName,
    } : undefined,
    config?.region
  );
}

/**
 * Get current SES configuration (for debugging/logging)
 */
export function getSESConfig() {
  return {
    region: SES_CONFIG.region,
    fromEmail: SES_CONFIG.fromEmail,
    fromName: SES_CONFIG.fromName,
    domain: SES_CONFIG.domain,
    hasCredentials: !!(SES_CONFIG.accessKeyId && SES_CONFIG.secretAccessKey),
  };
}