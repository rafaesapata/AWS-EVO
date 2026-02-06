/**
 * Lambda handler for Log Audit
 * Registra ações de auditoria no sistema
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { logAuditSchema } from '../../lib/schemas.js';

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
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const userId = user.sub || user.id || 'unknown';

    const validation = parseAndValidateBody(logAuditSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { action, resourceType, resourceId, details } = validation.data;

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
    return error('Failed to create audit log', 500, undefined, origin);
  }
}
