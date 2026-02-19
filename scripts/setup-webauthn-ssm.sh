#!/bin/bash
# =============================================================================
# Setup WebAuthn SSM Parameters
# Run once per environment to create the SSM parameters for WebAuthn config.
#
# Usage:
#   ./scripts/setup-webauthn-ssm.sh production
#   ./scripts/setup-webauthn-ssm.sh sandbox
# =============================================================================

set -euo pipefail

ENV="${1:-production}"

if [[ "$ENV" != "production" && "$ENV" != "sandbox" ]]; then
  echo "Usage: $0 <production|sandbox>"
  exit 1
fi

echo "=== Creating WebAuthn SSM Parameters for $ENV ==="

# WebAuthn RP ID (registrable domain — allows subdomains like evo.nuevacore.com)
aws ssm put-parameter \
  --name "/evo/${ENV}/webauthn-rp-id" \
  --type "String" \
  --value "nuevacore.com" \
  --description "WebAuthn Relying Party ID (registrable domain)" \
  --overwrite

# WebAuthn RP Name (display name shown in browser prompts)
aws ssm put-parameter \
  --name "/evo/${ENV}/webauthn-rp-name" \
  --type "String" \
  --value "EVO Platform" \
  --description "WebAuthn Relying Party display name" \
  --overwrite

echo "=== Done. Parameters created: ==="
echo "  /evo/${ENV}/webauthn-rp-id"
echo "  /evo/${ENV}/webauthn-rp-name"
echo ""
echo "Verify with:"
echo "  aws ssm get-parameter --name /evo/${ENV}/webauthn-rp-id --query Parameter.Value --output text"
echo "  aws ssm get-parameter --name /evo/${ENV}/webauthn-rp-name --query Parameter.Value --output text"
