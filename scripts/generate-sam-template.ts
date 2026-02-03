#!/usr/bin/env npx tsx
/**
 * EVO Platform - SAM Template Generator
 * 
 * Generates AWS SAM template.yaml with all Lambda functions
 * 
 * Usage: npx tsx scripts/generate-sam-template.ts
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

// All handlers
const HANDLERS: HandlerConfig[] = [
  // ADMIN
  { name: 'admin-manage-user', path: 'admin', handler: 'admin-manage-user' },
  { name: 'automated-cleanup-stuck-scans', path: 'admin', handler: 'automated-cleanup-stuck-scans', timeout: 300, scheduled: true },
  { name: 'check-cloudtrail-status', path: 'admin', handler: 'check-cloudtrail-status', scheduled: true },
  { name: 'check-costs', path: 'admin', handler: 'check-costs', scheduled: true },
  { name: 'cleanup-stuck-scans', path: 'admin', handler: 'cleanup-stuck-scans', timeout: 300, scheduled: true },
  { name: 'create-cognito-user', path: 'admin', handler: 'create-cognito-user' },
  { name: 'create-user', path: 'admin', handler: 'create-user' },
  { name: 'deactivate-demo-mode', path: 'admin', handler: 'deactivate-demo-mode' },
  { name: 'debug-cloudtrail', path: 'admin', handler: 'debug-cloudtrail', scheduled: true },
  { name: 'direct-cleanup', path: 'admin', handler: 'direct-cleanup', scheduled: true },
  { name: 'disable-cognito-user', path: 'admin', handler: 'disable-cognito-user' },
  { name: 'fix-role-arn-migration', path: 'admin', handler: 'fix-role-arn-migration', scheduled: true },
  { name: 'log-audit', path: 'admin', handler: 'log-audit' },
  { name: 'manage-demo-mode', path: 'admin', handler: 'manage-demo-mode' },
  { name: 'manage-email-templates', path: 'admin', handler: 'manage-email-templates' },
  { name: 'manage-organizations', path: 'admin', handler: 'manage-organizations' },
  { name: 'run-migration', path: 'admin', handler: 'run-migration', timeout: 300, scheduled: true },
  { name: 'run-migration-standalone', path: 'admin', handler: 'run-migration-standalone', timeout: 300, scheduled: true },
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
  { name: 'delete-webauthn-credential-admin', path: 'auth', handler: 'delete-webauthn-credential-admin', scheduled: true },
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
  { name: 'debug-azure-costs', path: 'azure', handler: 'debug-azure-costs', scheduled: true },
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
  // DATA
  { name: 'cleanup-cost-data', path: 'data', handler: 'cleanup-cost-data', timeout: 300, scheduled: true },
  { name: 'mutate-table', path: 'data', handler: 'mutate-table' },
  { name: 'query-table', path: 'data', handler: 'query-table' },
  { name: 'ticket-attachments', path: 'data', handler: 'ticket-attachments', timeout: 60 },
  { name: 'ticket-management', path: 'data', handler: 'ticket-management' },
  // DEBUG
  { name: 'check-daily-costs', path: 'debug', handler: 'check-daily-costs', scheduled: true },
  { name: 'diagnose-cost-dashboard', path: 'debug', handler: 'diagnose-cost-dashboard', scheduled: true },
  { name: 'investigate-data-mismatch', path: 'debug', handler: 'investigate-data-mismatch', scheduled: true },
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
  { name: 'add-status-column', path: 'system', handler: 'add-status-column', scheduled: true },
  { name: 'check-migrations', path: 'system', handler: 'check-migrations', scheduled: true },
  { name: 'db-init', path: 'system', handler: 'db-init', timeout: 300, memory: 512 },
  { name: 'debug-org-query', path: 'system', handler: 'debug-org-query', scheduled: true },
  { name: 'fix-azure-constraints', path: 'system', handler: 'fix-azure-constraints', scheduled: true },
  { name: 'list-tables', path: 'system', handler: 'list-tables', scheduled: true },
  { name: 'run-migrations', path: 'system', handler: 'run-migrations', timeout: 300, scheduled: true },
  { name: 'run-sql-migration', path: 'system', handler: 'run-sql-migration', timeout: 300, scheduled: true },
  // USER
  { name: 'notification-settings', path: 'user', handler: 'notification-settings' },
  // WEBSOCKET
  { name: 'websocket-connect', path: 'websocket', handler: 'connect', auth: 'NONE' },
  { name: 'websocket-disconnect', path: 'websocket', handler: 'disconnect', auth: 'NONE' },
];


function toPascalCase(str: string): string {
  return str.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

function generateFunction(h: HandlerConfig): string {
  const name = toPascalCase(h.name);
  const timeout = h.timeout || 30;
  const memory = h.memory || 256;
  
  let yaml = `
  ${name}Function:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub '\${ProjectName}-\${Environment}-${h.name}'
      CodeUri: backend/
      Handler: dist/handlers/${h.path}/${h.handler}.handler`;
  
  if (timeout !== 30) {
    yaml += `
      Timeout: ${timeout}`;
  }
  
  if (memory !== 256) {
    yaml += `
      MemorySize: ${memory}`;
  }
  
  // Add API event for non-scheduled functions
  if (!h.scheduled) {
    yaml += `
      Events:
        Api:
          Type: Api
          Properties:
            RestApiId: !Ref Api
            Path: /api/functions/${h.name}
            Method: POST`;
    
    // Auth must be at the same level as Properties, not inside it
    if (h.auth === 'NONE') {
      yaml += `
            Auth:
              Authorizer: NONE`;
    }
  }
  
  return yaml;
}

function generateTemplate(): string {
  const header = `AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: |
  EVO Platform - Serverless Application
  ${HANDLERS.length} Lambda Functions + API Gateway + Infrastructure
  Generated by scripts/generate-sam-template.ts

Globals:
  Function:
    Runtime: nodejs18.x
    Timeout: 30
    MemorySize: 256
    Architectures:
      - x86_64
    VpcConfig:
      SecurityGroupIds:
        - !Ref LambdaSecurityGroup
      SubnetIds:
        - !Ref PrivateSubnet1
        - !Ref PrivateSubnet2
    Environment:
      Variables:
        NODE_PATH: /opt/nodejs/node_modules
        DATABASE_URL: !Sub '{{resolve:secretsmanager:\${DatabaseSecret}:SecretString:DATABASE_URL}}'
        COGNITO_USER_POOL_ID: !Ref UserPool
        AWS_ACCOUNT_ID: !Ref AWS::AccountId
    Layers:
      - !Ref DependenciesLayer

Parameters:
  Environment:
    Type: String
    Default: sandbox
    AllowedValues: [sandbox, production]
  
  ProjectName:
    Type: String
    Default: evo-uds-v3

  DatabasePassword:
    Type: String
    NoEcho: true
    MinLength: 16

Resources:
  # ==========================================================================
  # NETWORKING
  # ==========================================================================
  VPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16
      EnableDnsHostnames: true
      EnableDnsSupport: true
      Tags:
        - Key: Name
          Value: !Sub '\${ProjectName}-\${Environment}-vpc'

  InternetGateway:
    Type: AWS::EC2::InternetGateway

  InternetGatewayAttachment:
    Type: AWS::EC2::VPCGatewayAttachment
    Properties:
      VpcId: !Ref VPC
      InternetGatewayId: !Ref InternetGateway

  PublicSubnet1:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      AvailabilityZone: !Select [0, !GetAZs '']
      CidrBlock: 10.0.1.0/24
      MapPublicIpOnLaunch: true

  PublicSubnet2:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      AvailabilityZone: !Select [1, !GetAZs '']
      CidrBlock: 10.0.2.0/24
      MapPublicIpOnLaunch: true

  PrivateSubnet1:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      AvailabilityZone: !Select [0, !GetAZs '']
      CidrBlock: 10.0.10.0/24

  PrivateSubnet2:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      AvailabilityZone: !Select [1, !GetAZs '']
      CidrBlock: 10.0.11.0/24

  NatGatewayEIP:
    Type: AWS::EC2::EIP
    DependsOn: InternetGatewayAttachment
    Properties:
      Domain: vpc

  NatGateway:
    Type: AWS::EC2::NatGateway
    Properties:
      AllocationId: !GetAtt NatGatewayEIP.AllocationId
      SubnetId: !Ref PublicSubnet1

  PublicRouteTable:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref VPC

  PublicRoute:
    Type: AWS::EC2::Route
    DependsOn: InternetGatewayAttachment
    Properties:
      RouteTableId: !Ref PublicRouteTable
      DestinationCidrBlock: 0.0.0.0/0
      GatewayId: !Ref InternetGateway

  PublicSubnet1RouteTableAssociation:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PublicSubnet1
      RouteTableId: !Ref PublicRouteTable

  PublicSubnet2RouteTableAssociation:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PublicSubnet2
      RouteTableId: !Ref PublicRouteTable

  PrivateRouteTable:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref VPC

  PrivateRoute:
    Type: AWS::EC2::Route
    Properties:
      RouteTableId: !Ref PrivateRouteTable
      DestinationCidrBlock: 0.0.0.0/0
      NatGatewayId: !Ref NatGateway

  PrivateSubnet1RouteTableAssociation:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PrivateSubnet1
      RouteTableId: !Ref PrivateRouteTable

  PrivateSubnet2RouteTableAssociation:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PrivateSubnet2
      RouteTableId: !Ref PrivateRouteTable
`;

  const securityAndDb = `
  # ==========================================================================
  # SECURITY GROUPS
  # ==========================================================================
  LambdaSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Security group for Lambda functions
      VpcId: !Ref VPC
      SecurityGroupEgress:
        - IpProtocol: -1
          CidrIp: 0.0.0.0/0

  DatabaseSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Security group for RDS
      VpcId: !Ref VPC
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 5432
          ToPort: 5432
          SourceSecurityGroupId: !Ref LambdaSecurityGroup

  # ==========================================================================
  # DATABASE
  # ==========================================================================
  DBSubnetGroup:
    Type: AWS::RDS::DBSubnetGroup
    Properties:
      DBSubnetGroupDescription: Subnet group for RDS
      SubnetIds:
        - !Ref PrivateSubnet1
        - !Ref PrivateSubnet2

  Database:
    Type: AWS::RDS::DBInstance
    DeletionPolicy: Snapshot
    Properties:
      DBInstanceIdentifier: !Sub '\${ProjectName}-\${Environment}-postgres'
      DBInstanceClass: db.t3.micro
      Engine: postgres
      EngineVersion: '15'
      AllocatedStorage: 20
      StorageType: gp3
      DBName: evouds
      MasterUsername: evoadmin
      MasterUserPassword: !Ref DatabasePassword
      VPCSecurityGroups:
        - !Ref DatabaseSecurityGroup
      DBSubnetGroupName: !Ref DBSubnetGroup
      PubliclyAccessible: false
      BackupRetentionPeriod: 7

  DatabaseSecret:
    Type: AWS::SecretsManager::Secret
    Properties:
      Name: !Sub '\${ProjectName}/\${Environment}/database'
      SecretString: !Sub |
        {
          "DATABASE_URL": "postgresql://evoadmin:\${DatabasePassword}@\${Database.Endpoint.Address}:5432/evouds?schema=public"
        }

  # ==========================================================================
  # COGNITO
  # ==========================================================================
  UserPool:
    Type: AWS::Cognito::UserPool
    Properties:
      UserPoolName: !Sub '\${ProjectName}-\${Environment}-users'
      AutoVerifiedAttributes: [email]
      UsernameAttributes: [email]
      Policies:
        PasswordPolicy:
          MinimumLength: 8
          RequireLowercase: true
          RequireNumbers: true
          RequireUppercase: true

  UserPoolClient:
    Type: AWS::Cognito::UserPoolClient
    Properties:
      ClientName: !Sub '\${ProjectName}-\${Environment}-web'
      UserPoolId: !Ref UserPool
      GenerateSecret: false
      ExplicitAuthFlows:
        - ALLOW_USER_PASSWORD_AUTH
        - ALLOW_REFRESH_TOKEN_AUTH
        - ALLOW_USER_SRP_AUTH

  # ==========================================================================
  # FRONTEND (S3 + CloudFront)
  # ==========================================================================
  FrontendBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub '\${ProjectName}-\${Environment}-frontend-\${AWS::AccountId}'
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true
      WebsiteConfiguration:
        IndexDocument: index.html
        ErrorDocument: index.html

  FrontendBucketPolicy:
    Type: AWS::S3::BucketPolicy
    Properties:
      Bucket: !Ref FrontendBucket
      PolicyDocument:
        Statement:
          - Effect: Allow
            Principal:
              Service: cloudfront.amazonaws.com
            Action: s3:GetObject
            Resource: !Sub '\${FrontendBucket.Arn}/*'
            Condition:
              StringEquals:
                AWS:SourceArn: !Sub 'arn:aws:cloudfront::\${AWS::AccountId}:distribution/\${CloudFrontDistribution}'

  CloudFrontOriginAccessControl:
    Type: AWS::CloudFront::OriginAccessControl
    Properties:
      OriginAccessControlConfig:
        Name: !Sub '\${ProjectName}-\${Environment}-oac'
        OriginAccessControlOriginType: s3
        SigningBehavior: always
        SigningProtocol: sigv4

  CloudFrontDistribution:
    Type: AWS::CloudFront::Distribution
    Properties:
      DistributionConfig:
        Enabled: true
        DefaultRootObject: index.html
        Origins:
          - Id: S3Origin
            DomainName: !GetAtt FrontendBucket.RegionalDomainName
            OriginAccessControlId: !Ref CloudFrontOriginAccessControl
            S3OriginConfig:
              OriginAccessIdentity: ''
        DefaultCacheBehavior:
          TargetOriginId: S3Origin
          ViewerProtocolPolicy: redirect-to-https
          AllowedMethods: [GET, HEAD, OPTIONS]
          CachedMethods: [GET, HEAD]
          ForwardedValues:
            QueryString: false
            Cookies:
              Forward: none
          Compress: true
        CustomErrorResponses:
          - ErrorCode: 403
            ResponseCode: 200
            ResponsePagePath: /index.html
          - ErrorCode: 404
            ResponseCode: 200
            ResponsePagePath: /index.html
        PriceClass: PriceClass_100

  # ==========================================================================
  # LAMBDA LAYER
  # ==========================================================================
  DependenciesLayer:
    Type: AWS::Serverless::LayerVersion
    Properties:
      LayerName: !Sub '\${ProjectName}-\${Environment}-deps'
      ContentUri: backend/layers/dependencies/
      CompatibleRuntimes:
        - nodejs18.x
      RetentionPolicy: Retain
    Metadata:
      BuildMethod: nodejs18.x

  # ==========================================================================
  # API GATEWAY
  # ==========================================================================
  Api:
    Type: AWS::Serverless::Api
    Properties:
      Name: !Sub '\${ProjectName}-\${Environment}-api'
      StageName: prod
      Auth:
        DefaultAuthorizer: CognitoAuthorizer
        Authorizers:
          CognitoAuthorizer:
            UserPoolArn: !GetAtt UserPool.Arn
      Cors:
        AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
        AllowHeaders: "'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token,X-Impersonate-Organization'"
        AllowOrigin: "'*'"
`;

  // Generate all functions
  const functions = HANDLERS.map(h => generateFunction(h)).join('\n');

  const outputs = `
  # ==========================================================================
  # OUTPUTS
  # ==========================================================================
Outputs:
  ApiEndpoint:
    Description: API Gateway endpoint URL
    Value: !Sub 'https://\${Api}.execute-api.\${AWS::Region}.amazonaws.com/prod'

  UserPoolId:
    Description: Cognito User Pool ID
    Value: !Ref UserPool

  UserPoolClientId:
    Description: Cognito User Pool Client ID
    Value: !Ref UserPoolClient

  DatabaseEndpoint:
    Description: RDS endpoint
    Value: !GetAtt Database.Endpoint.Address

  DatabaseSecretArn:
    Description: Database secret ARN for CI/CD
    Value: !Ref DatabaseSecret

  VpcId:
    Description: VPC ID
    Value: !Ref VPC

  PrivateSubnet1:
    Description: Private Subnet 1 ID
    Value: !Ref PrivateSubnet1

  PrivateSubnet2:
    Description: Private Subnet 2 ID
    Value: !Ref PrivateSubnet2

  LambdaSecurityGroupId:
    Description: Lambda Security Group ID
    Value: !Ref LambdaSecurityGroup

  FrontendBucketName:
    Description: S3 bucket for frontend
    Value: !Ref FrontendBucket

  CloudFrontDistributionId:
    Description: CloudFront distribution ID
    Value: !Ref CloudFrontDistribution

  CloudFrontDomainName:
    Description: CloudFront domain name
    Value: !GetAtt CloudFrontDistribution.DomainName
`;

  return header + securityAndDb + '\n  # ==========================================================================\n  # LAMBDA FUNCTIONS\n  # ==========================================================================' + functions + outputs;
}

async function main(): Promise<void> {
  console.log('🚀 EVO Platform - SAM Template Generator');
  console.log('='.repeat(50));
  console.log(`📊 Total handlers: ${HANDLERS.length}`);
  console.log(`🌐 API endpoints: ${HANDLERS.filter(h => !h.scheduled).length}`);
  console.log(`⏰ Scheduled: ${HANDLERS.filter(h => h.scheduled).length}`);
  
  const template = generateTemplate();
  
  // Write to root directory (not sam/) so paths resolve correctly
  const outputPath = path.join(__dirname, '..', 'template.yaml');
  fs.writeFileSync(outputPath, template, 'utf8');
  
  console.log(`\n✅ Generated: ${outputPath}`);
  console.log(`📄 Size: ${(template.length / 1024).toFixed(1)} KB`);
}

main().catch(console.error);
