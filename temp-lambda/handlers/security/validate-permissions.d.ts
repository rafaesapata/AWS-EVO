/**
 * Lambda handler for Validate Permissions
 * AWS Lambda Handler for validate-permissions
 *
 * Valida permissões IAM necessárias para operações do sistema
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=validate-permissions.d.ts.map