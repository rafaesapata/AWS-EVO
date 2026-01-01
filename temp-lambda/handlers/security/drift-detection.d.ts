/**
 * Lambda handler for Drift Detection
 * AWS Lambda Handler for drift-detection
 *
 * Detecta mudanças não autorizadas em recursos AWS (drift)
 * comparando estado atual vs estado esperado no inventário
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=drift-detection.d.ts.map