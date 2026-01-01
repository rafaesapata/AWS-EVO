/**
 * Executive Dashboard - Consolidated API Handler
 * Single endpoint that returns all dashboard data aggregated
 * Reduces frontend queries from 8 to 1
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=get-executive-dashboard.d.ts.map