#!/bin/bash

echo "🔄 Batch migrating more console.log statements..."

# Second batch of handlers
HANDLERS=(
  "backend/src/handlers/reports/generate-security-pdf.ts"
  "backend/src/handlers/reports/generate-remediation-script.ts"
  "backend/src/handlers/reports/generate-excel-report.ts"
  "backend/src/handlers/notifications/get-communication-logs.ts"
  "backend/src/handlers/monitoring/fetch-cloudwatch-metrics.ts"
  "backend/src/handlers/monitoring/endpoint-monitor-check.ts"
  "backend/src/handlers/monitoring/auto-alerts.ts"
  "backend/src/handlers/ml/predict-incidents.ts"
  "backend/src/handlers/ml/intelligent-alerts-analyzer.ts"
  "backend/src/handlers/ml/generate-ai-insights.ts"
  "backend/src/handlers/ml/anomaly-detection.ts"
  "backend/src/handlers/ml/ai-prioritization.ts"
  "backend/src/handlers/jobs/sync-resource-inventory.ts"
  "backend/src/handlers/jobs/scheduled-view-refresh.ts"
  "backend/src/handlers/integrations/cloudformation-webhook.ts"
)

for handler in "${HANDLERS[@]}"; do
  if [ -f "$handler" ]; then
    echo "📝 Processing $handler..."
    
    # Add logger import if not present
    if ! grep -q "import.*logger.*from.*logging" "$handler"; then
      # Find the line with the last import and add logger import after it
      sed -i '' '/^import.*from.*$/a\
import { logger } from '\''../../lib/logging.js'\'';
' "$handler"
    fi
    
    # Replace common console.log patterns
    sed -i '' 's/console\.log(/logger.info(/g' "$handler"
    sed -i '' 's/console\.error(/logger.error(/g' "$handler"
    sed -i '' 's/console\.warn(/logger.warn(/g' "$handler"
    sed -i '' 's/console\.debug(/logger.debug(/g' "$handler"
    
    echo "✅ Processed $handler"
  else
    echo "⚠️  File not found: $handler"
  fi
done

echo "🎯 Second batch migration completed!"