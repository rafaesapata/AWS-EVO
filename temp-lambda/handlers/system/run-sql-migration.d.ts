/**
 * Lambda handler for running SQL migrations
 * MILITARY GRADE: Requires super_admin authentication with strict validation
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=run-sql-migration.d.ts.map