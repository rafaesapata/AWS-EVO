#!/usr/bin/env node
/**
 * Generate Production CloudFormation Template
 * Converts SAM template to pure CloudFormation with S3 code references
 */

import * as fs from 'fs';
import * as yaml from 'js-yaml';

const SAM_TEMPLATE = 'sam/template.yaml';
const OUTPUT_TEMPLATE = 'sam/production-complete.yaml';

// Read SAM template
const samTemplate: any = yaml.load(fs.readFileSync(SAM_TEMPLATE, 'utf8'));

// Extract all Lambda functions
const functions: any[] = [];
Object.entries(samTemplate.Resources).forEach(([name, resource]: [string, any]) => {
  if (resource.Type === 'AWS::Serverless::Function') {
    functions.push({
      name,
      handler: resource.Properties.Handler,
      timeout: resource.Properties.Timeout || 30,
      memorySize: resource.Properties.MemorySize || 256,
      events: resource.Properties.Events || {},
    });
  }
});

console.log(`Found ${functions.length} Lambda functions`);

// Generate CloudFormation template
const cfTemplate: any = {
  AWSTemplateFormatVersion: '2010-09-09',
  Description: 'EVO Production - Complete Infrastructure (194 Lambdas)',
  
  Parameters: {
    Environment: {
      Type: 'String',
      Default: 'production',
    },
    ProjectName: {
      Type: 'String',
      Default: 'evo-uds-v3',
    },
    DatabasePassword: {
      Type: 'String',
      NoEcho: true,
      MinLength: 16,
    },
    LayerArn: {
      Type: 'String',
      Default: 'arn:aws:lambda:us-east-1:523115032346:layer:evo-uds-v3-production-deps:3',
    },
    CodeS3Bucket: {
      Type: 'String',
      Default: 'evo-sam-artifacts-523115032346',
    },
    CodeS3Key: {
      Type: 'String',
      Default: 'lambda-code/lambda-code-prod-v2.zip',
    },
  },
  
  Resources: {},
  
  Outputs: {
    LayerArn: {
      Value: { Ref: 'LayerArn' },
    },
  },
};

// Add IAM Role
cfTemplate.Resources.LambdaExecutionRole = {
  Type: 'AWS::IAM::Role',
  Properties: {
    RoleName: { 'Fn::Sub': '${ProjectName}-${Environment}-lambda-role' },
    AssumeRolePolicyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: { Service: 'lambda.amazonaws.com' },
        Action: 'sts:AssumeRole',
      }],
    },
    ManagedPolicyArns: [
      'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
      'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
      'arn:aws:iam::aws:policy/AmazonBedrockFullAccess',
    ],
    Policies: [{
      PolicyName: 'LambdaPolicy',
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['logs:*', 'secretsmanager:*', 'cognito-idp:*', 's3:*', 'ses:*', 'sts:*', 'ce:*', 'cloudwatch:*', 'cloudtrail:*', 'guardduty:*', 'securityhub:*', 'iam:*', 'ec2:Describe*', 'rds:Describe*', 'lambda:*', 'wafv2:*'],
            Resource: '*',
          },
        ],
      },
    }],
  },
};

// Add all Lambda functions
functions.forEach(func => {
  cfTemplate.Resources[func.name] = {
    Type: 'AWS::Lambda::Function',
    Properties: {
      FunctionName: { 'Fn::Sub': `\${ProjectName}-\${Environment}-${func.name.replace('Function', '').replace(/([A-Z])/g, '-$1').toLowerCase().substring(1)}` },
      Runtime: 'nodejs20.x',
      Handler: func.handler,
      Code: {
        S3Bucket: { Ref: 'CodeS3Bucket' },
        S3Key: { Ref: 'CodeS3Key' },
      },
      Layers: [{ Ref: 'LayerArn' }],
      Architectures: ['arm64'],
      Timeout: func.timeout,
      MemorySize: func.memorySize,
      Role: { 'Fn::GetAtt': ['LambdaExecutionRole', 'Arn'] },
    },
  };
  
  // Add output
  cfTemplate.Outputs[`${func.name}Arn`] = {
    Value: { 'Fn::GetAtt': [func.name, 'Arn'] },
  };
});

// Write output
fs.writeFileSync(OUTPUT_TEMPLATE, yaml.dump(cfTemplate, { lineWidth: -1 }));
console.log(`✅ Generated ${OUTPUT_TEMPLATE} with ${functions.length} Lambda functions`);
