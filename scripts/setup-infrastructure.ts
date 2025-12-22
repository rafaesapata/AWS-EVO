#!/usr/bin/env tsx
/**
 * Setup Automático da Infraestrutura CDK
 * Configura todos os stacks necessários para o EVO UDS System
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Cria o arquivo principal do CDK app
 */
function createCDKApp(): void {
  const appContent = `#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { DatabaseStack } from '../lib/database-stack';
import { AuthStack } from '../lib/auth-stack';
import { ApiStack } from '../lib/api-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { MonitoringStack } from '../lib/monitoring-stack';

const app = new cdk.App();

// Environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

const environment = process.env.NODE_ENV || 'development';
const stackPrefix = \`EvoUds\${environment.charAt(0).toUpperCase() + environment.slice(1)}\`;

// Network Stack (VPC, Subnets, etc.)
const networkStack = new NetworkStack(app, \`\${stackPrefix}NetworkStack\`, {
  env,
  description: 'EVO UDS Network Infrastructure',
});

// Database Stack (RDS, ElastiCache, etc.)
const databaseStack = new DatabaseStack(app, \`\${stackPrefix}DatabaseStack\`, {
  env,
  description: 'EVO UDS Database Infrastructure',
  vpc: networkStack.vpc,
});

// Auth Stack (Cognito, etc.)
const authStack = new AuthStack(app, \`\${stackPrefix}AuthStack\`, {
  env,
  description: 'EVO UDS Authentication Infrastructure',
});

// API Stack (Lambda, API Gateway, etc.)
const apiStack = new ApiStack(app, \`\${stackPrefix}ApiStack\`, {
  env,
  description: 'EVO UDS API Infrastructure',
  vpc: networkStack.vpc,
  database: databaseStack.database,
  userPool: authStack.userPool,
});

// Frontend Stack (S3, CloudFront, etc.)
const frontendStack = new FrontendStack(app, \`\${stackPrefix}FrontendStack\`, {
  env,
  description: 'EVO UDS Frontend Infrastructure',
  api: apiStack.api,
});

// Monitoring Stack (CloudWatch, Alarms, etc.)
const monitoringStack = new MonitoringStack(app, \`\${stackPrefix}MonitoringStack\`, {
  env,
  description: 'EVO UDS Monitoring Infrastructure',
  api: apiStack.api,
  database: databaseStack.database,
});

// Add dependencies
databaseStack.addDependency(networkStack);
apiStack.addDependency(databaseStack);
apiStack.addDependency(authStack);
frontendStack.addDependency(apiStack);
monitoringStack.addDependency(apiStack);
monitoringStack.addDependency(databaseStack);

// Tags
const tags = {
  Project: 'EVO-UDS',
  Environment: environment,
  ManagedBy: 'CDK',
  DeployedAt: new Date().toISOString(),
};

Object.entries(tags).forEach(([key, value]) => {
  cdk.Tags.of(app).add(key, value);
});
`;

  fs.writeFileSync(path.join(PROJECT_ROOT, 'infra', 'bin', 'app.ts'), appContent);
}

/**
 * Atualiza o Network Stack
 */
function updateNetworkStack(): void {
  const stackContent = `import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC with public and private subnets
    this.vpc = new ec2.Vpc(this, 'EvoUdsVpc', {
      maxAzs: 3,
      natGateways: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 28,
          name: 'Database',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // VPC Endpoints for AWS services
    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    this.vpc.addGatewayEndpoint('DynamoDBEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
    });

    // Security Groups
    const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for Lambda functions',
      allowAllOutbound: true,
    });

    const rdsSecurityGroup = new ec2.SecurityGroup(this, 'RdsSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for RDS database',
      allowAllOutbound: false,
    });

    // Allow Lambda to connect to RDS
    rdsSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow Lambda to connect to PostgreSQL'
    );

    // Outputs
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
    });

    new cdk.CfnOutput(this, 'LambdaSecurityGroupId', {
      value: lambdaSecurityGroup.securityGroupId,
      description: 'Lambda Security Group ID',
    });

    new cdk.CfnOutput(this, 'RdsSecurityGroupId', {
      value: rdsSecurityGroup.securityGroupId,
      description: 'RDS Security Group ID',
    });
  }
}
`;

  fs.writeFileSync(path.join(PROJECT_ROOT, 'infra', 'lib', 'network-stack.ts'), stackContent);
}

/**
 * Atualiza o Database Stack
 */
