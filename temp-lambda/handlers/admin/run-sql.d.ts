/**
 * Lambda handler for running raw SQL queries (READ ONLY)
 * Admin-only operation for debugging and data inspection
 * MILITARY GRADE: Strict validation to prevent SQL injection
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=run-sql.d.ts.map