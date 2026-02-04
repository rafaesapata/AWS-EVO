#!/bin/bash
# =============================================================================
# EVO Platform - Generate API Gateway Endpoints CloudFormation
# =============================================================================
# This script generates CloudFormation YAML for all API Gateway endpoints
# based on the lambda-functions-reference.md steering file.
#
# Usage: ./cloudformation/generate-api-endpoints.sh > cloudformation/api-endpoints-stack.yaml
# =============================================================================

cat << 'HEADER'
AWSTemplateFormatVersion: '2010-09-09'
Description: 'EVO Platform - API Gateway Endpoints Stack - All Lambda Integrations'

# =============================================================================
# This is a nested stack that creates all API Gateway endpoints
# It should be deployed after the master stack
# =============================================================================

Parameters:
  ProjectName:
    Type: String
    Default: evo-uds-v3
    
  Environment:
    Type: String
    Default: production
    
  RestApiId:
    Type: String
    Description: API Gateway REST API ID from master stack
    
  FunctionsResourceId:
    Type: String
    Description: API Gateway /api/functions resource ID
    
  AuthorizerId:
    Type: String
    Description: Cognito Authorizer ID
    
  LambdaCodeBucket:
    Type: String
    Description: S3 bucket containing Lambda code
    
  LambdaLayerArn:
    Type: String
    Description: Lambda dependencies layer ARN
    
  LambdaExecutionRoleArn:
    Type: String
    Description: Lambda execution role ARN
    
  LambdaSecurityGroupId:
    Type: String
    Description: Lambda security group ID
    
  PrivateSubnet1Id:
    Type: String
    Description: Private subnet 1 ID
    
  PrivateSubnet2Id:
    Type: String
    Description: Private subnet 2 ID
    
  DatabaseUrl:
    Type: String
    NoEcho: true
    Description: Database connection URL
    
  CognitoUserPoolId:
    Type: String
    Description: Cognito User Pool ID

Resources:
HEADER

# Function to generate Lambda + API Gateway resources for an endpoint
generate_endpoint() {
  local endpoint_name="$1"
  local handler_path="$2"
  local handler_name="$3"
  local timeout="${4:-30}"
  local memory="${5:-256}"
  local auth="${6:-COGNITO_USER_POOLS}"
  
  # Convert endpoint-name to PascalCase for resource names
  local pascal_name=$(echo "$endpoint_name" | sed -r 's/(^|-)([a-z])/\U\2/g')
  
  cat << EOF

  # ---------------------------------------------------------------------------
  # ${endpoint_name} ENDPOINT
  # ---------------------------------------------------------------------------
  
  ${pascal_name}Function:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: !Sub '\${ProjectName}-\${Environment}-${endpoint_name}'
      Runtime: nodejs18.x
      Handler: ${handler_name}.handler
      Code:
        S3Bucket: !Ref LambdaCodeBucket
        S3Key: handlers/${handler_path}/${handler_name}.zip
      Role: !Ref LambdaExecutionRoleArn
      Timeout: ${timeout}
      MemorySize: ${memory}
      VpcConfig:
        SecurityGroupIds: [!Ref LambdaSecurityGroupId]
        SubnetIds: [!Ref PrivateSubnet1Id, !Ref PrivateSubnet2Id]
      Layers: [!Ref LambdaLayerArn]
      Environment:
        Variables:
          DATABASE_URL: !Ref DatabaseUrl
          NODE_PATH: /opt/nodejs/node_modules
          COGNITO_USER_POOL_ID: !Ref CognitoUserPoolId

  ${pascal_name}Resource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref RestApiId
      ParentId: !Ref FunctionsResourceId
      PathPart: ${endpoint_name}

  ${pascal_name}OptionsMethod:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref RestApiId
      ResourceId: !Ref ${pascal_name}Resource
      HttpMethod: OPTIONS
      AuthorizationType: NONE
      Integration:
        Type: MOCK
        RequestTemplates:
          application/json: '{"statusCode": 200}'
        IntegrationResponses:
          - StatusCode: 200
            ResponseParameters:
              method.response.header.Access-Control-Allow-Headers: "'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token,X-Impersonate-Organization'"
              method.response.header.Access-Control-Allow-Methods: "'GET,POST,PUT,DELETE,OPTIONS'"
              method.response.header.Access-Control-Allow-Origin: "'*'"
      MethodResponses:
        - StatusCode: 200
          ResponseParameters:
            method.response.header.Access-Control-Allow-Headers: true
            method.response.header.Access-Control-Allow-Methods: true
            method.response.header.Access-Control-Allow-Origin: true

  ${pascal_name}PostMethod:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref RestApiId
      ResourceId: !Ref ${pascal_name}Resource
      HttpMethod: POST
      AuthorizationType: ${auth}
EOF

  # Add authorizer reference only if using Cognito
  if [ "$auth" = "COGNITO_USER_POOLS" ]; then
    cat << EOF
      AuthorizerId: !Ref AuthorizerId
EOF
  fi

  cat << EOF
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub 'arn:aws:apigateway:\${AWS::Region}:lambda:path/2015-03-31/functions/\${${pascal_name}Function.Arn}/invocations'

  ${pascal_name}LambdaPermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref ${pascal_name}Function
      Action: lambda:InvokeFunction
      Principal: apigateway.amazonaws.com
      SourceArn: !Sub 'arn:aws:execute-api:\${AWS::Region}:\${AWS::AccountId}:\${RestApiId}/*/POST/api/functions/${endpoint_name}'
EOF
}

