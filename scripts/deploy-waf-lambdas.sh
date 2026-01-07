#!/bin/bash
# Deploy WAF Monitoring Lambda Functions
# This script builds and deploys the WAF monitoring Lambda handlers

set -e

REGION="us-east-1"
ACCOUNT_ID="383234048592"
PROJECT_NAME="evo-uds-v3"
ENVIRONMENT="production"
LAYER_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:layer:evo-prisma-deps-layer:2"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== WAF Monitoring Lambda Deployment ===${NC}"

# Step 1: Build backend
echo -e "${YELLOW}Step 1: Building backend...${NC}"
npm run build --prefix backend

# Step 2: Create deployment packages
echo -e "${YELLOW}Step 2: Creating deployment packages...${NC}"

WAF_HANDLERS=(
  "waf-setup-monitoring"
  "waf-log-processor"
  "waf-threat-analyzer"
  "waf-dashboard-api"
  "waf-unblock-expired"
)

DEPLOY_DIR="/tmp/waf-lambda-deploy"
rm -rf $DEPLOY_DIR
mkdir -p $DEPLOY_DIR

for handler in "${WAF_HANDLERS[@]}"; do
  echo -e "  Packaging ${handler}..."
  
  HANDLER_DIR="$DEPLOY_DIR/$handler"
  mkdir -p "$HANDLER_DIR"
  
  # Copy compiled handler
  cp "backend/dist/handlers/security/${handler}.js" "$HANDLER_DIR/"
  
  # Copy lib dependencies
  mkdir -p "$HANDLER_DIR/lib"
  cp -r backend/dist/lib/* "$HANDLER_DIR/lib/" 2>/dev/null || true
  
  # Create zip
  pushd "$HANDLER_DIR" > /dev/null
  zip -r "../${handler}.zip" . > /dev/null
  popd > /dev/null
  
  echo -e "  ${GREEN}✓${NC} ${handler}.zip created"
done

# Step 3: Deploy Lambda functions
echo -e "${YELLOW}Step 3: Deploying Lambda functions...${NC}"

for handler in "${WAF_HANDLERS[@]}"; do
  FUNCTION_NAME="${PROJECT_NAME}-${ENVIRONMENT}-${handler}"
  ZIP_FILE="$DEPLOY_DIR/${handler}.zip"
  
  echo -e "  Deploying ${FUNCTION_NAME}..."
  
  # Check if function exists
  if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" > /dev/null 2>&1; then
    # Update existing function
    aws lambda update-function-code \
      --function-name "$FUNCTION_NAME" \
      --zip-file "fileb://${ZIP_FILE}" \
      --region "$REGION" > /dev/null
    
    echo -e "  ${GREEN}✓${NC} Updated ${FUNCTION_NAME}"
  else
    echo -e "  ${YELLOW}!${NC} Function ${FUNCTION_NAME} does not exist. Create it using CloudFormation first."
  fi
done

# Step 4: Update Lambda layers
echo -e "${YELLOW}Step 4: Updating Lambda layers...${NC}"

for handler in "${WAF_HANDLERS[@]}"; do
  FUNCTION_NAME="${PROJECT_NAME}-${ENVIRONMENT}-${handler}"
  
  if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" > /dev/null 2>&1; then
    aws lambda update-function-configuration \
      --function-name "$FUNCTION_NAME" \
      --layers "$LAYER_ARN" \
      --region "$REGION" > /dev/null 2>&1 || true
    
    echo -e "  ${GREEN}✓${NC} Layer updated for ${FUNCTION_NAME}"
  fi
done

# Step 5: Deploy API Gateway
echo -e "${YELLOW}Step 5: Deploying API Gateway...${NC}"

API_ID="3l66kn0eaj"
aws apigateway create-deployment \
  --rest-api-id "$API_ID" \
  --stage-name prod \
  --region "$REGION" > /dev/null

echo -e "${GREEN}✓${NC} API Gateway deployed"

# Cleanup
rm -rf $DEPLOY_DIR

echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo ""
echo "Next steps:"
echo "1. Create the Lambda functions using CloudFormation if they don't exist:"
echo "   aws cloudformation deploy --template-file cloudformation/waf-monitoring-stack.yaml --stack-name ${PROJECT_NAME}-waf-monitoring --capabilities CAPABILITY_NAMED_IAM"
echo ""
echo "2. Configure API Gateway endpoints for the WAF APIs"
echo ""
echo "3. Test the deployment by accessing /waf-monitoring in the frontend"
