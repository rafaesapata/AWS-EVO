/**
 * Lambda handler para salvar credenciais AWS
 * Cria organização automaticamente se não existir
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=save-aws-credentials.d.ts.map