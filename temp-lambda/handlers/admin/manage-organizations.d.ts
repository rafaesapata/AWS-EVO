/**
 * Lambda handler para gerenciamento de organizações
 * APENAS SUPER ADMINS podem usar este handler
 *
 * Operações suportadas:
 * - list: Lista todas as organizações
 * - create: Cria uma nova organização
 * - update: Atualiza uma organização existente
 * - delete: Remove uma organização (soft delete via status)
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=manage-organizations.d.ts.map