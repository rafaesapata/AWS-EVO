/**
 * Direct cleanup handler - removes invalid seat assignments
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, unauthorized } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getUserFromEvent, isSuperAdmin } from '../../lib/auth.js';

function getOriginFromEvent(event: AuthorizedEvent): string {
  const headers = event.headers || {};
  return headers['origin'] || headers['Origin'] || '*';
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOriginFromEvent(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    // CRITICAL: Only super_admin can run direct cleanup
    const user = getUserFromEvent(event);
    if (!isSuperAdmin(user)) {
      logger.warn('Unauthorized direct-cleanup attempt', { userId: user.sub });
      return unauthorized('Only super_admin can run direct cleanup', origin);
    }
    
    logger.info('Direct cleanup started', { requestId: context.awsRequestId, userId: user.sub });
    
    const prisma = getPrismaClient();
    
    // Target license and organization
    const licenseKey = 'NC-C7FD-5186-BCAC-CFD5';
    const organizationId = 'f7c9c432-d2c9-41ad-be8f-38883c06cb48';
    
    // 1. Get license
    const license = await prisma.license.findFirst({
      where: {
        license_key: licenseKey,
        organization_id: organizationId
      }
    });
    
    if (!license) {
      return error('License not found', 404, undefined, origin);
    }
    
    // 2. Get valid user IDs from organization
    const orgProfiles = await prisma.profile.findMany({
      where: { organization_id: organizationId },
      select: { user_id: true }
    });
    
    const validUserIds = orgProfiles.map(p => p.user_id);
    
    // 3. Find invalid seats
    const invalidSeats = await prisma.licenseSeatAssignment.findMany({
      where: {
        license_id: license.id,
        user_id: {
          notIn: validUserIds
        }
      }
    });
    
    logger.info('Found invalid seats', { count: invalidSeats.length, ids: invalidSeats.map(s => s.id) });
    
    let result = {
      success: true,
      licenseId: license.id,
      invalidSeatsFound: invalidSeats.length,
      invalidSeatsRemoved: 0,
      validUserIds,
      invalidSeats: invalidSeats.map(s => ({ id: s.id, user_id: s.user_id }))
    };
    
    // 4. Delete invalid seats
    if (invalidSeats.length > 0) {
      const deleteResult = await prisma.licenseSeatAssignment.deleteMany({
        where: {
          id: { in: invalidSeats.map(s => s.id) }
        }
      });
      
      result.invalidSeatsRemoved = deleteResult.count;
      
      // 5. Update license counts
      const remainingSeats = await prisma.licenseSeatAssignment.count({
        where: { license_id: license.id }
      });
      
      await prisma.license.update({
        where: { id: license.id },
        data: {
          used_seats: remainingSeats,
          available_seats: license.max_users - remainingSeats
        }
      });
      
      logger.info('Cleanup completed', { 
        removed: deleteResult.count,
        remaining: remainingSeats,
        available: license.max_users - remainingSeats
      });
    }
    
    return success(result, 200, origin);
    
  } catch (err: any) {
    logger.error('Direct cleanup error', err, { requestId: context.awsRequestId });
    return error(err instanceof Error ? err.message : 'Cleanup failed', 500, undefined, origin);
  }
}