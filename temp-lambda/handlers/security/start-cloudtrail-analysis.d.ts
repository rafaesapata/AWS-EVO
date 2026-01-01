/**
 * Lambda handler para iniciar análise CloudTrail de forma assíncrona
 * Retorna imediatamente e invoca analyze-cloudtrail em background
 *
 * CONTROLE DE PERÍODOS:
 * - Verifica se o período solicitado já foi processado
 * - Evita reprocessamento de dados já analisados
 * - Permite forçar reprocessamento com flag forceReprocess
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, _context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=start-cloudtrail-analysis.d.ts.map