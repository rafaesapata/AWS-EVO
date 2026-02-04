/**
 * User Notification Settings Handler
 * Manages user notification preferences
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, badRequest, error, corsOptions } from '../../lib/response.js';
import { logger } from '../../lib/logging.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { getOrigin } from '../../lib/middleware.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

// Zod schema for notification settings
const notificationSettingsSchema = z.object({
  email_enabled: z.boolean(),
  webhook_enabled: z.boolean().default(false),
  webhook_url: z.string().url().optional(),
  slack_enabled: z.boolean().default(false),
  slack_webhook_url: z.string().url().refine(
    (url) => !url || url.startsWith('https://hooks.slack.com/'),
    { message: 'Invalid Slack webhook URL format' }
  ).optional(),
  datadog_enabled: z.boolean().default(false),
  datadog_api_key: z.string().max(100).optional(),
  datadog_site: z.string().max(50).optional(),
  graylog_enabled: z.boolean().default(false),
  graylog_url: z.string().url().optional(),
  graylog_port: z.number().int().min(1).max(65535).optional(),
  zabbix_enabled: z.boolean().default(false),
  zabbix_url: z.string().url().optional(),
  zabbix_auth_token: z.string().max(200).optional(),
  notify_on_critical: z.boolean().default(true),
  notify_on_high: z.boolean().default(true),
  notify_on_medium: z.boolean().default(false),
  notify_on_scan_complete: z.boolean().default(true),
});

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
    getOrganizationIdWithImpersonation(event, user); // Validate auth
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
      const defaultSettings = {
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
    getOrganizationIdWithImpersonation(event, user);
  } catch (authError) {
    logger.error('Authentication error', authError);
    return error('Unauthorized', 401, undefined, origin);
  }

  try {
    if (!event.body) {
      return badRequest('Request body is required', undefined, origin);
    }

    // Validate input with Zod
    const validation = parseAndValidateBody(notificationSettingsSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const settings = validation.data;

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
    getOrganizationIdWithImpersonation(event, user);
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

/**
 * Main handler - routes to appropriate method handler
 */
export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  const origin = getOrigin(event);
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  switch (httpMethod) {
    case 'GET':
      return getHandler(event, context);
    case 'POST':
      return postHandler(event, context);
    case 'DELETE':
      return deleteHandler(event, context);
    default:
      return error(`Method ${httpMethod} not allowed`, 405, undefined, origin);
  }
}
