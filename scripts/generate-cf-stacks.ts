#!/usr/bin/env npx tsx
/**
 * EVO Platform - CloudFormation Nested Stacks Generator
 * 
 * Generates CloudFormation templates split into nested stacks to avoid
 * the 500 resource limit per stack.
 * 
 * Creates:
 * - evo-master-stack.yaml (main stack with nested stack references)
 * - evo-lambdas-{category}.yaml (Lambda functions by category)
 * - evo-api-{category}.yaml (API Gateway endpoints by category)
 * 
 * Usage: npx tsx scripts/generate-cf-stacks.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface HandlerConfig {
  name: string;
  path: string;
  handler: string;
  timeout?: number;
  memory?: number;
  auth?: 'COGNITO' | 'NONE';
  scheduled?: boolean;
}

// All handlers from generate-cloudformation.ts
const HANDLERS: HandlerConfig[] = [
  // ADMIN
  { name: 'admin-manage-user', path: 'admin', handler: 'admin-manage-user' },
  { name: 'automated-cleanup-stuck-scans', path: 'admin', handler: 'automated-cleanup-stuck-scans', timeout: 300, scheduled: true },
  { name: 'cleanup-stuck-scans', path: 'admin', handler: 'cleanup-stuck-scans', timeout: 300, scheduled: true },
  { name: 'create-cognito-user', path: 'admin', handler: 'create-cognito-user' },
  { name: 'create-user', path: 'admin', handler: 'create-user' },
  { name: 'deactivate-demo-mode', path: 'admin', handler: 'deactivate-demo-mode' },
  { name: 'debug-cloudtrail', path: 'admin', handler: 'debug-cloudtrail', scheduled: true },
  { name: 'direct-cleanup', path: 'admin', handler: 'direct-cleanup', scheduled: true },
  { name: 'disable-cognito-user', path: 'admin', handler: 'disable-cognito-user' },
  { name: 'log-audit', path: 'admin', handler: 'log-audit' },
  { name: 'manage-demo-mode', path: 'admin', handler: 'manage-demo-mode' },
  { name: 'manage-email-templates', path: 'admin', handler: 'manage-email-templates' },
  { name: 'manage-organizations', path: 'admin', handler: 'manage-organizations' },
  { name: 'run-migration', path: 'admin', handler: 'run-migration', timeout: 300, scheduled: true },
  { name: 'run-sql', path: 'admin', handler: 'run-sql', scheduled: true },
  { name: 'setup-license-config', path: 'admin', handler: 'setup-license-config', scheduled: true },
  // AI
  { name: 'bedrock-chat', path: 'ai', handler: 'bedrock-chat', timeout: 120, memory: 512 },
  { name: 'check-proactive-notifications', path: 'ai', handler: 'check-proactive-notifications', timeout: 120, scheduled: true },
  { name: 'generate-response', path: 'ai', handler: 'generate-response', timeout: 120, memory: 512, scheduled: true },
  { name: 'get-ai-notifications', path: 'ai', handler: 'get-ai-notifications' },
  { name: 'list-ai-notifications-admin', path: 'ai', handler: 'list-ai-notifications-admin' },
  { name: 'manage-notification-rules', path: 'ai', handler: 'manage-notification-rules' },
  { name: 'send-ai-notification', path: 'ai', handler: 'send-ai-notification' },
  { name: 'update-ai-notification', path: 'ai', handler: 'update-ai-notification' },
  // AUTH
  { name: 'delete-webauthn-credential', path: 'auth', handler: 'delete-webauthn-credential' },
  { name: 'forgot-password', path: 'auth', handler: 'forgot-password', auth: 'NONE' },
  { name: 'mfa-enroll', path: 'auth', handler: 'mfa-handlers' },
  { name: 'mfa-check', path: 'auth', handler: 'mfa-handlers' },
  { name: 'mfa-challenge-verify', path: 'auth', handler: 'mfa-handlers' },
  { name: 'mfa-verify-login', path: 'auth', handler: 'mfa-handlers' },
  { name: 'mfa-list-factors', path: 'auth', handler: 'mfa-handlers' },
  { name: 'mfa-unenroll', path: 'auth', handler: 'mfa-handlers' },
  { name: 'self-register', path: 'auth', handler: 'self-register', timeout: 60, auth: 'NONE' },
  { name: 'verify-tv-token', path: 'auth', handler: 'verify-tv-token' },
  { name: 'webauthn-authenticate', path: 'auth', handler: 'webauthn-authenticate' },
  { name: 'webauthn-check', path: 'auth', handler: 'webauthn-check-standalone' },
  { name: 'webauthn-register', path: 'auth', handler: 'webauthn-register' },
  // AWS
  { name: 'list-aws-credentials', path: 'aws', handler: 'list-aws-credentials' },
  { name: 'save-aws-credentials', path: 'aws', handler: 'save-aws-credentials' },
  { name: 'update-aws-credentials', path: 'aws', handler: 'update-aws-credentials' },
  // AZURE
  { name: 'azure-activity-logs', path: 'azure', handler: 'azure-activity-logs', timeout: 60 },
  { name: 'azure-compliance-scan', path: 'azure', handler: 'azure-compliance-scan', timeout: 300, memory: 1024 },
  { name: 'azure-cost-optimization', path: 'azure', handler: 'azure-cost-optimization', timeout: 120, memory: 512 },
  { name: 'azure-defender-scan', path: 'azure', handler: 'azure-defender-scan', timeout: 120, memory: 512 },
  { name: 'azure-detect-anomalies', path: 'azure', handler: 'azure-detect-anomalies', timeout: 120, memory: 512 },
  { name: 'azure-fetch-costs', path: 'azure', handler: 'azure-fetch-costs', timeout: 120, memory: 512 },
  { name: 'azure-fetch-edge-services', path: 'azure', handler: 'azure-fetch-edge-services', timeout: 60 },
  { name: 'azure-fetch-monitor-metrics', path: 'azure', handler: 'azure-fetch-monitor-metrics', timeout: 60 },
  { name: 'azure-oauth-callback', path: 'azure', handler: 'azure-oauth-callback', timeout: 60 },
  { name: 'azure-oauth-initiate', path: 'azure', handler: 'azure-oauth-initiate' },
  { name: 'azure-oauth-refresh', path: 'azure', handler: 'azure-oauth-refresh' },
  { name: 'azure-oauth-revoke', path: 'azure', handler: 'azure-oauth-revoke' },
  { name: 'azure-reservations-analyzer', path: 'azure', handler: 'azure-reservations-analyzer', timeout: 120, memory: 512 },
  { name: 'azure-resource-inventory', path: 'azure', handler: 'azure-resource-inventory', timeout: 120, memory: 512 },
  { name: 'azure-security-scan', path: 'azure', handler: 'azure-security-scan', timeout: 300, memory: 1024 },
  { name: 'azure-well-architected-scan', path: 'azure', handler: 'azure-well-architected-scan', timeout: 300, memory: 512 },
  { name: 'delete-azure-credentials', path: 'azure', handler: 'delete-azure-credentials' },
  { name: 'list-azure-credentials', path: 'azure', handler: 'list-azure-credentials' },
  { name: 'save-azure-credentials', path: 'azure', handler: 'save-azure-credentials' },
  { name: 'start-azure-security-scan', path: 'azure', handler: 'start-azure-security-scan', timeout: 60 },
  { name: 'validate-azure-credentials', path: 'azure', handler: 'validate-azure-credentials', timeout: 60 },
  { name: 'validate-azure-permissions', path: 'azure', handler: 'validate-azure-permissions', timeout: 60 },
  // CLOUD
  { name: 'list-cloud-credentials', path: 'cloud', handler: 'list-cloud-credentials' },
  // COST
  { name: 'analyze-ri-sp', path: 'cost', handler: 'analyze-ri-sp', timeout: 300, memory: 512 },
  { name: 'budget-forecast', path: 'cost', handler: 'budget-forecast', timeout: 120, memory: 512 },
  { name: 'cost-optimization', path: 'cost', handler: 'cost-optimization', timeout: 300, memory: 512 },
  { name: 'fetch-daily-costs', path: 'cost', handler: 'fetch-daily-costs', timeout: 300, memory: 512 },
  { name: 'finops-copilot', path: 'cost', handler: 'finops-copilot-v2', timeout: 120, memory: 512 },
  { name: 'generate-cost-forecast', path: 'cost', handler: 'generate-cost-forecast', timeout: 120, memory: 512 },
  { name: 'get-ri-sp-analysis', path: 'cost', handler: 'get-ri-sp-analysis' },
  { name: 'get-ri-sp-data', path: 'cost', handler: 'get-ri-sp-data' },
  { name: 'list-ri-sp-history', path: 'cost', handler: 'list-ri-sp-history' },
  { name: 'ml-waste-detection', path: 'cost', handler: 'ml-waste-detection', timeout: 120, memory: 512 },
  { name: 'ri-sp-analyzer', path: 'cost', handler: 'ri-sp-analyzer', timeout: 300, memory: 512 },
  { name: 'save-ri-sp-analysis', path: 'cost', handler: 'save-ri-sp-analysis', scheduled: true },
  // DASHBOARD
  { name: 'get-executive-dashboard', path: 'dashboard', handler: 'get-executive-dashboard', timeout: 60, memory: 512 },
  { name: 'get-executive-dashboard-public', path: 'dashboard', handler: 'get-executive-dashboard-public', timeout: 60, memory: 512, auth: 'NONE' },
  { name: 'manage-tv-tokens', path: 'dashboard', handler: 'manage-tv-tokens' },
  { name: 'manage-cloud-budget', path: 'cost', handler: 'manage-cloud-budget' },
  // DATA
  { name: 'cleanup-cost-data', path: 'data', handler: 'cleanup-cost-data', timeout: 300, scheduled: true },
  { name: 'mutate-table', path: 'data', handler: 'mutate-table' },
  { name: 'query-table', path: 'data', handler: 'query-table' },
  { name: 'ticket-attachments', path: 'data', handler: 'ticket-attachments', timeout: 60 },
  { name: 'ticket-management', path: 'data', handler: 'ticket-management' },
  // DEBUG
  { name: 'diagnose-cost-dashboard', path: 'debug', handler: 'diagnose-cost-dashboard', scheduled: true },
  // INTEGRATIONS
  { name: 'cloudformation-webhook', path: 'integrations', handler: 'cloudformation-webhook', auth: 'NONE' },
  { name: 'create-jira-ticket', path: 'integrations', handler: 'create-jira-ticket', timeout: 60 },
  // JOBS
  { name: 'auto-cleanup-stuck-scans', path: 'jobs', handler: 'auto-cleanup-stuck-scans', timeout: 300, scheduled: true },
  { name: 'cleanup-expired-external-ids', path: 'jobs', handler: 'cleanup-expired-external-ids', timeout: 60, scheduled: true },
  { name: 'cleanup-expired-oauth-states', path: 'jobs', handler: 'cleanup-expired-oauth-states', timeout: 60, scheduled: true },
  { name: 'cleanup-stuck-scans', path: 'jobs', handler: 'cleanup-stuck-scans', timeout: 300, scheduled: true },
  { name: 'execute-scheduled-job', path: 'jobs', handler: 'execute-scheduled-job', timeout: 300, memory: 512 },
  { name: 'initial-data-load', path: 'jobs', handler: 'initial-data-load', timeout: 300, scheduled: true },
  { name: 'list-background-jobs', path: 'jobs', handler: 'list-background-jobs' },
  { name: 'process-background-jobs', path: 'jobs', handler: 'process-background-jobs', timeout: 300, memory: 512 },
  { name: 'process-events', path: 'jobs', handler: 'process-events', timeout: 300, scheduled: true },
  { name: 'scheduled-scan-executor', path: 'jobs', handler: 'scheduled-scan-executor', timeout: 300, memory: 512 },
  { name: 'scheduled-view-refresh', path: 'jobs', handler: 'scheduled-view-refresh', timeout: 300, scheduled: true },
  { name: 'send-scheduled-emails', path: 'jobs', handler: 'send-scheduled-emails', timeout: 120, scheduled: true },
  { name: 'sync-resource-inventory', path: 'jobs', handler: 'sync-resource-inventory', timeout: 300, scheduled: true },
  // KB
  { name: 'increment-article-helpful', path: 'kb', handler: 'increment-article-helpful' },
  { name: 'increment-article-views', path: 'kb', handler: 'increment-article-views' },
  { name: 'kb-ai-suggestions', path: 'kb', handler: 'kb-ai-suggestions', timeout: 60, memory: 512 },
  { name: 'kb-analytics-dashboard', path: 'kb', handler: 'kb-analytics-dashboard' },
  { name: 'kb-article-tracking', path: 'kb', handler: 'kb-article-tracking', scheduled: true },
  { name: 'kb-export-pdf', path: 'kb', handler: 'kb-export-pdf', timeout: 60, memory: 512 },
  { name: 'track-article-view-detailed', path: 'kb', handler: 'track-article-view-detailed' },
  // LICENSE
  { name: 'admin-sync-license', path: 'license', handler: 'admin-sync-license', timeout: 60 },
  { name: 'cleanup-seats', path: 'license', handler: 'cleanup-seats', timeout: 60, scheduled: true },
  { name: 'configure-license', path: 'license', handler: 'configure-license' },
  { name: 'daily-license-validation', path: 'license', handler: 'daily-license-validation', timeout: 120, scheduled: true },
  { name: 'manage-seat-assignments', path: 'license', handler: 'manage-seat-assignments', scheduled: true },
  { name: 'manage-seats', path: 'license', handler: 'manage-seats' },
  { name: 'scheduled-license-sync', path: 'license', handler: 'scheduled-license-sync', timeout: 120, scheduled: true },
  { name: 'sync-license', path: 'license', handler: 'sync-license', timeout: 60 },
  { name: 'validate-license', path: 'license', handler: 'validate-license' },
  // MAINTENANCE
  { name: 'maintenance-auto-cleanup-stuck-scans', path: 'maintenance', handler: 'auto-cleanup-stuck-scans', timeout: 300, scheduled: true },
  { name: 'cleanup-stuck-scans-simple', path: 'maintenance', handler: 'cleanup-stuck-scans-simple', timeout: 300, scheduled: true },
  // ML
  { name: 'ai-prioritization', path: 'ml', handler: 'ai-prioritization', timeout: 120, memory: 512, scheduled: true },
  { name: 'detect-anomalies', path: 'ml', handler: 'detect-anomalies', timeout: 120, memory: 512 },
  { name: 'generate-ai-insights', path: 'ml', handler: 'generate-ai-insights', timeout: 120, memory: 512, scheduled: true },
  { name: 'intelligent-alerts-analyzer', path: 'ml', handler: 'intelligent-alerts-analyzer', timeout: 120, memory: 512 },
  { name: 'predict-incidents', path: 'ml', handler: 'predict-incidents', timeout: 120, memory: 512 },
  // MONITORING
  { name: 'alerts', path: 'monitoring', handler: 'alerts' },
  { name: 'auto-alerts', path: 'monitoring', handler: 'auto-alerts' },
  { name: 'aws-realtime-metrics', path: 'monitoring', handler: 'aws-realtime-metrics', timeout: 60, memory: 512 },
  { name: 'check-alert-rules', path: 'monitoring', handler: 'check-alert-rules' },
  { name: 'endpoint-monitor-check', path: 'monitoring', handler: 'endpoint-monitor-check' },
  { name: 'error-aggregator', path: 'monitoring', handler: 'error-aggregator', scheduled: true },
  { name: 'fetch-cloudwatch-metrics', path: 'monitoring', handler: 'fetch-cloudwatch-metrics', timeout: 60 },
  { name: 'fetch-edge-services', path: 'monitoring', handler: 'fetch-edge-services', timeout: 60 },
  { name: 'generate-error-fix-prompt', path: 'monitoring', handler: 'generate-error-fix-prompt' },
  { name: 'get-lambda-health', path: 'monitoring', handler: 'get-lambda-health' },
  { name: 'get-platform-metrics', path: 'monitoring', handler: 'get-platform-metrics', timeout: 60 },
  { name: 'get-recent-errors', path: 'monitoring', handler: 'get-recent-errors' },
  { name: 'health-check', path: 'monitoring', handler: 'health-check', scheduled: true },
  { name: 'lambda-health-check', path: 'monitoring', handler: 'lambda-health-check', scheduled: true },
  { name: 'log-frontend-error', path: 'monitoring', handler: 'log-frontend-error', auth: 'NONE' },
  { name: 'monitored-endpoints', path: 'monitoring', handler: 'monitored-endpoints' },
  { name: 'test-lambda-metrics', path: 'monitoring', handler: 'test-lambda-metrics', scheduled: true },
  // NOTIFICATIONS
  { name: 'get-communication-logs', path: 'notifications', handler: 'get-communication-logs' },
  { name: 'manage-email-preferences', path: 'notifications', handler: 'manage-email-preferences' },
  { name: 'send-email', path: 'notifications', handler: 'send-email' },
  { name: 'send-notification', path: 'notifications', handler: 'send-notification' },
  // ORGANIZATIONS
  { name: 'create-organization-account', path: 'organizations', handler: 'create-organization-account' },
  { name: 'sync-organization-accounts', path: 'organizations', handler: 'sync-organization-accounts', timeout: 60 },
  // PROFILES
  { name: 'check-organization', path: 'profiles', handler: 'check-organization' },
  { name: 'create-with-organization', path: 'profiles', handler: 'create-with-organization' },
  { name: 'get-user-organization', path: 'profiles', handler: 'get-user-organization' },
  // REPORTS
  { name: 'generate-excel-report', path: 'reports', handler: 'generate-excel-report', timeout: 120, memory: 512 },
  { name: 'generate-pdf-report', path: 'reports', handler: 'generate-pdf-report', timeout: 120, memory: 512 },
  { name: 'generate-remediation-script', path: 'reports', handler: 'generate-remediation-script', timeout: 60 },
  { name: 'generate-security-pdf', path: 'reports', handler: 'generate-security-pdf', timeout: 120, memory: 512 },
  { name: 'security-scan-pdf-export', path: 'reports', handler: 'security-scan-pdf-export', timeout: 120, memory: 512 },
  // SECURITY
  { name: 'analyze-cloudtrail', path: 'security', handler: 'analyze-cloudtrail', timeout: 300, memory: 512 },
  { name: 'compliance-scan', path: 'security', handler: 'compliance-scan', timeout: 300, memory: 1024 },
  { name: 'create-remediation-ticket', path: 'security', handler: 'create-remediation-ticket', scheduled: true },
  { name: 'drift-detection', path: 'security', handler: 'drift-detection', timeout: 120, memory: 512 },
  { name: 'fetch-cloudtrail', path: 'security', handler: 'fetch-cloudtrail', timeout: 60 },
  { name: 'get-compliance-history', path: 'security', handler: 'get-compliance-history' },
  { name: 'get-compliance-scan-status', path: 'security', handler: 'get-compliance-scan-status' },
  { name: 'get-findings', path: 'security', handler: 'get-findings' },
  { name: 'get-security-posture', path: 'security', handler: 'get-security-posture' },
  { name: 'guardduty-scan', path: 'security', handler: 'guardduty-scan', timeout: 120, memory: 512 },
  { name: 'iam-behavior-analysis', path: 'security', handler: 'iam-behavior-analysis', timeout: 120, memory: 512, scheduled: true },
  { name: 'iam-deep-analysis', path: 'security', handler: 'iam-deep-analysis', timeout: 120, memory: 512 },
  { name: 'lateral-movement-detection', path: 'security', handler: 'lateral-movement-detection', timeout: 120, memory: 512 },
  { name: 'security-scan', path: 'security', handler: 'security-scan', timeout: 300, memory: 1024 },
  { name: 'start-analyze-cloudtrail', path: 'security', handler: 'start-analyze-cloudtrail', timeout: 60, scheduled: true },
  { name: 'start-cloudtrail-analysis', path: 'security', handler: 'start-cloudtrail-analysis', timeout: 60 },
  { name: 'start-compliance-scan', path: 'security', handler: 'start-compliance-scan', timeout: 60 },
  { name: 'start-security-scan', path: 'security', handler: 'start-security-scan', timeout: 60 },
  { name: 'validate-aws-credentials', path: 'security', handler: 'validate-aws-credentials', timeout: 60 },
  { name: 'validate-permissions', path: 'security', handler: 'validate-permissions', timeout: 60 },
  { name: 'validate-waf-security', path: 'security', handler: 'validate-waf-security', scheduled: true },
  { name: 'waf-dashboard-api', path: 'security', handler: 'waf-dashboard-api' },
  { name: 'waf-log-forwarder', path: 'security', handler: 'waf-log-forwarder', scheduled: true },
  { name: 'waf-log-processor', path: 'security', handler: 'waf-log-processor', scheduled: true },
  { name: 'waf-setup-monitoring', path: 'security', handler: 'waf-setup-monitoring', timeout: 60 },
  { name: 'waf-threat-analyzer', path: 'security', handler: 'waf-threat-analyzer', scheduled: true },
  { name: 'waf-unblock-expired', path: 'security', handler: 'waf-unblock-expired', timeout: 60, scheduled: true },
  { name: 'well-architected-scan', path: 'security', handler: 'well-architected-scan', timeout: 300, memory: 512 },
  // STORAGE
  { name: 'storage-download', path: 'storage', handler: 'storage-handlers', timeout: 60 },
  { name: 'storage-delete', path: 'storage', handler: 'storage-handlers' },
  { name: 'upload-attachment', path: 'storage', handler: 'storage-handlers', timeout: 60 },
  // SYSTEM
  { name: 'check-migrations', path: 'system', handler: 'check-migrations', scheduled: true },
  { name: 'db-init', path: 'system', handler: 'db-init', timeout: 300, memory: 512 },
  { name: 'list-tables', path: 'system', handler: 'list-tables', scheduled: true },
  { name: 'run-migrations', path: 'system', handler: 'run-migrations', timeout: 300, scheduled: true },
  { name: 'run-sql-migration', path: 'system', handler: 'run-sql-migration', timeout: 300, scheduled: true },
  // USER
  { name: 'notification-settings', path: 'user', handler: 'notification-settings' },
  // WEBSOCKET
  { name: 'websocket-connect', path: 'websocket', handler: 'connect', auth: 'NONE' },
  { name: 'websocket-disconnect', path: 'websocket', handler: 'disconnect', auth: 'NONE' },
];

const DEFAULT_TIMEOUT = 30;
const DEFAULT_MEMORY = 256;
const OUTPUT_DIR = 'cloudformation';

const CORS_HEADERS = 'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token,X-Impersonate-Organization';
const CORS_METHODS = 'GET,POST,PUT,DELETE,OPTIONS';

function toPascalCase(str: string): string {
  return str.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

// Group handlers by category
function groupByCategory(handlers: HandlerConfig[]): Map<string, HandlerConfig[]> {
  const groups = new Map<string, HandlerConfig[]>();
  for (const h of handlers) {
    const list = groups.get(h.path) || [];
    list.push(h);
    groups.set(h.path, list);
  }
  return groups;
}

// Generate Lambda function YAML
function genLambda(h: HandlerConfig): string {
  const name = toPascalCase(h.name);
  return `
  ${name}Function:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: !Sub '\${ProjectName}-\${Environment}-${h.name}'
      Runtime: nodejs18.x
      Handler: ${h.handler}.handler
      Code:
        S3Bucket: !Ref LambdaCodeBucket
        S3Key: !Sub 'lambdas/${h.name}.zip'
      Role: !Ref LambdaExecutionRoleArn
      Timeout: ${h.timeout || DEFAULT_TIMEOUT}
      MemorySize: ${h.memory || DEFAULT_MEMORY}
      VpcConfig:
        SecurityGroupIds: !Ref LambdaSecurityGroupIds
        SubnetIds: !Ref PrivateSubnetIds
      Layers:
        - !Ref LambdaLayerArn
      Environment:
        Variables:
          DATABASE_URL: !Ref DatabaseUrl
          NODE_PATH: /opt/nodejs/node_modules
          COGNITO_USER_POOL_ID: !Ref CognitoUserPoolId
          AWS_ACCOUNT_ID: !Ref AWS::AccountId`;
}

// Generate API endpoint YAML (Resource + Methods + Permission)
function genApiEndpoint(h: HandlerConfig): string {
  if (h.scheduled) return '';
  const name = toPascalCase(h.name);
  const authType = h.auth === 'NONE' ? 'NONE' : 'COGNITO_USER_POOLS';
  const authLine = h.auth === 'NONE' ? '' : '\n      AuthorizerId: !Ref AuthorizerId';
  
  return `
  ${name}Resource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref RestApiId
      ParentId: !Ref FunctionsResourceId
      PathPart: ${h.name}

  ${name}OptionsMethod:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref RestApiId
      ResourceId: !Ref ${name}Resource
      HttpMethod: OPTIONS
      AuthorizationType: NONE
      Integration:
        Type: MOCK
        RequestTemplates:
          application/json: '{"statusCode": 200}'
        IntegrationResponses:
          - StatusCode: 200
            ResponseParameters:
              method.response.header.Access-Control-Allow-Headers: "'${CORS_HEADERS}'"
              method.response.header.Access-Control-Allow-Methods: "'${CORS_METHODS}'"
              method.response.header.Access-Control-Allow-Origin: "'*'"
      MethodResponses:
        - StatusCode: 200
          ResponseParameters:
            method.response.header.Access-Control-Allow-Headers: true
            method.response.header.Access-Control-Allow-Methods: true
            method.response.header.Access-Control-Allow-Origin: true

  ${name}PostMethod:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref RestApiId
      ResourceId: !Ref ${name}Resource
      HttpMethod: POST
      AuthorizationType: ${authType}${authLine}
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub 'arn:aws:apigateway:\${AWS::Region}:lambda:path/2015-03-31/functions/\${${name}Function.Arn}/invocations'

  ${name}Permission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref ${name}Function
      Action: lambda:InvokeFunction
      Principal: apigateway.amazonaws.com
      SourceArn: !Sub 'arn:aws:execute-api:\${AWS::Region}:\${AWS::AccountId}:\${RestApiId}/*/POST/api/functions/${h.name}'`;
}