function updateDatabaseStack(): void {
  const stackContent = `import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface DatabaseStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class DatabaseStack extends cdk.Stack {
  public readonly database: rds.DatabaseInstance;
  public readonly databaseSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    // Database credentials secret
    this.databaseSecret = new secretsmanager.Secret(this, 'DatabaseSecret', {
      description: 'EVO UDS Database credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'postgres' }),
        generateStringKey: 'password',
        excludeCharacters: '"@/\\\\',
      },
    });

    // Database subnet group
    const subnetGroup = new rds.SubnetGroup(this, 'DatabaseSubnetGroup', {
      vpc: props.vpc,
      description: 'Subnet group for EVO UDS database',
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    // RDS PostgreSQL instance
    this.database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_4,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc: props.vpc,
      subnetGroup,
      credentials: rds.Credentials.fromSecret(this.databaseSecret),
      databaseName: 'evouds',
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      deleteAutomatedBackups: false,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: false, // Set to true for production
      multiAz: false, // Set to true for production
      storageEncrypted: true,
      monitoringInterval: cdk.Duration.seconds(60),
      enablePerformanceInsights: true,
      performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
    });

    // Outputs
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: this.database.instanceEndpoint.hostname,
      description: 'Database endpoint',
    });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: this.databaseSecret.secretArn,
      description: 'Database secret ARN',
    });
  }
}
`;

  fs.writeFileSync(path.join(PROJECT_ROOT, 'infra', 'lib', 'database-stack.ts'), stackContent);
}

/**
 * Atualiza o Auth Stack
 */
function updateAuthStack(): void {
  const stackContent = `import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Cognito User Pool
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'EvoUdsUserPool',
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
        username: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        givenName: {
          required: true,
          mutable: true,
        },
        familyName: {
          required: true,
          mutable: true,
        },
      },
      customAttributes: {
        tenantId: new cognito.StringAttribute({ mutable: true }),
        role: new cognito.StringAttribute({ mutable: true }),
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change for production
    });

    // User Pool Client
    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: 'EvoUdsWebClient',
      generateSecret: false,
      authFlows: {
        userPassword: true,
        userSrp: true,
        custom: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          'http://localhost:3000/auth/callback',
          'https://app.evo-uds.com/auth/callback',
        ],
        logoutUrls: [
          'http://localhost:3000',
          'https://app.evo-uds.com',
        ],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
    });

    // User Pool Domain
    const domain = this.userPool.addDomain('UserPoolDomain', {
      cognitoDomain: {
        domainPrefix: \`evo-uds-\${cdk.Aws.ACCOUNT_ID}\`,
      },
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'UserPoolDomain', {
      value: domain.domainName,
      description: 'Cognito User Pool Domain',
    });
  }
}
`;

  fs.writeFileSync(path.join(PROJECT_ROOT, 'infra', 'lib', 'auth-stack.ts'), stackContent);
}

/**
 * Atualiza o API Stack
 */
function updateApiStack(): void {
  const stackContent = `import * as cdk from 'aws-cdk-lib';
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
      DATABASE_URL: \`postgresql://\${props.database.instanceEndpoint.hostname}:5432/evouds\`,
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
`;

  fs.writeFileSync(path.join(PROJECT_ROOT, 'infra', 'lib', 'api-stack.ts'), stackContent);
}

/**
 * Atualiza o Frontend Stack
 */
function updateFrontendStack(): void {
  const stackContent = `import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

export interface FrontendStackProps extends cdk.StackProps {
  api: apigateway.RestApi;
}

export class FrontendStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // S3 Bucket for frontend assets
    this.bucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: \`evo-uds-frontend-\${cdk.Aws.ACCOUNT_ID}-\${cdk.Aws.REGION}\`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Origin Access Identity for CloudFront
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI', {
      comment: 'EVO UDS Frontend OAI',
    });

    // Grant CloudFront access to S3 bucket
    this.bucket.grantRead(originAccessIdentity);

    // CloudFront Distribution
    this.distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(this.bucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.RestApiOrigin(props.api),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
        },
      },
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(30),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(30),
        },
      ],
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    // Deploy frontend assets
    new s3deploy.BucketDeployment(this, 'FrontendDeployment', {
      sources: [s3deploy.Source.asset('dist')],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });

    // Outputs
    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: \`https://\${this.distribution.distributionDomainName}\`,
      description: 'Frontend URL',
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: this.bucket.bucketName,
      description: 'Frontend S3 Bucket Name',
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID',
    });
  }
}
`;

  fs.writeFileSync(path.join(PROJECT_ROOT, 'infra', 'lib', 'frontend-stack.ts'), stackContent);
}

/**
 * Atualiza o Monitoring Stack
 */
