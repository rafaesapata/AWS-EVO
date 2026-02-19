#!/bin/bash
# =============================================================================
# Setup Sandbox CI/CD Pipeline
#
# Deploys the CodePipeline stack for the sandbox environment using the
# CloudFormation template at cicd/cloudformation/sam-pipeline-stack.yaml.
#
# What it creates:
#   - CodePipeline (evo-sam-pipeline-sandbox) triggered by branch "sandbox"
#   - CodeBuild project (ARM64 container, BUILD_GENERAL1_LARGE)
#   - IAM roles for CodeBuild and CodePipeline
#   - SNS topic for pipeline notifications
#   - S3 artifacts bucket (if not already existing)
#
# Usage:
#   ./scripts/setup-sandbox-pipeline.sh
#   ./scripts/setup-sandbox-pipeline.sh --dry-run
#
# Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
AWS_PROFILE="EVO_SANDBOX"
AWS_REGION="us-east-1"
STACK_NAME="evo-sam-pipeline-sandbox"
TEMPLATE_FILE="cicd/cloudformation/sam-pipeline-stack.yaml"
GITHUB_OWNER="rafaesapata"
GITHUB_REPO="AWS-EVO"
GITHUB_BRANCH="sandbox"
ARTIFACTS_BUCKET="evo-sam-artifacts-971354623291"
DRY_RUN=false

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--dry-run]"
      echo ""
      echo "Options:"
      echo "  --dry-run   Show what would be done without making changes"
      echo "  --help      Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Run '$0 --help' for usage."
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { echo "[$(date '+%H:%M:%S')] $*"; }
info() { log "INFO  $*"; }
warn() { log "WARN  $*"; }
err()  { log "ERROR $*" >&2; }

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
info "=== Setup Sandbox CI/CD Pipeline ==="
info "Profile: $AWS_PROFILE | Region: $AWS_REGION"
info "Stack:   $STACK_NAME"
info "Branch:  $GITHUB_BRANCH"

if $DRY_RUN; then
  info "*** DRY-RUN MODE — no changes will be made ***"
fi

# Verify template file exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE_PATH="$PROJECT_ROOT/$TEMPLATE_FILE"

if [[ ! -f "$TEMPLATE_PATH" ]]; then
  err "Template not found: $TEMPLATE_PATH"
  exit 1
fi
info "Template: $TEMPLATE_FILE ✓"

# Verify AWS credentials
if ! aws sts get-caller-identity --profile "$AWS_PROFILE" --region "$AWS_REGION" > /dev/null 2>&1; then
  err "Cannot authenticate with profile $AWS_PROFILE. Check your AWS credentials."
  exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --region "$AWS_REGION" --query "Account" --output text)
info "Authenticated — Account: $ACCOUNT_ID"

if [[ "$ACCOUNT_ID" != "971354623291" ]]; then
  err "Expected account 971354623291 (sandbox) but got $ACCOUNT_ID. Aborting."
  exit 1
fi

# ---------------------------------------------------------------------------
# Find GitHub Connection ARN via CodeStar Connections
# ---------------------------------------------------------------------------
info ""
info "--- Looking up GitHub Connection ARN ---"

GITHUB_CONNECTION_ARN=$(aws codestar-connections list-connections \
  --provider-type-filter GitHub \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query "Connections[?ConnectionStatus=='AVAILABLE'].ConnectionArn | [0]" \
  --output text 2>/dev/null || true)

if [[ -z "$GITHUB_CONNECTION_ARN" || "$GITHUB_CONNECTION_ARN" == "None" ]]; then
  # Fallback: try codeconnections (newer API)
  GITHUB_CONNECTION_ARN=$(aws codeconnections list-connections \
    --provider-type-filter GitHub \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query "Connections[?ConnectionStatus=='AVAILABLE'].ConnectionArn | [0]" \
    --output text 2>/dev/null || true)
fi

if [[ -z "$GITHUB_CONNECTION_ARN" || "$GITHUB_CONNECTION_ARN" == "None" ]]; then
  err "No available GitHub connection found in account $ACCOUNT_ID."
  err "Create one at: https://console.aws.amazon.com/codesuite/settings/connections"
  exit 1
fi

info "GitHub Connection: $GITHUB_CONNECTION_ARN ✓"

