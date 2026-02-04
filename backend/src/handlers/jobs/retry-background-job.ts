/**
 * Retry Background Job Handler
 * Retries a failed background job
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, badRequest, error, corsOptions } from '../../lib/response.js';
import { logger } from '../../lib/logging.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { getOrigin } from '../../lib/middleware.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

const retryJobSchema = z.object({
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

    const validation = parseAndValidateBody(retryJobSchema, event.body);
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

    // Only allow retry of failed or cancelled jobs
    if (!['failed', 'cancelled'].includes(job.status)) {
      return badRequest(`Cannot retry job with status: ${job.status}`, undefined, origin);
    }

    // Reset job status to pending for retry
    const updatedJob = await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: 'pending',
        error: null,
        completed_at: null,
        started_at: null,
      },
    });

    logger.info('Background job queued for retry', { 
      jobId, 
      userId, 
      organizationId,
    });
    
    return success({
      message: 'Job queued for retry',
      job: updatedJob,
    }, 200, origin);
  } catch (err) {
    logger.error('Failed to retry background job', err as Error);
    return error('Failed to retry job', 500, undefined, origin);
  }
}
