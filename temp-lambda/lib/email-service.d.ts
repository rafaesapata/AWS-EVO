/**
 * Amazon SES Email Service
 * Provides comprehensive email functionality using AWS SES
 */
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
export declare class EmailService {
    private sesClient;
    private fromAddress;
    private templates;
    constructor(fromAddress: EmailAddress, region?: string);
    /**
     * Send a single email
     */
    sendEmail(options: EmailOptions): Promise<{
        messageId: string;
    }>;
    /**
     * Send bulk emails using templates
     */
    sendBulkEmail(options: BulkEmailOptions): Promise<{
        messageIds: string[];
    }>;
    /**
     * Send raw email with attachments
     */
    private sendRawEmail;
    /**
     * Send notification email
     */
    sendNotification(to: EmailAddress | EmailAddress[], subject: string, message: string, severity?: 'info' | 'warning' | 'error' | 'critical'): Promise<{
        messageId: string;
    }>;
    /**
     * Send alert email
     */
    sendAlert(to: EmailAddress | EmailAddress[], alertData: {
        id: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        metric: string;
        currentValue: number;
        threshold: number;
        message: string;
        timestamp: Date;
    }): Promise<{
        messageId: string;
    }>;
    /**
     * Send security notification
     */
    sendSecurityNotification(to: EmailAddress | EmailAddress[], event: {
        type: string;
        description: string;
        timestamp: Date;
        sourceIp?: string;
        userAgent?: string;
        userId?: string;
    }): Promise<{
        messageId: string;
    }>;
    /**
     * Send welcome email
     */
    sendWelcomeEmail(to: EmailAddress, userData: {
        name: string;
        organizationName: string;
        loginUrl: string;
    }): Promise<{
        messageId: string;
    }>;
    /**
     * Send password reset email
     */
    sendPasswordResetEmail(to: EmailAddress, resetData: {
        name: string;
        resetUrl: string;
        expiresIn: string;
    }): Promise<{
        messageId: string;
    }>;
    /**
     * Add email template
     */
    addTemplate(template: EmailTemplate): void;
    /**
     * Remove email template
     */
    removeTemplate(templateId: string): void;
    /**
     * Get email statistics from CloudWatch metrics
     */
    getEmailStats(timeRange: {
        start: Date;
        end: Date;
    }): Promise<EmailStats>;
    /**
     * Normalize email addresses
     */
    private normalizeAddresses;
    /**
     * Format email address for SES
     */
    private formatEmailAddress;
    /**
     * Build raw email message with attachments
     */
    private buildRawMessage;
    /**
     * Process template with variables
     */
    private processTemplate;
    /**
     * Get notification template
     */
    private getNotificationTemplate;
    /**
     * Get severity color
     */
    private getSeverityColor;
    /**
     * Load default email templates
     */
    private loadDefaultTemplates;
}
export declare const emailService: EmailService;
/**
 * Email service factory for different environments
 */
export declare function createEmailService(config: {
    fromEmail: string;
    fromName?: string;
    region?: string;
}): EmailService;
//# sourceMappingURL=email-service.d.ts.map