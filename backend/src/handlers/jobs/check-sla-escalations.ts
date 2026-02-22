/**
 * Check SLA Escalations Handler (EventBridge Scheduled Job)
 * Runs every 15 minutes to:
 * 1. Send warning notifications before SLA breach (notify_before_breach_minutes)
 * 2. Detect SLA breaches and mark tickets as breached
 * 3. Escalate tickets past escalation_after_minutes (increment escalation_level)
 * 4. Send email notifications for breaches and escalations
 */

import type { LambdaContext } from '../../types/lambda.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { EmailService } from '../../lib/email-service.js';
import { getWatcherRecipients } from '../../lib/ticket-workflow.js';

const PLATFORM_BASE_URL = process.env.PLATFORM_BASE_URL || 'https://evo.nuevacore.com';
const MS_PER_MINUTE = 60_000;

interface EscalationResult {
  warnings: number;
  breaches: number;
  escalations: number;
  emailsSent: number;
  emailsFailed: number;
}

export async function handler(
  _event: unknown,
  _context: LambdaContext
): Promise<{ processed: number; results: EscalationResult }> {
  const prisma = getPrismaClient();
  const emailService = new EmailService();
  const now = new Date();

  const results: EscalationResult = {
    warnings: 0,
    breaches: 0,
    escalations: 0,
    emailsSent: 0,
    emailsFailed: 0,
  };

  logger.info('Starting SLA escalation check');

  try {
    // Get all organizations with active SLA policies that have escalation enabled
    const activePolicies = await prisma.slaPolicy.findMany({
      where: {
        is_active: true,
        escalation_enabled: true,
      },
      select: {
        id: true,
        organization_id: true,
        notify_on_breach: true,
        notify_before_breach_minutes: true,
        escalation_after_minutes: true,
        escalation_to: true,
        name: true,
        severity: true,
      },
    });

    const orgPolicies = new Map<string, typeof activePolicies>();
    for (const policy of activePolicies) {
      const existing = orgPolicies.get(policy.organization_id) || [];
      existing.push(policy);
      orgPolicies.set(policy.organization_id, existing);
    }

    logger.info(`Found ${activePolicies.length} active escalation policies across ${orgPolicies.size} organizations`);

    let processed = 0;

    for (const [organizationId, policies] of orgPolicies) {
      const policyIds = policies.map(p => p.id);

      // ========== 1. WARNING NOTIFICATIONS (before breach) ==========
      for (const policy of policies) {
        if (!policy.notify_before_breach_minutes) continue;

        const warningThreshold = new Date(now.getTime() + policy.notify_before_breach_minutes * MS_PER_MINUTE);

        const atRiskTickets = await prisma.remediationTicket.findMany({
          where: {
            organization_id: organizationId,
            sla_policy_id: policy.id,
            sla_breached: false,
            sla_breach_notified: false,
            sla_due_at: { lte: warningThreshold, gt: now },
            status: { notIn: ['resolved', 'closed', 'cancelled'] },
          },
          select: { id: true, title: true, severity: true, sla_due_at: true, assigned_to: true },
        });

        for (const ticket of atRiskTickets) {
          const minutesRemaining = Math.round((ticket.sla_due_at!.getTime() - now.getTime()) / MS_PER_MINUTE);

          await prisma.remediationTicket.update({
            where: { id: ticket.id },
            data: { sla_breach_notified: true },
          });

          await recordHistory(prisma, ticket.id, 'sla_warning', 'sla_status', null, 'at_risk',
            `SLA breach warning: ${minutesRemaining} minutes remaining (policy: ${policy.name})`);

          await sendSlaEmail(emailService, prisma, organizationId, policy, ticket, 'warning', minutesRemaining, results);
          results.warnings++;
        }
        processed += atRiskTickets.length;
      }

      // ========== 2. SLA BREACH DETECTION ==========
      const breachedTickets = await prisma.remediationTicket.findMany({
        where: {
          organization_id: organizationId,
          sla_policy_id: { in: policyIds },
          sla_due_at: { lt: now },
          sla_breached: false,
          status: { notIn: ['resolved', 'closed', 'cancelled'] },
        },
        include: { sla_policy: true },
      });

      for (const ticket of breachedTickets) {
        await prisma.remediationTicket.update({
          where: { id: ticket.id },
          data: { sla_breached: true },
        });

        await recordHistory(prisma, ticket.id, 'sla_breached', 'sla_breached', 'false', 'true',
          `SLA breached (policy: ${ticket.sla_policy?.name || 'unknown'})`);

        if (ticket.sla_policy?.notify_on_breach) {
          await sendSlaEmail(emailService, prisma, organizationId, ticket.sla_policy, ticket, 'breach', 0, results);
        }
        results.breaches++;
      }
      processed += breachedTickets.length;

      // ========== 3. ESCALATION (past escalation_after_minutes) ==========
      for (const policy of policies) {
        if (!policy.escalation_after_minutes) continue;

        const escalationThreshold = new Date(now.getTime() - policy.escalation_after_minutes * MS_PER_MINUTE);

        // Find breached tickets that haven't been escalated recently
        const ticketsToEscalate = await prisma.remediationTicket.findMany({
          where: {
            organization_id: organizationId,
            sla_policy_id: policy.id,
            sla_breached: true,
            sla_due_at: { lt: escalationThreshold },
            status: { notIn: ['resolved', 'closed', 'cancelled'] },
            // Only escalate if not escalated in the last escalation_after_minutes period
            OR: [
              { escalated_at: null },
              { escalated_at: { lt: escalationThreshold } },
            ],
          },
          select: { id: true, title: true, severity: true, escalation_level: true, sla_due_at: true, assigned_to: true },
        });

        for (const ticket of ticketsToEscalate) {
          const newLevel = ticket.escalation_level + 1;

          await prisma.remediationTicket.update({
            where: { id: ticket.id },
            data: {
              escalation_level: newLevel,
              escalated_at: now,
            },
          });

          await recordHistory(prisma, ticket.id, 'escalated', 'escalation_level',
            String(ticket.escalation_level), String(newLevel),
            `Escalated to level ${newLevel} (policy: ${policy.name}, ${policy.escalation_after_minutes}min past breach)`);

          await sendSlaEmail(emailService, prisma, organizationId, policy, ticket, 'escalation', newLevel, results);
          results.escalations++;
        }
        processed += ticketsToEscalate.length;
      }
    }

    logger.info('SLA escalation check completed', { processed, results });
    return { processed, results };

  } catch (err) {
    logger.error('Error in SLA escalation check', err as Error);
    throw err;
  }
}

