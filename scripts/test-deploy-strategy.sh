#!/bin/bash

# Test deploy strategy detection logic
# Simulates the buildspec logic to validate incremental deploy

echo "=== Testing Deploy Strategy Detection ==="
echo ""

# Get changed files from last commit
CHANGED_FILES=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || echo "FULL_DEPLOY")

echo "Changed files:"
echo "$CHANGED_FILES"
echo ""

# Determine deploy strategy
export DEPLOY_FRONTEND="false"
export DEPLOY_LAMBDAS="false"
export DEPLOY_FULL_SAM="false"
export CHANGED_HANDLERS=""

# Check what changed
if echo "$CHANGED_FILES" | grep -q "FULL_DEPLOY"; then
  echo ">>> FULL DEPLOY (no git history)"
  export DEPLOY_FRONTEND="true"
  export DEPLOY_FULL_SAM="true"
elif echo "$CHANGED_FILES" | grep -qE "^(sam/template\.yaml|sam/production-lambdas-only\.yaml|backend/prisma/schema\.prisma|backend/src/lib/|backend/src/types/)"; then
  echo ">>> FULL SAM DEPLOY (core files or template changed)"
  export DEPLOY_FULL_SAM="true"
  export DEPLOY_FRONTEND="true"
else
  # Check frontend changes
  if echo "$CHANGED_FILES" | grep -qE "^(src/|public/|index.html|vite\.config|tailwind|postcss)"; then
    echo ">>> Frontend changed"
    export DEPLOY_FRONTEND="true"
  fi
  
  # Check specific handler changes
  HANDLER_CHANGES=$(echo "$CHANGED_FILES" | grep "^backend/src/handlers/" | sed 's|backend/src/handlers/||' || true)
  if [ -n "$HANDLER_CHANGES" ]; then
    echo ">>> Handlers changed:"
    echo "$HANDLER_CHANGES"
    export DEPLOY_LAMBDAS="true"
    export CHANGED_HANDLERS="$HANDLER_CHANGES"
  fi
  
  # If only docs/scripts changed, skip deploy
  if [ "$DEPLOY_FRONTEND" = "false" ] && [ "$DEPLOY_LAMBDAS" = "false" ] && [ "$DEPLOY_FULL_SAM" = "false" ]; then
    echo ">>> NO DEPLOYABLE CHANGES (docs/scripts only)"
  fi
fi

echo ""
echo "=== DEPLOY STRATEGY ==="
echo "FRONTEND: $DEPLOY_FRONTEND"
echo "LAMBDAS: $DEPLOY_LAMBDAS"
echo "FULL_SAM: $DEPLOY_FULL_SAM"
echo ""

if [ "$DEPLOY_LAMBDAS" = "true" ]; then
  echo "=== LAMBDAS TO DEPLOY ==="
  for handler_path in $CHANGED_HANDLERS; do
    category=$(dirname "$handler_path")
    handler_file=$(basename "$handler_path" .ts)
    
    # Map handler file to lambda names
    case "$handler_file" in
      mfa-handlers)
        LAMBDAS="mfa-enroll mfa-check mfa-challenge-verify mfa-verify-login mfa-list-factors mfa-unenroll"
        ;;
      security-scan)
        LAMBDAS="security-scan"
        ;;
      *)
        LAMBDAS="$handler_file"
        ;;
    esac
    
    echo "Handler: $category/$handler_file"
    echo "  → Lambdas: $LAMBDAS"
  done
fi

echo ""
echo "=== ESTIMATED TIME ==="
if [ "$DEPLOY_FULL_SAM" = "true" ]; then
  echo "~10 minutes (Full SAM deploy)"
elif [ "$DEPLOY_LAMBDAS" = "true" ]; then
  LAMBDA_COUNT=$(echo "$CHANGED_HANDLERS" | wc -l | tr -d ' ')
  echo "~2 minutes (Incremental: $LAMBDA_COUNT handlers)"
else
  echo "~1 minute (Build only, no deploy)"
fi
