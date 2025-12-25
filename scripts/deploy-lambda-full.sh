#!/bin/bash
# Script para deploy completo de uma Lambda com todas as dependências
# Uso: ./scripts/deploy-lambda-full.sh <function-name> <handler-category>
# Exemplo: ./scripts/deploy-lambda-full.sh evo-uds-v3-production-security-scan security

set -e

FUNCTION_NAME=$1
HANDLER_CATEGORY=$2
HANDLER_FILE=$(echo $FUNCTION_NAME | sed 's/evo-uds-v3-production-//')

if [ -z "$FUNCTION_NAME" ] || [ -z "$HANDLER_CATEGORY" ]; then
  echo "Uso: $0 <function-name> <handler-category>"
  echo "Exemplo: $0 evo-uds-v3-production-security-scan security"
  exit 1
fi

echo "=== Building backend ==="
npm run build --prefix backend

echo ""
echo "=== Creating deployment package for $FUNCTION_NAME ==="

# Clean up
rm -rf /tmp/lambda-deploy-$HANDLER_FILE
mkdir -p /tmp/lambda-deploy-$HANDLER_FILE/handlers/$HANDLER_CATEGORY
mkdir -p /tmp/lambda-deploy-$HANDLER_FILE/lib
mkdir -p /tmp/lambda-deploy-$HANDLER_FILE/types

# Copy handler
cp backend/dist/handlers/$HANDLER_CATEGORY/$HANDLER_FILE.js /tmp/lambda-deploy-$HANDLER_FILE/handlers/$HANDLER_CATEGORY/

# Copy lib (all .js files, no .map or .d.ts)
find backend/dist/lib -name "*.js" ! -name "*.d.ts" -exec cp {} /tmp/lambda-deploy-$HANDLER_FILE/lib/ \;

# Copy types
find backend/dist/types -name "*.js" ! -name "*.d.ts" -exec cp {} /tmp/lambda-deploy-$HANDLER_FILE/types/ \; 2>/dev/null || true

# Create zip
rm -f /tmp/$HANDLER_FILE-full.zip
cd /tmp/lambda-deploy-$HANDLER_FILE
zip -r /tmp/$HANDLER_FILE-full.zip .
cd -

echo ""
echo "=== Deploying to AWS ==="
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --zip-file "fileb:///tmp/$HANDLER_FILE-full.zip"

echo ""
echo "=== Done! ==="
echo "Package size: $(du -h /tmp/$HANDLER_FILE-full.zip | cut -f1)"
