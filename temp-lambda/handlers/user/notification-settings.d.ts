/**
 * User Notification Settings Handler
 * Manages user notification preferences
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
/**
 * Get user notification settings
 */
export declare function getHandler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
/**
 * Update user notification settings
 */
export declare function postHandler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
/**
 * Delete user notification settings (reset to defaults)
 */
export declare function deleteHandler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=notification-settings.d.ts.map