/**
 * Health Event Processor
 *
 * Processes AWS Health events: creates remediation tickets, dashboard alerts,
 * email notifications, communication logs, and audit entries.
 *
 * Side effects (email, alert, audit, communication log) are wrapped in try/catch
 * so they never block the main ticket creation flow.
 */

import { logger } from './logger.js';
import { findAssignment, autoWatch } from './ticket-workflow.js';
import { logAuditAsync } from './audit-service.js';
import { EmailService } from './email-service.js';

// ==================== INTERFACES ====================

export interface ProcessableEvent {
  id: string;
  eventArn: string;
  typeCode: string;
  category: string;
  region: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  isCredentialExposure: boolean;
  awsAccountId: string;
  organizationId: string;
  remediationTicketId: string | null;
}

export interface ProcessingConfig {
  autoTicketSeverities: string[];
  organizationId: string;
}

export interface ProcessingResult {
  ticketCreated: boolean;
  ticketId: string | null;
  alertCreated: boolean;
  emailSent: boolean;
}

// ==================== CONSTANTS ====================

const CREDENTIAL_EXPOSURE_BUSINESS_IMPACT =
  'Credenciais AWS potencialmente expostas — ação imediata necessária';

const CREDENTIAL_EXPOSURE_REMEDIATION = [
  '1. Rotacionar imediatamente todas as credenciais afetadas (Access Keys, passwords)',
  '2. Revogar todas as sessões ativas associadas ao usuário/role comprometido',
  '3. Verificar CloudTrail para atividades suspeitas nas últimas 24-48 horas',
  '4. Revisar e remover quaisquer recursos não autorizados criados',
  '5. Habilitar MFA em todas as contas de usuário afetadas',
].join('\n');

// ==================== HELPERS ====================

function mapSeverityToPriority(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    default:
      return 'low';
  }
}

function buildTicketTitle(event: ProcessableEvent): string {
  return `[AWS Health] ${event.typeCode} - ${event.region} (${event.awsAccountId})`;
}

function buildTicketDescription(event: ProcessableEvent): string {
  const lines: string[] = [];
  lines.push(`Evento AWS Health detectado automaticamente.`);
  lines.push('');
  lines.push(`Tipo: ${event.typeCode}`);
  lines.push(`Região: ${event.region}`);
  lines.push(`Conta AWS: ${event.awsAccountId}`);
  lines.push(`Severidade: ${event.severity}`);
  lines.push('');
  if (event.description) {
    lines.push(`Descrição: ${event.description}`);
    lines.push('');
  }
  if (event.isCredentialExposure) {
    lines.push('=== INSTRUÇÕES DE REMEDIAÇÃO (URGENTE) ===');
    lines.push('');
    lines.push(CREDENTIAL_EXPOSURE_REMEDIATION);
  }
  return lines.join('\n');
}

// ==================== MAIN FUNCTION ====================