# ---------------------------------------------------------------------------
# Check current stack status (if exists)
# ---------------------------------------------------------------------------
info ""
info "--- Checking existing stack ---"

STACK_STATUS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query "Stacks[0].StackStatus" \
  --output text 2>/dev/null || echo "DOES_NOT_EXIST")

if [[ "$STACK_STATUS" == "DOES_NOT_EXIST" ]]; then
  info "Stack $STACK_NAME does not exist — will create"
elif [[ "$STACK_STATUS" == *"ROLLBACK_COMPLETE"* ]]; then
  warn "Stack $STACK_NAME is in $STACK_STATUS — deleting before re-create"
  if ! $DRY_RUN; then
    aws cloudformation delete-stack \
      --stack-name "$STACK_NAME" \
      --profile "$AWS_PROFILE" \
      --region "$AWS_REGION"
    info "Waiting for stack deletion..."
    aws cloudformation wait stack-delete-complete \
      --stack-name "$STACK_NAME" \
      --profile "$AWS_PROFILE" \
      --region "$AWS_REGION"
    info "Stack deleted ✓"
  fi
else
  info "Stack $STACK_NAME exists ($STACK_STATUS) — will update"
fi

# ---------------------------------------------------------------------------
# Deploy CloudFormation stack
# ---------------------------------------------------------------------------
info ""
info "--- Deploying pipeline stack ---"
info "Parameters:"
info "  Environment:         sandbox"
info "  GitHubOwner:         $GITHUB_OWNER"
info "  GitHubRepo:          $GITHUB_REPO"
info "  GitHubBranch:        $GITHUB_BRANCH"
info "  GitHubConnectionArn: $GITHUB_CONNECTION_ARN"
info "  ArtifactsBucketName: $ARTIFACTS_BUCKET"

if $DRY_RUN; then
  info ""
  info "[DRY-RUN] Would run:"
  info "  aws cloudformation deploy \\"
  info "    --template-file $TEMPLATE_FILE \\"
  info "    --stack-name $STACK_NAME \\"
  info "    --parameter-overrides \\"
  info "      Environment=sandbox \\"
  info "      GitHubOwner=$GITHUB_OWNER \\"
  info "      GitHubRepo=$GITHUB_REPO \\"
  info "      GitHubBranch=$GITHUB_BRANCH \\"
  info "      GitHubConnectionArn=$GITHUB_CONNECTION_ARN \\"
  info "      ArtifactsBucketName=$ARTIFACTS_BUCKET \\"
  info "    --capabilities CAPABILITY_NAMED_IAM \\"
  info "    --profile $AWS_PROFILE \\"
  info "    --region $AWS_REGION"
  info ""
  info "[DRY-RUN] Complete — no changes made."
  exit 0
fi

info ""
info "Deploying... (this may take a few minutes)"

aws cloudformation deploy \
  --template-file "$TEMPLATE_PATH" \
  --stack-name "$STACK_NAME" \
  --parameter-overrides \
    Environment=sandbox \
    GitHubOwner="$GITHUB_OWNER" \
    GitHubRepo="$GITHUB_REPO" \
    GitHubBranch="$GITHUB_BRANCH" \
    GitHubConnectionArn="$GITHUB_CONNECTION_ARN" \
    ArtifactsBucketName="$ARTIFACTS_BUCKET" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"

info "Stack deployed ✓"

# ---------------------------------------------------------------------------
# Show outputs
# ---------------------------------------------------------------------------
info ""
info "--- Stack Outputs ---"

aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query "Stacks[0].Outputs[].{Key:OutputKey,Value:OutputValue}" \
  --output table

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
info ""
info "=== Done ==="
info "Pipeline $STACK_NAME deployed successfully."
info ""
info "Next steps:"
info "  1. Push to branch '$GITHUB_BRANCH' to trigger the pipeline"
info "  2. Monitor at: https://$AWS_REGION.console.aws.amazon.com/codesuite/codepipeline/pipelines/evo-sam-pipeline-sandbox/view"
info "  3. Subscribe to notifications: aws sns subscribe --topic-arn <topic-arn> --protocol email --notification-endpoint your@email.com --profile $AWS_PROFILE --region $AWS_REGION"