// Generate nested stack parameters header
function genNestedStackParams(): string {
  return `AWSTemplateFormatVersion: '2010-09-09'
Description: EVO Platform - Nested Stack

Parameters:
  ProjectName:
    Type: String
  Environment:
    Type: String
  RestApiId:
    Type: String
  FunctionsResourceId:
    Type: String
  AuthorizerId:
    Type: String
  LambdaCodeBucket:
    Type: String
  LambdaExecutionRoleArn:
    Type: String
  LambdaSecurityGroupIds:
    Type: CommaDelimitedList
  PrivateSubnetIds:
    Type: CommaDelimitedList
  LambdaLayerArn:
    Type: String
  DatabaseUrl:
    Type: String
    NoEcho: true
  CognitoUserPoolId:
    Type: String

Resources:`;
}

// Generate master stack
function genMasterStack(categories: string[], s3Bucket: string): string {
  const nestedStacks = categories.map(cat => `
  ${toPascalCase(cat)}Stack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: !Sub 'https://\${TemplatesBucket}.s3.amazonaws.com/nested/evo-${cat}-stack.yaml'
      Parameters:
        ProjectName: !Ref ProjectName
        Environment: !Ref Environment
        RestApiId: !Ref RestApiId
        FunctionsResourceId: !Ref FunctionsResourceId
        AuthorizerId: !Ref AuthorizerId
        LambdaCodeBucket: !Ref LambdaCodeBucket
        LambdaExecutionRoleArn: !Ref LambdaExecutionRoleArn
        LambdaSecurityGroupIds: !Join [',', !Ref LambdaSecurityGroupIds]
        PrivateSubnetIds: !Join [',', !Ref PrivateSubnetIds]
        LambdaLayerArn: !Ref LambdaLayerArn
        DatabaseUrl: !Ref DatabaseUrl
        CognitoUserPoolId: !Ref CognitoUserPoolId`).join('\n');

  return `AWSTemplateFormatVersion: '2010-09-09'
Description: |
  EVO Platform - Master Stack with Nested Stacks
  Total handlers: ${HANDLERS.length}
  Categories: ${categories.length}

Parameters:
  ProjectName:
    Type: String
    Default: evo-uds-v3
  Environment:
    Type: String
    Default: sandbox
    AllowedValues: [sandbox, production]
  TemplatesBucket:
    Type: String
    Description: S3 bucket containing nested stack templates
  RestApiId:
    Type: String
  FunctionsResourceId:
    Type: String
  AuthorizerId:
    Type: String
  LambdaCodeBucket:
    Type: String
  LambdaExecutionRoleArn:
    Type: String
  LambdaSecurityGroupIds:
    Type: CommaDelimitedList
  PrivateSubnetIds:
    Type: CommaDelimitedList
  LambdaLayerArn:
    Type: String
  DatabaseUrl:
    Type: String
    NoEcho: true
  CognitoUserPoolId:
    Type: String

Resources:
${nestedStacks}

Outputs:
  TotalHandlers:
    Value: '${HANDLERS.length}'
  TotalCategories:
    Value: '${categories.length}'
`;
}

