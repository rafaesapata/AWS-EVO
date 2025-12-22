#!/usr/bin/env node
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
const stackPrefix = `EvoUds${environment.charAt(0).toUpperCase() + environment.slice(1)}`;

// Network Stack (VPC, Subnets, etc.)
const networkStack = new NetworkStack(app, `${stackPrefix}NetworkStack`, {
  env,
  description: 'EVO UDS Network Infrastructure',
});

// Database Stack (RDS, ElastiCache, etc.)
const databaseStack = new DatabaseStack(app, `${stackPrefix}DatabaseStack`, {
  env,
  description: 'EVO UDS Database Infrastructure',
  vpc: networkStack.vpc,
});

// Auth Stack (Cognito, etc.)
const authStack = new AuthStack(app, `${stackPrefix}AuthStack`, {
  env,
  description: 'EVO UDS Authentication Infrastructure',
});

// API Stack (Lambda, API Gateway, etc.)
const apiStack = new ApiStack(app, `${stackPrefix}ApiStack`, {
  env,
  description: 'EVO UDS API Infrastructure',
  vpc: networkStack.vpc,
  database: databaseStack.database,
  userPool: authStack.userPool,
});

// Frontend Stack (S3, CloudFront, etc.)
const frontendStack = new FrontendStack(app, `${stackPrefix}FrontendStack`, {
  env,
  description: 'EVO UDS Frontend Infrastructure',
  api: apiStack.api,
});

// Monitoring Stack (CloudWatch, Alarms, etc.)
const monitoringStack = new MonitoringStack(app, `${stackPrefix}MonitoringStack`, {
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
