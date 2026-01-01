/**
 * Admin Sync License - Super Admin can sync any organization's license
 * Allows super admin to manually trigger license sync for specific organizations
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=admin-sync-license.d.ts.map