export async function processHealthEvent(
  prisma: any,
  event: ProcessableEvent,
  config: ProcessingConfig,
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    ticketCreated: false,
    ticketId: null,
    alertCreated: false,
    emailSent: false,
  };

  // Skip if event already has a ticket
  if (event.remediationTicketId !== null) {
    return result;
  }

  // Skip if severity is not in the auto-ticket list
  if (!config.autoTicketSeverities.includes(event.severity)) {
    return result;
  }

  const title = buildTicketTitle(event);
  const description = buildTicketDescription(event);
  const priority = event.isCredentialExposure
    ? 'urgent'
    : mapSeverityToPriority(event.severity);

  // 1. Create RemediationTicket
  const ticket = await prisma.remediationTicket.create({
    data: {
      organization_id: event.organizationId,
      title,
      description,
      category: 'security',
      status: 'open',
      severity: event.severity,
      priority,
      business_impact: event.isCredentialExposure
        ? CREDENTIAL_EXPOSURE_BUSINESS_IMPACT
        : null,
      created_by: 'system:health-monitor',
      metadata: {
        event_arn: event.eventArn,
        typeCode: event.typeCode,
        aws_account_id: event.awsAccountId,
        region: event.region,
        description: event.description,
      },
    },
  });

  result.ticketCreated = true;
  result.ticketId = ticket.id;

  // 2. Auto-assignment and auto-watch (non-blocking)
  try {
    const assignment = await findAssignment(prisma, event.organizationId, {
      severity: event.severity,
      category: 'security',
      metadata: ticket.metadata,
    });

    if (assignment) {
      await prisma.remediationTicket.update({
        where: { id: ticket.id },
        data: { assigned_to: assignment.assignTo },
      });

      const assigneeProfile = await prisma.profile.findFirst({
        where: { id: assignment.assignTo, organization_id: event.organizationId },
        select: { full_name: true, email: true },
      });

      await autoWatch(
        prisma,
        ticket.id,
        assignment.assignTo,
        assigneeProfile?.full_name || null,
        assigneeProfile?.email || null,
      );
    }
  } catch (err) {
    logger.warn('Health event processor: auto-assignment failed (non-critical)', {
      ticketId: ticket.id,
      error: (err as Error).message,
    });
  }

  // 3. Create Alert for critical severity
  if (event.severity === 'critical') {
    try {
      await prisma.alert.create({
        data: {
          organization_id: event.organizationId,
          severity: 'critical',
          title,
          message: event.description || 'Evento crítico detectado no AWS Health',
          metadata: {
            source: 'aws-health-monitor',
            event_arn: event.eventArn,
            aws_account_id: event.awsAccountId,
            region: event.region,
            type_code: event.typeCode,
            remediation_ticket_id: ticket.id,
            detected_at: new Date().toISOString(),
          },
        },
      });
      result.alertCreated = true;
    } catch (err) {
      logger.warn('Health event processor: alert creation failed (non-critical)', {
        ticketId: ticket.id,
        error: (err as Error).message,
      });
    }
  }

  // 4. Send email for critical or high severity
  if (event.severity === 'critical' || event.severity === 'high') {
    try {
      const admins = await prisma.profile.findMany({
        where: {
          organization_id: event.organizationId,
          role: 'admin',
        },
        select: { email: true, full_name: true },
      });

      const recipients = admins
        .filter((a: any) => a.email)
        .map((a: any) => ({ email: a.email, name: a.full_name || undefined }));

      if (recipients.length > 0) {
        const emailService = new EmailService();
        const emailType = event.isCredentialExposure
          ? `[URGENTE] Credenciais AWS Expostas - ${event.awsAccountId}`
          : `AWS Health ${event.severity.toUpperCase()} - ${event.typeCode}`;

        await emailService.sendSecurityNotification(recipients, {
          type: emailType,
          description: event.description || title,
          timestamp: new Date(),
        });
        result.emailSent = true;
      }
    } catch (err) {
      logger.warn('Health event processor: email notification failed (non-critical)', {
        ticketId: ticket.id,
        error: (err as Error).message,
      });
    }
  }

  // 5. Register CommunicationLog for credential exposure
  if (event.isCredentialExposure) {
    try {
      await prisma.communicationLog.create({
        data: {
          organization_id: event.organizationId,
          channel: 'email',
          recipient: 'organization-admins',
          subject: `[URGENTE] Credenciais AWS Expostas - ${event.awsAccountId}`,
          message: `Evento de credential exposure detectado: ${event.eventArn}`,
          status: result.emailSent ? 'sent' : 'failed',
          metadata: {
            source: 'aws-health-credential-exposure',
            event_arn: event.eventArn,
            organization_id: event.organizationId,
          },
        },
      });
    } catch (err) {
      logger.warn('Health event processor: communication log failed (non-critical)', {
        ticketId: ticket.id,
        error: (err as Error).message,
      });
    }
  }

  // 6. Audit log (fire-and-forget)
  try {
    logAuditAsync({
      organizationId: event.organizationId,
      action: 'TICKET_CREATE' as any,
      resourceType: 'ticket',
      resourceId: ticket.id,
      details: {
        source: 'health-event-processor',
        action_type: 'HEALTH_EVENT_TICKET_CREATE',
        event_arn: event.eventArn,
        type_code: event.typeCode,
        severity: event.severity,
        is_credential_exposure: event.isCredentialExposure,
        aws_account_id: event.awsAccountId,
        region: event.region,
      },
    });
  } catch (err) {
    logger.warn('Health event processor: audit log failed (non-critical)', {
      ticketId: ticket.id,
      error: (err as Error).message,
    });
  }

  // 7. Update AwsHealthEvent with the ticket ID
  try {
    await prisma.awsHealthEvent.update({
      where: { id: event.id },
      data: { remediation_ticket_id: ticket.id },
    });
  } catch (err) {
    logger.warn('Health event processor: failed to update event with ticket ID', {
      eventId: event.id,
      ticketId: ticket.id,
      error: (err as Error).message,
    });
  }

  logger.info('Health event processed successfully', {
    eventId: event.id,
    ticketId: ticket.id,
    severity: event.severity,
    isCredentialExposure: event.isCredentialExposure,
    alertCreated: result.alertCreated,
    emailSent: result.emailSent,
  });

  return result;
}