// Main function
async function main(): Promise<void> {
  console.log('🚀 EVO Platform - Nested CloudFormation Generator');
  console.log('='.repeat(50));
  
  const groups = groupByCategory(HANDLERS);
  const categories = Array.from(groups.keys()).sort();
  
  console.log(`📊 Total handlers: ${HANDLERS.length}`);
  console.log(`📁 Categories: ${categories.length}`);
  
  // Create output directory
  const nestedDir = path.join(__dirname, '..', OUTPUT_DIR, 'nested');
  if (!fs.existsSync(nestedDir)) {
    fs.mkdirSync(nestedDir, { recursive: true });
  }
  
  // Generate nested stack for each category
  for (const [category, handlers] of groups) {
    console.log(`  📦 ${category}: ${handlers.length} handlers`);
    
    let content = genNestedStackParams();
    
    // Add Lambda functions
    for (const h of handlers) {
      content += genLambda(h);
    }
    
    // Add API endpoints (only for non-scheduled)
    for (const h of handlers) {
      content += genApiEndpoint(h);
    }
    
    // Add outputs
    content += '\n\nOutputs:';
    for (const h of handlers) {
      const name = toPascalCase(h.name);
      content += `
  ${name}FunctionArn:
    Value: !GetAtt ${name}Function.Arn
    Export:
      Name: !Sub '\${ProjectName}-\${Environment}-${h.name}-arn'`;
    }
    
    const filePath = path.join(nestedDir, `evo-${category}-stack.yaml`);
    fs.writeFileSync(filePath, content, 'utf8');
  }
  
  // Generate master stack
  const masterContent = genMasterStack(categories, 'evo-templates');
  const masterPath = path.join(__dirname, '..', OUTPUT_DIR, 'evo-nested-master.yaml');
  fs.writeFileSync(masterPath, masterContent, 'utf8');
  
  console.log('\n✅ Generated files:');
  console.log(`   📄 ${masterPath}`);
  console.log(`   📁 ${nestedDir}/ (${categories.length} nested stacks)`);
  
  // Count resources per stack
  console.log('\n📊 Resources per nested stack:');
  for (const [category, handlers] of groups) {
    const apiHandlers = handlers.filter(h => !h.scheduled).length;
    const resources = handlers.length + (apiHandlers * 4); // Lambda + (Resource + 2 Methods + Permission)
    console.log(`   ${category}: ${resources} resources`);
  }
}

main().catch(console.error);
