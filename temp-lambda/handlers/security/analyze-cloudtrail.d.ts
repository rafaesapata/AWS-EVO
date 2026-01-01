/**
 * Lambda handler for Analyze CloudTrail
 * Busca eventos do CloudTrail, analisa riscos de segurança e salva no banco
 * Identifica usuários responsáveis por ações que resultaram em problemas de segurança
 *
 * OTIMIZADO COM PARALELISMO:
 * - Busca paralela de páginas do CloudTrail
 * - Processamento paralelo de eventos em batches
 * - Upsert em batch no banco de dados
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=analyze-cloudtrail.d.ts.map