/**
 * Lambda handler para gerenciar usuários (admin)
 * AWS Lambda Handler for admin-manage-user
 *
 * Uses centralized middleware for validation, auth, and rate limiting
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=admin-manage-user.d.ts.map