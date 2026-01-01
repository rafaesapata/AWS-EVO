/**
 * Validate License - Check organization's license status
 * Returns cached license data from database (synced daily from external API)
 * Auto-assigns seats to users on first validation if seats are available
 * Also handles initial configuration when customer_id is provided in body
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, _context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=validate-license.d.ts.map