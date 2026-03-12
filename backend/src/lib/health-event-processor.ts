/**
 * Health Event Processor
 * Orchestrates ticket creation, dashboard alerts, email notifications,
 * and audit logging for AWS Health events.
 * Reuses existing platform components (tickets, email, audit).
 */

import { findAssignment, autoWatch } from './ticket-workflow.js';
import { logAuditAsync } from './audit-service.js';
import { EmailService } from './email-service.js';
import { logger } from './logger.js';

// ==================== INTERFACES ====================

export interface ProcessableEvent {
  id: string;                    // ID do AwsHealthEvent no DB
  eventArn: string;
  typeCode: string;
  category: string;
  region: string;
  description: string;
  severity: string;              // 'critical' | 'high' | 'medium' | 'low'
  isCredentialExposure: boolean;
  awsAccountId: string;
  organizationId: string;
  remediationTicketId: string | null;
}

export interface ProcessingConfig {
  autoTicketSeverities: string[];  // e.g. ['critical', 'high']
  organizationId: string;
}

export interface ProcessingResult {
  ticketCreated: boolean;
  ticketId: string | null;
  alertCreated: boolean;
  emailSent: boolean;
}

// ==================== CONSTANTS ====================

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
const SYSTEM_USER_NAME = 'AWS Health Monitor';

const CREDENTIAL_EXPOSURE_REMEDIATION = `Instruções de remediação para credenciais expostas:

1. ROTACIONAR CREDENCIAIS: Gere novas access keys imediatamente para o usuário/role afetado
2. REVOGAR SESSÕES ATIVAS: Invalide todas as sessões temporárias associadas às credenciais comprometidas
3. VERIFICAR CLOUDTRAIL: Analise os logs do CloudTrail para identificar atividades não autorizadas realizadas com as credenciais expostas
4. REVISAR PERMISSÕES: Verifique e restrinja as permissões do usuário/role afetado seguindo o princípio do menor privilégio`;

const CREDENTIAL_EXPOSURE_BUSINESS_IMPACT = 'Credenciais AWS potencialmente expostas — ação imediata necessária';

// ==================== HELPERS ====================

function mapSeverityToPriority(severity: string, isCredentialExposure: boolean): string {
  if (isCredentialExposure) return 'urgent';
  switch (severity) {
    case 'critical': return 'critical';
    case 'high': return 'high';
    case 'medium': return 'medium';
    default: return 'low';
  }
}

function buildTicketDescription(event: ProcessableEvent): string {
  if (event.isCredentialExposure) {
    return `${event.description || 'Credenciais AWS potencialmente expostas detectadas pelo AWS Health.'}\n\n${CREDENTIAL_EXPOSURE_REMEDIATION}`;
  }
  return event.description || 'Evento detectado pelo AWS Health Monitor.';
}

