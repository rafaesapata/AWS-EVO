/**
 * Lambda handler for Fetch Edge Services
 *
 * Descobre serviços de borda AWS e coleta métricas do CloudWatch
 * Suporta: CloudFront, WAF, ALB, NLB
 *
 * PERFORMANCE: Usa Redis cache para evitar chamadas repetidas às APIs AWS
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, _context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=fetch-edge-services.d.ts.map