async function recordHistory(
  prisma: any,
  ticketId: string,
  action: string,
  fieldChanged: string,
  oldValue: string | null,
  newValue: string | null,
  comment: string
) {
  return prisma.ticketHistory.create({
    data: {
      ticket_id: ticketId,
      user_id: '00000000-0000-0000-0000-000000000000', // system user
      user_name: 'System (SLA Automation)',
      user_email: null,
      action,
      field_changed: fieldChanged,
      old_value: oldValue,
      new_value: newValue,
      comment,
    },
  });
}

async function sendSlaEmail(
  emailService: EmailService,
  prisma: any,
  organizationId: string,
  policy: any,
  ticket: any,
  type: 'warning' | 'breach' | 'escalation',
  value: number,
  results: EscalationResult
) {
  try {
    // Determine recipients: escalation_to user, org admins, or assigned user
    const recipientEmails: string[] = [];

    // If escalation_to is set, get that user's email
    if (policy.escalation_to) {
      const escalationProfile = await prisma.profile.findFirst({
        where: { id: policy.escalation_to, organization_id: organizationId },
      });
      if (escalationProfile?.email) {
        recipientEmails.push(escalationProfile.email);
      }
    }

    // Also notify assigned user if different
    if (ticket.assigned_to && ticket.assigned_to !== policy.escalation_to) {
      const assignedProfile = await prisma.profile.findFirst({
        where: { id: ticket.assigned_to, organization_id: organizationId },
      });
      if (assignedProfile?.email) {
        recipientEmails.push(assignedProfile.email);
      }
    }

    // If no specific recipients, get org admins
    if (recipientEmails.length === 0) {
      const admins = await prisma.profile.findMany({
        where: {
          organization_id: organizationId,
          role: { in: ['admin', 'org_admin', 'super_admin'] },
        },
        select: { email: true },
        take: 5,
      });
      for (const admin of admins) {
        if (admin.email) recipientEmails.push(admin.email);
      }
    }

    // Include ticket watchers
    try {
      const eventType = type === 'warning' ? 'sla_warning' : type === 'breach' ? 'sla_breached' : 'escalated';
      const watcherRecipients = await getWatcherRecipients(prisma, ticket.id, organizationId, eventType);
      for (const w of watcherRecipients) {
        if (w.email && !recipientEmails.includes(w.email)) {
          recipientEmails.push(w.email);
        }
      }
    } catch (watcherErr) {
      logger.warn('Failed to get watcher recipients for SLA notification', { error: (watcherErr as Error).message });
    }

    // Also check org contact email
    if (recipientEmails.length === 0) {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { contact_email: true },
      });
      if (org?.contact_email) recipientEmails.push(org.contact_email);
    }

    if (recipientEmails.length === 0) {
      logger.warn('No recipients found for SLA notification', { organizationId, ticketId: ticket.id });
      return;
    }

    const ticketUrl = `${PLATFORM_BASE_URL}/remediation-tickets/${ticket.id}`;
    const { subject, htmlBody, textBody } = buildSlaEmailContent(type, policy, ticket, value, ticketUrl);

    for (const email of recipientEmails) {
      try {
        const result = await emailService.sendEmail({
          to: { email },
          subject,
          htmlBody,
          textBody,
          priority: type === 'escalation' || ticket.severity === 'critical' ? 'high' : 'normal',
          tags: { type: `sla_${type}`, severity: ticket.severity },
        });

        await prisma.communicationLog.create({
          data: {
            organization_id: organizationId,
            channel: 'email',
            recipient: email,
            subject,
            message: `SLA ${type}: ${ticket.title}`,
            status: 'sent',
            metadata: {
              messageId: result.messageId,
              sla_type: type,
              ticket_id: ticket.id,
              escalation_level: type === 'escalation' ? value : undefined,
              is_automated: true,
            },
          },
        });

        results.emailsSent++;
      } catch (emailErr) {
        results.emailsFailed++;
        logger.error(`Failed to send SLA ${type} email`, emailErr as Error, {
          organizationId, ticketId: ticket.id, recipient: email,
        });
      }
    }
  } catch (err) {
    logger.error('Error in sendSlaEmail', err as Error, { organizationId, ticketId: ticket.id });
  }
}

