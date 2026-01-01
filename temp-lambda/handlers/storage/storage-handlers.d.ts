/**
 * Storage Handlers - Upload, Download e Delete de arquivos no S3
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function uploadHandler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
export declare function downloadHandler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
export declare function deleteHandler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=storage-handlers.d.ts.map