# =============================================================================
# GENERATE ALL ENDPOINTS
# =============================================================================

# Auth endpoints
generate_endpoint "mfa-enroll" "auth" "mfa-handlers" 30 256
generate_endpoint "mfa-check" "auth" "mfa-handlers" 30 256
generate_endpoint "mfa-challenge-verify" "auth" "mfa-handlers" 30 256
generate_endpoint "mfa-verify-login" "auth" "mfa-handlers" 30 256
generate_endpoint "mfa-list-factors" "auth" "mfa-handlers" 30 256
generate_endpoint "mfa-unenroll" "auth" "mfa-handlers" 30 256
generate_endpoint "webauthn-register" "auth" "webauthn-register" 30 256
generate_endpoint "webauthn-authenticate" "auth" "webauthn-authenticate" 30 256
generate_endpoint "webauthn-check" "auth" "webauthn-check-standalone" 30 256
generate_endpoint "delete-webauthn-credential" "auth" "delete-webauthn-credential" 30 256
generate_endpoint "verify-tv-token" "auth" "verify-tv-token" 30 256
generate_endpoint "self-register" "auth" "self-register" 60 256 "NONE"
generate_endpoint "forgot-password" "auth" "forgot-password" 30 256 "NONE"

# Admin endpoints
generate_endpoint "admin-manage-user" "admin" "admin-manage-user" 30 256
generate_endpoint "create-cognito-user" "admin" "create-cognito-user" 30 256
generate_endpoint "create-user" "admin" "create-user" 30 256
generate_endpoint "disable-cognito-user" "admin" "disable-cognito-user" 30 256
generate_endpoint "manage-organizations" "admin" "manage-organizations" 30 256
generate_endpoint "deactivate-demo-mode" "admin" "deactivate-demo-mode" 30 256
generate_endpoint "manage-demo-mode" "admin" "manage-demo-mode" 30 256
generate_endpoint "log-audit" "admin" "log-audit" 30 256
generate_endpoint "manage-email-templates" "admin" "manage-email-templates" 30 256

# Security endpoints
generate_endpoint "security-scan" "security" "security-scan" 300 1024
generate_endpoint "start-security-scan" "security" "start-security-scan" 60 256
generate_endpoint "compliance-scan" "security" "compliance-scan" 300 1024
generate_endpoint "start-compliance-scan" "security" "start-compliance-scan" 60 256
generate_endpoint "get-compliance-scan-status" "security" "get-compliance-scan-status" 30 256
generate_endpoint "get-compliance-history" "security" "get-compliance-history" 30 256
generate_endpoint "well-architected-scan" "security" "well-architected-scan" 300 512
generate_endpoint "guardduty-scan" "security" "guardduty-scan" 120 512
generate_endpoint "get-findings" "security" "get-findings" 30 256
generate_endpoint "get-security-posture" "security" "get-security-posture" 30 256
generate_endpoint "validate-aws-credentials" "security" "validate-aws-credentials" 60 256
generate_endpoint "validate-permissions" "security" "validate-permissions" 60 256
generate_endpoint "iam-deep-analysis" "security" "iam-deep-analysis" 120 512
generate_endpoint "lateral-movement-detection" "security" "lateral-movement-detection" 120 512
generate_endpoint "drift-detection" "security" "drift-detection" 120 512
generate_endpoint "analyze-cloudtrail" "security" "analyze-cloudtrail" 300 512
generate_endpoint "start-cloudtrail-analysis" "security" "start-cloudtrail-analysis" 60 256
generate_endpoint "fetch-cloudtrail" "security" "fetch-cloudtrail" 60 256

# WAF endpoints
generate_endpoint "waf-setup-monitoring" "security" "waf-setup-monitoring" 60 256
generate_endpoint "waf-dashboard-api" "security" "waf-dashboard-api" 30 256

