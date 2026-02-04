/**
 * Cancel Background Job Handler
 * Cancels a running or pending background job
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, badRequest, error, corsOptions } from '../../lib/response.js';
import { logger } from '../../lib/logging.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { getOrigin } from '../../lib/middleware.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

const cancelJobSchema = z.object({
  jobId: z.string().uuid(),
});

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  let organizationId: string;
  let userId: string;
  
  try {
    const user = getUserFromEvent(event);
    userId = user.sub || user.id || 'unknown';
    organizationId = getOrganizationIdWithImpersonation(event, user);
  } catch (authError) {
    logger.error('Authentication error', authError);
    return error('Unauthorized', 401, undefined, origin);
  }

  try {
    if (!event.body) {
      return badRequest('Request body is required', undefined, origin);
    }

    const validation = parseAndValidateBody(cancelJobSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { jobId } = validation.data;
    const prisma = getPrismaClient();

    // Find the job and verify it belongs to the organization
    const job = await prisma.backgroundJob.findFirst({
      where: {
        id: jobId,
        organization_id: organizationId,
      },
    });

    if (!job) {
      return error('Job not found', 404, undefined, origin);
    }

    // Only allow cancellation of pending or running jobs
    if (!['pending', 'running'].includes(job.status)) {
      return badRequest(`Cannot cancel job with status: ${job.status}`, undefined, origin);
    }

    // Update job status to cancelled
    const updatedJob = await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: 'cancelled',
        completed_at: new Date(),
        error: 'Cancelled by user',
      },
    });

    logger.info('Background job cancelled', { jobId, userId, organizationId });
    
    return success({
      message: 'Job cancelled successfully',
      job: updatedJob,
    }, 200, origin);
  } catch (err) {
    logger.error('Failed to cancel background job', err as Error);
    return error('Failed to cancel job', 500, undefined, origin);
  }
}
