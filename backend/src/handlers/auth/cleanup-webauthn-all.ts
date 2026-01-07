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

    logger.info('🔐 [ADMIN] Cleaning up ALL WebAuthn data', { userId });

    // Delete all WebAuthn credentials for the user
    const credentialsResult = await prisma.webAuthnCredential.deleteMany({
      where: {
        user_id: userId
      }
    });

    // Delete all WebAuthn challenges for the user
    const challengesResult = await prisma.webauthnChallenge.deleteMany({
      where: {
        user_id: userId
      }
    });

    logger.info('🔐 [ADMIN] WebAuthn cleanup complete', { 
      userId,
      credentialsDeleted: credentialsResult.count,
      challengesDeleted: challengesResult.count
    });

    return success({
      message: 'WebAuthn data cleaned up successfully',
      credentialsDeleted: credentialsResult.count,
      challengesDeleted: challengesResult.count,
      userId
    });
  } catch (err) {
    logger.error('❌ [ADMIN] Error cleaning up WebAuthn data', { 
      error: err,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined
    });
    return error(
      `Failed to cleanup WebAuthn data: ${err instanceof Error ? err.message : String(err)}`, 
      500
    );
  }
}