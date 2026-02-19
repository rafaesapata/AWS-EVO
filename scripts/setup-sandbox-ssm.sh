#!/bin/bash
# =============================================================================
# Setup Sandbox SSM Parameters
#
# Configures all SSM parameters required for the sandbox environment under
# /evo/sandbox/. This script is idempotent — safe to run multiple times.
#
# Parameters created:
#   /evo/sandbox/token-encryption-key    (SecureString) — auto-generated
#   /evo/sandbox/azure-oauth-client-secret (SecureString) — from arg or prompt
#   /evo/sandbox/webauthn-rp-id          (String) — nuevacore.com
#   /evo/sandbox/webauthn-rp-name        (String) — EVO Platform (Sandbox)
#
# Usage:
#   ./scripts/setup-sandbox-ssm.sh
#   ./scripts/setup-sandbox-ssm.sh --azure-secret "your-secret-value"
#   ./scripts/setup-sandbox-ssm.sh --dry-run
#
# Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
AWS_PROFILE="EVO_SANDBOX"
AWS_REGION="us-east-1"
SSM_PREFIX="/evo/sandbox"
DRY_RUN=false
AZURE_SECRET=""

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --azure-secret)
      AZURE_SECRET="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--azure-secret <value>] [--dry-run]"
      echo ""
      echo "Options:"
      echo "  --azure-secret <value>  Azure OAuth client secret (prompted if not provided)"
      echo "  --dry-run               Show what would be done without making changes"
      echo "  --help                  Show this help message"
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

# Check if a parameter already exists in SSM
param_exists() {
  local name="$1"
  aws ssm get-parameter \
    --name "$name" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query "Parameter.Name" \
    --output text 2>/dev/null && return 0 || return 1
}

# Put a parameter into SSM (creates or overwrites)
put_param() {
  local name="$1"
  local type="$2"
  local value="$3"
  local description="$4"

  if $DRY_RUN; then
    info "[DRY-RUN] Would set $name ($type)"
    return 0
  fi

  if param_exists "$name"; then
    warn "Parameter $name already exists — overwriting"
  else
    info "Creating parameter $name"
  fi

  aws ssm put-parameter \
    --name "$name" \
    --type "$type" \
    --value "$value" \
    --description "$description" \
    --overwrite \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --output text > /dev/null

  info "✓ $name ($type)"
}

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
info "=== Setup Sandbox SSM Parameters ==="
info "Profile: $AWS_PROFILE | Region: $AWS_REGION | Prefix: $SSM_PREFIX"

if $DRY_RUN; then
  info "*** DRY-RUN MODE — no changes will be made ***"
fi

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
# 1. Token Encryption Key (SecureString) — generate new unique key
# ---------------------------------------------------------------------------
info ""
info "--- token-encryption-key ---"
TOKEN_KEY=$(openssl rand -base64 32)
put_param \
  "${SSM_PREFIX}/token-encryption-key" \
  "SecureString" \
  "$TOKEN_KEY" \
  "Token encryption key for sandbox (auto-generated, unique to sandbox)"

# ---------------------------------------------------------------------------
# 2. Azure OAuth Client Secret (SecureString) — from arg, prompt, or placeholder
# ---------------------------------------------------------------------------
info ""
info "--- azure-oauth-client-secret ---"

if [[ -z "$AZURE_SECRET" ]] && ! $DRY_RUN; then
  echo ""
  echo "Enter the Azure OAuth client secret for sandbox."
  echo "Press ENTER to use a placeholder value (you can update it later)."
  read -r -s -p "Azure OAuth Client Secret: " AZURE_SECRET
  echo ""

  if [[ -z "$AZURE_SECRET" ]]; then
    AZURE_SECRET="PLACEHOLDER_UPDATE_ME"
    warn "Using placeholder value — update later with:"
    warn "  aws ssm put-parameter --name ${SSM_PREFIX}/azure-oauth-client-secret --type SecureString --value '<real-secret>' --overwrite --profile $AWS_PROFILE --region $AWS_REGION"
  fi
fi

# In dry-run mode with no secret provided, use placeholder for display
if $DRY_RUN && [[ -z "$AZURE_SECRET" ]]; then
  AZURE_SECRET="PLACEHOLDER_UPDATE_ME"
fi

put_param \
  "${SSM_PREFIX}/azure-oauth-client-secret" \
  "SecureString" \
  "$AZURE_SECRET" \
  "Azure OAuth client secret for sandbox"

# ---------------------------------------------------------------------------
# 3. WebAuthn RP ID (String)
# ---------------------------------------------------------------------------
info ""
info "--- webauthn-rp-id ---"
put_param \
  "${SSM_PREFIX}/webauthn-rp-id" \
  "String" \
  "nuevacore.com" \
  "WebAuthn Relying Party ID — shared registrable domain"

# ---------------------------------------------------------------------------
# 4. WebAuthn RP Name (String)
# ---------------------------------------------------------------------------
info ""
info "--- webauthn-rp-name ---"
put_param \
  "${SSM_PREFIX}/webauthn-rp-name" \
  "String" \
  "EVO Platform (Sandbox)" \
  "WebAuthn Relying Party display name for sandbox"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
info ""
info "=== Done ==="
info "Parameters configured under ${SSM_PREFIX}/:"
info "  ${SSM_PREFIX}/token-encryption-key      (SecureString)"
info "  ${SSM_PREFIX}/azure-oauth-client-secret  (SecureString)"
info "  ${SSM_PREFIX}/webauthn-rp-id             (String)"
info "  ${SSM_PREFIX}/webauthn-rp-name           (String)"
info ""
info "Verify with:"
info "  aws ssm get-parameters-by-path --path ${SSM_PREFIX}/ --profile $AWS_PROFILE --region $AWS_REGION --query 'Parameters[].{Name:Name,Type:Type}' --output table"
