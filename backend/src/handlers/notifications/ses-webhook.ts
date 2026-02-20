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

// Auto-create email_events table if it doesn't exist
async function ensureEmailEventsTable(prisma: any): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "email_events" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "organization_id" UUID, "message_id" TEXT NOT NULL, "event_type" TEXT NOT NULL, "recipient" TEXT NOT NULL, "sender" TEXT, "subject" TEXT, "bounce_type" TEXT, "bounce_sub_type" TEXT, "complaint_type" TEXT, "diagnostic" TEXT, "timestamp" TIMESTAMPTZ(6) NOT NULL, "raw_event" JSONB, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "email_events_pkey" PRIMARY KEY ("id"))`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "email_events_message_id_idx" ON "email_events"("message_id")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "email_events_organization_id_idx" ON "email_events"("organization_id")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "email_events_recipient_idx" ON "email_events"("recipient")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "email_events_event_type_idx" ON "email_events"("event_type")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "email_events_timestamp_idx" ON "email_events"("timestamp")`);
    logger.info('email_events table ensured');
  } catch (err) {
    logger.warn('Failed to ensure email_events table (may already exist)', { error: (err as Error).message });
  }
}

let tableEnsured = false;

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

    // Ensure table exists on first invocation
    if (!tableEnsured) {
      await ensureEmailEventsTable(prisma);
      tableEnsured = true;
    }

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

    // Update communication_logs status based on delivery events
    try {
      if (['Delivery', 'Bounce', 'Complaint', 'Reject'].includes(sesEvent.eventType)) {
        const newStatus = sesEvent.eventType === 'Delivery' ? 'delivered' : 'failed';
        // Find communication_logs entries by messageId in metadata
        const logsToUpdate = await prisma.$queryRawUnsafe(
          `SELECT id FROM communication_logs WHERE metadata->>'messageId' = $1 LIMIT 10`,
          sesEvent.mail.messageId
        ) as Array<{ id: string }>;
        
        for (const log of logsToUpdate) {
          await prisma.communicationLog.update({
            where: { id: log.id },
            data: { status: newStatus },
          });
        }
        
        if (logsToUpdate.length > 0) {
          logger.info('Updated communication_logs status', {
            messageId: sesEvent.mail.messageId,
            newStatus,
            count: logsToUpdate.length,
          });
        }
      }
    } catch (syncErr) {
      logger.warn('Failed to sync communication_logs status (non-blocking)', { error: (syncErr as Error).message });
    }

    return { statusCode: 200, body: JSON.stringify({ status: 'processed', eventType: sesEvent.eventType }) };

  } catch (err) {
    logger.error('Failed to process SES webhook', err as Error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal error' }) };
  }
}
