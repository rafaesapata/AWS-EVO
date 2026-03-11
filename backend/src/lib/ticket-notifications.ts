/**
 * Ticket Notification Service
 * Sends real email notifications to ticket watchers via SES
 */

import { EmailService } from './email-service.js';
import { getWatcherRecipients, WatchEventType } from './ticket-workflow.js';
import { logger } from './logger.js';

const PLATFORM_BASE_URL = process.env.PLATFORM_BASE_URL || 'https://evo.nuevacore.com';

let emailServiceInstance: EmailService | null = null;
function getEmailService(): EmailService {
  if (!emailServiceInstance) emailServiceInstance = new EmailService();
  return emailServiceInstance;
}

interface TicketNotificationPayload {
  ticketId: string;
  ticketTitle: string;
  organizationId: string;
  eventType: WatchEventType;
  actorName: string;
  actorUserId: string;
  details: {
    oldValue?: string | null;
    newValue?: string | null;
    comment?: string;
    severity?: string;
  };
}

/**
 * Send notification emails to all watchers of a ticket.
 * Fire-and-forget — errors are logged but never thrown.
 */
export async function notifyTicketWatchers(
  prisma: any,
  payload: TicketNotificationPayload
): Promise<void> {
  try {
    const recipients = await getWatcherRecipients(
      prisma, payload.ticketId, payload.organizationId, payload.eventType, payload.actorUserId
    );

    if (recipients.length === 0) return;

    const emailService = getEmailService();
    const ticketUrl = `${PLATFORM_BASE_URL}/remediation-tickets/${payload.ticketId}`;
    const { subject, htmlBody, textBody } = buildNotificationEmail(payload, ticketUrl);

    for (const recipient of recipients) {
      try {
        await emailService.sendEmail({
          to: { email: recipient.email },
          subject,
          htmlBody,
          textBody,
          tags: { type: `ticket_${payload.eventType}`, ticketId: payload.ticketId },
        });
      } catch (emailErr) {
        logger.warn('Failed to send ticket notification email', {
          ticketId: payload.ticketId, recipient: recipient.email, error: (emailErr as Error).message,
        });
      }
    }

    // Log to communication_logs
    try {
      for (const recipient of recipients) {
        await prisma.communicationLog.create({
          data: {
            organization_id: payload.organizationId,
            channel: 'email',
            recipient: recipient.email,
            subject,
            message: `Ticket ${payload.eventType}: ${payload.ticketTitle}`,
            status: 'sent',
            metadata: {
              ticket_id: payload.ticketId,
              event_type: payload.eventType,
              is_automated: true,
              source: 'ticket-notifications',
            },
          },
        });
      }
    } catch (logErr) {
      logger.warn('Failed to log ticket notification (non-critical)', { error: (logErr as Error).message });
    }

    logger.info('Ticket notifications sent', {
      ticketId: payload.ticketId, eventType: payload.eventType, recipientCount: recipients.length,
    });
  } catch (err) {
    logger.error('notifyTicketWatchers failed', { ticketId: payload.ticketId, error: (err as Error).message });
  }
}

const EVENT_LABELS: Record<string, { emoji: string; label: string; color: string }> = {
  status_changed: { emoji: '🔄', label: 'Status Changed', color: '#007bff' },
  commented:      { emoji: '💬', label: 'New Comment', color: '#17a2b8' },
  assigned:       { emoji: '👤', label: 'Assigned', color: '#6f42c1' },
  sla_warning:    { emoji: '⚠️', label: 'SLA Warning', color: '#ffc107' },
  sla_breached:   { emoji: '🚨', label: 'SLA Breached', color: '#dc3545' },
  resolved:       { emoji: '✅', label: 'Resolved', color: '#28a745' },
  escalated:      { emoji: '🔺', label: 'Escalated', color: '#721c24' },
};

function buildNotificationEmail(
  payload: TicketNotificationPayload,
  ticketUrl: string
): { subject: string; htmlBody: string; textBody: string } {
  const config = EVENT_LABELS[payload.eventType] || { emoji: '📋', label: 'Updated', color: '#6c757d' };
  const subject = `[${config.label}] ${payload.ticketTitle}`;

  let detailRows = '';
  if (payload.details.oldValue && payload.details.newValue) {
    detailRows += `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;width:35%;">Changed:</td><td style="padding:8px 12px;border-bottom:1px solid #eee;"><s style="color:#999;">${payload.details.oldValue}</s> → <strong>${payload.details.newValue}</strong></td></tr>`;
  } else if (payload.details.newValue) {
    detailRows += `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;width:35%;">Value:</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${payload.details.newValue}</td></tr>`;
  }
  if (payload.details.comment) {
    const truncated = payload.details.comment.length > 300 ? payload.details.comment.substring(0, 300) + '...' : payload.details.comment;
    detailRows += `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;">Comment:</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${truncated}</td></tr>`;
  }

  const htmlBody = `
    <html><body style="font-family:'Segoe UI',Roboto,Arial,sans-serif;margin:0;padding:20px;background:#f0f2f5;">
      <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:24px;text-align:center;">
          <span style="font-size:28px;font-weight:700;color:#fff;letter-spacing:-1px;">EVO</span>
          <span style="font-size:11px;color:rgba(255,255,255,0.6);display:block;letter-spacing:3px;text-transform:uppercase;margin-top:2px;">Ticket Notification</span>
        </div>
        <div style="background:${config.color};color:#fff;padding:14px 24px;font-size:16px;font-weight:600;">
          ${config.emoji} ${config.label}
        </div>
        <div style="padding:28px;">
          <h2 style="color:#1a1a2e;margin:0 0 16px;font-size:18px;">${payload.ticketTitle}</h2>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
            <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;width:35%;">By:</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${payload.actorName}</td></tr>
            ${detailRows}
          </table>
          <div style="text-align:center;margin:20px 0;">
            <a href="${ticketUrl}" style="background:#007bff;color:#fff;padding:12px 30px;text-decoration:none;border-radius:5px;font-weight:600;display:inline-block;">View Ticket</a>
          </div>
          <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center;">You're receiving this because you're watching this ticket.</p>
        </div>
        <div style="background:#f8f9fb;padding:12px 28px;text-align:center;border-top:1px solid #e8ecf1;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">© ${new Date().getFullYear()} EVO Platform · Powered by NuevaCore</p>
        </div>
      </div>
    </body></html>`;

  const textBody = `${config.label}: ${payload.ticketTitle}\nBy: ${payload.actorName}\n${payload.details.comment ? `Comment: ${payload.details.comment}\n` : ''}View ticket: ${ticketUrl}`;

  return { subject, htmlBody, textBody };
}
