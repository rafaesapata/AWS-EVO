#!/usr/bin/env python3
"""Generate CloudFormation template with all 194 Lambdas"""

import re

# Read SAM template
with open('sam/template.yaml', 'r') as f:
    sam_content = f.read()

# Extract Lambda functions
functions = []
pattern = r'  ([A-Z][a-zA-Z]+)Function:\s+Type: AWS::Serverless::Function\s+Properties:\s+FunctionName:.*?\s+CodeUri:.*?\s+Handler: ([\w/\-\.]+)'
matches = re.findall(pattern, sam_content, re.MULTILINE | re.DOTALL)

for match in matches:
    name = match[0]
    handler = match[1]
    functions.append({'name': name, 'handler': handler})

print(f"Found {len(functions)} Lambda functions")

# Generate CloudFormation template
cf_template = '''AWSTemplateFormatVersion: '2010-09-09'
Description: EVO Production - All 194 Lambda Functions

Parameters:
  Environment:
    Type: String
    Default: production
  
  ProjectName:
    Type: String
    Default: evo-uds-v3

  LayerArn:
    Type: String
    Default: arn:aws:lambda:us-east-1:523115032346:layer:evo-uds-v3-production-deps:3

  CodeS3Bucket:
    Type: String
    Default: evo-sam-artifacts-523115032346

  CodeS3Key:
    Type: String
    Default: lambda-code/lambda-code-prod-v2.zip

Resources:
  # IAM Role for all Lambdas
  LambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub '${ProjectName}-${Environment}-lambda-role'
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
        - arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole
        - arn:aws:iam::aws:policy/AmazonBedrockFullAccess
      Policies:
        - PolicyName: LambdaPolicy
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - logs:*
                  - secretsmanager:*
                  - cognito-idp:*
                  - s3:*
                  - ses:*
                  - sts:*
                  - ce:*
                  - cloudwatch:*
                  - cloudtrail:*
                  - guardduty:*
                  - securityhub:*
                  - iam:*
                  - ec2:Describe*
                  - rds:Describe*
                  - lambda:*
                  - wafv2:*
                Resource: '*'

'''

# Add all Lambda functions
for func in functions:
    # Convert CamelCase to kebab-case
    func_name_kebab = re.sub(r'(?<!^)(?=[A-Z])', '-', func['name']).lower()
    
    # Remove 'dist/' prefix from handler
    handler = func['handler'].replace('dist/', '')
    
    cf_template += f'''  {func['name']}Function:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: !Sub '${{ProjectName}}-${{Environment}}-{func_name_kebab}'
      Runtime: nodejs20.x
      Handler: {handler}
      Code:
        S3Bucket: !Ref CodeS3Bucket
        S3Key: !Ref CodeS3Key
      Layers:
        - !Ref LayerArn
      Architectures:
        - arm64
      Timeout: 30
      MemorySize: 256
      Role: !GetAtt LambdaExecutionRole.Arn

'''

cf_template += '''Outputs:
  LambdaExecutionRoleArn:
    Value: !GetAtt LambdaExecutionRole.Arn
  LayerArn:
    Value: !Ref LayerArn
'''

# Write output
with open('sam/production-lambdas-only.yaml', 'w') as f:
    f.write(cf_template)

print(f"✅ Generated sam/production-lambdas-only.yaml with {len(functions)} Lambda functions")
