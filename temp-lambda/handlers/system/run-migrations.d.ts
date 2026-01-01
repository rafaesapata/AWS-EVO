/**
 * Lambda handler para executar migrações do Prisma
 * Usado para aplicar schema no RDS em subnet privada
 * SECURITY: Requires super_admin authentication
 */
import type { AuthorizedEvent, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event?: AuthorizedEvent): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=run-migrations.d.ts.map