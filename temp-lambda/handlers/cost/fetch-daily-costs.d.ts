/**
 * Lambda handler for Fetch Daily Costs
 * AWS Lambda Handler for fetch-daily-costs
 *
 * Busca custos diários da AWS usando Cost Explorer API
 * Suporta busca incremental - busca apenas datas que ainda não estão no banco
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=fetch-daily-costs.d.ts.map