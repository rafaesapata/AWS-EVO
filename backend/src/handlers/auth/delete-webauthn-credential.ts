import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const user = getUserFromEvent(event);
    const userId = user.sub; // User ID is in 'sub' claim
    const prisma = getPrismaClient();

    if (!userId) {
      return error('userId is required', 400);
    }

    logger.info('🔐 Deleting WebAuthn credentials', { userId });

    // Delete all WebAuthn credentials for the user
    const result = await prisma.webAuthnCredential.deleteMany({
      where: {
        user_id: userId
      }
    });

    logger.info('🔐 WebAuthn credentials deleted', { 
      userId,
      count: result.count 
    });

    return success({
      message: 'WebAuthn credentials deleted successfully',
      count: result.count
    });
  } catch (err) {
    logger.error('❌ Error deleting WebAuthn credentials', { 
      error: err,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined
    });
    return error(
      `Failed to delete WebAuthn credentials: ${err instanceof Error ? err.message : String(err)}`, 
      500
    );
  }
}
