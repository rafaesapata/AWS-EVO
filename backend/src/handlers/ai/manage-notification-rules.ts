/**
 * Manage AI Notification Rules Handler
 * CRUD para regras de notificação proativa
 * Apenas super_admin pode gerenciar regras
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

// Schema de validação
const listRulesSchema = z.object({
  action: z.literal('list'),
});

const getRuleSchema = z.object({
  action: z.literal('get'),
  rule_type: z.string(),
});

const updateRuleSchema = z.object({
  action: z.literal('update'),
  rule_type: z.string(),
  is_enabled: z.boolean().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  parameters: z.record(z.unknown()).optional(),
  title_template: z.string().optional(),
  message_template: z.string().optional(),
  suggested_action_template: z.string().optional(),
});

const createRuleSchema = z.object({
  action: z.literal('create'),
  rule_type: z.string(),
  name: z.string(),
  description: z.string().optional(),
  is_enabled: z.boolean().default(true),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  parameters: z.record(z.unknown()).optional(),
  title_template: z.string(),
  message_template: z.string(),
  suggested_action_template: z.string().optional(),
  action_type: z.string().optional(),
});

const requestSchema = z.discriminatedUnion('action', [
  listRulesSchema,
  getRuleSchema,
  updateRuleSchema,
  createRuleSchema,
]);

// Regras padrão do sistema
const DEFAULT_RULES = [
  {
    rule_type: 'security_scan_needed',
    name: 'Scan de Segurança Necessário',
    description: 'Notifica quando o último scan de segurança foi há mais de X dias',
    priority: 'medium',
    parameters: { days_threshold: 7, critical_threshold: 14 },
    title_template: 'Scan de Segurança Recomendado',
    message_template: 'Faz {days_since_last_scan} dias desde o último scan de segurança. Recomendo executar um novo scan para garantir que sua infraestrutura está protegida.',
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
    message_template: 'Sua última verificação de compliance foi há {days_since_last_scan} dias. Manter a conformidade atualizada é essencial para auditorias.',
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
    message_template: 'Você tem {critical_findings_count} achados de segurança de alta severidade pendentes. Recomendo revisar e remediar esses problemas o mais rápido possível.',
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
    message_template: 'Identifiquei {recommendations_count} oportunidades de economia que podem reduzir seus custos em até ${potential_savings}/ano.',
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
    message_template: 'Você tem {credentials_count} credencial(is) AWS que não foram rotacionadas há mais de 80 dias. A AWS recomenda rotação a cada 90 dias para maior segurança.',
    suggested_action_template: 'Ver credenciais que precisam de atenção',
    action_type: 'navigate',
  },
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
    const prisma = getPrismaClient();

    // Verificar se é super_admin
    const roles = user['custom:roles'] || user.roles || '[]';
    const parsedRoles = typeof roles === 'string' ? JSON.parse(roles) : roles;
    const isSuperAdmin = parsedRoles.includes('super_admin');

    if (!isSuperAdmin) {
      return error('Apenas super admins podem gerenciar regras de notificação', 403);
    }

    // Parse and validate body using centralized validation
    const validation = parseAndValidateBody(requestSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const request = validation.data;

    switch (request.action) {
      case 'list': {
        // Buscar todas as regras
        let rules = await prisma.aiNotificationRule.findMany({
          orderBy: { rule_type: 'asc' },
        });

        // Se não houver regras, criar as padrão
        if (rules.length === 0) {
          logger.info('No rules found, creating default rules');
          
          for (const defaultRule of DEFAULT_RULES) {
            await prisma.aiNotificationRule.create({
              data: {
                ...defaultRule,
                is_enabled: true,
                parameters: defaultRule.parameters as object,
              },
            });
          }

          rules = await prisma.aiNotificationRule.findMany({
            orderBy: { rule_type: 'asc' },
          });
        }

        return success({
          rules,
          total: rules.length,
        });
      }

      case 'get': {
        const rule = await prisma.aiNotificationRule.findUnique({
          where: { rule_type: request.rule_type },
        });

        if (!rule) {
          return error('Rule not found', 404);
        }

        return success({ rule });
      }

      case 'update': {
        const existingRule = await prisma.aiNotificationRule.findUnique({
          where: { rule_type: request.rule_type },
        });

        if (!existingRule) {
          return error('Rule not found', 404);
        }

        const updatedRule = await prisma.aiNotificationRule.update({
          where: { rule_type: request.rule_type },
          data: {
            is_enabled: request.is_enabled,
            priority: request.priority,
            parameters: request.parameters as object | undefined,
            title_template: request.title_template,
            message_template: request.message_template,
            suggested_action_template: request.suggested_action_template,
            updated_by: user.sub,
          },
        });

        logger.info('Notification rule updated', {
          rule_type: request.rule_type,
          is_enabled: updatedRule.is_enabled,
          updated_by: user.sub,
        });

        return success({ rule: updatedRule });
      }

      case 'create': {
        // Verificar se já existe
        const existing = await prisma.aiNotificationRule.findUnique({
          where: { rule_type: request.rule_type },
        });

        if (existing) {
          return error('Rule with this type already exists', 409);
        }

        const newRule = await prisma.aiNotificationRule.create({
          data: {
            rule_type: request.rule_type,
            name: request.name,
            description: request.description,
            is_enabled: request.is_enabled,
            priority: request.priority,
            parameters: request.parameters as object | undefined,
            title_template: request.title_template,
            message_template: request.message_template,
            suggested_action_template: request.suggested_action_template,
            action_type: request.action_type,
            created_by: user.sub,
          },
        });

        logger.info('Notification rule created', {
          rule_type: request.rule_type,
          created_by: user.sub,
        });

        return success({ rule: newRule });
      }

      default:
        return error('Invalid action', 400);
    }
  } catch (err) {
    logger.error('Error managing notification rules', err as Error);
    return error('Internal server error');
  }
}