# Cost endpoints
generate_endpoint "fetch-daily-costs" "cost" "fetch-daily-costs" 300 512
generate_endpoint "ri-sp-analyzer" "cost" "ri-sp-analyzer" 300 512
generate_endpoint "get-ri-sp-data" "cost" "get-ri-sp-data" 30 256
generate_endpoint "get-ri-sp-analysis" "cost" "get-ri-sp-analysis" 30 256
generate_endpoint "list-ri-sp-history" "cost" "list-ri-sp-history" 30 256
generate_endpoint "cost-optimization" "cost" "cost-optimization" 300 512
generate_endpoint "budget-forecast" "cost" "budget-forecast" 120 512
generate_endpoint "generate-cost-forecast" "cost" "generate-cost-forecast" 120 512
generate_endpoint "finops-copilot" "cost" "finops-copilot-v2" 120 512
generate_endpoint "ml-waste-detection" "cost" "ml-waste-detection" 120 512

# AI endpoints
generate_endpoint "bedrock-chat" "ai" "bedrock-chat" 120 512
generate_endpoint "get-ai-notifications" "ai" "get-ai-notifications" 30 256
generate_endpoint "update-ai-notification" "ai" "update-ai-notification" 30 256
generate_endpoint "send-ai-notification" "ai" "send-ai-notification" 30 256
generate_endpoint "list-ai-notifications-admin" "ai" "list-ai-notifications-admin" 30 256
generate_endpoint "manage-notification-rules" "ai" "manage-notification-rules" 30 256

# ML endpoints
generate_endpoint "intelligent-alerts-analyzer" "ml" "intelligent-alerts-analyzer" 120 512
generate_endpoint "predict-incidents" "ml" "predict-incidents" 120 512
generate_endpoint "detect-anomalies" "ml" "detect-anomalies" 120 512

# Dashboard endpoints
generate_endpoint "get-executive-dashboard" "dashboard" "get-executive-dashboard" 60 512
generate_endpoint "get-executive-dashboard-public" "dashboard" "get-executive-dashboard-public" 60 512 "NONE"
generate_endpoint "manage-tv-tokens" "dashboard" "manage-tv-tokens" 30 256

# Monitoring endpoints
generate_endpoint "alerts" "monitoring" "alerts" 30 256
generate_endpoint "auto-alerts" "monitoring" "auto-alerts" 30 256
generate_endpoint "check-alert-rules" "monitoring" "check-alert-rules" 30 256
generate_endpoint "aws-realtime-metrics" "monitoring" "aws-realtime-metrics" 60 512
generate_endpoint "fetch-cloudwatch-metrics" "monitoring" "fetch-cloudwatch-metrics" 60 256
generate_endpoint "fetch-edge-services" "monitoring" "fetch-edge-services" 60 256
generate_endpoint "endpoint-monitor-check" "monitoring" "endpoint-monitor-check" 30 256
generate_endpoint "generate-error-fix-prompt" "monitoring" "generate-error-fix-prompt" 30 256
generate_endpoint "get-platform-metrics" "monitoring" "get-platform-metrics" 60 256
generate_endpoint "get-recent-errors" "monitoring" "get-recent-errors" 30 256
generate_endpoint "get-lambda-health" "monitoring" "get-lambda-health" 30 256
generate_endpoint "log-frontend-error" "monitoring" "log-frontend-error" 30 256 "NONE"

# AWS credentials endpoints
generate_endpoint "list-aws-credentials" "aws" "list-aws-credentials" 30 256
generate_endpoint "save-aws-credentials" "aws" "save-aws-credentials" 30 256
generate_endpoint "update-aws-credentials" "aws" "update-aws-credentials" 30 256

# Azure endpoints
generate_endpoint "azure-oauth-initiate" "azure" "azure-oauth-initiate" 30 256
generate_endpoint "azure-oauth-callback" "azure" "azure-oauth-callback" 60 256
generate_endpoint "azure-oauth-refresh" "azure" "azure-oauth-refresh" 30 256
generate_endpoint "azure-oauth-revoke" "azure" "azure-oauth-revoke" 30 256
generate_endpoint "validate-azure-credentials" "azure" "validate-azure-credentials" 60 256
generate_endpoint "validate-azure-permissions" "azure" "validate-azure-permissions" 60 256
generate_endpoint "save-azure-credentials" "azure" "save-azure-credentials" 30 256
generate_endpoint "list-azure-credentials" "azure" "list-azure-credentials" 30 256
generate_endpoint "delete-azure-credentials" "azure" "delete-azure-credentials" 30 256
generate_endpoint "azure-security-scan" "azure" "azure-security-scan" 300 1024
generate_endpoint "start-azure-security-scan" "azure" "start-azure-security-scan" 60 256
generate_endpoint "azure-defender-scan" "azure" "azure-defender-scan" 120 512
generate_endpoint "azure-compliance-scan" "azure" "azure-compliance-scan" 300 1024
generate_endpoint "azure-well-architected-scan" "azure" "azure-well-architected-scan" 300 512
generate_endpoint "azure-cost-optimization" "azure" "azure-cost-optimization" 120 512
generate_endpoint "azure-reservations-analyzer" "azure" "azure-reservations-analyzer" 120 512
generate_endpoint "azure-fetch-costs" "azure" "azure-fetch-costs" 120 512
generate_endpoint "azure-resource-inventory" "azure" "azure-resource-inventory" 120 512
generate_endpoint "azure-activity-logs" "azure" "azure-activity-logs" 60 256
generate_endpoint "azure-fetch-monitor-metrics" "azure" "azure-fetch-monitor-metrics" 60 256
generate_endpoint "azure-detect-anomalies" "azure" "azure-detect-anomalies" 120 512
generate_endpoint "azure-fetch-edge-services" "azure" "azure-fetch-edge-services" 60 256

