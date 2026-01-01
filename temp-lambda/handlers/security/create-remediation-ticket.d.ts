/**
 * Lambda handler para criar tickets de remediação de segurança
 * Cria tickets baseados em findings de segurança selecionados
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, _context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=create-remediation-ticket.d.ts.map