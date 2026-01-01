/**
 * Delete WebAuthn Credential Handler
 * Removes a WebAuthn/Passkey credential for the authenticated user
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

interface DeleteCredentialBody {
  credentialId: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  // Handle CORS preflight
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  const requestId = context.awsRequestId;
  logger.info('Delete WebAuthn credential request', { requestId });

  try {
    // Get authenticated user
    const user = getUserFromEvent(event);
    if (!user || !user.sub) {
      return error('Unauthorized', 401);
    }

    const userId = user.sub;

    // Parse request body
    let body: DeleteCredentialBody;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (e) {
      return error('Invalid request body', 400);
    }

    const { credentialId } = body;

    if (!credentialId) {
      return error('credentialId is required', 400);
    }

    logger.info('Deleting WebAuthn credential', { userId, credentialId });

    const prisma = getPrismaClient();

    // First verify the credential belongs to this user
    const credential = await prisma.webAuthnCredential.findFirst({
      where: {
        id: credentialId,
        user_id: userId
      }
    });

    if (!credential) {
      logger.warn('Credential not found or does not belong to user', { userId, credentialId });
      return error('Credential not found', 404);
    }

    // Delete the credential
    await prisma.webAuthnCredential.delete({
      where: { id: credentialId }
    });

    logger.info('WebAuthn credential deleted successfully', { userId, credentialId });

    return success({
      message: 'Credential deleted successfully',
      credentialId
    });

  } catch (err: any) {
    logger.error('Error deleting WebAuthn credential', { error: err.message, stack: err.stack });
    return error('Failed to delete credential: ' + err.message, 500);
  }
}
