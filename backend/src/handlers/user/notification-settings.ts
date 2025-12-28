/**
 * User Notification Settings Handler
 * Manages user notification preferences
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, badRequest, error, corsOptions } from '../../lib/response.js';
import { logger } from '../../lib/logging.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { getOrigin } from '../../lib/middleware.js';

interface NotificationSettings {
  email_enabled: boolean;
  webhook_enabled: boolean;
  webhook_url?: string;
  slack_enabled: boolean;
  slack_webhook_url?: string;
  datadog_enabled: boolean;
  datadog_api_key?: string;
  datadog_site?: string;
  graylog_enabled: boolean;
  graylog_url?: string;
  graylog_port?: number;
  zabbix_enabled: boolean;
  zabbix_url?: string;
  zabbix_auth_token?: string;
  notify_on_critical: boolean;
  notify_on_high: boolean;
  notify_on_medium: boolean;
  notify_on_scan_complete: boolean;
}

/**
 * Get user notification settings
 */
export async function getHandler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }


  let userId: string;
  
  try {
    const user = getUserFromEvent(event);
    userId = user.sub || user.id || 'unknown';
    getOrganizationId(user); // Validate auth
  } catch (authError) {
    logger.error('Authentication error', authError);
    return error('Unauthorized', 401, undefined, origin);
  }

  try {
    const prisma = getPrismaClient();
    const existingSettings = await prisma.notificationSettings.findUnique({
      where: { userId },
    });

    if (!existingSettings) {
      const defaultSettings: NotificationSettings = {
        email_enabled: true,
        webhook_enabled: false,
        slack_enabled: false,
        datadog_enabled: false,
        graylog_enabled: false,
        zabbix_enabled: false,
        notify_on_critical: true,
        notify_on_high: true,
        notify_on_medium: false,
        notify_on_scan_complete: true,
      };
      return success(defaultSettings, 200, origin);
    }

    logger.info('Notification settings retrieved', { userId });
    return success(existingSettings, 200, origin);
  } catch (err) {
    logger.error('Failed to get notification settings', err as Error);
    return error('Failed to get notification settings', 500, undefined, origin);
  }
}

/**
 * Update user notification settings
 */
export async function postHandler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  let userId: string;
  
  try {
    const user = getUserFromEvent(event);
    userId = user.sub || user.id || 'unknown';
    getOrganizationId(user);
  } catch (authError) {
    logger.error('Authentication error', authError);
    return error('Unauthorized', 401, undefined, origin);
  }

  try {
    if (!event.body) {
      return badRequest('Request body is required', undefined, origin);
    }

    const settings: NotificationSettings = JSON.parse(event.body);

    if (typeof settings.email_enabled !== 'boolean') {
      return badRequest('email_enabled is required and must be boolean', undefined, origin);
    }

    // Validate URLs
    if (settings.webhook_enabled && settings.webhook_url) {
      try { new URL(settings.webhook_url); } catch {
        return badRequest('Invalid webhook URL format', undefined, origin);
      }
    }

    if (settings.slack_enabled && settings.slack_webhook_url) {
      if (!settings.slack_webhook_url.startsWith('https://hooks.slack.com/')) {
        return badRequest('Invalid Slack webhook URL format', undefined, origin);
      }
    }

    const prisma = getPrismaClient();
    const updatedSettings = await prisma.notificationSettings.upsert({
      where: { userId },
      update: { ...settings, updated_at: new Date() },
      create: { userId, ...settings, created_at: new Date(), updated_at: new Date() },
    });

    logger.info('Notification settings updated', { userId, settingsId: updatedSettings.id });
    return success({ message: 'Notification settings updated successfully', settings: updatedSettings }, 200, origin);
  } catch (err) {
    logger.error('Failed to update notification settings', err as Error);
    return error('Failed to update notification settings', 500, undefined, origin);
  }
}

/**
 * Delete user notification settings (reset to defaults)
 */
export async function deleteHandler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  let userId: string;
  
  try {
    const user = getUserFromEvent(event);
    userId = user.sub || user.id || 'unknown';
    getOrganizationId(user);
  } catch (authError) {
    logger.error('Authentication error', authError);
    return error('Unauthorized', 401, undefined, origin);
  }

  try {
    const prisma = getPrismaClient();
    await prisma.notificationSettings.deleteMany({ where: { userId } });
    logger.info('Notification settings deleted (reset to defaults)', { userId });
    return success({ message: 'Notification settings reset to defaults' }, 200, origin);
  } catch (err) {
    logger.error('Failed to delete notification settings', err as Error);
    return error('Failed to delete notification settings', 500, undefined, origin);
  }
}
