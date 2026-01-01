/**
 * MFA Handlers - Gerenciamento de autenticação multi-fator
 * Inclui: mfa-list-factors, mfa-enroll, mfa-challenge-verify, mfa-unenroll
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function listFactorsHandler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
export declare function enrollHandler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
export declare function verifyHandler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
export declare function unenrollHandler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=mfa-handlers.d.ts.map