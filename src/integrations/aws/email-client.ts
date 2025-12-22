/**
 * Email Service Client
 * Frontend client for Amazon SES email service
 */

import { apiClient } from './api-client';

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface SendEmailRequest {
  type: 'single' | 'notification' | 'alert' | 'security' | 'welcome' | 'password-reset';
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string;
  htmlBody?: string;
  textBody?: string;
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

export interface BulkEmailRequest {
  template: string;
  recipients: {
    email: string;
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
 * Email Service Client
 */
export class EmailClient {
  /**
   * Send a single email
   */
  async sendEmail(request: SendEmailRequest): Promise<{ messageId: string }> {
    const response = await apiClient.post('/email', request);
    return response.result;
  }

  /**
   * Send notification email
   */
  async sendNotification(
    to: string | string[],
    subject: string,
    message: string,
    severity: 'info' | 'warning' | 'error' | 'critical' = 'info'
  ): Promise<{ messageId: string }> {
    return this.sendEmail({
      type: 'notification',
      to,
      subject,
      notificationData: {
        message,
        severity,
      },
    });
  }

  /**
   * Send alert email
   */
  async sendAlert(
    to: string | string[],
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
    return this.sendEmail({
      type: 'alert',
      to,
      alertData: {
        ...alertData,
        timestamp: alertData.timestamp.toISOString(),
      },
    });
  }

  /**
   * Send security notification
   */
  async sendSecurityNotification(
    to: string | string[],
    event: {
      type: string;
      description: string;
      timestamp: Date;
      sourceIp?: string;
      userAgent?: string;
      userId?: string;
    }
  ): Promise<{ messageId: string }> {
    return this.sendEmail({
      type: 'security',
      to,
      securityEvent: {
        ...event,
        timestamp: event.timestamp.toISOString(),
      },
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(
    to: string,
    userData: {
      name: string;
      organizationName: string;
      loginUrl: string;
    }
  ): Promise<{ messageId: string }> {
    return this.sendEmail({
      type: 'welcome',
      to,
      welcomeData: userData,
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    to: string,
    resetData: {
      name: string;
      resetUrl: string;
      expiresIn: string;
    }
  ): Promise<{ messageId: string }> {
    return this.sendEmail({
      type: 'password-reset',
      to,
      resetData,
    });
  }

  /**
   * Send bulk emails
   */
  async sendBulkEmail(request: BulkEmailRequest): Promise<{ messageIds: string[] }> {
    const response = await apiClient.post('/email/bulk', request);
    return response.result;
  }

  /**
   * Get email statistics
   */
  async getEmailStats(timeRange?: { start: Date; end: Date }): Promise<{
    stats: EmailStats;
    timeRange: { start: string; end: string };
  }> {
    const params = new URLSearchParams();
    
    if (timeRange) {
      params.append('start', timeRange.start.toISOString());
      params.append('end', timeRange.end.toISOString());
    }

    const queryString = params.toString();
    const url = queryString ? `/email/stats?${queryString}` : '/email/stats';
    
    return await apiClient.get(url);
  }

  /**
   * Send custom email with full control
   */
  async sendCustomEmail(options: {
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject: string;
    htmlBody?: string;
    textBody?: string;
    priority?: 'high' | 'normal' | 'low';
    tags?: Record<string, string>;
  }): Promise<{ messageId: string }> {
    return this.sendEmail({
      type: 'single',
      ...options,
    });
  }
}

// Global email client instance
export const emailClient = new EmailClient();

/**
 * Email utility functions
 */
export const emailUtils = {
  /**
   * Validate email address
   */
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  /**
   * Format email address with name
   */
  formatEmailAddress(email: string, name?: string): string {
    return name ? `${name} <${email}>` : email;
  },

  /**
   * Extract email from formatted address
   */
  extractEmail(formattedAddress: string): string {
    const match = formattedAddress.match(/<([^>]+)>/);
    return match ? match[1] : formattedAddress;
  },

  /**
   * Validate multiple email addresses
   */
  validateEmails(emails: string[]): { valid: string[]; invalid: string[] } {
    const valid: string[] = [];
    const invalid: string[] = [];

    emails.forEach(email => {
      if (this.isValidEmail(email)) {
        valid.push(email);
      } else {
        invalid.push(email);
      }
    });

    return { valid, invalid };
  },

  /**
   * Get severity color for email styling
   */
  getSeverityColor(severity: string): string {
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
  },

  /**
   * Generate email preview text
   */
  generatePreviewText(htmlContent: string, maxLength: number = 150): string {
    // Remove HTML tags and get plain text
    const plainText = htmlContent.replace(/<[^>]*>/g, '').trim();
    
    if (plainText.length <= maxLength) {
      return plainText;
    }

    return plainText.substring(0, maxLength - 3) + '...';
  },

  /**
   * Create email template variables
   */
  createTemplateVariables(data: Record<string, any>): Record<string, string> {
    const variables: Record<string, string> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined) {
        variables[key] = String(value);
      }
    }

    return variables;
  },
};