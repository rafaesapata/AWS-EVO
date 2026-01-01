/**
 * Lambda handler para criar usuário no Cognito
 * Endpoint: POST /api/functions/create-cognito-user
 *
 * Super admins podem criar usuários em qualquer organização
 * Admins regulares só podem criar usuários na própria organização
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=create-cognito-user.d.ts.map