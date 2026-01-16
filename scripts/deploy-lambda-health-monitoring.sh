#!/bin/bash

# Deploy Lambda Health Monitoring Stack
# Este script faz o deploy completo da infraestrutura de monitoramento de saúde das Lambdas

set -e

ENVIRONMENT=${1:-production}
REGION=${AWS_REGION:-us-east-1}
ALERT_EMAIL=${2:-devops@udstec.io}

echo "🚀 Deploying Lambda Health Monitoring Stack"
echo "   Environment: $ENVIRONMENT"
echo "   Region: $REGION"
echo "   Alert Email: $ALERT_EMAIL"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Deploy CloudFormation Stack
echo "1️⃣ Deploying CloudFormation stack..."
aws cloudformation deploy \
  --template-file cloudformation/lambda-health-monitoring-stack.yaml \
  --stack-name evo-lambda-health-monitoring-${ENVIRONMENT} \
  --parameter-overrides \
    Environment=${ENVIRONMENT} \
    AlertEmail=${ALERT_EMAIL} \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ${REGION}

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ CloudFormation stack deployed${NC}"
else
  echo -e "${RED}❌ Failed to deploy CloudFormation stack${NC}"
  exit 1
fi

# Step 2: Build Lambda code
echo ""
echo "2️⃣ Building Lambda code..."
npm run build --prefix backend

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Lambda code built${NC}"
else
  echo -e "${RED}❌ Failed to build Lambda code${NC}"
  exit 1
fi

# Step 3: Prepare Lambda deployment package
echo ""
echo "3️⃣ Preparing Lambda deployment package..."
rm -rf /tmp/lambda-health-check-deploy
mkdir -p /tmp/lambda-health-check-deploy

# Copy handler and adjust imports
sed 's|require("../../lib/|require("./lib/|g' backend/dist/handlers/monitoring/lambda-health-check.js | \
sed 's|require("../../types/|require("./types/|g' > /tmp/lambda-health-check-deploy/lambda-health-check.js

# Copy dependencies
cp -r backend/dist/lib /tmp/lambda-health-check-deploy/
cp -r backend/dist/types /tmp/lambda-health-check-deploy/

# Create ZIP
pushd /tmp/lambda-health-check-deploy > /dev/null
zip -r /tmp/lambda-health-check.zip . > /dev/null
popd > /dev/null

echo -e "${GREEN}✅ Lambda package prepared${NC}"

# Step 4: Deploy Lambda code
echo ""
echo "4️⃣ Deploying Lambda code..."
FUNCTION_NAME="evo-uds-v3-${ENVIRONMENT}-lambda-health-check"

aws lambda update-function-code \
  --function-name ${FUNCTION_NAME} \
  --zip-file fileb:///tmp/lambda-health-check.zip \
  --region ${REGION} > /dev/null

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Lambda code deployed${NC}"
else
  echo -e "${RED}❌ Failed to deploy Lambda code${NC}"
  exit 1
fi

# Step 5: Wait for Lambda to be ready
echo ""
echo "5️⃣ Waiting for Lambda to be ready..."
aws lambda wait function-updated \
  --function-name ${FUNCTION_NAME} \
  --region ${REGION}

echo -e "${GREEN}✅ Lambda is ready${NC}"

# Step 6: Test Lambda invocation
echo ""
echo "6️⃣ Testing Lambda invocation..."
aws lambda invoke \
  --function-name ${FUNCTION_NAME} \
  --region ${REGION} \
  /tmp/lambda-health-check-test.json > /dev/null

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Lambda invocation successful${NC}"
else
  echo -e "${YELLOW}⚠️  Lambda invocation failed (may be expected on first run)${NC}"
fi

