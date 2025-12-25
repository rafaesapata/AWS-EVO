#!/bin/bash
set -e

echo "=== Building backend ==="
npm run build --prefix backend

echo ""
echo "=== Creating deployment package ==="
rm -rf /tmp/lambda-package
mkdir -p /tmp/lambda-package/handlers/security
mkdir -p /tmp/lambda-package/handlers/auth
mkdir -p /tmp/lambda-package/handlers/cost
mkdir -p /tmp/lambda-package/lib
mkdir -p /tmp/lambda-package/types

# Copy handlers
cp -r backend/dist/handlers/security/*.js /tmp/lambda-package/handlers/security/ 2>/dev/null || true
cp -r backend/dist/handlers/auth/*.js /tmp/lambda-package/handlers/auth/ 2>/dev/null || true
cp -r backend/dist/handlers/cost/*.js /tmp/lambda-package/handlers/cost/ 2>/dev/null || true

# Copy lib
cp backend/dist/lib/*.js /tmp/lambda-package/lib/ 2>/dev/null || true

# Copy types
cp backend/dist/types/*.js /tmp/lambda-package/types/ 2>/dev/null || true

echo ""
echo "=== Updating Lambda functions ==="

# List of functions to update with their handler paths
declare -A FUNCTIONS=(
  ["evo-uds-v3-production-security-scan"]="handlers/security"
  ["evo-uds-v3-production-well-architected-scan"]="handlers/security"
  ["evo-uds-v3-production-webauthn-register"]="handlers/auth"
  ["evo-uds-v3-production-webauthn-authenticate"]="handlers/auth"
  ["evo-uds-v3-production-ml-waste-detection"]="handlers/cost"
)

for func in "${!FUNCTIONS[@]}"; do
  handler_path="${FUNCTIONS[$func]}"
  handler_file=$(echo $func | sed 's/evo-uds-v3-production-//')
  
  echo "Updating $func..."
  
  # Create zip for this function
  rm -f /tmp/${handler_file}.zip
  
  # Go to package dir and create zip
  pushd /tmp/lambda-package > /dev/null
  zip -r /tmp/${handler_file}.zip ${handler_path}/${handler_file}.js lib/ types/ 2>/dev/null || true
  popd > /dev/null
  
  # Update Lambda
  if [ -f "/tmp/${handler_file}.zip" ]; then
    aws lambda update-function-code \
      --function-name "$func" \
      --zip-file "fileb:///tmp/${handler_file}.zip" \
      --query "LastModified" --output text 2>/dev/null || echo "  Failed to update $func"
  fi
done

echo ""
echo "=== Done ==="
