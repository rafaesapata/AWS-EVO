import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface ApiStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  database: rds.DatabaseInstance;
  userPool: cognito.UserPool;
}

export class ApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // Lambda execution role
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        DatabaseAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'rds:DescribeDBInstances',
                'rds:DescribeDBClusters',
              ],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'secretsmanager:GetSecretValue',
                'secretsmanager:DescribeSecret',
              ],
              resources: [props.database.secret?.secretArn || '*'],
            }),
          ],
        }),
      },
    });

    // Lambda Layer for common dependencies
    const commonLayer = new lambda.LayerVersion(this, 'CommonLayer', {
      code: lambda.Code.fromAsset('backend/dist/layers/common'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
      description: 'Common dependencies for EVO UDS Lambda functions',
    });

    // Environment variables for Lambda functions
    const lambdaEnvironment = {
      NODE_ENV: process.env.NODE_ENV || 'development',
      DATABASE_URL: `postgresql://${props.database.instanceEndpoint.hostname}:5432/evouds`,
      DATABASE_SECRET_ARN: props.database.secret?.secretArn || '',
      USER_POOL_ID: props.userPool.userPoolId,
      REGION: cdk.Aws.REGION,
    };

    // Security Scan Lambda
    const securityScanFunction = new lambda.Function(this, 'SecurityScanFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'security-scan.handler',
      code: lambda.Code.fromAsset('backend/dist/handlers/security'),
      environment: lambdaEnvironment,
      role: lambdaRole,
      vpc: props.vpc,
      layers: [commonLayer],
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
    });

    // Cost Analysis Lambda
    const costAnalysisFunction = new lambda.Function(this, 'CostAnalysisFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'cost-analysis.handler',
      code: lambda.Code.fromAsset('backend/dist/handlers/finops'),
      environment: lambdaEnvironment,
      role: lambdaRole,
      vpc: props.vpc,
      layers: [commonLayer],
      timeout: cdk.Duration.minutes(10),
      memorySize: 1024,
    });

    // Health Check Lambda
    const healthCheckFunction = new lambda.Function(this, 'HealthCheckFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'health.handler',
      code: lambda.Code.fromAsset('backend/dist/handlers/system'),
      environment: lambdaEnvironment,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    // API Gateway
    this.api = new apigateway.RestApi(this, 'EvoUdsApi', {
      restApiName: 'EVO UDS API',
      description: 'EVO UDS System API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
      deployOptions: {
        stageName: process.env.NODE_ENV || 'dev',
        throttlingRateLimit: 1000,
        throttlingBurstLimit: 2000,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
      },
    });

    // Cognito Authorizer
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [props.userPool],
      identitySource: 'method.request.header.Authorization',
    });

    // API Resources and Methods
    const healthResource = this.api.root.addResource('health');
    healthResource.addMethod('GET', new apigateway.LambdaIntegration(healthCheckFunction));

    const securityResource = this.api.root.addResource('security');
    const scanResource = securityResource.addResource('scan');
    scanResource.addMethod('POST', new apigateway.LambdaIntegration(securityScanFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const finopsResource = this.api.root.addResource('finops');
    const costResource = finopsResource.addResource('cost-analysis');
    costResource.addMethod('POST', new apigateway.LambdaIntegration(costAnalysisFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Profile Management Lambdas
    const checkOrganizationFunction = new lambda.Function(this, 'CheckOrganizationFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'check-organization.handler',
      code: lambda.Code.fromAsset('backend/dist/handlers/profiles'),
      environment: lambdaEnvironment,
      role: lambdaRole,
      vpc: props.vpc,
      layers: [commonLayer],
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    const createWithOrgFunction = new lambda.Function(this, 'CreateWithOrgFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'create-with-organization.handler',
      code: lambda.Code.fromAsset('backend/dist/handlers/profiles'),
      environment: lambdaEnvironment,
      role: lambdaRole,
      vpc: props.vpc,
      layers: [commonLayer],
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    // Profile API Resources
    const profilesResource = this.api.root.addResource('profiles');
    const checkOrgResource = profilesResource.addResource('check');
    checkOrgResource.addMethod('POST', new apigateway.LambdaIntegration(checkOrganizationFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const createWithOrgResource = profilesResource.addResource('create-with-org');
    createWithOrgResource.addMethod('POST', new apigateway.LambdaIntegration(createWithOrgFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'ApiId', {
      value: this.api.restApiId,
      description: 'API Gateway ID',
    });
  }
}