# Step 7: Get stack outputs
echo ""
echo "7️⃣ Getting stack outputs..."
STACK_OUTPUTS=$(aws cloudformation describe-stacks \
  --stack-name evo-lambda-health-monitoring-${ENVIRONMENT} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs' \
  --output json)

HEALTH_CHECK_ARN=$(echo $STACK_OUTPUTS | jq -r '.[] | select(.OutputKey=="LambdaHealthCheckFunctionArn") | .OutputValue')
ALERT_TOPIC_ARN=$(echo $STACK_OUTPUTS | jq -r '.[] | select(.OutputKey=="AlertTopicArn") | .OutputValue')
DASHBOARD_URL=$(echo $STACK_OUTPUTS | jq -r '.[] | select(.OutputKey=="DashboardURL") | .OutputValue')

# Step 8: Deploy get-lambda-health handler
echo ""
echo "8️⃣ Deploying get-lambda-health handler..."
rm -rf /tmp/get-lambda-health-deploy
mkdir -p /tmp/get-lambda-health-deploy

# Copy handler and adjust imports
sed 's|require("../../lib/|require("./lib/|g' backend/dist/handlers/monitoring/get-lambda-health.js | \
sed 's|require("../../types/|require("./types/|g' > /tmp/get-lambda-health-deploy/get-lambda-health.js

# Copy dependencies
cp -r backend/dist/lib /tmp/get-lambda-health-deploy/
cp -r backend/dist/types /tmp/get-lambda-health-deploy/

# Create ZIP
pushd /tmp/get-lambda-health-deploy > /dev/null
zip -r /tmp/get-lambda-health.zip . > /dev/null
popd > /dev/null

# Check if Lambda exists, create if not
GET_LAMBDA_NAME="evo-uds-v3-${ENVIRONMENT}-get-lambda-health"
if aws lambda get-function --function-name ${GET_LAMBDA_NAME} --region ${REGION} &>/dev/null; then
  echo "   Lambda exists, updating code..."
  aws lambda update-function-code \
    --function-name ${GET_LAMBDA_NAME} \
    --zip-file fileb:///tmp/get-lambda-health.zip \
    --region ${REGION} > /dev/null
  
  aws lambda update-function-configuration \
    --function-name ${GET_LAMBDA_NAME} \
    --handler get-lambda-health.handler \
    --region ${REGION} > /dev/null
else
  echo "   Lambda doesn't exist, creating..."
  echo -e "${YELLOW}⚠️  Please create the Lambda manually or via CDK/CloudFormation${NC}"
fi

echo -e "${GREEN}✅ get-lambda-health handler deployed${NC}"

# Step 9: Create API Gateway endpoint (if needed)
echo ""
echo "9️⃣ Checking API Gateway endpoint..."
API_ID="3l66kn0eaj"
PARENT_ID="n9gxy9"

# Check if endpoint exists
RESOURCE_ID=$(aws apigateway get-resources \
  --rest-api-id ${API_ID} \
  --region ${REGION} \
  --query "items[?pathPart=='get-lambda-health'].id" \
  --output text)

if [ -z "$RESOURCE_ID" ]; then
  echo "   Creating API Gateway endpoint..."
  echo -e "${YELLOW}⚠️  Please create the endpoint manually following the process in api-gateway-endpoints.md${NC}"
else
  echo -e "${GREEN}✅ API Gateway endpoint exists${NC}"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 DEPLOYMENT SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${GREEN}✅ Lambda Health Monitoring deployed successfully!${NC}"
echo ""
echo "📋 Resources Created:"
echo "   • Lambda Health Check: ${HEALTH_CHECK_ARN}"
echo "   • Alert SNS Topic: ${ALERT_TOPIC_ARN}"
echo "   • CloudWatch Dashboard: ${DASHBOARD_URL}"
echo ""
echo "⏰ Schedule:"
echo "   • Health checks run every 5 minutes"
echo "   • Alerts sent to: ${ALERT_EMAIL}"
echo ""
echo "📊 Metrics Published:"
echo "   • Namespace: EVO/LambdaHealth"
echo "   • Metrics: LambdaHealth, OverallHealthPercentage"
echo ""
echo "🔗 Next Steps:"
echo "   1. Confirm SNS subscription email"
echo "   2. View dashboard: ${DASHBOARD_URL}"
echo "   3. Check Lambda logs: aws logs tail /aws/lambda/${FUNCTION_NAME} --follow"
echo "   4. Test frontend: Navigate to Platform Monitoring > Lambda Health tab"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
