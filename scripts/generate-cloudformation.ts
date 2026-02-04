#!/usr/bin/env npx tsx
/**
 * EVO Platform - CloudFormation Generator
 * 
 * Generates complete CloudFormation templates for all Lambda functions
 * and API Gateway endpoints based on the handler definitions.
 * 
 * Usage: npx tsx scripts/generate-cloudformation.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// HANDLER DEFINITIONS
// =============================================================================

interface HandlerConfig {
  name: string;           // endpoint name (kebab-case)
  path: string;           // handler path (category/handler-file)
  handler: string;        // handler file name (without .js)
  timeout?: number;       // timeout in seconds (default: 30)
  memory?: number;        // memory in MB (default: 256)
  auth?: 'COGNITO' | 'NONE';  // authentication type
  description?: string;   // optional description
  scheduled?: boolean;    // if true, no API endpoint (internal/scheduled only)
}

const HANDLERS: HandlerConfig[] = [
  // =========================================================================
  // ADMIN HANDLERS
  // =========================================================================
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

  // =========================================================================
  // AI HANDLERS
  // =========================================================================
  { name: 'bedrock-chat', path: 'ai', handler: 'bedrock-chat', timeout: 120, memory: 512 },
  { name: 'check-proactive-notifications', path: 'ai', handler: 'check-proactive-notifications', timeout: 120, scheduled: true },
  { name: 'generate-response', path: 'ai', handler: 'generate-response', timeout: 120, memory: 512, scheduled: true },
  { name: 'get-ai-notifications', path: 'ai', handler: 'get-ai-notifications' },
  { name: 'list-ai-notifications-admin', path: 'ai', handler: 'list-ai-notifications-admin' },
  { name: 'manage-notification-rules', path: 'ai', handler: 'manage-notification-rules' },
  { name: 'send-ai-notification', path: 'ai', handler: 'send-ai-notification' },
  { name: 'update-ai-notification', path: 'ai', handler: 'update-ai-notification' },

  // =========================================================================
  // AUTH HANDLERS
  // =========================================================================
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

  // =========================================================================
  // AWS CREDENTIALS HANDLERS
  // =========================================================================
  { name: 'list-aws-credentials', path: 'aws', handler: 'list-aws-credentials' },
  { name: 'save-aws-credentials', path: 'aws', handler: 'save-aws-credentials' },
  { name: 'update-aws-credentials', path: 'aws', handler: 'update-aws-credentials' },

  // =========================================================================
  // AZURE HANDLERS
  // =========================================================================
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

  // =========================================================================
  // CLOUD UNIFIED HANDLERS
  // =========================================================================
  { name: 'list-cloud-credentials', path: 'cloud', handler: 'list-cloud-credentials' },

  // =========================================================================
  // COST HANDLERS
  // =========================================================================
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

  // =========================================================================
  // DASHBOARD HANDLERS
  // =========================================================================
  { name: 'get-executive-dashboard', path: 'dashboard', handler: 'get-executive-dashboard', timeout: 60, memory: 512 },
  { name: 'get-executive-dashboard-public', path: 'dashboard', handler: 'get-executive-dashboard-public', timeout: 60, memory: 512, auth: 'NONE' },
  { name: 'manage-tv-tokens', path: 'dashboard', handler: 'manage-tv-tokens' },

  // =========================================================================
  // DATA HANDLERS
  // =========================================================================
  { name: 'cleanup-cost-data', path: 'data', handler: 'cleanup-cost-data', timeout: 300, scheduled: true },
  { name: 'mutate-table', path: 'data', handler: 'mutate-table' },
  { name: 'query-table', path: 'data', handler: 'query-table' },
  { name: 'ticket-attachments', path: 'data', handler: 'ticket-attachments', timeout: 60 },
  { name: 'ticket-management', path: 'data', handler: 'ticket-management' },

  // =========================================================================
  // DEBUG HANDLERS (Internal only)
  // =========================================================================
  { name: 'diagnose-cost-dashboard', path: 'debug', handler: 'diagnose-cost-dashboard', scheduled: true },

  // =========================================================================
  // INTEGRATIONS HANDLERS
  // =========================================================================
  { name: 'cloudformation-webhook', path: 'integrations', handler: 'cloudformation-webhook', auth: 'NONE' },
  { name: 'create-jira-ticket', path: 'integrations', handler: 'create-jira-ticket', timeout: 60 },

  // =========================================================================
  // JOBS HANDLERS
  // =========================================================================
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

  // =========================================================================
  // KB HANDLERS
  // =========================================================================
  { name: 'increment-article-helpful', path: 'kb', handler: 'increment-article-helpful' },
  { name: 'increment-article-views', path: 'kb', handler: 'increment-article-views' },
  { name: 'kb-ai-suggestions', path: 'kb', handler: 'kb-ai-suggestions', timeout: 60, memory: 512 },
  { name: 'kb-analytics-dashboard', path: 'kb', handler: 'kb-analytics-dashboard' },
  { name: 'kb-article-tracking', path: 'kb', handler: 'kb-article-tracking', scheduled: true },
  { name: 'kb-export-pdf', path: 'kb', handler: 'kb-export-pdf', timeout: 60, memory: 512 },
  { name: 'track-article-view-detailed', path: 'kb', handler: 'track-article-view-detailed' },

  // =========================================================================
  // LICENSE HANDLERS
  // =========================================================================
  { name: 'admin-sync-license', path: 'license', handler: 'admin-sync-license', timeout: 60 },
  { name: 'cleanup-seats', path: 'license', handler: 'cleanup-seats', timeout: 60, scheduled: true },
  { name: 'configure-license', path: 'license', handler: 'configure-license' },
  { name: 'daily-license-validation', path: 'license', handler: 'daily-license-validation', timeout: 120, scheduled: true },
  { name: 'manage-seat-assignments', path: 'license', handler: 'manage-seat-assignments', scheduled: true },
  { name: 'manage-seats', path: 'license', handler: 'manage-seats' },
  { name: 'scheduled-license-sync', path: 'license', handler: 'scheduled-license-sync', timeout: 120, scheduled: true },
  { name: 'sync-license', path: 'license', handler: 'sync-license', timeout: 60 },
  { name: 'validate-license', path: 'license', handler: 'validate-license' },

  // =========================================================================
  // MAINTENANCE HANDLERS
  // =========================================================================
  { name: 'maintenance-auto-cleanup-stuck-scans', path: 'maintenance', handler: 'auto-cleanup-stuck-scans', timeout: 300, scheduled: true },
  { name: 'cleanup-stuck-scans-simple', path: 'maintenance', handler: 'cleanup-stuck-scans-simple', timeout: 300, scheduled: true },

  // =========================================================================
  // ML HANDLERS
  // =========================================================================
  { name: 'ai-prioritization', path: 'ml', handler: 'ai-prioritization', timeout: 120, memory: 512, scheduled: true },
  { name: 'detect-anomalies', path: 'ml', handler: 'detect-anomalies', timeout: 120, memory: 512 },
  { name: 'generate-ai-insights', path: 'ml', handler: 'generate-ai-insights', timeout: 120, memory: 512, scheduled: true },
  { name: 'intelligent-alerts-analyzer', path: 'ml', handler: 'intelligent-alerts-analyzer', timeout: 120, memory: 512 },
  { name: 'predict-incidents', path: 'ml', handler: 'predict-incidents', timeout: 120, memory: 512 },

  // =========================================================================
  // MONITORING HANDLERS
  // =========================================================================
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

  // =========================================================================
  // NOTIFICATIONS HANDLERS
  // =========================================================================
  { name: 'get-communication-logs', path: 'notifications', handler: 'get-communication-logs' },
  { name: 'manage-email-preferences', path: 'notifications', handler: 'manage-email-preferences' },
  { name: 'send-email', path: 'notifications', handler: 'send-email' },
  { name: 'send-notification', path: 'notifications', handler: 'send-notification' },

  // =========================================================================
  // ORGANIZATIONS HANDLERS
  // =========================================================================
  { name: 'create-organization-account', path: 'organizations', handler: 'create-organization-account' },
  { name: 'sync-organization-accounts', path: 'organizations', handler: 'sync-organization-accounts', timeout: 60 },

  // =========================================================================
  // PROFILES HANDLERS
  // =========================================================================
  { name: 'check-organization', path: 'profiles', handler: 'check-organization' },
  { name: 'create-with-organization', path: 'profiles', handler: 'create-with-organization' },
  { name: 'get-user-organization', path: 'profiles', handler: 'get-user-organization' },

  // =========================================================================
  // REPORTS HANDLERS
  // =========================================================================
  { name: 'generate-excel-report', path: 'reports', handler: 'generate-excel-report', timeout: 120, memory: 512 },
  { name: 'generate-pdf-report', path: 'reports', handler: 'generate-pdf-report', timeout: 120, memory: 512 },
  { name: 'generate-remediation-script', path: 'reports', handler: 'generate-remediation-script', timeout: 60 },
  { name: 'generate-security-pdf', path: 'reports', handler: 'generate-security-pdf', timeout: 120, memory: 512 },
  { name: 'security-scan-pdf-export', path: 'reports', handler: 'security-scan-pdf-export', timeout: 120, memory: 512 },

  // =========================================================================
  // SECURITY HANDLERS
  // =========================================================================
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

  // =========================================================================
  // STORAGE HANDLERS
  // =========================================================================
  { name: 'storage-download', path: 'storage', handler: 'storage-handlers', timeout: 60 },
  { name: 'storage-delete', path: 'storage', handler: 'storage-handlers' },
  { name: 'upload-attachment', path: 'storage', handler: 'storage-handlers', timeout: 60 },

  // =========================================================================
  // SYSTEM HANDLERS
  // =========================================================================
  { name: 'check-migrations', path: 'system', handler: 'check-migrations', scheduled: true },
  { name: 'db-init', path: 'system', handler: 'db-init', timeout: 300, memory: 512 },
  { name: 'list-tables', path: 'system', handler: 'list-tables', scheduled: true },
  { name: 'run-migrations', path: 'system', handler: 'run-migrations', timeout: 300, scheduled: true },
  { name: 'run-sql-migration', path: 'system', handler: 'run-sql-migration', timeout: 300, scheduled: true },

  // =========================================================================
  // USER HANDLERS
  // =========================================================================
  { name: 'notification-settings', path: 'user', handler: 'notification-settings' },

  // =========================================================================
  // WEBSOCKET HANDLERS
  // =========================================================================
  { name: 'websocket-connect', path: 'websocket', handler: 'connect', auth: 'NONE' },
  { name: 'websocket-disconnect', path: 'websocket', handler: 'disconnect', auth: 'NONE' },
];

// =============================================================================
// CONSTANTS
// =============================================================================

// Lambda Configuration Defaults
const DEFAULT_TIMEOUT = 30;
const DEFAULT_MEMORY = 256;
const NODEJS_RUNTIME = 'nodejs18.x';

// Database Configuration
const DATABASE_NAME = 'evouds';
const DATABASE_SCHEMA = 'public';
const DATABASE_PORT = 5432;
const DATABASE_SSL_MODE = 'require';

// Output Configuration
const OUTPUT_FILENAME = 'evo-complete-stack.yaml';
const OUTPUT_DIR = 'cloudformation';

// CORS Configuration
const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'X-API-Key',
  'X-Request-ID',
  'X-CSRF-Token',
  'X-Correlation-ID',
  'X-Amz-Date',
  'X-Amz-Security-Token',
  'X-Impersonate-Organization',
] as const;

const CORS_ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] as const;

const CORS_HEADERS = CORS_ALLOWED_HEADERS.join(',');
const CORS_METHODS = CORS_ALLOWED_METHODS.join(',');

// Computed statistics (lazy-initialized, cached after first access)
const STATS = (() => {
  let cached: { total: number; api: number; scheduled: number } | null = null;
  
  const compute = () => {
    if (!cached) {
      const scheduled = HANDLERS.filter(h => h.scheduled).length;
      cached = {
        total: HANDLERS.length,
        api: HANDLERS.length - scheduled,
        scheduled,
      };
    }
    return cached;
  };
  
  return {
    get totalHandlers() { return compute().total; },
    get apiEndpoints() { return compute().api; },
    get scheduledHandlers() { return compute().scheduled; },
  };
})();

// =============================================================================
// CLOUDFORMATION GENERATOR
// =============================================================================

/**
 * Converts kebab-case to PascalCase for CloudFormation resource names
 * @example toPascalCase('my-function-name') => 'MyFunctionName'
 */
