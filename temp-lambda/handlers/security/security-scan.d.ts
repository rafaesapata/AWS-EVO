/**
 * Lambda handler para security scan - Security Engine V3
 * 23 scanners de serviços AWS com 170+ verificações de segurança
 * Suporte a 6 frameworks de compliance: CIS, Well-Architected, PCI-DSS, NIST, LGPD, SOC2
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare const handler: (event: AuthorizedEvent, context: LambdaContext) => Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=security-scan.d.ts.map