/**
 * Lambda handler for Process Background Jobs
 * AWS Lambda Handler for process-background-jobs
 *
 * SECURITY NOTE: This handler processes jobs from ALL organizations.
 * This is intentional because:
 * 1. It's a system-level job processor triggered by EventBridge/CloudWatch
 * 2. Each job has its own organization_id and is processed in isolation
 * 3. Job results are stored with the correct organization_id
 *
 * Rate limiting is applied per-organization to prevent any single org
 * from monopolizing the job queue.
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=process-background-jobs.d.ts.map