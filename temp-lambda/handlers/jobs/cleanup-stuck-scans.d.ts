/**
 * Lambda handler para limpeza de scans travados
 * Identifica e corrige scans que ficaram em status "running" por muito tempo
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=cleanup-stuck-scans.d.ts.map