function buildSlaEmailContent(
  type: 'warning' | 'breach' | 'escalation',
  policy: any,
  ticket: any,
  value: number,
  ticketUrl: string
): { subject: string; htmlBody: string; textBody: string } {
  const severityColors: Record<string, string> = {
    critical: '#721c24',
    high: '#dc3545',
    medium: '#fd7e14',
    low: '#28a745',
  };

  const typeConfig = {
    warning: {
      emoji: '⚠️',
      label: 'SLA Warning',
      color: '#ffc107',
      description: `Ticket approaching SLA breach in ${value} minutes`,
    },
    breach: {
      emoji: '🚨',
      label: 'SLA Breached',
      color: '#dc3545',
      description: 'Ticket has breached its SLA deadline',
    },
    escalation: {
      emoji: '🔺',
      label: `SLA Escalation (Level ${value})`,
      color: '#721c24',
      description: `Ticket escalated to level ${value} due to unresolved SLA breach`,
    },
  };

  const config = typeConfig[type];
  const severity = ticket.severity || 'medium';
  const subject = `[${config.label}] ${ticket.title} (${severity.toUpperCase()})`;

  const htmlBody = `
    <html>
      <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="background-color: ${config.color}; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">${config.emoji} ${config.label}</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">SLA Policy: ${policy.name}</p>
          </div>
          <div style="padding: 30px;">
            <h2 style="color: #333; margin-top: 0;">${ticket.title}</h2>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold; width: 35%;">Severity:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">
                  <span style="color: ${severityColors[severity] || '#666'}; font-weight: bold;">${severity.toUpperCase()}</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">SLA Deadline:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${ticket.sla_due_at ? new Date(ticket.sla_due_at).toLocaleString('pt-BR') : 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Event:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${config.description}</td>
              </tr>
              ${type === 'escalation' ? `
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Escalation Level:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; color: ${config.color}; font-weight: bold;">${value}</td>
              </tr>` : ''}
            </table>
            <div style="text-align: center; margin: 20px 0;">
              <a href="${ticketUrl}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                View Ticket
              </a>
            </div>
            <p style="color: #666; font-size: 14px; margin: 0;">
              This is an automated notification from EVO Platform SLA monitoring.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textBody = `${config.label}\n\nTicket: ${ticket.title}\nSeverity: ${severity}\nSLA Deadline: ${ticket.sla_due_at || 'N/A'}\n${config.description}\n\nView ticket: ${ticketUrl}`;

  return { subject, htmlBody, textBody };
}
