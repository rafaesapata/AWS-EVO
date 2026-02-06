/**
 * Get Compliance Scan Status Handler
 * Returns the status and progress of a compliance scan job
 */

import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

const getStatusSchema = z.object({
  jobId: z.string().uuid(),
});

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  logger.info('Get Compliance Scan Status handler invoked');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    // Validate input
    const validation = parseAndValidateBody(getStatusSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { jobId } = validation.data;
    
    const prisma = getPrismaClient();
    
    // Get job status
    const job = await prisma.backgroundJob.findFirst({
      where: {
        id: jobId,
        organization_id: organizationId,
      },
    });
    
    if (!job) {
      return badRequest('Job not found', undefined, origin);
    }
    
    const result = job.result as any || {};
    
    // If job is completed, get the scan results
    let scanResults = null;
    if (job.status === 'completed' && result.scan_id) {
      const complianceChecks = await prisma.complianceCheck.findMany({
        where: { scan_id: result.scan_id },
        orderBy: [
          { status: 'asc' },
          { severity: 'asc' },
        ],
      });
      
      scanResults = {
        scan_id: result.scan_id,
        framework: result.framework,
        compliance_score: result.compliance_score,
        passed: result.passed,
        failed: result.failed,
        errors: result.errors,
        duration_ms: result.duration_ms,
        checks: complianceChecks.map(c => ({
          control_id: c.control_id,
          control_name: c.control_name,
          status: c.status,
          severity: c.severity,
          evidence: c.evidence,
          remediation_steps: c.remediation_steps,
        })),
      };
    }
    
    return success({
      job_id: job.id,
      job_name: (job.payload as any)?.jobName || job.job_type,
      status: job.status,
      progress: result.progress || 0,
      message: result.message || '',
      completed: result.completed || 0,
      total: result.total || 0,
      started_at: job.started_at,
      completed_at: job.completed_at,
      error: job.error,
      parameters: job.payload,
      scan_results: scanResults,
    }, 200, origin);
    
  } catch (err) {
    logger.error('Get compliance scan status error', err as Error);
    return error('An unexpected error occurred. Please try again.', 500, undefined, origin);
  }
}
