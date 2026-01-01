/**
 * Lambda handler for Fetch CloudWatch Metrics
 *
 * Coleta TODOS os recursos e métricas usando paralelismo otimizado
 * Sem limites artificiais - o usuário vê tudo
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare const handler: (event: AuthorizedEvent, context: LambdaContext) => Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=fetch-cloudwatch-metrics.d.ts.map