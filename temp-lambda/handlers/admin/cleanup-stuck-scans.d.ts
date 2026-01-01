/**
 * Lambda handler para limpeza manual de scans travados via API
 * Permite que administradores executem a limpeza sob demanda
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, _context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=cleanup-stuck-scans.d.ts.map