function updateMonitoringStack(): void {
  const stackContent = `import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

export interface MonitoringStackProps extends cdk.StackProps {
  api: apigateway.RestApi;
  database: rds.DatabaseInstance;
}

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    // SNS Topic for alerts
    const alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: 'EvoUdsAlerts',
      displayName: 'EVO UDS System Alerts',
    });

    // Email subscription (replace with actual email)
    alertTopic.addSubscription(
      new snsSubscriptions.EmailSubscription('admin@evo-uds.com')
    );

    // API Gateway Alarms
    const apiErrorAlarm = new cloudwatch.Alarm(this, 'ApiErrorAlarm', {
      alarmName: 'EVO-UDS-API-Errors',
      alarmDescription: 'API Gateway 4XX/5XX errors',
      metric: props.api.metricClientError().with({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    apiErrorAlarm.addAlarmAction(
      new cloudwatch.SnsAction(alertTopic)
    );

    const apiLatencyAlarm = new cloudwatch.Alarm(this, 'ApiLatencyAlarm', {
      alarmName: 'EVO-UDS-API-Latency',
      alarmDescription: 'API Gateway high latency',
      metric: props.api.metricLatency().with({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5000, // 5 seconds
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    apiLatencyAlarm.addAlarmAction(
      new cloudwatch.SnsAction(alertTopic)
    );

    // Database Alarms
    const dbConnectionAlarm = new cloudwatch.Alarm(this, 'DatabaseConnectionAlarm', {
      alarmName: 'EVO-UDS-DB-Connections',
      alarmDescription: 'Database connection count high',
      metric: props.database.metricDatabaseConnections().with({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80, // 80% of max connections
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    dbConnectionAlarm.addAlarmAction(
      new cloudwatch.SnsAction(alertTopic)
    );

    const dbCpuAlarm = new cloudwatch.Alarm(this, 'DatabaseCpuAlarm', {
      alarmName: 'EVO-UDS-DB-CPU',
      alarmDescription: 'Database CPU utilization high',
      metric: props.database.metricCPUUtilization().with({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80, // 80% CPU
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    dbCpuAlarm.addAlarmAction(
      new cloudwatch.SnsAction(alertTopic)
    );

    // CloudWatch Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'EvoUdsDashboard', {
      dashboardName: 'EVO-UDS-System-Dashboard',
    });

    // API Metrics Widget
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway Metrics',
        left: [
          props.api.metricCount(),
          props.api.metricLatency(),
        ],
        right: [
          props.api.metricClientError(),
          props.api.metricServerError(),
        ],
        width: 12,
        height: 6,
      })
    );

    // Database Metrics Widget
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Database Metrics',
        left: [
          props.database.metricCPUUtilization(),
          props.database.metricDatabaseConnections(),
        ],
        right: [
          props.database.metricReadLatency(),
          props.database.metricWriteLatency(),
        ],
        width: 12,
        height: 6,
      })
    );

    // Outputs
    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: alertTopic.topicArn,
      description: 'SNS Alert Topic ARN',
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: \`https://\${cdk.Aws.REGION}.console.aws.amazon.com/cloudwatch/home?region=\${cdk.Aws.REGION}#dashboards:name=\${dashboard.dashboardName}\`,
      description: 'CloudWatch Dashboard URL',
    });
  }
}
`;

  fs.writeFileSync(path.join(PROJECT_ROOT, 'infra', 'lib', 'monitoring-stack.ts'), stackContent);
}

/**
 * Atualiza o package.json da infraestrutura
 */
