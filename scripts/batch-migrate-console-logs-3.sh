#!/bin/bash

echo "🔄 Final batch migrating console.log statements..."

# Final batch of handlers
HANDLERS=(
  "backend/src/handlers/security/fetch-cloudtrail.ts"
  "backend/src/handlers/cost/finops-copilot-v2.ts"
  "backend/src/handlers/cost/waste-detection-v2.ts"
  "backend/src/handlers/cost/ri-sp-analyzer.ts"
  "backend/src/handlers/admin/admin-manage-user.ts"
  "backend/src/handlers/ml/detect-anomalies.ts"
  "backend/src/handlers/jobs/initial-data-load.ts"
  "backend/src/handlers/monitoring/health-check.ts"
  "backend/src/handlers/reports/security-scan-pdf-export.ts"
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

echo "🎯 Final batch migration completed!"