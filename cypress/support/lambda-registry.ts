/**
 * EVO Platform - Complete Lambda Registry
 * All 195+ lambdas organized by domain with metadata
 *
 * type: 'http' = has API Gateway route, 'internal' = EventBridge/scheduled/no route
 * auth: 'cognito' = requires JWT, 'none' = public endpoint
 * method: HTTP method (always POST for this platform)
 * safe: true = read-only/safe to call in tests, false = mutates data (test with caution)
 */

export interface LambdaDefinition {
  name: string;
  type: 'http' | 'internal';
  auth: 'cognito' | 'none';
  safe: boolean;
  domain: string;
  description: string;
}

// ============================================================================
// AUTH DOMAIN (12 lambdas)
// ============================================================================
export const AUTH_LAMBDAS: LambdaDefinition[] = [
  { name: 'mfa-enroll', type: 'http', auth: 'cognito', safe: false, domain: 'auth', description: 'Enroll new MFA factor' },
  { name: 'mfa-check', type: 'http', auth: 'cognito', safe: true, domain: 'auth', description: 'Check if user has MFA enabled' },
  { name: 'mfa-challenge-verify', type: 'http', auth: 'cognito', safe: false, domain: 'auth', description: 'Verify MFA challenge code' },
  { name: 'mfa-verify-login', type: 'http', auth: 'cognito', safe: false, domain: 'auth', description: 'Verify MFA during login' },
  { name: 'mfa-list-factors', type: 'http', auth: 'cognito', safe: true, domain: 'auth', description: 'List user MFA factors' },
  { name: 'mfa-unenroll', type: 'http', auth: 'cognito', safe: false, domain: 'auth', description: 'Remove MFA factor' },
  { name: 'webauthn-register', type: 'http', auth: 'cognito', safe: false, domain: 'auth', description: 'Register WebAuthn credential' },
  { name: 'webauthn-authenticate', type: 'http', auth: 'cognito', safe: false, domain: 'auth', description: 'Authenticate with WebAuthn' },
  { name: 'webauthn-check', type: 'http', auth: 'cognito', safe: true, domain: 'auth', description: 'Check WebAuthn status' },
  { name: 'delete-webauthn-credential', type: 'http', auth: 'cognito', safe: false, domain: 'auth', description: 'Delete WebAuthn credential' },
  { name: 'verify-tv-token', type: 'http', auth: 'cognito', safe: true, domain: 'auth', description: 'Verify TV display token' },
  { name: 'self-register', type: 'http', auth: 'none', safe: false, domain: 'auth', description: 'Public self-registration' },
  { name: 'forgot-password', type: 'http', auth: 'none', safe: false, domain: 'auth', description: 'Public forgot password' },
];

// ============================================================================
// PROFILES DOMAIN (3 lambdas)
// ============================================================================
export const PROFILES_LAMBDAS: LambdaDefinition[] = [
  { name: 'check-organization', type: 'http', auth: 'cognito', safe: true, domain: 'auth', description: 'Check user organization' },
  { name: 'create-with-organization', type: 'http', auth: 'cognito', safe: false, domain: 'auth', description: 'Create profile with org' },
  { name: 'get-user-organization', type: 'http', auth: 'cognito', safe: true, domain: 'auth', description: 'Get user organization details' },
];

// ============================================================================
// USER DOMAIN (1 lambda)
// ============================================================================
export const USER_LAMBDAS: LambdaDefinition[] = [
  { name: 'notification-settings', type: 'http', auth: 'cognito', safe: true, domain: 'auth', description: 'User notification settings' },
];

