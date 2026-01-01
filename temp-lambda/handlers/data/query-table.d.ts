/**
 * Lambda handler genérico para queries em tabelas do banco
 * Substitui as chamadas REST diretas do frontend
 *
 * IMPORTANTE: Todas as queries são filtradas por organization_id para multi-tenancy
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=query-table.d.ts.map