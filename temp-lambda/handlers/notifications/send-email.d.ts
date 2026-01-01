/**
 * Send Email Notification Handler
 * Handles email sending requests via Amazon SES
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
/**
 * Send email handler
 */
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
/**
 * Send bulk email handler
 */
export declare function bulkHandler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
/**
 * Get email statistics handler
 */
export declare function statsHandler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=send-email.d.ts.map