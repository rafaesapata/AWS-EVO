#!/usr/bin/env npx tsx
/**
 * EVO Platform - Complete SAM Template Generator
 * 
 * Generates AWS SAM template with COMPLETE infrastructure:
 * - VPC, Subnets, NAT Gateway, Internet Gateway
 * - RDS PostgreSQL
 * - Cognito User Pool
 * - S3 + CloudFront for Frontend
 * - API Gateway with Cognito Authorizer
 * - Lambda Layer (Prisma + zod)
 * - All Lambda Functions (200+)
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
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE';
}

// All handlers grouped by category
const HANDLERS: HandlerConfig[] = [
  // ADMIN (16)
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
  // AI (8)
  { name: 'bedrock-chat', path: 'ai', handler: 'bedrock-chat', timeout: 120, memory: 512 },
  { name: 'check-proactive-notifications', path: 'ai', handler: 'check-proactive-notifications', timeout: 120, scheduled: true },
  { name: 'generate-response', path: 'ai', handler: 'generate-response', timeout: 120, memory: 512, scheduled: true },
  { name: 'get-ai-notifications', path: 'ai', handler: 'get-ai-notifications' },
  { name: 'list-ai-notifications-admin', path: 'ai', handler: 'list-ai-notifications-admin' },
  { name: 'manage-notification-rules', path: 'ai', handler: 'manage-notification-rules' },
  { name: 'send-ai-notification', path: 'ai', handler: 'send-ai-notification' },
  { name: 'update-ai-notification', path: 'ai', handler: 'update-ai-notification' },
  // AUTH (13)
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
  // AWS (3)
  { name: 'list-aws-credentials', path: 'aws', handler: 'list-aws-credentials' },
  { name: 'save-aws-credentials', path: 'aws', handler: 'save-aws-credentials' },
  { name: 'update-aws-credentials', path: 'aws', handler: 'update-aws-credentials' },
  // AZURE (22)
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
  // CLOUD (1)
  { name: 'list-cloud-credentials', path: 'cloud', handler: 'list-cloud-credentials' },
  // COST (12)
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
  // DASHBOARD (3)
  { name: 'get-executive-dashboard', path: 'dashboard', handler: 'get-executive-dashboard', timeout: 60, memory: 512 },
  { name: 'get-executive-dashboard-public', path: 'dashboard', handler: 'get-executive-dashboard-public', timeout: 60, memory: 512, auth: 'NONE' },
  { name: 'manage-tv-tokens', path: 'dashboard', handler: 'manage-tv-tokens' },
  // DATA (5)
  { name: 'cleanup-cost-data', path: 'data', handler: 'cleanup-cost-data', timeout: 300, scheduled: true },
  { name: 'mutate-table', path: 'data', handler: 'mutate-table' },
  { name: 'query-table', path: 'data', handler: 'query-table' },
  { name: 'ticket-attachments', path: 'data', handler: 'ticket-attachments', timeout: 60 },
  { name: 'ticket-management', path: 'data', handler: 'ticket-management' },
  // DEBUG (1)
  { name: 'diagnose-cost-dashboard', path: 'debug', handler: 'diagnose-cost-dashboard', scheduled: true },
  // INTEGRATIONS (2)
  { name: 'cloudformation-webhook', path: 'integrations', handler: 'cloudformation-webhook', auth: 'NONE' },
  { name: 'create-jira-ticket', path: 'integrations', handler: 'create-jira-ticket', timeout: 60 },
  // JOBS (15)
  { name: 'auto-cleanup-stuck-scans', path: 'jobs', handler: 'auto-cleanup-stuck-scans', timeout: 300, scheduled: true },
  { name: 'cleanup-expired-external-ids', path: 'jobs', handler: 'cleanup-expired-external-ids', timeout: 60, scheduled: true },
  { name: 'cleanup-expired-oauth-states', path: 'jobs', handler: 'cleanup-expired-oauth-states', timeout: 60, scheduled: true },
  { name: 'cleanup-stuck-scans-jobs', path: 'jobs', handler: 'cleanup-stuck-scans', timeout: 300, scheduled: true },
  { name: 'execute-scheduled-job', path: 'jobs', handler: 'execute-scheduled-job', timeout: 300, memory: 512 },
  { name: 'initial-data-load', path: 'jobs', handler: 'initial-data-load', timeout: 300, scheduled: true },
  { name: 'cancel-background-job', path: 'jobs', handler: 'cancel-background-job' },
  { name: 'retry-background-job', path: 'jobs', handler: 'retry-background-job' },
  { name: 'list-background-jobs', path: 'jobs', handler: 'list-background-jobs' },
  { name: 'process-background-jobs', path: 'jobs', handler: 'process-background-jobs', timeout: 300, memory: 512 },
  { name: 'process-events', path: 'jobs', handler: 'process-events', timeout: 300, scheduled: true },
  { name: 'scheduled-scan-executor', path: 'jobs', handler: 'scheduled-scan-executor', timeout: 300, memory: 512 },
  { name: 'scheduled-view-refresh', path: 'jobs', handler: 'scheduled-view-refresh', timeout: 300, scheduled: true },
  { name: 'send-scheduled-emails', path: 'jobs', handler: 'send-scheduled-emails', timeout: 120, scheduled: true },
  { name: 'sync-resource-inventory', path: 'jobs', handler: 'sync-resource-inventory', timeout: 300, scheduled: true },
  // KB (7)
  { name: 'increment-article-helpful', path: 'kb', handler: 'increment-article-helpful' },
  { name: 'increment-article-views', path: 'kb', handler: 'increment-article-views' },
  { name: 'kb-ai-suggestions', path: 'kb', handler: 'kb-ai-suggestions', timeout: 60, memory: 512 },
  { name: 'kb-analytics-dashboard', path: 'kb', handler: 'kb-analytics-dashboard' },
  { name: 'kb-article-tracking', path: 'kb', handler: 'kb-article-tracking', scheduled: true },
  { name: 'kb-export-pdf', path: 'kb', handler: 'kb-export-pdf', timeout: 60, memory: 512 },
  { name: 'track-article-view-detailed', path: 'kb', handler: 'track-article-view-detailed' },
  // LICENSE (9)
  { name: 'admin-sync-license', path: 'license', handler: 'admin-sync-license', timeout: 60 },
  { name: 'cleanup-seats', path: 'license', handler: 'cleanup-seats', timeout: 60, scheduled: true },
  { name: 'configure-license', path: 'license', handler: 'configure-license' },
  { name: 'daily-license-validation', path: 'license', handler: 'daily-license-validation', timeout: 120, scheduled: true },
  { name: 'manage-seat-assignments', path: 'license', handler: 'manage-seat-assignments', scheduled: true },
  { name: 'manage-seats', path: 'license', handler: 'manage-seats' },
  { name: 'scheduled-license-sync', path: 'license', handler: 'scheduled-license-sync', timeout: 120, scheduled: true },
  { name: 'sync-license', path: 'license', handler: 'sync-license', timeout: 60 },
  { name: 'validate-license', path: 'license', handler: 'validate-license' },
  // MAINTENANCE (2)
  { name: 'maintenance-auto-cleanup-stuck-scans', path: 'maintenance', handler: 'auto-cleanup-stuck-scans', timeout: 300, scheduled: true },
  { name: 'cleanup-stuck-scans-simple', path: 'maintenance', handler: 'cleanup-stuck-scans-simple', timeout: 300, scheduled: true },
  // ML (5)
  { name: 'ai-prioritization', path: 'ml', handler: 'ai-prioritization', timeout: 120, memory: 512, scheduled: true },
  { name: 'detect-anomalies', path: 'ml', handler: 'detect-anomalies', timeout: 120, memory: 512 },
  { name: 'generate-ai-insights', path: 'ml', handler: 'generate-ai-insights', timeout: 120, memory: 512, scheduled: true },
  { name: 'intelligent-alerts-analyzer', path: 'ml', handler: 'intelligent-alerts-analyzer', timeout: 120, memory: 512 },
  { name: 'predict-incidents', path: 'ml', handler: 'predict-incidents', timeout: 120, memory: 512 },
  // MONITORING (17)
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
  // NOTIFICATIONS (4)
  { name: 'get-communication-logs', path: 'notifications', handler: 'get-communication-logs' },
  { name: 'manage-email-preferences', path: 'notifications', handler: 'manage-email-preferences' },
  { name: 'send-email', path: 'notifications', handler: 'send-email' },
  { name: 'send-notification', path: 'notifications', handler: 'send-notification' },
  // ORGANIZATIONS (2)
  { name: 'create-organization-account', path: 'organizations', handler: 'create-organization-account' },
  { name: 'sync-organization-accounts', path: 'organizations', handler: 'sync-organization-accounts', timeout: 60 },
  // PROFILES (3)
  { name: 'check-organization', path: 'profiles', handler: 'check-organization' },
  { name: 'create-with-organization', path: 'profiles', handler: 'create-with-organization' },
  { name: 'get-user-organization', path: 'profiles', handler: 'get-user-organization' },
  // REPORTS (5)
  { name: 'generate-excel-report', path: 'reports', handler: 'generate-excel-report', timeout: 120, memory: 512 },
  { name: 'generate-pdf-report', path: 'reports', handler: 'generate-pdf-report', timeout: 120, memory: 512 },
  { name: 'generate-remediation-script', path: 'reports', handler: 'generate-remediation-script', timeout: 60 },
  { name: 'generate-security-pdf', path: 'reports', handler: 'generate-security-pdf', timeout: 120, memory: 512 },
  { name: 'security-scan-pdf-export', path: 'reports', handler: 'security-scan-pdf-export', timeout: 120, memory: 512 },
  // SECURITY (28)
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
  // STORAGE (3)
  { name: 'storage-download', path: 'storage', handler: 'storage-handlers', timeout: 60 },
  { name: 'storage-delete', path: 'storage', handler: 'storage-handlers' },
  { name: 'upload-attachment', path: 'storage', handler: 'storage-handlers', timeout: 60 },
  // SYSTEM (5)
  { name: 'check-migrations', path: 'system', handler: 'check-migrations', scheduled: true },
  { name: 'db-init', path: 'system', handler: 'db-init', timeout: 300, memory: 512 },
  { name: 'list-tables', path: 'system', handler: 'list-tables', scheduled: true },
  { name: 'run-migrations', path: 'system', handler: 'run-migrations', timeout: 300, scheduled: true },
  { name: 'run-sql-migration', path: 'system', handler: 'run-sql-migration', timeout: 300, scheduled: true },
  // USER (1)
  { name: 'notification-settings', path: 'user', handler: 'notification-settings' },
  // WEBSOCKET (2)
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
  const isScheduled = h.scheduled === true;
  const noAuth = h.auth === 'NONE';
  
  let events = '';
  if (!isScheduled) {
    const authConfig = noAuth ? `
            Auth:
              Authorizer: NONE` : '';
    events = `
      Events:
        Api:
          Type: Api
          Properties:
            RestApiId: !Ref Api
            Path: /api/functions/${h.name}
            Method: POST${authConfig}`;
  }
  
  let extraProps = '';
  if (timeout !== 30) {
    extraProps += `
      Timeout: ${timeout}`;
  }
  if (memory !== 256) {
    extraProps += `
      MemorySize: ${memory}`;
  }
  
  // esbuild Metadata for fast builds
  const esbuildMetadata = `
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Minify: true
        Target: es2022
        Sourcemap: false
        EntryPoints:
          - ${h.handler}.ts
        External:
          - '@prisma/client'
          - '.prisma/client'
          - '@aws-sdk/*'`;
  
  return `
  ${name}Function:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub '\${ProjectName}-\${Environment}-${h.name}'
      CodeUri: backend/src/handlers/${h.path}/
      Handler: ${h.handler}.handler${extraProps}${events}${esbuildMetadata}`;
}


function generateTemplate(): string {
  const functions = HANDLERS.map(h => generateFunction(h)).join('\n');
  const apiEndpoints = HANDLERS.filter(h => !h.scheduled).length;
  const scheduledFunctions = HANDLERS.filter(h => h.scheduled).length;
  
  return `AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: |
  EVO Platform - Complete Serverless Application
  ${HANDLERS.length} Lambda Functions + Complete Infrastructure
  Generated by scripts/generate-sam-template.ts

Globals:
  Function:
    Runtime: nodejs20.x
    Timeout: 30
    MemorySize: 256
    Architectures:
      - arm64
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
    Description: Password for RDS PostgreSQL database

Resources:
  # ==========================================================================
  # NETWORKING - VPC, Subnets, NAT Gateway, Internet Gateway
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
    Properties:
      Tags:
        - Key: Name
          Value: !Sub '\${ProjectName}-\${Environment}-igw'

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
      Tags:
        - Key: Name
          Value: !Sub '\${ProjectName}-\${Environment}-public-1'

  PublicSubnet2:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      AvailabilityZone: !Select [1, !GetAZs '']
      CidrBlock: 10.0.2.0/24
      MapPublicIpOnLaunch: true
      Tags:
        - Key: Name
          Value: !Sub '\${ProjectName}-\${Environment}-public-2'

  PrivateSubnet1:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      AvailabilityZone: !Select [0, !GetAZs '']
      CidrBlock: 10.0.10.0/24
      Tags:
        - Key: Name
          Value: !Sub '\${ProjectName}-\${Environment}-private-1'

  PrivateSubnet2:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      AvailabilityZone: !Select [1, !GetAZs '']
      CidrBlock: 10.0.11.0/24
      Tags:
        - Key: Name
          Value: !Sub '\${ProjectName}-\${Environment}-private-2'

  NatGatewayEIP:
    Type: AWS::EC2::EIP
    DependsOn: InternetGatewayAttachment
    Properties:
      Domain: vpc
      Tags:
        - Key: Name
          Value: !Sub '\${ProjectName}-\${Environment}-nat-eip'

  NatGateway:
    Type: AWS::EC2::NatGateway
    Properties:
      AllocationId: !GetAtt NatGatewayEIP.AllocationId
      SubnetId: !Ref PublicSubnet1
      Tags:
        - Key: Name
          Value: !Sub '\${ProjectName}-\${Environment}-nat'

  PublicRouteTable:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref VPC
      Tags:
        - Key: Name
          Value: !Sub '\${ProjectName}-\${Environment}-public-rt'

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
      Tags:
        - Key: Name
          Value: !Sub '\${ProjectName}-\${Environment}-private-rt'

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

  # ==========================================================================
  # SECURITY GROUPS
  # ==========================================================================
  LambdaSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Security group for Lambda functions
      GroupName: !Sub '\${ProjectName}-\${Environment}-lambda-sg'
      VpcId: !Ref VPC
      SecurityGroupEgress:
        - IpProtocol: -1
          CidrIp: 0.0.0.0/0
      Tags:
        - Key: Name
          Value: !Sub '\${ProjectName}-\${Environment}-lambda-sg'

  DatabaseSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Security group for RDS PostgreSQL
      GroupName: !Sub '\${ProjectName}-\${Environment}-rds-sg'
      VpcId: !Ref VPC
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 5432
          ToPort: 5432
          SourceSecurityGroupId: !Ref LambdaSecurityGroup
      Tags:
        - Key: Name
          Value: !Sub '\${ProjectName}-\${Environment}-rds-sg'

  # ==========================================================================
  # DATABASE - RDS PostgreSQL
  # ==========================================================================
  DBSubnetGroup:
    Type: AWS::RDS::DBSubnetGroup
    Properties:
      DBSubnetGroupDescription: Subnet group for RDS PostgreSQL
      DBSubnetGroupName: !Sub '\${ProjectName}-\${Environment}-db-subnet-group'
      SubnetIds:
        - !Ref PrivateSubnet1
        - !Ref PrivateSubnet2
      Tags:
        - Key: Name
          Value: !Sub '\${ProjectName}-\${Environment}-db-subnet-group'

  Database:
    Type: AWS::RDS::DBInstance
    DeletionPolicy: Snapshot
    UpdateReplacePolicy: Snapshot
    Properties:
      DBInstanceIdentifier: !Sub '\${ProjectName}-\${Environment}-postgres'
      DBInstanceClass: db.t3.micro
      Engine: postgres
      EngineVersion: '15'
      AllocatedStorage: 20
      MaxAllocatedStorage: 100
      StorageType: gp3
      DBName: evouds
      MasterUsername: evoadmin
      MasterUserPassword: !Ref DatabasePassword
      VPCSecurityGroups:
        - !Ref DatabaseSecurityGroup
      DBSubnetGroupName: !Ref DBSubnetGroup
      PubliclyAccessible: false
      BackupRetentionPeriod: 7
      MultiAZ: false
      StorageEncrypted: true
      EnablePerformanceInsights: true
      PerformanceInsightsRetentionPeriod: 7
      Tags:
        - Key: Name
          Value: !Sub '\${ProjectName}-\${Environment}-postgres'

  DatabaseSecret:
    Type: AWS::SecretsManager::Secret
    Properties:
      Name: !Sub '\${ProjectName}/\${Environment}/database'
      Description: Database connection string for EVO Platform
      SecretString: !Sub |
        {
          "DATABASE_URL": "postgresql://evoadmin:\${DatabasePassword}@\${Database.Endpoint.Address}:5432/evouds?schema=public",
          "DB_HOST": "\${Database.Endpoint.Address}",
          "DB_PORT": "5432",
          "DB_NAME": "evouds",
          "DB_USER": "evoadmin"
        }
      Tags:
        - Key: Name
          Value: !Sub '\${ProjectName}-\${Environment}-db-secret'

  # ==========================================================================
  # COGNITO - User Pool and Client
  # ==========================================================================
  UserPool:
    Type: AWS::Cognito::UserPool
    Properties:
      UserPoolName: !Sub '\${ProjectName}-\${Environment}-users'
      AutoVerifiedAttributes:
        - email
      UsernameAttributes:
        - email
      UsernameConfiguration:
        CaseSensitive: false
      Policies:
        PasswordPolicy:
          MinimumLength: 8
          RequireLowercase: true
          RequireNumbers: true
          RequireUppercase: true
          RequireSymbols: false
      Schema:
        - Name: email
          AttributeDataType: String
          Mutable: true
          Required: true
        - Name: name
          AttributeDataType: String
          Mutable: true
          Required: false
      AccountRecoverySetting:
        RecoveryMechanisms:
          - Name: verified_email
            Priority: 1
      AdminCreateUserConfig:
        AllowAdminCreateUserOnly: false
      EmailConfiguration:
        EmailSendingAccount: COGNITO_DEFAULT
      UserPoolTags:
        Name: !Sub '\${ProjectName}-\${Environment}-users'

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
      PreventUserExistenceErrors: ENABLED
      SupportedIdentityProviders:
        - COGNITO
      AccessTokenValidity: 1
      IdTokenValidity: 1
      RefreshTokenValidity: 30
      TokenValidityUnits:
        AccessToken: hours
        IdToken: hours
        RefreshToken: days

  # ==========================================================================
  # FRONTEND - S3 Bucket + CloudFront Distribution
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
      CorsConfiguration:
        CorsRules:
          - AllowedHeaders: ['*']
            AllowedMethods: [GET, HEAD]
            AllowedOrigins: ['*']
            MaxAge: 3600
      Tags:
        - Key: Name
          Value: !Sub '\${ProjectName}-\${Environment}-frontend'

  FrontendBucketPolicy:
    Type: AWS::S3::BucketPolicy
    Properties:
      Bucket: !Ref FrontendBucket
      PolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Sid: AllowCloudFrontAccess
            Effect: Allow
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
        Description: OAC for EVO Platform Frontend
        OriginAccessControlOriginType: s3
        SigningBehavior: always
        SigningProtocol: sigv4

  CloudFrontDistribution:
    Type: AWS::CloudFront::Distribution
    Properties:
      DistributionConfig:
        Enabled: true
        Comment: !Sub '\${ProjectName}-\${Environment} Frontend Distribution'
        DefaultRootObject: index.html
        HttpVersion: http2and3
        IPV6Enabled: true
        Origins:
          - Id: S3Origin
            DomainName: !GetAtt FrontendBucket.RegionalDomainName
            OriginAccessControlId: !Ref CloudFrontOriginAccessControl
            S3OriginConfig:
              OriginAccessIdentity: ''
        DefaultCacheBehavior:
          TargetOriginId: S3Origin
          ViewerProtocolPolicy: redirect-to-https
          AllowedMethods:
            - GET
            - HEAD
            - OPTIONS
          CachedMethods:
            - GET
            - HEAD
          ForwardedValues:
            QueryString: false
            Cookies:
              Forward: none
          Compress: true
          DefaultTTL: 86400
          MaxTTL: 31536000
          MinTTL: 0
        CustomErrorResponses:
          - ErrorCode: 403
            ResponseCode: 200
            ResponsePagePath: /index.html
            ErrorCachingMinTTL: 10
          - ErrorCode: 404
            ResponseCode: 200
            ResponsePagePath: /index.html
            ErrorCachingMinTTL: 10
        PriceClass: PriceClass_100
      Tags:
        - Key: Name
          Value: !Sub '\${ProjectName}-\${Environment}-cloudfront'

  # ==========================================================================
  # STORAGE - S3 Bucket for Attachments
  # ==========================================================================
  AttachmentsBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub '\${ProjectName}-\${Environment}-attachments-\${AWS::AccountId}'
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true
      CorsConfiguration:
        CorsRules:
          - AllowedHeaders: ['*']
            AllowedMethods: [GET, PUT, POST, DELETE, HEAD]
            AllowedOrigins: ['*']
            MaxAge: 3600
      LifecycleConfiguration:
        Rules:
          - Id: DeleteOldAttachments
            Status: Enabled
            ExpirationInDays: 365
      Tags:
        - Key: Name
          Value: !Sub '\${ProjectName}-\${Environment}-attachments'

  # ==========================================================================
  # LAMBDA LAYER - Prisma + zod (AWS SDK is in Lambda runtime)
  # ==========================================================================
  DependenciesLayer:
    Type: AWS::Serverless::LayerVersion
    Properties:
      LayerName: !Sub '\${ProjectName}-\${Environment}-deps'
      Description: Prisma Client + zod for EVO Platform
      ContentUri: backend/layers/dependencies/
      CompatibleRuntimes:
        - nodejs18.x
      CompatibleArchitectures:
        - arm64
      RetentionPolicy: Retain

  # ==========================================================================
  # IAM ROLE - Lambda Execution Role
  # ==========================================================================
  LambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub '\${ProjectName}-\${Environment}-lambda-role'
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole
        - arn:aws:iam::aws:policy/AmazonBedrockFullAccess
      Policies:
        - PolicyName: LambdaPolicy
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - logs:CreateLogGroup
                  - logs:CreateLogStream
                  - logs:PutLogEvents
                Resource: '*'
              - Effect: Allow
                Action:
                  - secretsmanager:GetSecretValue
                Resource: !Ref DatabaseSecret
              - Effect: Allow
                Action:
                  - cognito-idp:*
                Resource: !GetAtt UserPool.Arn
              - Effect: Allow
                Action:
                  - s3:GetObject
                  - s3:PutObject
                  - s3:DeleteObject
                  - s3:ListBucket
                Resource:
                  - !GetAtt AttachmentsBucket.Arn
                  - !Sub '\${AttachmentsBucket.Arn}/*'
              - Effect: Allow
                Action:
                  - ses:SendEmail
                  - ses:SendRawEmail
                Resource: '*'
              - Effect: Allow
                Action:
                  - sts:AssumeRole
                Resource: '*'
              - Effect: Allow
                Action:
                  - ce:*
                  - cloudwatch:*
                  - cloudtrail:*
                  - guardduty:*
                  - securityhub:*
                  - iam:*
                  - ec2:Describe*
                  - rds:Describe*
                  - s3:List*
                  - s3:GetBucket*
                  - lambda:List*
                  - lambda:Get*
                  - wafv2:*
                Resource: '*'

  # ==========================================================================
  # API GATEWAY - REST API with Cognito Authorizer
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
        MaxAge: "'600'"
      EndpointConfiguration:
        Type: REGIONAL
      TracingEnabled: true
      Tags:
        Name: !Sub '\${ProjectName}-\${Environment}-api'

  # ==========================================================================
  # LAMBDA FUNCTIONS (${HANDLERS.length} total - ${apiEndpoints} API, ${scheduledFunctions} scheduled)
  # ==========================================================================
${functions}

  # ==========================================================================
  # OUTPUTS
  # ==========================================================================
Outputs:
  # API Gateway
  ApiEndpoint:
    Description: API Gateway endpoint URL
    Value: !Sub 'https://\${Api}.execute-api.\${AWS::Region}.amazonaws.com/prod'
    Export:
      Name: !Sub '\${ProjectName}-\${Environment}-api-endpoint'

  ApiId:
    Description: API Gateway ID
    Value: !Ref Api
    Export:
      Name: !Sub '\${ProjectName}-\${Environment}-api-id'

  # Cognito
  UserPoolId:
    Description: Cognito User Pool ID
    Value: !Ref UserPool
    Export:
      Name: !Sub '\${ProjectName}-\${Environment}-user-pool-id'

  UserPoolClientId:
    Description: Cognito User Pool Client ID
    Value: !Ref UserPoolClient
    Export:
      Name: !Sub '\${ProjectName}-\${Environment}-user-pool-client-id'

  UserPoolArn:
    Description: Cognito User Pool ARN
    Value: !GetAtt UserPool.Arn
    Export:
      Name: !Sub '\${ProjectName}-\${Environment}-user-pool-arn'

  # Database
  DatabaseEndpoint:
    Description: RDS PostgreSQL endpoint
    Value: !GetAtt Database.Endpoint.Address
    Export:
      Name: !Sub '\${ProjectName}-\${Environment}-db-endpoint'

  DatabaseSecretArn:
    Description: Database secret ARN
    Value: !Ref DatabaseSecret
    Export:
      Name: !Sub '\${ProjectName}-\${Environment}-db-secret-arn'

  # VPC
  VpcId:
    Description: VPC ID
    Value: !Ref VPC
    Export:
      Name: !Sub '\${ProjectName}-\${Environment}-vpc-id'

  PrivateSubnet1Id:
    Description: Private Subnet 1 ID
    Value: !Ref PrivateSubnet1
    Export:
      Name: !Sub '\${ProjectName}-\${Environment}-private-subnet-1'

  PrivateSubnet2Id:
    Description: Private Subnet 2 ID
    Value: !Ref PrivateSubnet2
    Export:
      Name: !Sub '\${ProjectName}-\${Environment}-private-subnet-2'

  LambdaSecurityGroupId:
    Description: Lambda Security Group ID
    Value: !Ref LambdaSecurityGroup
    Export:
      Name: !Sub '\${ProjectName}-\${Environment}-lambda-sg'

  # Frontend
  FrontendBucketName:
    Description: S3 bucket for frontend
    Value: !Ref FrontendBucket
    Export:
      Name: !Sub '\${ProjectName}-\${Environment}-frontend-bucket'

  CloudFrontDistributionId:
    Description: CloudFront distribution ID
    Value: !Ref CloudFrontDistribution
    Export:
      Name: !Sub '\${ProjectName}-\${Environment}-cloudfront-id'

  CloudFrontDomainName:
    Description: CloudFront domain name
    Value: !GetAtt CloudFrontDistribution.DomainName
    Export:
      Name: !Sub '\${ProjectName}-\${Environment}-cloudfront-domain'

  # Storage
  AttachmentsBucketName:
    Description: S3 bucket for attachments
    Value: !Ref AttachmentsBucket
    Export:
      Name: !Sub '\${ProjectName}-\${Environment}-attachments-bucket'

  # Lambda Layer
  DependenciesLayerArn:
    Description: Dependencies Layer ARN
    Value: !Ref DependenciesLayer
    Export:
      Name: !Sub '\${ProjectName}-\${Environment}-deps-layer'

  # Summary
  FunctionCount:
    Description: Number of Lambda functions deployed
    Value: ${HANDLERS.length}
`;
}

async function main(): Promise<void> {
  console.log('🚀 EVO Platform - Complete SAM Template Generator');
  console.log('='.repeat(60));
  console.log(`📊 Total handlers: ${HANDLERS.length}`);
  console.log(`🌐 API endpoints: ${HANDLERS.filter(h => !h.scheduled).length}`);
  console.log(`⏰ Scheduled: ${HANDLERS.filter(h => h.scheduled).length}`);
  console.log(`🔓 No auth: ${HANDLERS.filter(h => h.auth === 'NONE').length}`);
  
  const template = generateTemplate();
  
  // Write to sam directory
  const outputPath = path.join(__dirname, '..', 'sam', 'template.yaml');
  fs.writeFileSync(outputPath, template, 'utf8');
  
  console.log(`\n✅ Generated: ${outputPath}`);
  console.log(`📄 Size: ${(template.length / 1024).toFixed(1)} KB`);
  console.log(`\n📋 Infrastructure included:`);
  console.log(`   - VPC with public/private subnets`);
  console.log(`   - NAT Gateway + Internet Gateway`);
  console.log(`   - RDS PostgreSQL (db.t3.micro)`);
  console.log(`   - Cognito User Pool + Client`);
  console.log(`   - S3 + CloudFront for Frontend`);
  console.log(`   - S3 for Attachments`);
  console.log(`   - API Gateway with Cognito Authorizer`);
  console.log(`   - Lambda Layer (Prisma + zod)`);
  console.log(`   - IAM Role for Lambda execution`);
}

main().catch(console.error);