// ============================================================================
// ADMIN DOMAIN (16 lambdas)
// ============================================================================
export const ADMIN_LAMBDAS: LambdaDefinition[] = [
  { name: 'admin-manage-user', type: 'http', auth: 'cognito', safe: false, domain: 'operations', description: 'Admin user management' },
  { name: 'create-cognito-user', type: 'http', auth: 'cognito', safe: false, domain: 'operations', description: 'Create Cognito user' },
  { name: 'create-user', type: 'http', auth: 'cognito', safe: false, domain: 'operations', description: 'Create user in DB' },
  { name: 'disable-cognito-user', type: 'http', auth: 'cognito', safe: false, domain: 'operations', description: 'Disable Cognito user' },
  { name: 'manage-organizations', type: 'http', auth: 'cognito', safe: false, domain: 'operations', description: 'Manage organizations' },
  { name: 'deactivate-demo-mode', type: 'http', auth: 'cognito', safe: false, domain: 'operations', description: 'Deactivate demo mode' },
  { name: 'manage-demo-mode', type: 'http', auth: 'cognito', safe: false, domain: 'operations', description: 'Manage demo mode' },
  { name: 'log-audit', type: 'http', auth: 'cognito', safe: true, domain: 'operations', description: 'Query audit logs' },
  { name: 'manage-email-templates', type: 'http', auth: 'cognito', safe: false, domain: 'operations', description: 'Manage email templates' },
  { name: 'run-sql', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Run SQL (admin only)' },
  { name: 'cleanup-stuck-scans', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Cleanup stuck scans' },
  { name: 'automated-cleanup-stuck-scans', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Auto cleanup stuck scans' },
  { name: 'check-cloudtrail-status', type: 'internal', auth: 'cognito', safe: true, domain: 'operations', description: 'Check CloudTrail status' },
  { name: 'check-costs', type: 'internal', auth: 'cognito', safe: true, domain: 'operations', description: 'Check costs (admin)' },
  { name: 'debug-cloudtrail', type: 'internal', auth: 'cognito', safe: true, domain: 'operations', description: 'Debug CloudTrail' },
  { name: 'direct-cleanup', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Direct cleanup' },
  { name: 'fix-role-arn-migration', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Fix role ARN migration' },
  { name: 'run-migration', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Run DB migration' },
  { name: 'run-migration-standalone', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Run standalone migration' },
  { name: 'setup-license-config', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Setup license config' },
];

// ============================================================================
// AWS CREDENTIALS DOMAIN (3 lambdas)
// ============================================================================
export const AWS_LAMBDAS: LambdaDefinition[] = [
  { name: 'list-aws-credentials', type: 'http', auth: 'cognito', safe: true, domain: 'cloud', description: 'List AWS credentials' },
  { name: 'save-aws-credentials', type: 'http', auth: 'cognito', safe: false, domain: 'cloud', description: 'Save AWS credentials' },
  { name: 'update-aws-credentials', type: 'http', auth: 'cognito', safe: false, domain: 'cloud', description: 'Update AWS credentials' },
];

// ============================================================================
// SECURITY DOMAIN (28 lambdas)
// ============================================================================
export const SECURITY_LAMBDAS: LambdaDefinition[] = [
  { name: 'security-scan', type: 'http', auth: 'cognito', safe: true, domain: 'security', description: 'Run security scan' },
  { name: 'start-security-scan', type: 'http', auth: 'cognito', safe: false, domain: 'security', description: 'Start async security scan' },
  { name: 'compliance-scan', type: 'http', auth: 'cognito', safe: true, domain: 'security', description: 'Run compliance scan' },
  { name: 'start-compliance-scan', type: 'http', auth: 'cognito', safe: false, domain: 'security', description: 'Start async compliance scan' },
  { name: 'get-compliance-scan-status', type: 'http', auth: 'cognito', safe: true, domain: 'security', description: 'Get compliance scan status' },
  { name: 'get-compliance-history', type: 'http', auth: 'cognito', safe: true, domain: 'security', description: 'Get compliance history' },
  { name: 'well-architected-scan', type: 'http', auth: 'cognito', safe: true, domain: 'security', description: 'Well-Architected scan' },
  { name: 'guardduty-scan', type: 'http', auth: 'cognito', safe: true, domain: 'security', description: 'GuardDuty scan' },
  { name: 'get-findings', type: 'http', auth: 'cognito', safe: true, domain: 'security', description: 'Get security findings' },
  { name: 'get-security-posture', type: 'http', auth: 'cognito', safe: true, domain: 'security', description: 'Get security posture' },
  { name: 'validate-aws-credentials', type: 'http', auth: 'cognito', safe: true, domain: 'security', description: 'Validate AWS credentials' },
  { name: 'validate-permissions', type: 'http', auth: 'cognito', safe: true, domain: 'security', description: 'Validate IAM permissions' },
  { name: 'iam-deep-analysis', type: 'http', auth: 'cognito', safe: true, domain: 'security', description: 'IAM deep analysis' },
  { name: 'iam-behavior-analysis', type: 'internal', auth: 'cognito', safe: true, domain: 'security', description: 'IAM behavior analysis' },
  { name: 'lateral-movement-detection', type: 'http', auth: 'cognito', safe: true, domain: 'security', description: 'Lateral movement detection' },
  { name: 'drift-detection', type: 'http', auth: 'cognito', safe: true, domain: 'security', description: 'Drift detection' },
  { name: 'analyze-cloudtrail', type: 'http', auth: 'cognito', safe: true, domain: 'security', description: 'Analyze CloudTrail' },
  { name: 'start-cloudtrail-analysis', type: 'http', auth: 'cognito', safe: false, domain: 'security', description: 'Start CloudTrail analysis' },
  { name: 'start-analyze-cloudtrail', type: 'internal', auth: 'cognito', safe: false, domain: 'security', description: 'Start analyze CloudTrail' },
  { name: 'fetch-cloudtrail', type: 'http', auth: 'cognito', safe: true, domain: 'security', description: 'Fetch CloudTrail events' },
  { name: 'waf-setup-monitoring', type: 'http', auth: 'cognito', safe: false, domain: 'security', description: 'WAF setup monitoring' },
  { name: 'waf-dashboard-api', type: 'http', auth: 'cognito', safe: true, domain: 'security', description: 'WAF dashboard API' },
  { name: 'waf-unblock-expired', type: 'internal', auth: 'cognito', safe: false, domain: 'security', description: 'WAF unblock expired IPs' },
  { name: 'waf-log-forwarder', type: 'internal', auth: 'cognito', safe: false, domain: 'security', description: 'WAF log forwarder' },
  { name: 'waf-log-processor', type: 'internal', auth: 'cognito', safe: false, domain: 'security', description: 'WAF log processor' },
  { name: 'waf-threat-analyzer', type: 'internal', auth: 'cognito', safe: true, domain: 'security', description: 'WAF threat analyzer' },
  { name: 'validate-waf-security', type: 'internal', auth: 'cognito', safe: true, domain: 'security', description: 'Validate WAF security' },
  { name: 'create-remediation-ticket', type: 'internal', auth: 'cognito', safe: false, domain: 'security', description: 'Create remediation ticket' },
];

// ============================================================================
// COST DOMAIN (17 lambdas)
// ============================================================================
export const COST_LAMBDAS: LambdaDefinition[] = [
  { name: 'fetch-daily-costs', type: 'http', auth: 'cognito', safe: true, domain: 'cost', description: 'Fetch daily costs' },
  { name: 'ri-sp-analyzer', type: 'http', auth: 'cognito', safe: true, domain: 'cost', description: 'RI/SP analyzer' },
  { name: 'get-ri-sp-data', type: 'http', auth: 'cognito', safe: true, domain: 'cost', description: 'Get RI/SP data' },
  { name: 'get-ri-sp-analysis', type: 'http', auth: 'cognito', safe: true, domain: 'cost', description: 'Get RI/SP analysis' },
  { name: 'list-ri-sp-history', type: 'http', auth: 'cognito', safe: true, domain: 'cost', description: 'List RI/SP history' },
  { name: 'analyze-ri-sp', type: 'http', auth: 'cognito', safe: true, domain: 'cost', description: 'Analyze RI/SP' },
  { name: 'save-ri-sp-analysis', type: 'internal', auth: 'cognito', safe: false, domain: 'cost', description: 'Save RI/SP analysis' },
  { name: 'cost-optimization', type: 'http', auth: 'cognito', safe: true, domain: 'cost', description: 'Cost optimization' },
  { name: 'budget-forecast', type: 'http', auth: 'cognito', safe: true, domain: 'cost', description: 'Budget forecast' },
  { name: 'generate-cost-forecast', type: 'http', auth: 'cognito', safe: true, domain: 'cost', description: 'Generate cost forecast' },
  { name: 'finops-copilot', type: 'http', auth: 'cognito', safe: true, domain: 'cost', description: 'FinOps copilot' },
  { name: 'ml-waste-detection', type: 'http', auth: 'cognito', safe: true, domain: 'cost', description: 'ML waste detection' },
  { name: 'manage-cloud-budget', type: 'http', auth: 'cognito', safe: false, domain: 'cost', description: 'Manage cloud budget' },
];

// ============================================================================
// ML DOMAIN (5 lambdas)
// ============================================================================
export const ML_LAMBDAS: LambdaDefinition[] = [
  { name: 'intelligent-alerts-analyzer', type: 'http', auth: 'cognito', safe: true, domain: 'cost', description: 'Intelligent alerts analyzer' },
  { name: 'predict-incidents', type: 'http', auth: 'cognito', safe: true, domain: 'cost', description: 'Predict incidents' },
  { name: 'detect-anomalies', type: 'http', auth: 'cognito', safe: true, domain: 'cost', description: 'Detect anomalies' },
  { name: 'ai-prioritization', type: 'internal', auth: 'cognito', safe: true, domain: 'cost', description: 'AI prioritization' },
  { name: 'generate-ai-insights', type: 'internal', auth: 'cognito', safe: true, domain: 'cost', description: 'Generate AI insights' },
];

// ============================================================================
// AI DOMAIN (8 lambdas)
// ============================================================================
export const AI_LAMBDAS: LambdaDefinition[] = [
  { name: 'bedrock-chat', type: 'http', auth: 'cognito', safe: true, domain: 'ai', description: 'Bedrock AI chat' },
  { name: 'get-ai-notifications', type: 'http', auth: 'cognito', safe: true, domain: 'ai', description: 'Get AI notifications' },
  { name: 'update-ai-notification', type: 'http', auth: 'cognito', safe: false, domain: 'ai', description: 'Update AI notification' },
  { name: 'send-ai-notification', type: 'http', auth: 'cognito', safe: false, domain: 'ai', description: 'Send AI notification' },
  { name: 'list-ai-notifications-admin', type: 'http', auth: 'cognito', safe: true, domain: 'ai', description: 'List AI notifications (admin)' },
  { name: 'manage-notification-rules', type: 'http', auth: 'cognito', safe: false, domain: 'ai', description: 'Manage notification rules' },
  { name: 'check-proactive-notifications', type: 'internal', auth: 'cognito', safe: true, domain: 'ai', description: 'Check proactive notifications' },
  { name: 'generate-response', type: 'internal', auth: 'cognito', safe: true, domain: 'ai', description: 'Generate AI response' },
];

// ============================================================================
// KB DOMAIN (7 lambdas)
// ============================================================================
export const KB_LAMBDAS: LambdaDefinition[] = [
  { name: 'kb-analytics-dashboard', type: 'http', auth: 'cognito', safe: true, domain: 'ai', description: 'KB analytics dashboard' },
  { name: 'kb-ai-suggestions', type: 'http', auth: 'cognito', safe: true, domain: 'ai', description: 'KB AI suggestions' },
  { name: 'kb-export-pdf', type: 'http', auth: 'cognito', safe: true, domain: 'ai', description: 'KB export PDF' },
  { name: 'increment-article-views', type: 'http', auth: 'cognito', safe: false, domain: 'ai', description: 'Increment article views' },
  { name: 'increment-article-helpful', type: 'http', auth: 'cognito', safe: false, domain: 'ai', description: 'Increment article helpful' },
  { name: 'track-article-view-detailed', type: 'http', auth: 'cognito', safe: false, domain: 'ai', description: 'Track article view detailed' },
  { name: 'kb-article-tracking', type: 'internal', auth: 'cognito', safe: false, domain: 'ai', description: 'KB article tracking' },
];

// ============================================================================
// REPORTS DOMAIN (5 lambdas)
// ============================================================================
export const REPORTS_LAMBDAS: LambdaDefinition[] = [
  { name: 'generate-pdf-report', type: 'http', auth: 'cognito', safe: true, domain: 'ai', description: 'Generate PDF report' },
  { name: 'generate-excel-report', type: 'http', auth: 'cognito', safe: true, domain: 'ai', description: 'Generate Excel report' },
  { name: 'generate-security-pdf', type: 'http', auth: 'cognito', safe: true, domain: 'ai', description: 'Generate security PDF' },
  { name: 'security-scan-pdf-export', type: 'http', auth: 'cognito', safe: true, domain: 'ai', description: 'Security scan PDF export' },
  { name: 'generate-remediation-script', type: 'http', auth: 'cognito', safe: true, domain: 'ai', description: 'Generate remediation script' },
];

// ============================================================================
// DASHBOARD DOMAIN (3 lambdas)
// ============================================================================
export const DASHBOARD_LAMBDAS: LambdaDefinition[] = [
  { name: 'get-executive-dashboard', type: 'http', auth: 'cognito', safe: true, domain: 'monitoring', description: 'Get executive dashboard' },
  { name: 'get-executive-dashboard-public', type: 'http', auth: 'none', safe: true, domain: 'monitoring', description: 'Get executive dashboard (public)' },
  { name: 'manage-tv-tokens', type: 'http', auth: 'cognito', safe: false, domain: 'monitoring', description: 'Manage TV tokens' },
];

// ============================================================================
// MONITORING DOMAIN (17 lambdas)
// ============================================================================
export const MONITORING_LAMBDAS: LambdaDefinition[] = [
  { name: 'alerts', type: 'http', auth: 'cognito', safe: true, domain: 'monitoring', description: 'Manage alerts' },
  { name: 'auto-alerts', type: 'http', auth: 'cognito', safe: true, domain: 'monitoring', description: 'Auto alerts' },
  { name: 'check-alert-rules', type: 'http', auth: 'cognito', safe: true, domain: 'monitoring', description: 'Check alert rules' },
  { name: 'aws-realtime-metrics', type: 'http', auth: 'cognito', safe: true, domain: 'monitoring', description: 'AWS realtime metrics' },
  { name: 'fetch-cloudwatch-metrics', type: 'http', auth: 'cognito', safe: true, domain: 'monitoring', description: 'Fetch CloudWatch metrics' },
  { name: 'fetch-edge-services', type: 'http', auth: 'cognito', safe: true, domain: 'monitoring', description: 'Fetch edge services' },
  { name: 'endpoint-monitor-check', type: 'http', auth: 'cognito', safe: true, domain: 'monitoring', description: 'Endpoint monitor check' },
  { name: 'monitored-endpoints', type: 'http', auth: 'cognito', safe: true, domain: 'monitoring', description: 'Monitored endpoints' },
  { name: 'generate-error-fix-prompt', type: 'http', auth: 'cognito', safe: true, domain: 'monitoring', description: 'Generate error fix prompt' },
  { name: 'get-platform-metrics', type: 'http', auth: 'cognito', safe: true, domain: 'monitoring', description: 'Get platform metrics' },
  { name: 'get-recent-errors', type: 'http', auth: 'cognito', safe: true, domain: 'monitoring', description: 'Get recent errors' },
  { name: 'get-lambda-health', type: 'http', auth: 'cognito', safe: true, domain: 'monitoring', description: 'Get Lambda health' },
  { name: 'log-frontend-error', type: 'http', auth: 'none', safe: false, domain: 'monitoring', description: 'Log frontend error (public)' },
  { name: 'error-aggregator', type: 'internal', auth: 'cognito', safe: true, domain: 'monitoring', description: 'Error aggregator' },
  { name: 'health-check', type: 'internal', auth: 'cognito', safe: true, domain: 'monitoring', description: 'Health check' },
  { name: 'lambda-health-check', type: 'internal', auth: 'cognito', safe: true, domain: 'monitoring', description: 'Lambda health check' },
  { name: 'test-lambda-metrics', type: 'internal', auth: 'cognito', safe: true, domain: 'monitoring', description: 'Test Lambda metrics' },
];

// ============================================================================
// AZURE DOMAIN (22 lambdas)
// ============================================================================
export const AZURE_LAMBDAS: LambdaDefinition[] = [
  { name: 'azure-oauth-initiate', type: 'http', auth: 'cognito', safe: true, domain: 'cloud', description: 'Azure OAuth initiate' },
  { name: 'azure-oauth-callback', type: 'http', auth: 'cognito', safe: false, domain: 'cloud', description: 'Azure OAuth callback' },
  { name: 'azure-oauth-refresh', type: 'http', auth: 'cognito', safe: false, domain: 'cloud', description: 'Azure OAuth refresh' },
  { name: 'azure-oauth-revoke', type: 'http', auth: 'cognito', safe: false, domain: 'cloud', description: 'Azure OAuth revoke' },
  { name: 'validate-azure-credentials', type: 'http', auth: 'cognito', safe: true, domain: 'cloud', description: 'Validate Azure credentials' },
  { name: 'validate-azure-permissions', type: 'http', auth: 'cognito', safe: true, domain: 'cloud', description: 'Validate Azure permissions' },
  { name: 'save-azure-credentials', type: 'http', auth: 'cognito', safe: false, domain: 'cloud', description: 'Save Azure credentials' },
  { name: 'list-azure-credentials', type: 'http', auth: 'cognito', safe: true, domain: 'cloud', description: 'List Azure credentials' },
  { name: 'delete-azure-credentials', type: 'http', auth: 'cognito', safe: false, domain: 'cloud', description: 'Delete Azure credentials' },
  { name: 'azure-security-scan', type: 'http', auth: 'cognito', safe: true, domain: 'cloud', description: 'Azure security scan' },
  { name: 'start-azure-security-scan', type: 'http', auth: 'cognito', safe: false, domain: 'cloud', description: 'Start Azure security scan' },
  { name: 'azure-defender-scan', type: 'http', auth: 'cognito', safe: true, domain: 'cloud', description: 'Azure Defender scan' },
  { name: 'azure-compliance-scan', type: 'http', auth: 'cognito', safe: true, domain: 'cloud', description: 'Azure compliance scan' },
  { name: 'azure-well-architected-scan', type: 'http', auth: 'cognito', safe: true, domain: 'cloud', description: 'Azure Well-Architected scan' },
  { name: 'azure-cost-optimization', type: 'http', auth: 'cognito', safe: true, domain: 'cloud', description: 'Azure cost optimization' },
  { name: 'azure-reservations-analyzer', type: 'http', auth: 'cognito', safe: true, domain: 'cloud', description: 'Azure reservations analyzer' },
  { name: 'azure-fetch-costs', type: 'http', auth: 'cognito', safe: true, domain: 'cloud', description: 'Azure fetch costs' },
  { name: 'azure-resource-inventory', type: 'http', auth: 'cognito', safe: true, domain: 'cloud', description: 'Azure resource inventory' },
  { name: 'azure-activity-logs', type: 'http', auth: 'cognito', safe: true, domain: 'cloud', description: 'Azure activity logs' },
  { name: 'azure-fetch-monitor-metrics', type: 'http', auth: 'cognito', safe: true, domain: 'cloud', description: 'Azure fetch monitor metrics' },
  { name: 'azure-detect-anomalies', type: 'http', auth: 'cognito', safe: true, domain: 'cloud', description: 'Azure detect anomalies' },
  { name: 'azure-fetch-edge-services', type: 'http', auth: 'cognito', safe: true, domain: 'cloud', description: 'Azure fetch edge services' },
];

// ============================================================================
// CLOUD DOMAIN (1 lambda)
// ============================================================================
export const CLOUD_LAMBDAS: LambdaDefinition[] = [
  { name: 'list-cloud-credentials', type: 'http', auth: 'cognito', safe: true, domain: 'cloud', description: 'List all cloud credentials' },
];

// ============================================================================
// LICENSE DOMAIN (9 lambdas)
// ============================================================================
export const LICENSE_LAMBDAS: LambdaDefinition[] = [
  { name: 'validate-license', type: 'http', auth: 'cognito', safe: true, domain: 'integrations', description: 'Validate license' },
  { name: 'configure-license', type: 'http', auth: 'cognito', safe: false, domain: 'integrations', description: 'Configure license' },
  { name: 'sync-license', type: 'http', auth: 'cognito', safe: false, domain: 'integrations', description: 'Sync license' },
  { name: 'admin-sync-license', type: 'http', auth: 'cognito', safe: false, domain: 'integrations', description: 'Admin sync license' },
  { name: 'manage-seats', type: 'http', auth: 'cognito', safe: false, domain: 'integrations', description: 'Manage seats' },
  { name: 'manage-seat-assignments', type: 'internal', auth: 'cognito', safe: false, domain: 'integrations', description: 'Manage seat assignments' },
  { name: 'daily-license-validation', type: 'internal', auth: 'cognito', safe: true, domain: 'integrations', description: 'Daily license validation (scheduled)' },
  { name: 'scheduled-license-sync', type: 'internal', auth: 'cognito', safe: false, domain: 'integrations', description: 'Scheduled license sync' },
  { name: 'cleanup-seats', type: 'internal', auth: 'cognito', safe: false, domain: 'integrations', description: 'Cleanup seats' },
];

// ============================================================================
// DATA DOMAIN (5 lambdas)
// ============================================================================
export const DATA_LAMBDAS: LambdaDefinition[] = [
  { name: 'query-table', type: 'http', auth: 'cognito', safe: true, domain: 'integrations', description: 'Query table data' },
  { name: 'mutate-table', type: 'http', auth: 'cognito', safe: false, domain: 'integrations', description: 'Mutate table data' },
  { name: 'ticket-management', type: 'http', auth: 'cognito', safe: false, domain: 'integrations', description: 'Ticket management' },
  { name: 'ticket-attachments', type: 'http', auth: 'cognito', safe: false, domain: 'integrations', description: 'Ticket attachments' },
  { name: 'cleanup-cost-data', type: 'internal', auth: 'cognito', safe: false, domain: 'integrations', description: 'Cleanup cost data' },
];

// ============================================================================
// NOTIFICATIONS DOMAIN (4 lambdas)
// ============================================================================
export const NOTIFICATIONS_LAMBDAS: LambdaDefinition[] = [
  { name: 'send-email', type: 'http', auth: 'cognito', safe: false, domain: 'integrations', description: 'Send email' },
  { name: 'send-notification', type: 'http', auth: 'cognito', safe: false, domain: 'integrations', description: 'Send notification' },
  { name: 'get-communication-logs', type: 'http', auth: 'cognito', safe: true, domain: 'integrations', description: 'Get communication logs' },
  { name: 'manage-email-preferences', type: 'http', auth: 'cognito', safe: false, domain: 'integrations', description: 'Manage email preferences' },
];

// ============================================================================
// JOBS DOMAIN (16 lambdas)
// ============================================================================
export const JOBS_LAMBDAS: LambdaDefinition[] = [
  { name: 'process-background-jobs', type: 'http', auth: 'cognito', safe: false, domain: 'operations', description: 'Process background jobs' },
  { name: 'list-background-jobs', type: 'http', auth: 'cognito', safe: true, domain: 'operations', description: 'List background jobs' },
  { name: 'execute-scheduled-job', type: 'http', auth: 'cognito', safe: false, domain: 'operations', description: 'Execute scheduled job' },
  { name: 'scheduled-scan-executor', type: 'http', auth: 'cognito', safe: false, domain: 'operations', description: 'Scheduled scan executor' },
  { name: 'cancel-background-job', type: 'http', auth: 'cognito', safe: false, domain: 'operations', description: 'Cancel background job' },
  { name: 'retry-background-job', type: 'http', auth: 'cognito', safe: false, domain: 'operations', description: 'Retry background job' },
  { name: 'send-scheduled-emails', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Send scheduled emails' },
  { name: 'cleanup-expired-oauth-states', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Cleanup expired OAuth states' },
  { name: 'cleanup-expired-external-ids', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Cleanup expired external IDs' },
  { name: 'auto-cleanup-stuck-scans', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Auto cleanup stuck scans (job)' },
  { name: 'initial-data-load', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Initial data load' },
  { name: 'process-events', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Process events' },
  { name: 'scheduled-view-refresh', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Scheduled view refresh' },
  { name: 'sync-resource-inventory', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Sync resource inventory' },
  { name: 'retry-fallback-licenses', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Retry fallback licenses' },
];

// ============================================================================
// ORGANIZATIONS DOMAIN (2 lambdas)
// ============================================================================
export const ORGANIZATIONS_LAMBDAS: LambdaDefinition[] = [
  { name: 'create-organization-account', type: 'http', auth: 'cognito', safe: false, domain: 'integrations', description: 'Create organization account' },
  { name: 'sync-organization-accounts', type: 'http', auth: 'cognito', safe: false, domain: 'integrations', description: 'Sync organization accounts' },
];

// ============================================================================
// INTEGRATIONS DOMAIN (2 lambdas)
// ============================================================================
export const INTEGRATIONS_LAMBDAS: LambdaDefinition[] = [
  { name: 'create-jira-ticket', type: 'http', auth: 'cognito', safe: false, domain: 'integrations', description: 'Create Jira ticket' },
  { name: 'cloudformation-webhook', type: 'internal', auth: 'none', safe: false, domain: 'integrations', description: 'CloudFormation webhook (dedicated route)' },
];

// ============================================================================
// STORAGE DOMAIN (3 lambdas)
// ============================================================================
export const STORAGE_LAMBDAS: LambdaDefinition[] = [
  { name: 'storage-download', type: 'http', auth: 'cognito', safe: true, domain: 'integrations', description: 'Storage download' },
  { name: 'storage-delete', type: 'http', auth: 'cognito', safe: false, domain: 'integrations', description: 'Storage delete' },
  { name: 'upload-attachment', type: 'http', auth: 'cognito', safe: false, domain: 'integrations', description: 'Upload attachment' },
];

// ============================================================================
// WEBSOCKET DOMAIN (2 lambdas)
// ============================================================================
export const WEBSOCKET_LAMBDAS: LambdaDefinition[] = [
  { name: 'websocket-connect', type: 'internal', auth: 'none', safe: true, domain: 'integrations', description: 'WebSocket connect (dedicated route)' },
  { name: 'websocket-disconnect', type: 'internal', auth: 'none', safe: true, domain: 'integrations', description: 'WebSocket disconnect (dedicated route)' },
];

// ============================================================================
// SYSTEM DOMAIN (6 lambdas)
// ============================================================================
export const SYSTEM_LAMBDAS: LambdaDefinition[] = [
  { name: 'add-status-column', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Add status column' },
  { name: 'db-init', type: 'http', auth: 'cognito', safe: false, domain: 'operations', description: 'DB init' },
  { name: 'debug-org-query', type: 'internal', auth: 'cognito', safe: true, domain: 'operations', description: 'Debug org query' },
  { name: 'fix-azure-constraints', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Fix Azure constraints' },
  { name: 'run-migrations', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Run migrations' },
  { name: 'run-sql-migration', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Run SQL migration' },
];

// ============================================================================
// MAINTENANCE DOMAIN (2 lambdas)
// ============================================================================
export const MAINTENANCE_LAMBDAS: LambdaDefinition[] = [
  { name: 'maintenance-auto-cleanup-stuck-scans', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Maintenance auto cleanup' },
  { name: 'cleanup-stuck-scans-simple', type: 'internal', auth: 'cognito', safe: false, domain: 'operations', description: 'Cleanup stuck scans simple' },
];

// ============================================================================
// DEBUG DOMAIN (3 lambdas)
// ============================================================================
export const DEBUG_LAMBDAS: LambdaDefinition[] = [
  { name: 'check-daily-costs', type: 'internal', auth: 'cognito', safe: true, domain: 'operations', description: 'Check daily costs (debug)' },
  { name: 'diagnose-cost-dashboard', type: 'internal', auth: 'cognito', safe: true, domain: 'operations', description: 'Diagnose cost dashboard' },
  { name: 'investigate-data-mismatch', type: 'internal', auth: 'cognito', safe: true, domain: 'operations', description: 'Investigate data mismatch' },
];

// ============================================================================
// DEBUG AZURE (1 lambda)
// ============================================================================
export const DEBUG_AZURE_LAMBDAS: LambdaDefinition[] = [
  { name: 'debug-azure-costs', type: 'internal', auth: 'cognito', safe: true, domain: 'cloud', description: 'Debug Azure costs' },
];

// ============================================================================
// DELETE WEBAUTHN ADMIN (1 lambda)
// ============================================================================
export const WEBAUTHN_ADMIN_LAMBDAS: LambdaDefinition[] = [
  { name: 'delete-webauthn-credential-admin', type: 'internal', auth: 'cognito', safe: false, domain: 'auth', description: 'Delete WebAuthn credential (admin)' },
];

// ============================================================================
// ALL LAMBDAS COMBINED
// ============================================================================
export const ALL_LAMBDAS: LambdaDefinition[] = [
  ...AUTH_LAMBDAS,
  ...PROFILES_LAMBDAS,
  ...USER_LAMBDAS,
  ...ADMIN_LAMBDAS,
  ...AWS_LAMBDAS,
  ...SECURITY_LAMBDAS,
  ...COST_LAMBDAS,
  ...ML_LAMBDAS,
  ...AI_LAMBDAS,
  ...KB_LAMBDAS,
  ...REPORTS_LAMBDAS,
  ...DASHBOARD_LAMBDAS,
  ...MONITORING_LAMBDAS,
  ...AZURE_LAMBDAS,
  ...CLOUD_LAMBDAS,
  ...LICENSE_LAMBDAS,
  ...DATA_LAMBDAS,
  ...NOTIFICATIONS_LAMBDAS,
  ...JOBS_LAMBDAS,
  ...ORGANIZATIONS_LAMBDAS,
  ...INTEGRATIONS_LAMBDAS,
  ...STORAGE_LAMBDAS,
  ...WEBSOCKET_LAMBDAS,
  ...SYSTEM_LAMBDAS,
  ...MAINTENANCE_LAMBDAS,
  ...DEBUG_LAMBDAS,
  ...DEBUG_AZURE_LAMBDAS,
  ...WEBAUTHN_ADMIN_LAMBDAS,
];

/** All lambdas with HTTP API routes */
export const HTTP_LAMBDAS = ALL_LAMBDAS.filter(l => l.type === 'http');

/** All internal lambdas (no HTTP route) */
export const INTERNAL_LAMBDAS = ALL_LAMBDAS.filter(l => l.type === 'internal');

/** Public lambdas (no auth required) */
export const PUBLIC_LAMBDAS = ALL_LAMBDAS.filter(l => l.auth === 'none');

/** Safe lambdas (read-only, safe to call) */
export const SAFE_LAMBDAS = ALL_LAMBDAS.filter(l => l.safe);

/** Get lambdas by domain */
export function getLambdasByDomain(domain: string): LambdaDefinition[] {
  return ALL_LAMBDAS.filter(l => l.domain === domain);
}