function buildTicketMetadata(event: ProcessableEvent): Record<string, any> {
  return {
    event_arn: event.eventArn,
    type_code: event.typeCode,
    aws_account_id: event.awsAccountId,
    region: event.region,
    description: event.description,
    source: 'aws-health-monitor',
  };
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

  // Skip if severity is not in auto-ticket list
  if (!config.autoTicketSeverities.includes(event.severity)) {
    return result;
  }

  // 1. Create RemediationTicket
  const ticketTitle = `[AWS Health] ${event.typeCode} - ${event.region} (${event.awsAccountId})`;
  const ticketDescription = buildTicketDescription(event);
  const ticketMetadata = buildTicketMetadata(event);
  const priority = mapSeverityToPriority(event.severity, event.isCredentialExposure);

  const ticket = await prisma.remediationTicket.create({
    data: {
      organization_id: event.organizationId,
      title: ticketTitle,
      description: ticketDescription,
      severity: event.severity,
      priority,
      status: 'open',
      category: 'security',
      created_by: 'system',
      business_impact: event.isCredentialExposure ? CREDENTIAL_EXPOSURE_BUSINESS_IMPACT : null,
      metadata: ticketMetadata,
      finding_ids: [],
    },
  });

  result.ticketCreated = true;
  result.ticketId = ticket.id;

  // 2. Auto-assignment
  try {
    const assignment = await findAssignment(prisma, event.organizationId, {
      severity: event.severity,
      category: 'security',
      metadata: ticketMetadata,
    });
    if (assignment) {
      await prisma.remediationTicket.update({
        where: { id: ticket.id },
        data: { assigned_to: assignment.assignTo },
      });
    }
  } catch (err) {
    logger.warn('Health event auto-assignment failed', { ticketId: ticket.id, error: (err as Error).message });
  }

  // 3. Auto-watch system user
  try {
    await autoWatch(prisma, ticket.id, SYSTEM_USER_ID, SYSTEM_USER_NAME, null);
  } catch (err) {
    logger.warn('Health event auto-watch failed', { ticketId: ticket.id, error: (err as Error).message });
  }

  // 4. Create TicketHistory entry
  try {
    await prisma.ticketHistory.create({
      data: {
        ticket_id: ticket.id,
        user_id: SYSTEM_USER_ID,
        user_name: SYSTEM_USER_NAME,
        user_email: null,
        action: 'created',
        comment: `Ticket criado automaticamente a partir do evento AWS Health: ${event.eventArn}`,
      },
    });
  } catch (err) {
    logger.warn('Health event ticket history creation failed', { ticketId: ticket.id, error: (err as Error).message });
  }

  // 5. Update AwsHealthEvent with ticket reference
  try {
    await prisma.awsHealthEvent.update({
      where: { id: event.id },
      data: { remediation_ticket_id: ticket.id },
    });
  } catch (err) {
    logger.warn('Failed to update health event with ticket id', { eventId: event.id, ticketId: ticket.id, error: (err as Error).message });
  }

  // 6. Audit log (fire-and-forget)
  try {
    logAuditAsync({
      organizationId: event.organizationId,
      userId: null as any,
      action: 'HEALTH_EVENT_TICKET_CREATE' as any,
      resourceType: 'ticket' as any,
      resourceId: ticket.id,
      details: {
        event_arn: event.eventArn,
        type_code: event.typeCode,
        severity: event.severity,
      },
    });
  } catch (err) {
    logger.warn('Health event audit log failed', { ticketId: ticket.id, error: (err as Error).message });
  }

  // 7. Create Alert for critical severity (fire-and-forget)
  if (event.severity === 'critical') {
    try {
      await prisma.alert.create({
        data: {
          organization_id: event.organizationId,
          severity: 'critical',
          title: ticketTitle,
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
      logger.warn('Health event alert creation failed', { eventArn: event.eventArn, error: (err as Error).message });
    }
  }

  // 8. Send email for critical or high severity (fire-and-forget)
  if (event.severity === 'critical' || event.severity === 'high') {
    try {
      const adminProfiles = await prisma.profile.findMany({
        where: {
          organization_id: event.organizationId,
          role: 'admin',
          email: { not: null },
        },
        select: { email: true, full_name: true },
      });

      if (adminProfiles.length > 0) {
        const emailService = new EmailService();
        const recipients = adminProfiles
          .filter((p: any) => p.email)
          .map((p: any) => ({ email: p.email, name: p.full_name || undefined }));

        if (recipients.length > 0) {
          const emailSubject = event.isCredentialExposure
            ? `[URGENTE] Credenciais AWS Expostas - ${event.awsAccountId}`
            : `[AWS Health] ${event.typeCode} - ${event.region}`;

          await emailService.sendSecurityNotification(recipients, {
            type: emailSubject,
            description: ticketDescription,
            timestamp: new Date(),
          });
          result.emailSent = true;
        }
      }
    } catch (err) {
      logger.warn('Health event email notification failed', { eventArn: event.eventArn, error: (err as Error).message });
    }
  }

  // 9. For credential exposure, create CommunicationLog (fire-and-forget)
  if (event.isCredentialExposure) {
    try {
      await prisma.communicationLog.create({
        data: {
          organization_id: event.organizationId,
          channel: 'email',
          recipient: 'org-admins',
          subject: `[URGENTE] Credenciais AWS Expostas - ${event.awsAccountId}`,
          message: ticketDescription,
          status: result.emailSent ? 'sent' : 'failed',
          metadata: {
            source: 'aws-health-credential-exposure',
            event_arn: event.eventArn,
            organization_id: event.organizationId,
          },
        },
      });
    } catch (err) {
      logger.warn('Health event communication log failed', { eventArn: event.eventArn, error: (err as Error).message });
    }
  }

  logger.info('Health event processed', {
    eventArn: event.eventArn,
    ticketId: ticket.id,
    alertCreated: result.alertCreated,
    emailSent: result.emailSent,
  });

  return result;
}
