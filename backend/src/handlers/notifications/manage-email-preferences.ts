/**
 * Manage Email Preferences Handler
 * Allows organizations to manage their email notification preferences
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { z } from 'zod';
import { parseAndValidateBody } from '../../lib/validation.js';

// Validation schemas
const listPreferencesSchema = z.object({
  action: z.literal('list'),
});

const updatePreferenceSchema = z.object({
  action: z.literal('update'),
  notification_type: z.string().min(1),
  is_enabled: z.boolean().optional(),
  frequency: z.enum(['immediate', 'daily', 'weekly', 'monthly']).optional(),
  send_time: z.string().optional(), // HH:MM format
  timezone: z.string().optional(),
  recipients: z.array(z.string().email()).optional(),
});

const bulkUpdateSchema = z.object({
  action: z.literal('bulk_update'),
  settings: z.array(z.object({
    notification_type: z.string().min(1),
    is_enabled: z.boolean().optional(),
    frequency: z.enum(['immediate', 'daily', 'weekly', 'monthly']).optional(),
  })),
});

const testEmailSchema = z.object({
  action: z.literal('test'),
  notification_type: z.string().min(1),
  email: z.string().email().optional(),
});

const requestSchema = z.discriminatedUnion('action', [
  listPreferencesSchema,
  updatePreferenceSchema,
  bulkUpdateSchema,
  testEmailSchema,
]);

// Platform URLs
const PLATFORM_URLS = {
  base: 'https://evo.ai.udstec.io',
  dashboard: 'https://evo.ai.udstec.io/dashboard',
  reports: 'https://evo.ai.udstec.io/reports',
  alerts: 'https://evo.ai.udstec.io/alerts',
  securityScans: 'https://evo.ai.udstec.io/security-scans',
  costAnalysis: 'https://evo.ai.udstec.io/cost-analysis',
} as const;

// Notification types with descriptions
const NOTIFICATION_TYPES = [
  { type: 'welcome', name: 'Email de Boas-vindas', description: 'Enviado quando novos usuários são criados', category: 'onboarding' },
  { type: 'daily_summary', name: 'Resumo Diário', description: 'Resumo diário de segurança e custos', category: 'reports' },
  { type: 'weekly_report', name: 'Relatório Semanal', description: 'Relatório semanal completo', category: 'reports' },
  { type: 'critical_alert', name: 'Alertas Críticos', description: 'Alertas de severidade crítica', category: 'alerts' },
  { type: 'security_notification', name: 'Notificações de Segurança', description: 'Novos findings de segurança', category: 'security' },
  { type: 'proactive_notification', name: 'Notificações Proativas da IA', description: 'Sugestões e alertas da IA', category: 'ai' },
  { type: 'cost_alert', name: 'Alertas de Custos', description: 'Anomalias e picos de custo', category: 'costs' },
];

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    const validation = parseAndValidateBody(requestSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const data = validation.data;

    switch (data.action) {
      case 'list': {
        // Get all settings for the organization
        const settings = await prisma.organizationEmailSettings.findMany({
          where: { organization_id: organizationId },
          orderBy: { notification_type: 'asc' },
        });

        // Merge with notification types info
        const result = NOTIFICATION_TYPES.map(nt => {
          const setting = settings.find(s => s.notification_type === nt.type);
          return {
            ...nt,
            is_enabled: setting?.is_enabled ?? true,
            frequency: setting?.frequency ?? (nt.category === 'reports' ? 'daily' : 'immediate'),
            send_time: setting?.send_time?.toISOString().slice(11, 16) ?? '08:00',
            timezone: setting?.timezone ?? 'America/Sao_Paulo',
            recipients: setting?.recipients ?? [],
            last_sent_at: setting?.last_sent_at,
            send_count: setting?.send_count ?? 0,
          };
        });

        return success({ settings: result, notification_types: NOTIFICATION_TYPES });
      }

      case 'update': {
        const updateData: Partial<{
          is_enabled: boolean;
          frequency: string;
          timezone: string;
          recipients: string[];
          send_time: Date;
        }> = {};
        if (data.is_enabled !== undefined) updateData.is_enabled = data.is_enabled;
        if (data.frequency) updateData.frequency = data.frequency;
        if (data.timezone) updateData.timezone = data.timezone;
        if (data.recipients) updateData.recipients = data.recipients;
        if (data.send_time) {
          // Convert HH:MM to Time
          const [hours, minutes] = data.send_time.split(':');
          updateData.send_time = new Date(`1970-01-01T${hours}:${minutes}:00Z`);
        }

        const setting = await prisma.organizationEmailSettings.upsert({
          where: {
            organization_id_notification_type: {
              organization_id: organizationId,
              notification_type: data.notification_type,
            },
          },
          update: updateData,
          create: {
            organization_id: organizationId,
            notification_type: data.notification_type,
            ...updateData,
          },
        });

        logger.info('Email preference updated', {
          organizationId,
          notificationType: data.notification_type,
          isEnabled: setting.is_enabled,
        });

        return success({ setting, message: 'Preference updated successfully' });
      }

      case 'bulk_update': {
        const results = [];
        
        for (const item of data.settings) {
          const updateData: Partial<{
            is_enabled: boolean;
            frequency: string;
          }> = {};
          if (item.is_enabled !== undefined) updateData.is_enabled = item.is_enabled;
          if (item.frequency) updateData.frequency = item.frequency;

          const setting = await prisma.organizationEmailSettings.upsert({
            where: {
              organization_id_notification_type: {
                organization_id: organizationId,
                notification_type: item.notification_type,
              },
            },
            update: updateData,
            create: {
              organization_id: organizationId,
              notification_type: item.notification_type,
              ...updateData,
            },
          });
          results.push(setting);
        }

        logger.info('Email preferences bulk updated', {
          organizationId,
          count: results.length,
        });

        return success({ settings: results, message: 'Preferences updated successfully' });
      }

      case 'test': {
        // Import email service dynamically
        const { EmailService } = await import('../../lib/email-service.js');
        const emailService = new EmailService();

        // Get template
        const template = await prisma.emailTemplate.findUnique({
          where: { template_type: data.notification_type },
        });

        if (!template) {
          return error(`Template '${data.notification_type}' not found`, 404);
        }

        // Get organization info
        const org = await prisma.organization.findUnique({
          where: { id: organizationId },
        });

        // Get user email
        const targetEmail = data.email || user.email;
        const userName = user.name || user.email?.split('@')[0] || 'Usuário';

        // Prepare test variables for email preview
        // NOTE: These are SAMPLE values used ONLY for test email previews in the admin UI.
        // They allow admins to see how the email template will look with realistic data.
        // Production emails use real data from gatherEmailData() in send-scheduled-emails.ts
        const now = new Date();
        const testVars: Record<string, string> = {
          user_name: userName,
          organization_name: org?.name || 'Sua Organização',
          date: now.toLocaleDateString('pt-BR'),
          time: now.toLocaleTimeString('pt-BR'),
          platform_url: PLATFORM_URLS.base,
          dashboard_url: PLATFORM_URLS.dashboard,
          reports_url: PLATFORM_URLS.reports,
          alerts_url: PLATFORM_URLS.alerts,
          security_scans_url: PLATFORM_URLS.securityScans,
          cost_analysis_url: PLATFORM_URLS.costAnalysis,
          // Sample data for testing
          critical_findings: '3',
          high_findings: '12',
          medium_findings: '45',
          total_cost: 'R$ 15.432,00',
          cost_change: '+5.2%',
          alert_title: 'Alerta de Teste',
          alert_description: 'Esta é uma descrição de alerta de teste.',
          alert_severity: 'high',
        };

        // Process template
        let subject = template.subject;
        let htmlBody = template.html_body;
        
        for (const [key, value] of Object.entries(testVars)) {
          const regex = new RegExp(`\\{${key}\\}`, 'g');
          subject = subject.replace(regex, value);
          htmlBody = htmlBody.replace(regex, value);
        }

        // Send test email
        const result = await emailService.sendEmail({
          to: { email: targetEmail, name: userName },
          subject: `[TESTE] ${subject}`,
          htmlBody,
          textBody: template.text_body || undefined,
        });

        // Log to communication_logs
        await prisma.communicationLog.create({
          data: {
            organization_id: organizationId,
            channel: 'email',
            recipient: targetEmail,
            subject: `[TESTE] ${subject}`,
            message: `Test email for template: ${data.notification_type}`,
            status: 'sent',
            metadata: { messageId: result.messageId, template_type: data.notification_type, is_test: true },
          },
        });

        logger.info('Test email sent', {
          organizationId,
          notificationType: data.notification_type,
          recipient: targetEmail,
          messageId: result.messageId,
        });

        return success({ 
          message: 'Test email sent successfully',
          messageId: result.messageId,
          recipient: targetEmail,
        });
      }

      default:
        return error('Invalid action', 400);
    }
  } catch (err) {
    logger.error('Error managing email preferences', err as Error);
    return error('Internal server error', 500);
  }
}
