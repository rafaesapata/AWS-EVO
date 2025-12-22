/**
 * Tipos comuns para handlers Lambda
 */

export interface APIGatewayProxyEventV2 {
  version: string;
  routeKey: string;
  rawPath: string;
  rawQueryString: string;
  headers: Record<string, string>;
  requestContext: {
    accountId: string;
    apiId: string;
    domainName: string;
    domainPrefix: string;
    http: {
      method: string;
      path: string;
      protocol: string;
      sourceIp: string;
      userAgent: string;
    };
    requestId: string;
    routeKey: string;
    stage: string;
    time: string;
    timeEpoch: number;
    authorizer?: {
      jwt?: {
        claims: Record<string, string>;
        scopes: string[];
      };
    };
  };
  body?: string;
  isBase64Encoded: boolean;
}

export interface APIGatewayProxyResultV2 {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
}

export interface LambdaContext {
  callbackWaitsForEmptyEventLoop: boolean;
  functionName: string;
  functionVersion: string;
  invokedFunctionArn: string;
  memoryLimitInMB: string;
  awsRequestId: string;
  logGroupName: string;
  logStreamName: string;
  getRemainingTimeInMillis(): number;
  done(error?: Error, result?: any): void;
  fail(error: Error | string): void;
  succeed(messageOrObject: any): void;
}

export type LambdaHandler<TEvent = any, TResult = any> = (
  event: TEvent,
  context: LambdaContext
) => Promise<TResult>;

export interface CognitoUser {
  sub: string;
  email: string;
  email_verified: boolean;
  'custom:organization_id'?: string;
  'custom:tenant_id'?: string;
  'custom:roles'?: string;
  [key: string]: any;
}

export interface AuthorizedEvent extends APIGatewayProxyEventV2 {
  requestContext: APIGatewayProxyEventV2['requestContext'] & {
    authorizer: {
      jwt: {
        claims: CognitoUser;
        scopes: string[];
      };
    };
  };
}
