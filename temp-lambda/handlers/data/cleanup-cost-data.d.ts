/**
 * Lambda handler para limpar dados de custo antigos/incorretos
 * Remove todos os registros da tabela daily_costs para permitir re-fetch
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=cleanup-cost-data.d.ts.map