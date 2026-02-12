---
inclusion: manual
---

# API & Lambda Reference

## API Gateway: REST API `3l66kn0eaj` | Stage: `prod` | Authorizer: `joelbs` (Cognito) | Resource: `n9gxy9`

## ~194 Lambdas organizadas por categoria

Auth/MFA: `mfa-enroll`, `mfa-check`, `mfa-challenge-verify`, `mfa-verify-login`, `mfa-list-factors`, `mfa-unenroll`, `webauthn-register`, `webauthn-authenticate`, `webauthn-check`, `delete-webauthn-credential`, `verify-tv-token`, `self-register` (PUBLIC), `forgot-password`

Admin: `admin-manage-user`, `create-cognito-user`, `create-user`, `disable-cognito-user`, `manage-organizations`, `deactivate-demo-mode`, `manage-demo-mode`, `log-audit`, `manage-email-templates`

AWS Credentials: `list-aws-credentials`, `save-aws-credentials`, `update-aws-credentials`

Security: `security-scan`, `start-security-scan`, `compliance-scan`, `start-compliance-scan`, `get-compliance-scan-status`, `get-compliance-history`, `well-architected-scan`, `guardduty-scan`, `get-findings`, `get-security-posture`, `validate-aws-credentials`, `validate-permissions`, `iam-deep-analysis`, `lateral-movement-detection`, `drift-detection`, `analyze-cloudtrail`, `start-cloudtrail-analysis`, `fetch-cloudtrail`, `waf-setup-monitoring`, `waf-dashboard-api`

Cost/FinOps: `fetch-daily-costs`, `ri-sp-analyzer`, `get-ri-sp-data`, `get-ri-sp-analysis`, `list-ri-sp-history`, `cost-optimization`, `budget-forecast`, `generate-cost-forecast`, `finops-copilot`, `ml-waste-detection`

AI/ML: `bedrock-chat`, `get-ai-notifications`, `update-ai-notification`, `send-ai-notification`, `list-ai-notifications-admin`, `manage-notification-rules`, `intelligent-alerts-analyzer`, `predict-incidents`, `detect-anomalies`

Dashboard: `get-executive-dashboard`, `get-executive-dashboard-public`, `manage-tv-tokens`

Monitoring: `alerts`, `auto-alerts`, `check-alert-rules`, `aws-realtime-metrics`, `fetch-cloudwatch-metrics`, `fetch-edge-services`, `endpoint-monitor-check`, `generate-error-fix-prompt`, `get-platform-metrics`, `get-recent-errors`, `get-lambda-health`, `log-frontend-error`

License: `validate-license`, `configure-license`, `sync-license`, `admin-sync-license`, `manage-seats`

Azure: `azure-oauth-initiate`, `azure-oauth-callback`, `azure-oauth-refresh`, `azure-oauth-revoke`, `validate-azure-credentials`, `validate-azure-permissions`, `save-azure-credentials`, `list-azure-credentials`, `delete-azure-credentials`, `azure-security-scan`, `start-azure-security-scan`, `azure-defender-scan`, `azure-compliance-scan`, `azure-well-architected-scan`, `azure-cost-optimization`, `azure-reservations-analyzer`, `azure-fetch-costs`, `azure-resource-inventory`, `azure-activity-logs`, `azure-fetch-monitor-metrics`, `azure-detect-anomalies`, `azure-fetch-edge-services`, `list-cloud-credentials`

KB: `kb-analytics-dashboard`, `kb-ai-suggestions`, `kb-export-pdf`, `increment-article-views`, `increment-article-helpful`, `track-article-view-detailed`

Reports: `generate-pdf-report`, `generate-excel-report`, `generate-security-pdf`, `security-scan-pdf-export`, `generate-remediation-script`

Data: `query-table`, `mutate-table`, `ticket-management`, `ticket-attachments`

Orgs: `create-organization-account`, `sync-organization-accounts`, `check-organization`, `create-with-organization`, `get-user-organization`

Notifications: `send-email`, `send-notification`, `get-communication-logs`, `manage-email-preferences`

Jobs: `process-background-jobs`, `list-background-jobs`, `execute-scheduled-job`, `scheduled-scan-executor`

Storage: `storage-download`, `storage-delete`, `upload-attachment`

Integrations: `create-jira-ticket`

Todos os endpoints seguem padrão `/api/functions/{lambda-name}`.
