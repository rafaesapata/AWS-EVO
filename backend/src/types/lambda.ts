/**
 * Tipos comuns para handlers Lambda
 */

// REST API v1 Event (API Gateway)
export interface APIGatewayProxyEvent {
  resource: string;
  path: string;
  httpMethod: string;
  headers: Record<string, string>;
  queryStringParameters: Record<string, string> | null;
  pathParameters: Record<string, string> | null;
  body: string | null;
  isBase64Encoded: boolean;
  requestContext: {
    accountId: string;
    apiId: string;
    authorizer?: {
      claims?: CognitoUser;
      principalId?: string;
    };
    domainName: string;
    domainPrefix: string;
    httpMethod: string;
    identity: {
      sourceIp: string;
      userAgent: string;
    };
    path: string;
    protocol: string;
    requestId: string;
    requestTime: string;
    requestTimeEpoch: number;
    resourceId: string;
    resourcePath: string;
    stage: string;
  };
}

// HTTP API v2 Event
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

// Combined event type that supports both REST API v1 and HTTP API v2
export interface AuthorizedEvent {
  // REST API v1 properties
  httpMethod?: string;
  resource?: string;
  path?: string;
  pathParameters?: Record<string, string> | null;
  queryStringParameters?: Record<string, string> | null;
  
  // HTTP API v2 properties
  version?: string;
  routeKey?: string;
  rawPath?: string;
  rawQueryString?: string;
  
  // Common properties
  headers: Record<string, string>;
  body?: string | null;
  isBase64Encoded: boolean;
  
  requestContext: {
    accountId: string;
    apiId: string;
    domainName?: string;
    domainPrefix?: string;
    requestId: string;
    stage: string;
    
    // REST API v1 authorizer (Cognito User Pools)
    authorizer?: {
      claims?: CognitoUser;
      principalId?: string;
      // HTTP API v2 JWT authorizer
      jwt?: {
        claims: CognitoUser;
        scopes: string[];
      };
    };
    
    // HTTP API v2 specific
    http?: {
      method: string;
      path: string;
      protocol: string;
      sourceIp: string;
      userAgent: string;
    };
    
    // REST API v1 specific
    httpMethod?: string;
    identity?: {
      sourceIp: string;
      userAgent: string;
    };
  };
}
