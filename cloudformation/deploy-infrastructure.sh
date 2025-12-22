#!/bin/bash

# EVO UDS - Complete Infrastructure Deployment Script
# Usage: ./deploy-infrastructure.sh <environment> <admin-email>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check arguments
if [ $# -lt 2 ]; then
    log_error "Usage: $0 <environment> <admin-email>"
    log_error "Example: $0 production admin@example.com"
    exit 1
fi

ENVIRONMENT=$1
ADMIN_EMAIL=$2
PROJECT_NAME="evo-uds"
REGION=${AWS_REGION:-us-east-1}
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

log_info "Starting EVO UDS Infrastructure Deployment"
log_info "Environment: $ENVIRONMENT"
log_info "Admin Email: $ADMIN_EMAIL"
log_info "AWS Account: $AWS_ACCOUNT_ID"
log_info "Region: $REGION"

# Step 1: Create S3 bucket for CloudFormation templates
log_info "Step 1: Creating S3 bucket for CloudFormation templates..."
TEMPLATE_BUCKET="${PROJECT_NAME}-cloudformation-${AWS_ACCOUNT_ID}"

if aws s3 ls "s3://${TEMPLATE_BUCKET}" 2>&1 | grep -q 'NoSuchBucket'; then
    aws s3 mb "s3://${TEMPLATE_BUCKET}" --region ${REGION}
    log_info "Created bucket: ${TEMPLATE_BUCKET}"
else
    log_info "Bucket already exists: ${TEMPLATE_BUCKET}"
fi

# Step 2: Upload CloudFormation templates
log_info "Step 2: Uploading CloudFormation templates..."
aws s3 sync . "s3://${TEMPLATE_BUCKET}/" \
    --exclude "*.md" \
    --exclude "*.sh" \
    --exclude ".git/*" \
    --region ${REGION}
log_info "Templates uploaded successfully"

# Step 3: Create Lambda code bucket
log_info "Step 3: Creating S3 bucket for Lambda code..."
LAMBDA_BUCKET="${PROJECT_NAME}-lambda-code-${AWS_ACCOUNT_ID}"

if aws s3 ls "s3://${LAMBDA_BUCKET}" 2>&1 | grep -q 'NoSuchBucket'; then
    aws s3 mb "s3://${LAMBDA_BUCKET}" --region ${REGION}
    log_info "Created bucket: ${LAMBDA_BUCKET}"
else
    log_info "Bucket already exists: ${LAMBDA_BUCKET}"
fi

# Step 4: Build and upload Lambda functions
log_info "Step 4: Building Lambda functions..."
cd ../backend
npm run build
log_info "Lambda functions built successfully"

# Step 5: Deploy CloudFormation stack
log_info "Step 5: Deploying CloudFormation master stack..."
STACK_NAME="${PROJECT_NAME}-${ENVIRONMENT}-master"

aws cloudformation create-stack \
    --stack-name ${STACK_NAME} \
    --template-url "https://${TEMPLATE_BUCKET}.s3.amazonaws.com/master-stack.yaml" \
    --parameters \
        ParameterKey=Environment,ParameterValue=${ENVIRONMENT} \
        ParameterKey=ProjectName,ParameterValue=${PROJECT_NAME} \
        ParameterKey=AdminEmail,ParameterValue=${ADMIN_EMAIL} \
        ParameterKey=DBInstanceClass,ParameterValue=db.t3.micro \
        ParameterKey=DBAllocatedStorage,ParameterValue=20 \
    --capabilities CAPABILITY_NAMED_IAM \
    --region ${REGION}

log_info "Stack creation initiated. Waiting for completion..."
aws cloudformation wait stack-create-complete \
    --stack-name ${STACK_NAME} \
    --region ${REGION}

log_info "Stack created successfully!"

# Step 6: Get outputs
log_info "Step 6: Retrieving stack outputs..."
aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --query 'Stacks[0].Outputs' \
    --output table \
    --region ${REGION}

log_info "Deployment completed successfully!"
log_info "Next steps:"
log_info "1. Deploy Lambda functions"
log_info "2. Run database migrations"
log_info "3. Create admin user in Cognito"
log_info "4. Deploy frontend to S3"
