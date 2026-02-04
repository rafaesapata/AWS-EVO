/**
 * Check Proactive Notifications Handler (Scheduled)
 * Verifica condições e cria notificações proativas automaticamente
 * Executado via EventBridge Schedule (ex: a cada hora)
 * 
 * ATUALIZADO: Agora usa regras configuráveis do banco de dados
 * ATUALIZADO: Envia emails para notificações de alta prioridade
 */

import type { LambdaContext } from '../../types/lambda.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { EmailService } from '../../lib/email-service.js';

interface NotificationData {
  title: string;
  message: string;
  suggested_action: string;
  action_type: string;
  action_params?: Record<string, unknown>;
  priority: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, unknown>;
}

type RuleChecker = (
  orgId: string,
  prisma: ReturnType<typeof getPrismaClient>,
  parameters: Record<string, unknown>
) => Promise<NotificationData | null>;

// Mapa de funções de verificação por tipo de regra
const RULE_CHECKERS: Record<string, RuleChecker> = {
  security_scan_needed: async (orgId, prisma, params) => {
    const daysThreshold = (params.days_threshold as number) || 7;
    const criticalThreshold = (params.critical_threshold as number) || 14;

    const lastScan = await prisma.securityScan.findFirst({
      where: { organization_id: orgId, status: 'completed' },
      orderBy: { created_at: 'desc' },
    });

    const daysSinceLastScan = lastScan
      ? Math.floor((Date.now() - lastScan.created_at.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    if (daysSinceLastScan >= daysThreshold) {
      return {
        title: 'Scan de Segurança Recomendado',
        message: lastScan
          ? `Faz ${daysSinceLastScan} dias desde o último scan de segurança. Recomendo executar um novo scan para garantir que sua infraestrutura está protegida.`
          : 'Você ainda não executou nenhum scan de segurança. Posso ajudá-lo a identificar vulnerabilidades na sua infraestrutura AWS.',
        suggested_action: 'Posso iniciar o scan de segurança agora?',
        action_type: 'security_scan',
        priority: daysSinceLastScan >= criticalThreshold ? 'high' : 'medium',
        context: { days_since_last_scan: daysSinceLastScan },
      };
    }
    return null;
  },

  compliance_scan_needed: async (orgId, prisma, params) => {
    const daysThreshold = (params.days_threshold as number) || 30;

    const lastScan = await prisma.complianceScan.findFirst({
      where: { organization_id: orgId, status: 'completed' },
      orderBy: { created_at: 'desc' },
    });

    const daysSinceLastScan = lastScan
      ? Math.floor((Date.now() - lastScan.created_at.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    if (daysSinceLastScan >= daysThreshold) {
      return {
        title: 'Verificação de Compliance Pendente',
        message: lastScan
          ? `Sua última verificação de compliance foi há ${daysSinceLastScan} dias. Manter a conformidade atualizada é essencial para auditorias.`
          : 'Você ainda não executou uma verificação de compliance. Posso ajudá-lo a verificar a conformidade com frameworks como CIS, LGPD, PCI-DSS.',
        suggested_action: 'Deseja que eu inicie uma verificação de compliance?',
        action_type: 'compliance_scan',
        priority: 'medium',
        context: { days_since_last_scan: daysSinceLastScan },
      };
    }
    return null;
  },

  high_severity_findings: async (orgId, prisma, params) => {
    const findingsThreshold = (params.findings_threshold as number) || 5;
    const criticalThreshold = (params.critical_threshold as number) || 10;

    const criticalFindings = await prisma.finding.count({
      where: {
        organization_id: orgId,
        severity: { in: ['critical', 'high'] },
        status: 'pending',
      },
    });

    if (criticalFindings >= findingsThreshold) {
      return {
        title: 'Achados de Segurança Críticos',
        message: `Você tem ${criticalFindings} achados de segurança de alta severidade pendentes. Recomendo revisar e remediar esses problemas o mais rápido possível.`,
        suggested_action: 'Quer que eu mostre os achados mais críticos?',
        action_type: 'navigate',
        action_params: { path: '/security-scans' },
        priority: criticalFindings >= criticalThreshold ? 'critical' : 'high',
        context: { critical_findings_count: criticalFindings },
      };
    }
    return null;
  },

  cost_optimization_available: async (orgId, prisma, params) => {
    const recommendationsThreshold = (params.recommendations_threshold as number) || 3;
    const savingsThreshold = (params.savings_threshold as number) || 1000;

    const recommendations = await prisma.riSpRecommendation.count({
      where: {
        organization_id: orgId,
        status: 'active',
      },
    });

    if (recommendations >= recommendationsThreshold) {
      const savings = await prisma.riSpRecommendation.aggregate({
        where: {
          organization_id: orgId,
          status: 'active',
        },
        _sum: { estimated_annual_savings: true },
      });

      const totalSavings = savings._sum.estimated_annual_savings || 0;

      if (totalSavings >= savingsThreshold) {
        return {
          title: 'Oportunidades de Economia Disponíveis',
          message: `Identifiquei ${recommendations} oportunidades de economia que podem reduzir seus custos em até $${totalSavings.toFixed(0)}/ano. Quer que eu explique as recomendações?`,
          suggested_action: 'Ver recomendações de economia',
          action_type: 'navigate',
          action_params: { path: '/ri-savings-plans' },
          priority: totalSavings >= 5000 ? 'high' : 'medium',
          context: { recommendations_count: recommendations, potential_savings: totalSavings },
        };
      }
    }
    return null;
  },

  aws_credentials_expiring: async (orgId, prisma, params) => {
    const daysThreshold = (params.days_threshold as number) || 80;

    const oldCredentials = await prisma.awsCredential.count({
      where: {
        organization_id: orgId,
        is_active: true,
        created_at: { lte: new Date(Date.now() - daysThreshold * 24 * 60 * 60 * 1000) },
      },
    });

    if (oldCredentials > 0) {
      return {
        title: 'Rotação de Credenciais Recomendada',
        message: `Você tem ${oldCredentials} credencial(is) AWS que não foram rotacionadas há mais de ${daysThreshold} dias. A AWS recomenda rotação a cada 90 dias para maior segurança.`,
        suggested_action: 'Ver credenciais que precisam de atenção',
        action_type: 'navigate',
        action_params: { path: '/cloud-credentials' },
        priority: 'medium',
        context: { credentials_count: oldCredentials },
      };
    }
    return null;
  },
};

export async function handler(
  _event: unknown,
  _context: LambdaContext
): Promise<{ processed: number; created: number; rules_checked: number }> {
  const prisma = getPrismaClient();

  logger.info('Starting proactive notifications check');

  let processed = 0;
  let created = 0;
  let rulesChecked = 0;

  try {
    // Buscar regras ativas do banco de dados
    let rules = await prisma.aiNotificationRule.findMany({
      where: { is_enabled: true },
    });

    // Se não houver regras, criar as padrão
    if (rules.length === 0) {
      logger.info('No rules found, creating default rules');
      
      const defaultRules = [
        {
          rule_type: 'security_scan_needed',
          name: 'Scan de Segurança Necessário',
          description: 'Notifica quando o último scan de segurança foi há mais de X dias',
          priority: 'medium',
          parameters: { days_threshold: 7, critical_threshold: 14 },
          title_template: 'Scan de Segurança Recomendado',
          message_template: 'Faz {days_since_last_scan} dias desde o último scan...',
          suggested_action_template: 'Posso iniciar o scan de segurança agora?',
          action_type: 'security_scan',
        },
        {
          rule_type: 'compliance_scan_needed',
          name: 'Verificação de Compliance Pendente',
          description: 'Notifica quando a última verificação de compliance foi há mais de X dias',
          priority: 'medium',
          parameters: { days_threshold: 30 },
          title_template: 'Verificação de Compliance Pendente',
          message_template: 'Sua última verificação de compliance foi há {days_since_last_scan} dias.',
          suggested_action_template: 'Deseja que eu inicie uma verificação de compliance?',
          action_type: 'compliance_scan',
        },
        {
          rule_type: 'high_severity_findings',
          name: 'Achados de Alta Severidade',
          description: 'Notifica quando há muitos achados críticos/altos pendentes',
          priority: 'high',
          parameters: { findings_threshold: 5, critical_threshold: 10 },
          title_template: 'Achados de Segurança Críticos',
          message_template: 'Você tem {critical_findings_count} achados de alta severidade pendentes.',
          suggested_action_template: 'Quer que eu mostre os achados mais críticos?',
          action_type: 'navigate',
        },
        {
          rule_type: 'cost_optimization_available',
          name: 'Oportunidades de Economia',
          description: 'Notifica quando há recomendações de economia significativas',
          priority: 'medium',
          parameters: { recommendations_threshold: 3, savings_threshold: 1000 },
          title_template: 'Oportunidades de Economia Disponíveis',
          message_template: 'Identifiquei {recommendations_count} oportunidades de economia.',
          suggested_action_template: 'Ver recomendações de economia',
          action_type: 'navigate',
        },
        {
          rule_type: 'aws_credentials_expiring',
          name: 'Rotação de Credenciais',
          description: 'Notifica quando credenciais AWS não foram rotacionadas há muito tempo',
          priority: 'medium',
          parameters: { days_threshold: 80 },
          title_template: 'Rotação de Credenciais Recomendada',
          message_template: 'Você tem {credentials_count} credencial(is) que precisam de rotação.',
          suggested_action_template: 'Ver credenciais que precisam de atenção',
          action_type: 'navigate',
        },
      ];

      for (const rule of defaultRules) {
        await prisma.aiNotificationRule.create({
          data: {
            ...rule,
            is_enabled: true,
            parameters: rule.parameters as object,
          },
        });
      }

      rules = await prisma.aiNotificationRule.findMany({
        where: { is_enabled: true },
      });
    }

    logger.info(`Found ${rules.length} active notification rules`);

    // Buscar todas as organizações ativas com licença válida
    const organizations = await prisma.organization.findMany({
      where: {
        licenses: {
          some: {
            is_active: true,
          },
        },
      },
      select: { id: true, name: true },
    });

    logger.info(`Checking ${organizations.length} organizations`);

    for (const org of organizations) {
      for (const rule of rules) {
        try {
          rulesChecked++;
          processed++;

          // Verificar se existe função de verificação para este tipo de regra
          const checker = RULE_CHECKERS[rule.rule_type];
          if (!checker) {
            logger.warn(`No checker found for rule type: ${rule.rule_type}`);
            continue;
          }

          // Verificar se já existe notificação pendente deste tipo
          const existingNotification = await prisma.aiNotification.findFirst({
            where: {
              organization_id: org.id,
              type: rule.rule_type,
              status: { in: ['pending', 'delivered'] },
              OR: [
                { expires_at: null },
                { expires_at: { gt: new Date() } },
              ],
            },
          });

          if (existingNotification) {
            continue; // Já existe notificação pendente
          }

          // Executar verificação com parâmetros da regra
          const parameters = (rule.parameters as Record<string, unknown>) || {};
          const notificationData = await checker(org.id, prisma, parameters);

          if (notificationData) {
            // Usar prioridade da regra se não especificada
            const priority = notificationData.priority || (rule.priority as 'low' | 'medium' | 'high' | 'critical');

            // Criar notificação
            await prisma.aiNotification.create({
              data: {
                organization_id: org.id,
                user_id: null, // Para todos os usuários da org
                type: rule.rule_type,
                priority,
                title: notificationData.title,
                message: notificationData.message,
                suggested_action: notificationData.suggested_action,
                action_type: notificationData.action_type,
                action_params: notificationData.action_params as object | undefined,
                context: notificationData.context as object | undefined,
                status: 'pending',
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
              },
            });

            created++;

            logger.info(`Created notification for org ${org.id}`, {
              type: rule.rule_type,
              priority,
            });

            // Send email for high/critical priority notifications
            if (priority === 'high' || priority === 'critical') {
              try {
                // Check if organization has proactive_notification emails enabled
                const emailSetting = await prisma.organizationEmailSettings.findFirst({
                  where: {
                    organization_id: org.id,
                    notification_type: 'proactive_notification',
                    is_enabled: true,
                  },
                });

                if (emailSetting) {
                  // Get template from database
                  const template = await prisma.emailTemplate.findUnique({
                    where: { template_type: 'proactive_notification' },
                  });

                  if (template && template.is_active) {
                    const emailService = new EmailService();
                    const recipients = emailSetting.recipients || [];

                    // If no custom recipients, get org admins
                    let emailRecipients: string[] = recipients;
                    if (emailRecipients.length === 0) {
                      const admins = await prisma.profile.findMany({
                        where: {
                          organization_id: org.id,
                          role: { in: ['org_admin', 'super_admin'] },
                        },
                        take: 5,
                      });
                      // We need to get emails from Cognito or stored somewhere
                      // For now, skip if no recipients configured
                      logger.warn('No email recipients configured for proactive notifications', {
                        organizationId: org.id,
                      });
                    }

                    for (const recipientEmail of emailRecipients) {
                      try {
                        // Process template
                        let subject = template.subject
                          .replace('{title}', notificationData.title)
                          .replace('{priority}', priority);
                        let htmlBody = template.html_body
                          .replace('{title}', notificationData.title)
                          .replace('{message}', notificationData.message)
                          .replace('{suggested_action}', notificationData.suggested_action)
                          .replace('{priority}', priority)
                          .replace('{organizationName}', org.name)
                          .replace('{dashboardUrl}', 'https://evo.ai.udstec.io/dashboard');

                        const emailResult = await emailService.sendEmail({
                          to: { email: recipientEmail },
                          subject,
                          htmlBody,
                          textBody: `${notificationData.title}\n\n${notificationData.message}\n\nAção sugerida: ${notificationData.suggested_action}`,
                        });

                        // Log to communication_logs
                        await prisma.communicationLog.create({
                          data: {
                            organization_id: org.id,
                            channel: 'email',
                            recipient: recipientEmail,
                            subject,
                            message: `Proactive notification: ${notificationData.title}`,
                            status: 'sent',
                            metadata: {
                              messageId: emailResult.messageId,
                              template_type: 'proactive_notification',
                              notification_type: rule.rule_type,
                              priority,
                              is_automated: true,
                            },
                          },
                        });

                        logger.info('Proactive notification email sent', {
                          organizationId: org.id,
                          recipient: recipientEmail,
                          notificationType: rule.rule_type,
                          messageId: emailResult.messageId,
                        });
                      } catch (emailErr) {
                        // Log failed email
                        await prisma.communicationLog.create({
                          data: {
                            organization_id: org.id,
                            channel: 'email',
                            recipient: recipientEmail,
                            subject: `[${priority.toUpperCase()}] ${notificationData.title}`,
                            message: `Failed proactive notification: ${notificationData.title}`,
                            status: 'failed',
                            metadata: {
                              error: (emailErr as Error).message,
                              template_type: 'proactive_notification',
                              notification_type: rule.rule_type,
                              is_automated: true,
                            },
                          },
                        });

                        logger.error('Failed to send proactive notification email', emailErr as Error, {
                          organizationId: org.id,
                          recipient: recipientEmail,
                        });
                      }
                    }
                  }
                }
              } catch (emailSetupErr) {
                logger.warn('Error checking email settings for proactive notification', {
                  organizationId: org.id,
                  error: (emailSetupErr as Error).message,
                });
              }
            }
          }

          // Atualizar última execução da regra
          await prisma.aiNotificationRule.update({
            where: { id: rule.id },
            data: {
              last_executed_at: new Date(),
              execution_count: { increment: 1 },
            },
          });

        } catch (err) {
          logger.error(`Error checking rule ${rule.rule_type} for org ${org.id}`, err as Error);
        }
      }
    }

    // Limpar notificações expiradas
    const deleted = await prisma.aiNotification.deleteMany({
      where: {
        expires_at: { lt: new Date() },
      },
    });

    logger.info('Proactive notifications check completed', {
      processed,
      created,
      rules_checked: rulesChecked,
      expired_deleted: deleted.count,
    });

    return { processed, created, rules_checked: rulesChecked };

  } catch (err) {
    logger.error('Error in proactive notifications check', err as Error);
    throw err;
  }
}