function toPascalCase(str: string): string {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Generates CloudFormation YAML for a Lambda function resource
 */
function generateLambdaFunction(config: HandlerConfig): string {
  const resourceName = toPascalCase(config.name);
  const timeout = config.timeout ?? DEFAULT_TIMEOUT;
  const memory = config.memory ?? DEFAULT_MEMORY;
  
  return `
  ${resourceName}Function:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: !Sub '\${ProjectName}-\${Environment}-${config.name}'
      Runtime: ${NODEJS_RUNTIME}
      Handler: ${config.handler}.handler
      Code:
        S3Bucket: !Ref LambdaCodeBucket
        S3Key: handlers/${config.path}/${config.handler}.zip
      Role: !Ref LambdaExecutionRoleArn
      Timeout: ${timeout}
      MemorySize: ${memory}
      VpcConfig:
        SecurityGroupIds: [!Ref LambdaSecurityGroupId]
        SubnetIds: [!Ref PrivateSubnet1Id, !Ref PrivateSubnet2Id]
      Layers: [!Ref LambdaLayerArn]
      Environment:
        Variables:
          DATABASE_URL: !Sub 
            - 'postgresql://\${Username}:\${Password}@\${Host}:${DATABASE_PORT}/${DATABASE_NAME}?schema=${DATABASE_SCHEMA}&sslmode=${DATABASE_SSL_MODE}'
            - Username: !Sub '{{resolve:secretsmanager:\${DatabaseSecretArn}:SecretString:username}}'
              Password: !Sub '{{resolve:secretsmanager:\${DatabaseSecretArn}:SecretString:password}}'
              Host: !Ref DatabaseEndpoint
          NODE_PATH: /opt/nodejs/node_modules
          COGNITO_USER_POOL_ID: !Ref CognitoUserPoolId`;
}

/**
 * Generates CloudFormation YAML for API Gateway endpoint (Resource + Methods + Permission)
 * Returns empty string for scheduled/internal handlers (no public endpoint needed)
 */
function generateApiEndpoint(config: HandlerConfig): string {
  // Skip API endpoint for scheduled/internal handlers
  if (config.scheduled) {
    return '';
  }

  const resourceName = toPascalCase(config.name);
  const isPublicEndpoint = config.auth === 'NONE';
  const authType = isPublicEndpoint ? 'NONE' : 'COGNITO_USER_POOLS';
  const authorizerLine = isPublicEndpoint ? '' : `
      AuthorizerId: !Ref AuthorizerId`;
  
  return `
  # ---------------------------------------------------------------------------
  # ${config.name.toUpperCase()} ENDPOINT
  # ---------------------------------------------------------------------------
  
  ${resourceName}Resource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref RestApiId
      ParentId: !Ref FunctionsResourceId
      PathPart: ${config.name}

  ${resourceName}OptionsMethod:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref RestApiId
      ResourceId: !Ref ${resourceName}Resource
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

  ${resourceName}PostMethod:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref RestApiId
      ResourceId: !Ref ${resourceName}Resource
      HttpMethod: POST
      AuthorizationType: ${authType}${authorizerLine}
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub 'arn:aws:apigateway:\${AWS::Region}:lambda:path/2015-03-31/functions/\${${resourceName}Function.Arn}/invocations'

  ${resourceName}LambdaPermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref ${resourceName}Function
      Action: lambda:InvokeFunction
      Principal: apigateway.amazonaws.com
      SourceArn: !Sub 'arn:aws:execute-api:\${AWS::Region}:\${AWS::AccountId}:\${RestApiId}/*/POST/api/functions/${config.name}'`;
}


// =============================================================================
// HEADER GENERATOR
// =============================================================================

/**
 * Generates the CloudFormation template header with parameters
 */
function generateHeader(): string {
  return `AWSTemplateFormatVersion: '2010-09-09'
Description: |
  EVO Platform - Complete Lambda Functions and API Gateway Endpoints
  Generated automatically by scripts/generate-cloudformation.ts
  Total handlers: ${STATS.totalHandlers}
  API endpoints: ${STATS.apiEndpoints}
  Internal/Scheduled handlers: ${STATS.scheduledHandlers}

# =============================================================================
# PARAMETERS
# =============================================================================

Parameters:
  ProjectName:
    Type: String
    Default: evo-uds-v3
    Description: Project name prefix for all resources

  Environment:
    Type: String
    Default: production
    AllowedValues: [production, staging, development]
    Description: Deployment environment

  RestApiId:
    Type: String
    Description: API Gateway REST API ID

  FunctionsResourceId:
    Type: String
    Description: API Gateway resource ID for /api/functions

  AuthorizerId:
    Type: String
    Description: API Gateway Cognito Authorizer ID

  LambdaCodeBucket:
    Type: String
    Description: S3 bucket containing Lambda code packages

  LambdaExecutionRoleArn:
    Type: String
    Description: ARN of the Lambda execution IAM role

  LambdaSecurityGroupId:
    Type: String
    Description: Security Group ID for Lambda functions

  PrivateSubnet1Id:
    Type: String
    Description: Private Subnet 1 ID for Lambda VPC config

  PrivateSubnet2Id:
    Type: String
    Description: Private Subnet 2 ID for Lambda VPC config

  LambdaLayerArn:
    Type: String
    Description: ARN of the Lambda layer with dependencies

  DatabaseSecretArn:
    Type: String
    Description: ARN of the Secrets Manager secret for database credentials

  DatabaseEndpoint:
    Type: String
    Description: RDS Proxy endpoint for database connections

  CognitoUserPoolId:
    Type: String
    Description: Cognito User Pool ID for authentication

# =============================================================================
# RESOURCES
# =============================================================================

Resources:`;
}

// =============================================================================
// OUTPUTS GENERATOR
// =============================================================================

/**
 * Generates CloudFormation outputs for all resources
 */
function generateOutputs(): string {
  const lambdaOutputs = HANDLERS.map(config => {
    const resourceName = toPascalCase(config.name);
    return `
  ${resourceName}FunctionArn:
    Description: ARN of ${config.name} Lambda function
    Value: !GetAtt ${resourceName}Function.Arn
    Export:
      Name: !Sub '\${ProjectName}-\${Environment}-${config.name}-arn'`;
  }).join('');

  const apiOutputs = HANDLERS
    .filter(h => !h.scheduled)
    .map(config => {
      const resourceName = toPascalCase(config.name);
      return `
  ${resourceName}EndpointUrl:
    Description: API endpoint URL for ${config.name}
    Value: !Sub 'https://\${RestApiId}.execute-api.\${AWS::Region}.amazonaws.com/prod/api/functions/${config.name}'`;
    }).join('');

  return `

# =============================================================================
# OUTPUTS
# =============================================================================

Outputs:
  TotalLambdaFunctions:
    Description: Total number of Lambda functions created
    Value: '${STATS.totalHandlers}'

  TotalApiEndpoints:
    Description: Total number of API Gateway endpoints created
    Value: '${STATS.apiEndpoints}'

  TotalScheduledHandlers:
    Description: Total number of scheduled/internal handlers
    Value: '${STATS.scheduledHandlers}'
${lambdaOutputs}
${apiOutputs}`;
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Main entry point - generates the complete CloudFormation template
 */
async function main(): Promise<void> {
  console.log('🚀 EVO Platform CloudFormation Generator');
  console.log('=========================================');
  console.log(`📊 Total handlers: ${STATS.totalHandlers}`);
  console.log(`🌐 API endpoints: ${STATS.apiEndpoints}`);
  console.log(`⏰ Scheduled/Internal: ${STATS.scheduledHandlers}`);
  console.log('');

  // Use array for efficient string building
  const templateParts: string[] = [generateHeader()];

  // Generate Lambda functions
  console.log('📦 Generating Lambda functions...');
  for (const handler of HANDLERS) {
    templateParts.push(generateLambdaFunction(handler));
  }

  // Generate API endpoints (only for non-scheduled handlers)
  console.log('🔗 Generating API Gateway endpoints...');
  for (const handler of HANDLERS) {
    if (!handler.scheduled) {
      templateParts.push(generateApiEndpoint(handler));
    }
  }

  // Generate outputs
  console.log('📤 Generating outputs...');
  templateParts.push(generateOutputs());

  // Write to file
  const outputPath = path.join(__dirname, '..', OUTPUT_DIR, OUTPUT_FILENAME);
  fs.writeFileSync(outputPath, templateParts.join(''), 'utf8');

  console.log('');
  console.log('✅ CloudFormation template generated successfully!');
  console.log(`📁 Output: ${outputPath}`);
  console.log('');

  // Print summary by category
  const categories = new Map<string, number>();
  for (const handler of HANDLERS) {
    const count = categories.get(handler.path) ?? 0;
    categories.set(handler.path, count + 1);
  }

  console.log('📊 Handlers by category:');
  console.log('------------------------');
  for (const [category, count] of Array.from(categories.entries()).sort()) {
    console.log(`  ${category}: ${count}`);
  }
}

// Run the generator
main().catch(console.error);
