import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

import * as path from 'path';

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
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist/layers/common')),
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
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist/handlers/security')),
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
      handler: 'cost-optimization.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist/handlers/cost')),
      environment: lambdaEnvironment,
      role: lambdaRole,
      vpc: props.vpc,
      layers: [commonLayer],
      timeout: cdk.Duration.minutes(10),
      memorySize: 1024,
    });

    // Health Check Lambda - using run-migrations as placeholder
    const healthCheckFunction = new lambda.Function(this, 'HealthCheckFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'run-migrations.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist/handlers/system')),
      environment: lambdaEnvironment,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    // API Gateway with restricted CORS
    const allowedOrigins = [
      'https://app.evo-uds.com',
      'https://staging.evo-uds.com',
      'https://evo-uds.com',
      ...(process.env.NODE_ENV === 'development' ? ['http://localhost:5173', 'http://localhost:3000'] : []),
    ].filter(Boolean);

    this.api = new apigateway.RestApi(this, 'EvoUdsApi', {
      restApiName: 'EVO UDS API',
      description: 'EVO UDS System API',
      defaultCorsPreflightOptions: {
        allowOrigins: allowedOrigins.length > 0 ? allowedOrigins : apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-CSRF-Token',
        ],
        allowCredentials: true,
        maxAge: cdk.Duration.hours(1),
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
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist/handlers/profiles')),
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
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist/handlers/profiles')),
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

    // AWS Credentials Lambda - CRITICAL for CloudFormation connection
    const saveAwsCredentialsFunction = new lambda.Function(this, 'SaveAwsCredentialsFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'save-aws-credentials.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist/handlers/aws')),
      environment: lambdaEnvironment,
      role: lambdaRole,
      vpc: props.vpc,
      layers: [commonLayer],
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    // AWS Credentials API Resources
    const awsResource = this.api.root.addResource('aws');
    const credentialsResource = awsResource.addResource('credentials');
    credentialsResource.addMethod('POST', new apigateway.LambdaIntegration(saveAwsCredentialsFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Well-Architected Scan Lambda
    const wellArchitectedScanFunction = new lambda.Function(this, 'WellArchitectedScanFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'well-architected-scan.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist/handlers/security')),
      environment: lambdaEnvironment,
      role: lambdaRole,
      vpc: props.vpc,
      layers: [commonLayer],
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
    });

    // Add Well-Architected permissions to Lambda role
    wellArchitectedScanFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'wellarchitected:ListWorkloads',
        'wellarchitected:GetWorkload',
        'wellarchitected:ListLensReviews',
        'wellarchitected:GetLensReview',
        'sts:AssumeRole',
      ],
      resources: ['*'],
    }));

    // Also add under /functions for compatibility with apiClient.invoke
    const functionsResource = this.api.root.addResource('functions');
    const saveCredsFunctionResource = functionsResource.addResource('save-aws-credentials');
    saveCredsFunctionResource.addMethod('POST', new apigateway.LambdaIntegration(saveAwsCredentialsFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Well-Architected Scan route
    const wellArchitectedResource = functionsResource.addResource('well-architected-scan');
    wellArchitectedResource.addMethod('POST', new apigateway.LambdaIntegration(wellArchitectedScanFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Security Posture Lambda
    const getSecurityPostureFunction = new lambda.Function(this, 'GetSecurityPostureFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'get-security-posture.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist/handlers/security')),
      environment: lambdaEnvironment,
      role: lambdaRole,
      vpc: props.vpc,
      layers: [commonLayer],
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    // Get Findings Lambda
    const getFindingsFunction = new lambda.Function(this, 'GetFindingsFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'get-findings.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist/handlers/security')),
      environment: lambdaEnvironment,
      role: lambdaRole,
      vpc: props.vpc,
      layers: [commonLayer],
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    // Query Table Lambda (generic data access)
    const queryTableFunction = new lambda.Function(this, 'QueryTableFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'query-table.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist/handlers/data')),
      environment: lambdaEnvironment,
      role: lambdaRole,
      vpc: props.vpc,
      layers: [commonLayer],
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    // Security routes under /security
    const postureResource = securityResource.addResource('posture');
    postureResource.addMethod('POST', new apigateway.LambdaIntegration(getSecurityPostureFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const findingsResource = securityResource.addResource('findings');
    findingsResource.addMethod('POST', new apigateway.LambdaIntegration(getFindingsFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Security PDF Export Lambda
    const securityPdfExportFunction = new lambda.Function(this, 'SecurityPdfExportFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'security-scan-pdf-export.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist/handlers/reports')),
      environment: lambdaEnvironment,
      role: lambdaRole,
      vpc: props.vpc,
      layers: [commonLayer],
      timeout: cdk.Duration.minutes(2),
      memorySize: 512,
    });

    const exportPdfResource = securityResource.addResource('export-pdf');
    exportPdfResource.addMethod('POST', new apigateway.LambdaIntegration(securityPdfExportFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Query table route under /api/functions
    const queryTableResource = functionsResource.addResource('query-table');
    queryTableResource.addMethod('POST', new apigateway.LambdaIntegration(queryTableFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Fetch CloudWatch Metrics Lambda
    const fetchCloudwatchMetricsFunction = new lambda.Function(this, 'FetchCloudwatchMetricsFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'fetch-cloudwatch-metrics.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist/handlers/monitoring')),
      environment: lambdaEnvironment,
      role: lambdaRole,
      vpc: props.vpc,
      layers: [commonLayer],
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
    });

    // Add CloudWatch permissions for Fetch Metrics
    fetchCloudwatchMetricsFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:GetMetricStatistics',
        'cloudwatch:GetMetricData',
        'cloudwatch:ListMetrics',
        'sts:AssumeRole',
      ],
      resources: ['*'],
    }));

    // ML Waste Detection Lambda
    const mlWasteDetectionFunction = new lambda.Function(this, 'MLWasteDetectionFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'ml-waste-detection.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist/handlers/cost')),
      environment: lambdaEnvironment,
      role: lambdaRole,
      vpc: props.vpc,
      layers: [commonLayer],
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
    });

    // Add AWS permissions for ML Waste Detection
    mlWasteDetectionFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ec2:DescribeInstances',
        'ec2:DescribeVolumes',
        'ec2:DescribeSnapshots',
        'cloudwatch:GetMetricStatistics',
        'cloudwatch:GetMetricData',
        'sts:AssumeRole',
      ],
      resources: ['*'],
    }));

    // ML Waste Detection route under /functions
    const mlWasteDetectionResource = functionsResource.addResource('ml-waste-detection');
    mlWasteDetectionResource.addMethod('POST', new apigateway.LambdaIntegration(mlWasteDetectionFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Fetch CloudWatch Metrics route under /api/lambda (for apiClient.lambda compatibility)
    const lambdaResource = this.api.root.addResource('api').addResource('lambda');
    const fetchMetricsResource = lambdaResource.addResource('fetch-cloudwatch-metrics');
    fetchMetricsResource.addMethod('POST', new apigateway.LambdaIntegration(fetchCloudwatchMetricsFunction), {
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
