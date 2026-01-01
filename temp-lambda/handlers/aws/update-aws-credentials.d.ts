/**
 * Lambda handler para atualizar credenciais AWS
 * Permite desativar contas e atualizar nome/regiões
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=update-aws-credentials.d.ts.map