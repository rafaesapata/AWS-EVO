/**
 * SES Webhook Handler
 * Receives SNS notifications from SES Event Publishing (Bounce, Delivery, Complaint, etc.)
 * and stores them in the email_events table for delivery tracking.
 */
import type { APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';

interface SNSMessage {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SubscribeURL?: string;
  Token?: string;
}

interface SESEventRecord {
  eventType: string;
  mail: {
    messageId: string;
    source: string;
    timestamp: string;
    destination: string[];
    commonHeaders?: {
      subject?: string;
      from?: string[];
      to?: string[];
    };
    tags?: Record<string, string[]>;
  };
  bounce?: {
    bounceType: string;
    bounceSubType: string;
    bouncedRecipients: Array<{
      emailAddress: string;
      action?: string;
      status?: string;
      diagnosticCode?: string;
    }>;
  };
  delivery?: {
    timestamp: string;
    recipients: string[];
    processingTimeMillis: number;
    smtpResponse?: string;
  };
  complaint?: {
    complainedRecipients: Array<{
      emailAddress: string;
    }>;
    complaintFeedbackType?: string;
  };
  reject?: {
    reason: string;
  };
  open?: {
    timestamp: string;
    ipAddress?: string;
    userAgent?: string;
  };
  click?: {
    timestamp: string;
    ipAddress?: string;
    link?: string;
    userAgent?: string;
  };
}

export async function handler(event: any): Promise<APIGatewayProxyResultV2> {
  try {
    let snsMessage: SNSMessage;

    // Handle both API Gateway (HTTP) and direct SNS invocation
    if (event.body) {
      snsMessage = JSON.parse(typeof event.body === 'string' ? event.body : JSON.stringify(event.body));
    } else if (event.Records) {
      // Direct SNS → Lambda invocation
      snsMessage = {
        Type: 'Notification',
        MessageId: event.Records[0].Sns.MessageId,
        TopicArn: event.Records[0].Sns.TopicArn,
        Message: event.Records[0].Sns.Message,
        Timestamp: event.Records[0].Sns.Timestamp,
      };
    } else {
      logger.warn('Unknown event format', { event: JSON.stringify(event).substring(0, 500) });
      return { statusCode: 400, body: JSON.stringify({ error: 'Unknown event format' }) };
    }

    // Handle SNS subscription confirmation
    if (snsMessage.Type === 'SubscriptionConfirmation') {
      logger.info('SNS subscription confirmation received', {
        topicArn: snsMessage.TopicArn,
        subscribeUrl: snsMessage.SubscribeURL,
      });
      // Auto-confirm by fetching the SubscribeURL
      if (snsMessage.SubscribeURL) {
        const https = await import('https');
        await new Promise<void>((resolve, reject) => {
          https.get(snsMessage.SubscribeURL!, (res: any) => {
            res.on('data', () => {});
            res.on('end', resolve);
          }).on('error', reject);
        });
        logger.info('SNS subscription confirmed');
      }
      return { statusCode: 200, body: JSON.stringify({ status: 'subscription_confirmed' }) };
    }

    // Parse the SES event
    const sesEvent: SESEventRecord = JSON.parse(snsMessage.Message);
    const prisma = getPrismaClient();
    const orgId = sesEvent.mail.tags?.['organization_id']?.[0] || null;

    logger.info('SES event received', {
      eventType: sesEvent.eventType,
      messageId: sesEvent.mail.messageId,
      destination: sesEvent.mail.destination,
    });

    switch (sesEvent.eventType) {
      case 'Delivery': {
        const recipients = sesEvent.delivery?.recipients || sesEvent.mail.destination;
        for (const recipient of recipients) {
          await prisma.emailEvent.create({
            data: {
              organization_id: orgId,
              message_id: sesEvent.mail.messageId,
              event_type: 'Delivery',
              recipient,
              sender: sesEvent.mail.source,
              subject: sesEvent.mail.commonHeaders?.subject,
              timestamp: new Date(sesEvent.delivery?.timestamp || sesEvent.mail.timestamp),
              diagnostic: sesEvent.delivery?.smtpResponse,
              raw_event: sesEvent as any,
            },
          });
        }
        break;
      }

      case 'Bounce': {
        const bouncedRecipients = sesEvent.bounce?.bouncedRecipients || [];
        for (const recipient of bouncedRecipients) {
          await prisma.emailEvent.create({
            data: {
              organization_id: orgId,
              message_id: sesEvent.mail.messageId,
              event_type: 'Bounce',
              recipient: recipient.emailAddress,
              sender: sesEvent.mail.source,
              subject: sesEvent.mail.commonHeaders?.subject,
              bounce_type: sesEvent.bounce?.bounceType,
              bounce_sub_type: sesEvent.bounce?.bounceSubType,
              diagnostic: recipient.diagnosticCode,
              timestamp: new Date(sesEvent.mail.timestamp),
              raw_event: sesEvent as any,
            },
          });
        }
        break;
      }

      case 'Complaint': {
        const complainedRecipients = sesEvent.complaint?.complainedRecipients || [];
        for (const recipient of complainedRecipients) {
          await prisma.emailEvent.create({
            data: {
              organization_id: orgId,
              message_id: sesEvent.mail.messageId,
              event_type: 'Complaint',
              recipient: recipient.emailAddress,
              sender: sesEvent.mail.source,
              subject: sesEvent.mail.commonHeaders?.subject,
              complaint_type: sesEvent.complaint?.complaintFeedbackType,
              timestamp: new Date(sesEvent.mail.timestamp),
              raw_event: sesEvent as any,
            },
          });
        }
        break;
      }

      case 'Reject': {
        for (const recipient of sesEvent.mail.destination) {
          await prisma.emailEvent.create({
            data: {
              organization_id: orgId,
              message_id: sesEvent.mail.messageId,
              event_type: 'Reject',
              recipient,
              sender: sesEvent.mail.source,
              subject: sesEvent.mail.commonHeaders?.subject,
              diagnostic: sesEvent.reject?.reason,
              timestamp: new Date(sesEvent.mail.timestamp),
              raw_event: sesEvent as any,
            },
          });
        }
        break;
      }

      case 'Send': {
        for (const recipient of sesEvent.mail.destination) {
          await prisma.emailEvent.create({
            data: {
              organization_id: orgId,
              message_id: sesEvent.mail.messageId,
              event_type: 'Send',
              recipient,
              sender: sesEvent.mail.source,
              subject: sesEvent.mail.commonHeaders?.subject,
              timestamp: new Date(sesEvent.mail.timestamp),
            },
          });
        }
        break;
      }

      default: {
        // Open, Click, etc.
        const recipients = sesEvent.mail.destination;
        for (const recipient of recipients) {
          await prisma.emailEvent.create({
            data: {
              organization_id: orgId,
              message_id: sesEvent.mail.messageId,
              event_type: sesEvent.eventType,
              recipient,
              sender: sesEvent.mail.source,
              subject: sesEvent.mail.commonHeaders?.subject,
              timestamp: new Date(sesEvent.mail.timestamp),
              raw_event: sesEvent as any,
            },
          });
        }
      }
    }

    return { statusCode: 200, body: JSON.stringify({ status: 'processed', eventType: sesEvent.eventType }) };

  } catch (err) {
    logger.error('Failed to process SES webhook', err as Error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal error' }) };
  }
}