# Cloud unified endpoints
generate_endpoint "list-cloud-credentials" "cloud" "list-cloud-credentials" 30 256

# License endpoints
generate_endpoint "validate-license" "license" "validate-license" 30 256
generate_endpoint "configure-license" "license" "configure-license" 30 256
generate_endpoint "sync-license" "license" "sync-license" 60 256
generate_endpoint "admin-sync-license" "license" "admin-sync-license" 60 256
generate_endpoint "manage-seats" "license" "manage-seats" 30 256

# KB endpoints
generate_endpoint "kb-analytics-dashboard" "kb" "kb-analytics-dashboard" 30 256
generate_endpoint "kb-ai-suggestions" "kb" "kb-ai-suggestions" 60 512
generate_endpoint "kb-export-pdf" "kb" "kb-export-pdf" 60 512
generate_endpoint "increment-article-views" "kb" "increment-article-views" 30 256
generate_endpoint "increment-article-helpful" "kb" "increment-article-helpful" 30 256
generate_endpoint "track-article-view-detailed" "kb" "track-article-view-detailed" 30 256

# Reports endpoints
generate_endpoint "generate-pdf-report" "reports" "generate-pdf-report" 120 512
generate_endpoint "generate-excel-report" "reports" "generate-excel-report" 120 512
generate_endpoint "generate-security-pdf" "reports" "generate-security-pdf" 120 512
generate_endpoint "security-scan-pdf-export" "reports" "security-scan-pdf-export" 120 512
generate_endpoint "generate-remediation-script" "reports" "generate-remediation-script" 60 256

# Data endpoints
generate_endpoint "query-table" "data" "query-table" 30 256
generate_endpoint "mutate-table" "data" "mutate-table" 30 256
generate_endpoint "ticket-management" "data" "ticket-management" 30 256
generate_endpoint "ticket-attachments" "data" "ticket-attachments" 60 256

# Organizations endpoints
generate_endpoint "create-organization-account" "organizations" "create-organization-account" 30 256
generate_endpoint "sync-organization-accounts" "organizations" "sync-organization-accounts" 60 256

# Profiles endpoints
generate_endpoint "check-organization" "profiles" "check-organization" 30 256
generate_endpoint "create-with-organization" "profiles" "create-with-organization" 30 256
generate_endpoint "get-user-organization" "profiles" "get-user-organization" 30 256

# Notifications endpoints
generate_endpoint "send-email" "notifications" "send-email" 30 256
generate_endpoint "send-notification" "notifications" "send-notification" 30 256
generate_endpoint "get-communication-logs" "notifications" "get-communication-logs" 30 256
generate_endpoint "manage-email-preferences" "notifications" "manage-email-preferences" 30 256

# Jobs endpoints
generate_endpoint "process-background-jobs" "jobs" "process-background-jobs" 300 512
generate_endpoint "list-background-jobs" "jobs" "list-background-jobs" 30 256
generate_endpoint "execute-scheduled-job" "jobs" "execute-scheduled-job" 300 512
generate_endpoint "scheduled-scan-executor" "jobs" "scheduled-scan-executor" 300 512

# Storage endpoints
generate_endpoint "storage-download" "storage" "storage-handlers" 60 256
generate_endpoint "storage-delete" "storage" "storage-handlers" 30 256
generate_endpoint "upload-attachment" "storage" "storage-handlers" 60 256

# Integrations endpoints
generate_endpoint "create-jira-ticket" "integrations" "create-jira-ticket" 60 256

# User endpoints
generate_endpoint "notification-settings" "user" "notification-settings" 30 256

# System endpoints
generate_endpoint "db-init" "system" "db-init" 300 512

# Output footer
cat << 'FOOTER'

Outputs:
  EndpointCount:
    Description: Number of API Gateway endpoints created
    Value: "140+"
    
  DeploymentNote:
    Description: Deployment instructions
    Value: "After deploying this stack, create a new API Gateway deployment to activate the endpoints"
FOOTER

echo ""
echo "# Generated $(date '+%Y-%m-%d %H:%M:%S')"
