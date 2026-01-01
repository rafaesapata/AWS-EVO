import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { ScheduledEvent } from 'aws-lambda';
export declare function handler(event: AuthorizedEvent | ScheduledEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2 | void>;
//# sourceMappingURL=daily-license-validation.d.ts.map