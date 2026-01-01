/**
 * Lambda handler genérico para mutações (INSERT/UPDATE/DELETE) em tabelas do banco
 * Substitui as chamadas REST diretas do frontend
 *
 * IMPORTANTE: Todas as operações são filtradas por organization_id para multi-tenancy
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=mutate-table.d.ts.map