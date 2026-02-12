import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, badRequest } from '../../lib/response.js';
import { getUserFromEvent } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const user = getUserFromEvent(event);
    const userId = user.sub;
    const prisma = getPrismaClient();

    if (!userId) {
      return badRequest('userId is required');
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { credentialId } = body;

    if (credentialId) {
      // Delete specific credential — verify it belongs to this user
      const credential = await prisma.webAuthnCredential.findFirst({
        where: { id: credentialId, user_id: userId }
      });

      if (!credential) {
        return error('Credential not found or does not belong to user', 404);
      }

      await prisma.webAuthnCredential.delete({ where: { id: credentialId } });

      logAuditAsync({
        organizationId: user['custom:organization_id'] || '',
        userId,
        action: 'WEBAUTHN_CREDENTIAL_DELETED',
        resourceType: 'webauthn_credential',
        resourceId: credentialId,
        details: { deviceName: credential.device_name },
        ipAddress: getIpFromEvent(event),
        userAgent: getUserAgentFromEvent(event)
      });

      logger.info('WebAuthn credential deleted', { userId, credentialId });

      return success({ message: 'Credential deleted', count: 1 });
    }

    // No credentialId — delete all for user
    const result = await prisma.webAuthnCredential.deleteMany({
      where: { user_id: userId }
    });

    logAuditAsync({
      organizationId: user['custom:organization_id'] || '',
      userId,
      action: 'WEBAUTHN_ALL_CREDENTIALS_DELETED',
      resourceType: 'webauthn_credential',
      resourceId: userId,
      details: { count: result.count },
      ipAddress: getIpFromEvent(event),
      userAgent: getUserAgentFromEvent(event)
    });

    logger.info('All WebAuthn credentials deleted', { userId, count: result.count });

    return success({ message: 'All credentials deleted', count: result.count });
  } catch (err) {
    logger.error('Error deleting WebAuthn credentials', {
      error: err instanceof Error ? err.message : String(err)
    });
    return error(
      `Failed to delete WebAuthn credentials: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
