#!/bin/bash

# Script to update all handler comments from Supabase migration to AWS Lambda

echo "🔄 Updating handler comments..."

# List of files to update
files=(
  "backend/src/handlers/reports/generate-remediation-script.ts"
  "backend/src/handlers/jobs/process-events.ts"
  "backend/src/handlers/reports/generate-security-pdf.ts"
  "backend/src/handlers/jobs/process-background-jobs.ts"
  "backend/src/handlers/reports/generate-excel-report.ts"
  "backend/src/handlers/reports/generate-pdf-report.ts"
  "backend/src/handlers/monitoring/health-check.ts"
  "backend/src/handlers/monitoring/aws-realtime-metrics.ts"
  "backend/src/handlers/ml/ai-prioritization.ts"
  "backend/src/handlers/jobs/execute-scheduled-job.ts"
  "backend/src/handlers/monitoring/check-alert-rules.ts"
  "backend/src/handlers/jobs/scheduled-view-refresh.ts"
  "backend/src/handlers/jobs/scheduled-scan-executor.ts"
  "backend/src/handlers/monitoring/auto-alerts.ts"
  "backend/src/handlers/ml/predict-incidents.ts"
  "backend/src/handlers/monitoring/fetch-cloudwatch-metrics.ts"
  "backend/src/handlers/jobs/cleanup-expired-external-ids.ts"
  "backend/src/handlers/monitoring/endpoint-monitor-check.ts"
  "backend/src/handlers/notifications/get-communication-logs.ts"
  "backend/src/handlers/ml/anomaly-detection.ts"
  "backend/src/handlers/jobs/sync-resource-inventory.ts"
  "backend/src/handlers/ml/intelligent-alerts-analyzer.ts"
  "backend/src/handlers/ml/generate-ai-insights.ts"
  "backend/src/handlers/integrations/create-jira-ticket.ts"
  "backend/src/handlers/organizations/create-organization-account.ts"
  "backend/src/handlers/notifications/send-notification.ts"
  "backend/src/handlers/security/iam-deep-analysis.ts"
  "backend/src/handlers/security/guardduty-scan.ts"
  "backend/src/handlers/cost/ri-sp-analyzer.ts"
  "backend/src/handlers/cost/budget-forecast.ts"
  "backend/src/handlers/cost/generate-cost-forecast.ts"
  "backend/src/handlers/security/well-architected-scan.ts"
  "backend/src/handlers/cost/cost-optimization.ts"
  "backend/src/handlers/license/validate-license.ts"
  "backend/src/handlers/cost/fetch-daily-costs.ts"
  "backend/src/handlers/cost/ml-waste-detection.ts"
  "backend/src/handlers/security/compliance-scan.ts"
  "backend/src/handlers/security/validate-aws-credentials.ts"
  "backend/src/handlers/kb/kb-ai-suggestions.ts"
  "backend/src/handlers/kb/kb-analytics-dashboard.ts"
  "backend/src/handlers/kb/kb-export-pdf.ts"
  "backend/src/handlers/security/lateral-movement-detection.ts"
  "backend/src/handlers/security/security-scan.ts"
  "backend/src/handlers/cost/finops-copilot.ts"
  "backend/src/handlers/security/validate-permissions.ts"
  "backend/src/handlers/security/get-findings.ts"
  "backend/src/handlers/security/validate-waf-security.ts"
  "backend/src/handlers/security/analyze-cloudtrail.ts"
  "backend/src/handlers/security/get-security-posture.ts"
  "backend/src/handlers/security/iam-behavior-analysis.ts"
  "backend/src/handlers/security/drift-detection.ts"
  "backend/src/handlers/organizations/sync-organization-accounts.ts"
)

count=0
for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    # Extract function name from path
    function_name=$(basename "$file" .ts)
    
    # Update the comment
    sed -i '' "s|Migrado de: supabase/functions/.*|AWS Lambda Handler for $function_name|g" "$file"
    
    ((count++))
    echo "✅ Updated: $file"
  else
    echo "⚠️  File not found: $file"
  fi
done

echo ""
echo "🎉 Updated $count handler files"