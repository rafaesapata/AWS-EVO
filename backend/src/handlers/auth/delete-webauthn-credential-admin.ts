import type { LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

interface AdminEvent {
  userId: string;
}

export async function handler(
  event: AdminEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  try {
    const { userId } = event;
    
    if (!userId) {
      return error('userId is required', 400);
    }

    const prisma = getPrismaClient();

    logger.info('🔐 [ADMIN] Deleting WebAuthn credentials', { userId });

    // Delete all WebAuthn credentials for the user
    const result = await prisma.webAuthnCredential.deleteMany({
      where: {
        user_id: userId
      }
    });

    logger.info('🔐 [ADMIN] WebAuthn credentials deleted', { 
      userId,
      count: result.count 
    });

    return success({
      message: 'WebAuthn credentials deleted successfully',
      count: result.count,
      userId
    });
  } catch (err) {
    logger.error('❌ [ADMIN] Error deleting WebAuthn credentials', { 
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
