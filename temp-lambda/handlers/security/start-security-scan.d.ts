/**
 * Start Security Scan Handler - Inicia um novo scan de segurança
 * Invoca o security-scan Lambda de forma assíncrona para evitar timeout
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=start-security-scan.d.ts.map