/**
 * ML Waste Detection Lambda Handler v3.0
 *
 * Uses machine learning analysis to detect AWS resource waste.
 * Analyzes EC2, RDS, Lambda, S3, EBS, NAT Gateway, EIP, and DynamoDB resources.
 * Includes full ARN tracking for all resources.
 * Optimized to execute within API Gateway 29s timeout.
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=ml-waste-detection.d.ts.map