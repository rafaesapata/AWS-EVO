#!/bin/bash
# =============================================================================
# EVO Platform - CloudFormation Deployment Script
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
STACK_NAME="evo-uds-v3-production"
REGION="us-east-1"
ENVIRONMENT="production"
PROJECT_NAME="evo-uds-v3"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --stack-name)
      STACK_NAME="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --environment)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --alert-email)
      ALERT_EMAIL="$2"
      shift 2
      ;;
    --domain)
      DOMAIN_NAME="$2"
      shift 2
      ;;
    --certificate-arn)
      CERTIFICATE_ARN="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --stack-name NAME      CloudFormation stack name (default: evo-uds-v3-production)"
      echo "  --region REGION        AWS region (default: us-east-1)"
      echo "  --environment ENV      Environment: development|staging|production (default: production)"
      echo "  --alert-email EMAIL    Email for CloudWatch alerts"
      echo "  --domain DOMAIN        Custom domain name (optional)"
      echo "  --certificate-arn ARN  ACM certificate ARN for custom domain (optional)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  EVO Platform - CloudFormation Deployment${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

echo -e "${YELLOW}Configuration:${NC}"
echo "  Stack Name:   $STACK_NAME"
echo "  Region:       $REGION"
echo "  Environment:  $ENVIRONMENT"
echo "  Alert Email:  ${ALERT_EMAIL:-'(not set)'}"
echo "  Domain:       ${DOMAIN_NAME:-'(CloudFront default)'}"
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
  echo -e "${RED}Error: AWS CLI is not installed${NC}"
  exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
  echo -e "${RED}Error: AWS credentials not configured${NC}"
  exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo -e "${GREEN}AWS Account: $ACCOUNT_ID${NC}"
echo ""

# Build parameters
PARAMS="ParameterKey=Environment,ParameterValue=$ENVIRONMENT"
PARAMS="$PARAMS ParameterKey=ProjectName,ParameterValue=$PROJECT_NAME"

if [ -n "$ALERT_EMAIL" ]; then
  PARAMS="$PARAMS ParameterKey=AlertEmail,ParameterValue=$ALERT_EMAIL"
fi

if [ -n "$DOMAIN_NAME" ]; then
  PARAMS="$PARAMS ParameterKey=DomainName,ParameterValue=$DOMAIN_NAME"
fi

if [ -n "$CERTIFICATE_ARN" ]; then
  PARAMS="$PARAMS ParameterKey=CertificateArn,ParameterValue=$CERTIFICATE_ARN"
fi

# Step 1: Validate template
echo -e "${YELLOW}Step 1: Validating CloudFormation template...${NC}"
aws cloudformation validate-template \
  --template-body file://cloudformation/evo-master-stack.yaml \
  --region $REGION > /dev/null

echo -e "${GREEN}✓ Template is valid${NC}"
echo ""

# Step 2: Check if stack exists
STACK_EXISTS=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION 2>/dev/null || echo "")

if [ -n "$STACK_EXISTS" ]; then
  echo -e "${YELLOW}Step 2: Updating existing stack...${NC}"
  ACTION="update-stack"
else
  echo -e "${YELLOW}Step 2: Creating new stack...${NC}"
  ACTION="create-stack"
fi

# Step 3: Deploy stack
aws cloudformation $ACTION \
  --stack-name $STACK_NAME \
  --template-body file://cloudformation/evo-master-stack.yaml \
  --parameters $PARAMS \
  --capabilities CAPABILITY_NAMED_IAM \
  --region $REGION \
  --tags Key=Project,Value=$PROJECT_NAME Key=Environment,Value=$ENVIRONMENT

echo -e "${GREEN}✓ Stack deployment initiated${NC}"
echo ""

# Step 4: Wait for stack completion
echo -e "${YELLOW}Step 3: Waiting for stack to complete (this may take 15-30 minutes)...${NC}"

if [ "$ACTION" = "create-stack" ]; then
  aws cloudformation wait stack-create-complete \
    --stack-name $STACK_NAME \
    --region $REGION
else
  aws cloudformation wait stack-update-complete \
    --stack-name $STACK_NAME \
    --region $REGION
fi

echo -e "${GREEN}✓ Stack deployment complete!${NC}"
echo ""

# Step 5: Get outputs
echo -e "${YELLOW}Step 4: Retrieving stack outputs...${NC}"
echo ""

OUTPUTS=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs' \
  --output json)

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Deployment Complete - Stack Outputs${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Parse and display key outputs
FRONTEND_URL=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="FrontendUrl") | .OutputValue')
API_URL=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="ApiGatewayUrl") | .OutputValue')
USER_POOL_ID=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="CognitoUserPoolId") | .OutputValue')
USER_POOL_CLIENT_ID=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="CognitoUserPoolClientId") | .OutputValue')
DB_ENDPOINT=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="DatabaseEndpoint") | .OutputValue')
LAMBDA_BUCKET=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="LambdaCodeBucketName") | .OutputValue')
FRONTEND_BUCKET=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="FrontendBucketName") | .OutputValue')
CLOUDFRONT_ID=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="CloudFrontDistributionId") | .OutputValue')

echo -e "${GREEN}Frontend URL:${NC}           $FRONTEND_URL"
echo -e "${GREEN}API Gateway URL:${NC}        $API_URL"
echo -e "${GREEN}Cognito User Pool ID:${NC}   $USER_POOL_ID"
echo -e "${GREEN}Cognito Client ID:${NC}      $USER_POOL_CLIENT_ID"
echo -e "${GREEN}Database Endpoint:${NC}      $DB_ENDPOINT"
echo -e "${GREEN}Lambda Code Bucket:${NC}     $LAMBDA_BUCKET"
echo -e "${GREEN}Frontend Bucket:${NC}        $FRONTEND_BUCKET"
echo -e "${GREEN}CloudFront ID:${NC}          $CLOUDFRONT_ID"
echo ""

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Next Steps${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo "1. Upload Lambda code to S3:"
echo "   npm run build --prefix backend"
echo "   ./scripts/upload-lambda-code.sh $LAMBDA_BUCKET"
echo ""
echo "2. Upload Lambda layer to S3:"
echo "   ./scripts/create-lambda-layer.sh $LAMBDA_BUCKET"
echo ""
echo "3. Build and deploy frontend:"
echo "   npm run build"
echo "   aws s3 sync dist/ s3://$FRONTEND_BUCKET --delete"
echo "   aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths '/*'"
echo ""
echo "4. Run database migrations:"
echo "   npx prisma migrate deploy --prefix backend"
echo ""
echo "5. Create admin user in Cognito:"
echo "   aws cognito-idp admin-create-user \\"
echo "     --user-pool-id $USER_POOL_ID \\"
echo "     --username admin@example.com \\"
echo "     --user-attributes Name=email,Value=admin@example.com Name=email_verified,Value=true \\"
echo "     --temporary-password TempPass123!"
echo ""
echo "6. Update frontend environment variables:"
echo "   VITE_COGNITO_USER_POOL_ID=$USER_POOL_ID"
echo "   VITE_COGNITO_CLIENT_ID=$USER_POOL_CLIENT_ID"
echo "   VITE_API_URL=$API_URL"
echo ""
echo -e "${GREEN}Deployment complete!${NC}"
