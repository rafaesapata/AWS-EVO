/**
 * Lambda handler for Log Audit
 * Registra ações de auditoria no sistema
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';

interface LogAuditRequest {
  action: string;
  resourceType: string;
  resourceId: string;
  details?: Record<string, any>;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    const userId = user.sub || user.id || 'unknown';

    const body: LogAuditRequest = event.body ? JSON.parse(event.body) : {};
    const { action, resourceType, resourceId, details } = body;

    if (!action || !resourceType || !resourceId) {
      return badRequest('Missing required fields: action, resourceType, resourceId', undefined, origin);
    }

    const prisma = getPrismaClient();

    // Registrar log de auditoria
    const auditLog = await prisma.auditLog.create({
      data: {
        organization_id: organizationId,
        user_id: userId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        details: details || {},
        ip_address: event.requestContext?.identity?.sourceIp || 
                    event.headers?.['x-forwarded-for']?.split(',')[0] || 
                    'unknown',
        user_agent: event.headers?.['user-agent'] || 'unknown',
      },
    });

    logger.info(`✅ Audit log created: ${action} on ${resourceType}/${resourceId}`);

    return success({
      success: true,
      auditLogId: auditLog.id,
    }, 201, origin);

  } catch (err) {
    logger.error('❌ Log audit error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
  }
}
