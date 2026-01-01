/**
 * Create Profile with Organization Handler
 * Cria um profile de usuário vinculado a uma organização
 * Se a organização não existir, cria automaticamente
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=create-with-organization.d.ts.map