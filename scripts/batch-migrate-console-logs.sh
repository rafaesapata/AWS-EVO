#!/bin/bash

echo "🔄 Batch migrating console.log statements to structured logging..."

# List of handlers to migrate
HANDLERS=(
  "backend/src/handlers/license/validate-license.ts"
  "backend/src/handlers/license/daily-license-validation.ts"
  "backend/src/handlers/kb/kb-export-pdf.ts"
  "backend/src/handlers/kb/kb-ai-suggestions.ts"
  "backend/src/handlers/kb/kb-analytics-dashboard.ts"
  "backend/src/handlers/security/iam-behavior-analysis.ts"
  "backend/src/handlers/auth/webauthn-register.ts"
  "backend/src/handlers/auth/webauthn-authenticate.ts"
  "backend/src/handlers/auth/verify-tv-token.ts"
  "backend/src/handlers/cost/generate-cost-forecast.ts"
  "backend/src/handlers/cost/budget-forecast.ts"
  "backend/src/handlers/admin/create-user.ts"
  "backend/src/handlers/integrations/create-jira-ticket.ts"
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

echo "🎯 Batch migration completed!"