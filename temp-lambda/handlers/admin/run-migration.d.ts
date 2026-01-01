/**
 * Lambda handler for running database migrations
 * Recreates daily_costs table with proper structure for multi-tenant isolation
 * NOTE: This is an admin-only operation, invoked directly (not via API Gateway)
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=run-migration.d.ts.map