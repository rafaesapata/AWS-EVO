/**
 * Lambda handler for KB Article Tracking
 * Handles increment_article_views, increment_article_helpful, track_article_view_detailed
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=kb-article-tracking.d.ts.map