function updateInfraPackageJson(): void {
  const packageJson = {
    name: 'evo-uds-infrastructure',
    version: '1.0.0',
    description: 'EVO UDS System Infrastructure',
    scripts: {
      build: 'tsc',
      watch: 'tsc -w',
      test: 'jest',
      cdk: 'cdk',
      deploy: 'cdk deploy --all --require-approval never',
      destroy: 'cdk destroy --all --force',
      diff: 'cdk diff',
      synth: 'cdk synth',
      bootstrap: 'cdk bootstrap',
    },
    devDependencies: {
      '@types/jest': '^29.4.0',
      '@types/node': '20.1.0',
      'aws-cdk': '2.100.0',
      jest: '^29.4.0',
      'ts-jest': '^29.1.0',
      'ts-node': '^10.9.1',
      typescript: '~5.1.3',
    },
    dependencies: {
      'aws-cdk-lib': '2.100.0',
      constructs: '^10.0.0',
      'source-map-support': '^0.5.21',
    },
  };

  fs.writeFileSync(
    path.join(PROJECT_ROOT, 'infra', 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
}

/**
 * Cria o arquivo cdk.json
 */
function createCDKJson(): void {
  const cdkConfig = {
    app: 'npx ts-node --prefer-ts-exts bin/app.ts',
    watch: {
      include: ['**'],
      exclude: [
        'README.md',
        'cdk*.json',
        '**/*.d.ts',
        '**/*.js',
        'tsconfig.json',
        'package*.json',
        'yarn.lock',
        'node_modules',
        'test',
      ],
    },
    context: {
      '@aws-cdk/aws-lambda:recognizeLayerVersion': true,
      '@aws-cdk/core:checkSecretUsage': true,
      '@aws-cdk/core:target-partitions': ['aws', 'aws-cn'],
      '@aws-cdk-containers/ecs-service-extensions:enableDefaultLogDriver': true,
      '@aws-cdk/aws-ec2:uniqueImdsv2TemplateName': true,
      '@aws-cdk/aws-ecs:arnFormatIncludesClusterName': true,
      '@aws-cdk/aws-iam:minimizePolicies': true,
      '@aws-cdk/core:validateSnapshotRemovalPolicy': true,
      '@aws-cdk/aws-codepipeline:crossAccountKeyAliasStackSafeResourceName': true,
      '@aws-cdk/aws-s3:createDefaultLoggingPolicy': true,
      '@aws-cdk/aws-sns-subscriptions:restrictSqsDescryption': true,
      '@aws-cdk/aws-apigateway:disableCloudWatchRole': false,
      '@aws-cdk/core:enablePartitionLiterals': true,
      '@aws-cdk/aws-events:eventsTargetQueueSameAccount': true,
      '@aws-cdk/aws-iam:standardizedServicePrincipals': true,
      '@aws-cdk/aws-ecs:disableExplicitDeploymentControllerForCircuitBreaker': true,
      '@aws-cdk/aws-iam:importedRoleStackSafeDefaultPolicyName': true,
      '@aws-cdk/aws-s3:serverAccessLogsUseBucketPolicy': true,
      '@aws-cdk/aws-route53-patters:useCertificate': true,
      '@aws-cdk/customresources:installLatestAwsSdkDefault': false,
      '@aws-cdk/aws-rds:databaseProxyUniqueResourceName': true,
      '@aws-cdk/aws-codedeploy:removeAlarmsFromDeploymentGroup': true,
      '@aws-cdk/aws-apigateway:authorizerChangeDeploymentLogicalId': true,
      '@aws-cdk/aws-ec2:launchTemplateDefaultUserData': true,
      '@aws-cdk/aws-secretsmanager:useAttachedSecretResourcePolicyForSecretTargetAttachments': true,
      '@aws-cdk/aws-redshift:columnId': true,
      '@aws-cdk/aws-stepfunctions-tasks:enableLogging': true,
      '@aws-cdk/aws-ec2:restrictDefaultSecurityGroup': true,
      '@aws-cdk/aws-apigateway:requestValidatorUniqueId': true,
      '@aws-cdk/aws-kms:aliasNameRef': true,
      '@aws-cdk/aws-autoscaling:generateLaunchTemplateInsteadOfLaunchConfig': true,
      '@aws-cdk/core:includePrefixInUniqueNameGeneration': true,
      '@aws-cdk/aws-efs:denyAnonymousAccess': true,
      '@aws-cdk/aws-opensearchservice:enableLogging': true,
      '@aws-cdk/aws-normlizedkeys:props': true,
      '@aws-cdk/aws-kms:reduceCrossAccountRegionPolicyScope': true,
      '@aws-cdk/aws-opensearchservice:enforceHttps': true,
      '@aws-cdk/aws-s3:eventBridgeNotificationToSqs': true,
      '@aws-cdk/aws-cloudfront:defaultSecurityPolicyTLSv1.2_2021': true,
    },
  };

  fs.writeFileSync(
    path.join(PROJECT_ROOT, 'infra', 'cdk.json'),
    JSON.stringify(cdkConfig, null, 2)
  );
}

/**
 * Cria o arquivo tsconfig.json para a infraestrutura
 */
function createInfraTsConfig(): void {
  const tsConfig = {
    compilerOptions: {
      target: 'ES2020',
      module: 'commonjs',
      lib: ['es2020'],
      declaration: true,
      strict: true,
      noImplicitAny: true,
      strictNullChecks: true,
      noImplicitThis: true,
      alwaysStrict: true,
      noUnusedLocals: false,
      noUnusedParameters: false,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: false,
      inlineSourceMap: true,
      inlineSources: true,
      experimentalDecorators: true,
      strictPropertyInitialization: false,
      typeRoots: ['./node_modules/@types'],
    },
    exclude: ['cdk.out'],
  };

  fs.writeFileSync(
    path.join(PROJECT_ROOT, 'infra', 'tsconfig.json'),
    JSON.stringify(tsConfig, null, 2)
  );
}

/**
 * Cria arquivos de exemplo para handlers Lambda
 */
function createLambdaHandlers(): void {
  // Security scan handler
  const securityHandler = `import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    console.log('Security scan request:', JSON.stringify(event, null, 2));
    
    // Implementar lógica de scan de segurança aqui
    const result = {
      scanId: \`scan_\${Date.now()}\`,
      status: 'completed',
      findings: [],
      timestamp: new Date().toISOString(),
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('Security scan error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: 'Security scan failed',
      }),
    };
  }
};
`;

  // Cost analysis handler
  const costHandler = `import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    console.log('Cost analysis request:', JSON.stringify(event, null, 2));
    
    // Implementar lógica de análise de custos aqui
    const result = {
      analysisId: \`cost_\${Date.now()}\`,
      totalCost: 0,
      breakdown: {},
      recommendations: [],
      timestamp: new Date().toISOString(),
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('Cost analysis error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: 'Cost analysis failed',
      }),
    };
  }
};
`;

  // Health check handler
  const healthHandler = `import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      region: process.env.AWS_REGION || 'us-east-1',
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      },
      body: JSON.stringify(health),
    };
  } catch (error) {
    console.error('Health check error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
`;

  // Cria os arquivos
  fs.writeFileSync(
    path.join(PROJECT_ROOT, 'backend', 'dist', 'handlers', 'security', 'security-scan.js'),
    securityHandler
  );
  
  fs.writeFileSync(
    path.join(PROJECT_ROOT, 'backend', 'dist', 'handlers', 'finops', 'cost-analysis.js'),
    costHandler
  );
  
  fs.writeFileSync(
    path.join(PROJECT_ROOT, 'backend', 'dist', 'handlers', 'system', 'health.js'),
    healthHandler
  );
}

/**
 * Cria layer comum para Lambda
 */
function createCommonLayer(): void {
  const layerPackageJson = {
    name: 'evo-uds-common-layer',
    version: '1.0.0',
    description: 'Common dependencies for EVO UDS Lambda functions',
    dependencies: {
      'aws-sdk': '^2.1490.0',
      '@aws-sdk/client-secrets-manager': '^3.450.0',
      '@aws-sdk/client-rds': '^3.450.0',
      'pg': '^8.11.3',
      'zod': '^3.22.4',
    },
  };

  const layerDir = path.join(PROJECT_ROOT, 'backend', 'dist', 'layers', 'common');
  const nodeModulesDir = path.join(layerDir, 'nodejs');
  
  if (!fs.existsSync(nodeModulesDir)) {
    fs.mkdirSync(nodeModulesDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(nodeModulesDir, 'package.json'),
    JSON.stringify(layerPackageJson, null, 2)
  );
}

/**
 * Função principal
 */
function main(): void {
  console.log('🏗️  Configurando infraestrutura CDK...');

  // Cria diretórios se não existirem
  const dirs = [
    'infra/bin',
    'infra/lib',
    'backend/dist/handlers/security',
    'backend/dist/handlers/finops',
    'backend/dist/handlers/system',
    'backend/dist/layers/common/nodejs',
  ];

  dirs.forEach(dir => {
    const fullPath = path.join(PROJECT_ROOT, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });

  // Atualiza arquivos da infraestrutura
  createCDKApp();
  updateNetworkStack();
  updateDatabaseStack();
  updateAuthStack();
  updateApiStack();
  updateFrontendStack();
  updateMonitoringStack();
  updateInfraPackageJson();
  createCDKJson();
  createInfraTsConfig();
  createLambdaHandlers();
  createCommonLayer();

  console.log('✅ Infraestrutura CDK configurada com sucesso!');
  console.log('📦 Arquivos criados:');
  console.log('   • infra/bin/app.ts - CDK App principal');
  console.log('   • infra/lib/*.ts - 6 stacks CDK');
  console.log('   • infra/cdk.json - Configuração CDK');
  console.log('   • infra/package.json - Dependências');
  console.log('   • backend/dist/handlers/ - Handlers Lambda');
  console.log('   • backend/dist/layers/ - Layer comum');
  console.log('');
  console.log('🚀 Próximos passos:');
  console.log('   1. Execute: npm run deploy:dev');
  console.log('   2. Aguarde o deploy completo (~10-15 minutos)');
  console.log('   3. Acesse as URLs fornecidas ao final');
}

// Executa se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main };