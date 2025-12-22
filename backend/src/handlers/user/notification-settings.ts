/**
 * User Notification Settings Handler
 * Manages user notification preferences
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { success, badRequest, error } from '../../lib/response.js';
import { logger } from '../../lib/logging.js';
import { withMetrics } from '../../lib/monitoring-alerting.js';
import { getPrismaClient } from '../../lib/database.js';

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
export const getHandler = withMetrics(async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info('Get notification settings request received');

    // Get user ID from JWT token
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return badRequest('User ID not found in token');
    }

    const prisma = getPrismaClient();

    // Try to get existing settings
    const existingSettings = await prisma.notificationSettings.findUnique({
      where: { userId },
    });

    if (!existingSettings) {
      // Return default settings
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

      return success(defaultSettings);
    }

    logger.info('Notification settings retrieved', { userId });

    return success(existingSettings);

  } catch (err) {
    logger.error('Failed to get notification settings', err as Error);
    return error('Failed to get notification settings');
  }
}, 'GetNotificationSettings');

/**
 * Update user notification settings
 */
export const postHandler = withMetrics(async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info('Update notification settings request received');

    if (!event.body) {
      return badRequest('Request body is required');
    }

    // Get user ID from JWT token
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return badRequest('User ID not found in token');
    }

    const settings: NotificationSettings = JSON.parse(event.body);

    // Validate required fields
    if (typeof settings.email_enabled !== 'boolean') {
      return badRequest('email_enabled is required and must be boolean');
    }

    // Validate webhook URL if enabled
    if (settings.webhook_enabled && settings.webhook_url) {
      try {
        new URL(settings.webhook_url);
      } catch {
        return badRequest('Invalid webhook URL format');
      }
    }

    // Validate Slack webhook URL if enabled
    if (settings.slack_enabled && settings.slack_webhook_url) {
      if (!settings.slack_webhook_url.startsWith('https://hooks.slack.com/')) {
        return badRequest('Invalid Slack webhook URL format');
      }
    }

    // Validate Graylog URL if enabled
    if (settings.graylog_enabled && settings.graylog_url) {
      try {
        new URL(settings.graylog_url);
      } catch {
        return badRequest('Invalid Graylog URL format');
      }
    }

    // Validate Zabbix URL if enabled
    if (settings.zabbix_enabled && settings.zabbix_url) {
      try {
        new URL(settings.zabbix_url);
      } catch {
        return badRequest('Invalid Zabbix URL format');
      }
    }

    const prisma = getPrismaClient();

    // Upsert settings
    const updatedSettings = await prisma.notificationSettings.upsert({
      where: { userId },
      update: {
        ...settings,
        updated_at: new Date(),
      },
      create: {
        userId,
        ...settings,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    logger.info('Notification settings updated', {
      userId,
      settingsId: updatedSettings.id,
    });

    return success({
      message: 'Notification settings updated successfully',
      settings: updatedSettings,
    });

  } catch (err) {
    logger.error('Failed to update notification settings', err as Error);
    return error('Failed to update notification settings');
  }
}, 'UpdateNotificationSettings');

/**
 * Delete user notification settings (reset to defaults)
 */
export const deleteHandler = withMetrics(async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info('Delete notification settings request received');

    // Get user ID from JWT token
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return badRequest('User ID not found in token');
    }

    const prisma = getPrismaClient();

    // Delete existing settings
    await prisma.notificationSettings.deleteMany({
      where: { userId },
    });

    logger.info('Notification settings deleted (reset to defaults)', { userId });

    return success({
      message: 'Notification settings reset to defaults',
    });

  } catch (err) {
    logger.error('Failed to delete notification settings', err as Error);
    return error('Failed to delete notification settings');
  }
}, 'DeleteNotificationSettings');