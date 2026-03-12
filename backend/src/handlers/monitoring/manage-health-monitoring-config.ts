/**
 * Manage Health Monitoring Config - Gerencia configuração de monitoramento por organização
 * POST /api/functions/manage-health-monitoring-config
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';

const VALID_SEVERITIES = ['critical', 'high', 'medium', 'low'];

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.['origin'] || event.headers?.['Origin'] || '*';

  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    const prisma = getPrismaClient();

    let body: any = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return badRequest('Invalid JSON body', undefined, origin);
    }

    const { action } = body;

    if (action === 'get') {
      let config = await prisma.healthMonitoringConfig.findUnique({
        where: { organization_id: organizationId },
      });

      if (!config) {
        config = await prisma.healthMonitoringConfig.create({
          data: {
            organization_id: organizationId,
            enabled: true,
            auto_ticket_severities: ['critical', 'high'],
            polling_frequency_minutes: 15,
          },
        });
      }

      return success(config, 200, origin);
    }

    if (action === 'update') {
      const { enabled, autoTicketSeverities, pollingFrequencyMinutes } = body;

      // Validate enabled
      if (enabled !== undefined && typeof enabled !== 'boolean') {
        return badRequest('enabled must be a boolean', undefined, origin);
      }

      // Validate autoTicketSeverities
      if (autoTicketSeverities !== undefined) {
        if (!Array.isArray(autoTicketSeverities) || !autoTicketSeverities.every((s: string) => VALID_SEVERITIES.includes(s))) {
          return badRequest(`autoTicketSeverities must be a subset of ${JSON.stringify(VALID_SEVERITIES)}`, undefined, origin);
        }
      }

      // Validate pollingFrequencyMinutes
      if (pollingFrequencyMinutes !== undefined) {
        if (typeof pollingFrequencyMinutes !== 'number' || !Number.isInteger(pollingFrequencyMinutes) || pollingFrequencyMinutes < 5) {
          return badRequest('pollingFrequencyMinutes must be a positive integer >= 5', undefined, origin);
        }
      }

      const updateData: any = {};
      if (enabled !== undefined) updateData.enabled = enabled;
      if (autoTicketSeverities !== undefined) updateData.auto_ticket_severities = autoTicketSeverities;
      if (pollingFrequencyMinutes !== undefined) updateData.polling_frequency_minutes = pollingFrequencyMinutes;

      const config = await prisma.healthMonitoringConfig.upsert({
        where: { organization_id: organizationId },
        create: {
          organization_id: organizationId,
          enabled: enabled ?? true,
          auto_ticket_severities: autoTicketSeverities ?? ['critical', 'high'],
          polling_frequency_minutes: pollingFrequencyMinutes ?? 15,
          ...updateData,
        },
        update: updateData,
      });

      logAuditAsync({
        organizationId,
        userId: user.sub,
        action: 'HEALTH_MONITORING_CONFIG_UPDATE' as any,
        resourceType: 'health_monitoring_config' as any,
        resourceId: config.id,
        details: { enabled, autoTicketSeverities, pollingFrequencyMinutes },
        ipAddress: getIpFromEvent(event),
        userAgent: getUserAgentFromEvent(event),
      });

      return success(config, 200, origin);
    }

    return badRequest('Invalid action. Use "get" or "update"', undefined, origin);
  } catch (err) {
    logger.error('❌ Manage health monitoring config error:', err);
    return error('An unexpected error occurred. Please try again.', 500, undefined, origin);
  }
}
