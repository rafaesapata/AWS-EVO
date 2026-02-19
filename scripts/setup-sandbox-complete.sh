#!/bin/bash
# =============================================================================
# Complete Sandbox Environment Setup — Master Orchestrator
#
# Runs all sandbox setup scripts in the correct order:
#   1. SSM Parameters          (setup-sandbox-ssm.sh)
#   2. API Gateway Custom Domain (setup-sandbox-api-domain.sh)
#   3. CloudFront Custom Domain  (setup-sandbox-cloudfront.sh)
#   4. CI/CD Pipeline            (setup-sandbox-pipeline.sh)
#   5. Database dump/restore     (sandbox-db-restore.sh) — requires confirmation
#   6. Environment verification  (verify-sandbox.sh)
#
# Each step can be skipped individually. The script stops on first failure
# unless --continue-on-error is used.
#
# Usage:
#   ./scripts/setup-sandbox-complete.sh
#   ./scripts/setup-sandbox-complete.sh --dry-run
#   ./scripts/setup-sandbox-complete.sh --skip-db
#   ./scripts/setup-sandbox-complete.sh --verify-only
#   ./scripts/setup-sandbox-complete.sh --bastion 10.0.1.50 --confirm-db
#   ./scripts/setup-sandbox-complete.sh --skip-ssm --skip-pipeline --dry-run
#
# Requirements: 1-12 (all)
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN=false
CONTINUE_ON_ERROR=false
VERIFY_ONLY=false

# Step skip flags
SKIP_SSM=false
SKIP_API_DOMAIN=false
SKIP_CLOUDFRONT=false
SKIP_PIPELINE=false
SKIP_DB=false
SKIP_VERIFY=false

# DB restore options (passed through to sandbox-db-restore.sh)
BASTION_HOST=""
PROD_PASS=""
SANDBOX_PASS=""
CONFIRM_DB=false

# Timing
TOTAL_START=""

# Step tracking
STEPS_RUN=0
STEPS_PASSED=0
STEPS_FAILED=0
STEPS_SKIPPED=0

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --continue-on-error)
      CONTINUE_ON_ERROR=true
      shift
      ;;
    --verify-only)
      VERIFY_ONLY=true
      shift
      ;;
    --skip-ssm)
      SKIP_SSM=true
      shift
      ;;
    --skip-api-domain)
      SKIP_API_DOMAIN=true
      shift
      ;;
    --skip-cloudfront)
      SKIP_CLOUDFRONT=true
      shift
      ;;
    --skip-pipeline)
      SKIP_PIPELINE=true
      shift
      ;;
    --skip-db)
      SKIP_DB=true
      shift
      ;;
    --skip-verify)
      SKIP_VERIFY=true
      shift
      ;;
    --confirm-db)
      CONFIRM_DB=true
      shift
      ;;
    --bastion)
      BASTION_HOST="$2"
      shift 2
      ;;
    --prod-pass)
      PROD_PASS="$2"
      shift 2
      ;;
    --sandbox-pass)
      SANDBOX_PASS="$2"
      shift 2
      ;;
    --help|-h)
      cat <<EOF
Usage: $0 [options]

Orchestrates the complete sandbox environment setup by running all
individual scripts in the correct order.

Step Control:
  --verify-only         Run only the verification step (skip all setup)
  --skip-ssm            Skip SSM parameters setup
  --skip-api-domain     Skip API Gateway custom domain setup
  --skip-cloudfront     Skip CloudFront custom domain setup
  --skip-pipeline       Skip CI/CD pipeline setup
  --skip-db             Skip database dump/restore
  --skip-verify         Skip environment verification

Database Restore Options:
  --bastion <host>      Bastion host for DB dump (required for DB step)
  --prod-pass <pass>    Production database password
  --sandbox-pass <pass> Sandbox database password
  --confirm-db          Skip DB restore confirmation prompt

General:
  --dry-run             Pass --dry-run to all sub-scripts
  --continue-on-error   Continue to next step even if one fails
  --help                Show this help message

Execution Order:
  1. SSM Parameters           → setup-sandbox-ssm.sh
  2. API Gateway Custom Domain → setup-sandbox-api-domain.sh
  3. CloudFront Custom Domain  → setup-sandbox-cloudfront.sh
  4. CI/CD Pipeline            → setup-sandbox-pipeline.sh
  5. Database Dump/Restore     → sandbox-db-restore.sh (needs --bastion)
  6. Environment Verification  → verify-sandbox.sh

Examples:
  # Full setup with dry-run
  $0 --dry-run

  # Setup everything except database
  $0 --skip-db

  # Full setup including database
  $0 --bastion 10.0.1.50 --confirm-db

  # Only verify the environment
  $0 --verify-only

  # Re-run only SSM and verification
  $0 --skip-api-domain --skip-cloudfront --skip-pipeline --skip-db
EOF
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

format_duration() {
  local seconds=$1
  if [[ $seconds -ge 60 ]]; then
    printf "%dm %ds" $((seconds / 60)) $((seconds % 60))
  else
    printf "%ds" "$seconds"
  fi
}

# Run a step: run_step <step_number> <step_name> <script> [args...]
run_step() {
  local step_num="$1"
  local step_name="$2"
  local script="$3"
  shift 3
  local args=("$@")

  STEPS_RUN=$((STEPS_RUN + 1))

  info ""
  info "=========================================="
  info "  Step $step_num: $step_name"
  info "=========================================="

  local script_path="$SCRIPT_DIR/$script"
  if [[ ! -f "$script_path" ]]; then
    err "Script not found: $script_path"
    STEPS_FAILED=$((STEPS_FAILED + 1))
    if ! $CONTINUE_ON_ERROR; then
      err "Aborting. Use --continue-on-error to proceed past failures."
      return 1
    fi
    return 0
  fi

  if [[ ! -x "$script_path" ]]; then
    warn "Script not executable, running with bash: $script"
  fi

  local step_start
  step_start=$(date +%s)

  local exit_code=0
  bash "$script_path" "${args[@]}" || exit_code=$?

  local step_end
  step_end=$(date +%s)
  local step_duration=$((step_end - step_start))

  if [[ $exit_code -eq 0 ]]; then
    STEPS_PASSED=$((STEPS_PASSED + 1))
    info "✅ Step $step_num completed in $(format_duration $step_duration)"
  else
    STEPS_FAILED=$((STEPS_FAILED + 1))
    err "❌ Step $step_num failed (exit code $exit_code) after $(format_duration $step_duration)"
    if ! $CONTINUE_ON_ERROR; then
      err "Aborting. Use --continue-on-error to proceed past failures."
      return 1
    fi
    warn "Continuing to next step (--continue-on-error)"
  fi

  return 0
}

skip_step() {
  local step_num="$1"
  local step_name="$2"
  STEPS_SKIPPED=$((STEPS_SKIPPED + 1))
  info ""
  info "⏭️  Step $step_num: $step_name — SKIPPED"
}

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
info "=========================================="
info "  Complete Sandbox Environment Setup"
info "=========================================="
info ""

if $DRY_RUN; then
  info "*** DRY-RUN MODE — --dry-run will be passed to all sub-scripts ***"
  info ""
fi

if $CONTINUE_ON_ERROR; then
  info "*** CONTINUE-ON-ERROR MODE — will not stop on failures ***"
  info ""
fi

if $VERIFY_ONLY; then
  info "*** VERIFY-ONLY MODE — skipping all setup steps ***"
  info ""
fi

TOTAL_START=$(date +%s)

# ---------------------------------------------------------------------------
# Step 1: SSM Parameters
# ---------------------------------------------------------------------------
if $VERIFY_ONLY || $SKIP_SSM; then
  skip_step 1 "SSM Parameters"
else
  STEP_ARGS=()
  if $DRY_RUN; then STEP_ARGS+=("--dry-run"); fi
  run_step 1 "SSM Parameters" "setup-sandbox-ssm.sh" "${STEP_ARGS[@]}"
fi

# ---------------------------------------------------------------------------
# Step 2: API Gateway Custom Domain
# ---------------------------------------------------------------------------
if $VERIFY_ONLY || $SKIP_API_DOMAIN; then
  skip_step 2 "API Gateway Custom Domain"
else
  STEP_ARGS=()
  if $DRY_RUN; then STEP_ARGS+=("--dry-run"); fi
  run_step 2 "API Gateway Custom Domain" "setup-sandbox-api-domain.sh" "${STEP_ARGS[@]}"
fi

# ---------------------------------------------------------------------------
# Step 3: CloudFront Custom Domain
# ---------------------------------------------------------------------------
if $VERIFY_ONLY || $SKIP_CLOUDFRONT; then
  skip_step 3 "CloudFront Custom Domain"
else
  STEP_ARGS=()
  if $DRY_RUN; then STEP_ARGS+=("--dry-run"); fi
  run_step 3 "CloudFront Custom Domain" "setup-sandbox-cloudfront.sh" "${STEP_ARGS[@]}"
fi

# ---------------------------------------------------------------------------
# Step 4: CI/CD Pipeline
# ---------------------------------------------------------------------------
if $VERIFY_ONLY || $SKIP_PIPELINE; then
  skip_step 4 "CI/CD Pipeline"
else
  STEP_ARGS=()
  if $DRY_RUN; then STEP_ARGS+=("--dry-run"); fi
  run_step 4 "CI/CD Pipeline" "setup-sandbox-pipeline.sh" "${STEP_ARGS[@]}"
fi

# ---------------------------------------------------------------------------
# Step 5: Database Dump/Restore
# ---------------------------------------------------------------------------
if $VERIFY_ONLY || $SKIP_DB; then
  skip_step 5 "Database Dump/Restore"
else
  # Database restore requires explicit confirmation
  if ! $CONFIRM_DB && ! $DRY_RUN; then
    info ""
    info "=========================================="
    info "  Step 5: Database Dump/Restore"
    info "=========================================="
    warn "⚠️  This step will dump the PRODUCTION database and restore it to SANDBOX."
    warn "   This is a destructive operation on the sandbox database."
    echo ""
    read -r -p "Do you want to proceed with database restore? [y/N] " DB_CONFIRM
    echo ""
    if [[ ! "$DB_CONFIRM" =~ ^[Yy]$ ]]; then
      info "Database restore skipped by user."
      STEPS_SKIPPED=$((STEPS_SKIPPED + 1))
    else
      CONFIRM_DB=true
    fi
  fi

  if $CONFIRM_DB || $DRY_RUN; then
    # Check bastion host is provided
    if [[ -z "$BASTION_HOST" ]] && ! $DRY_RUN; then
      warn "No --bastion host provided. Skipping database restore."
      warn "Use: $0 --bastion <host> --confirm-db"
      STEPS_SKIPPED=$((STEPS_SKIPPED + 1))
    else
      STEP_ARGS=()
      if $DRY_RUN; then
        STEP_ARGS+=("--dry-run")
        # Bastion is required even for dry-run display
        if [[ -n "$BASTION_HOST" ]]; then
          STEP_ARGS+=("--bastion" "$BASTION_HOST")
        else
          STEP_ARGS+=("--bastion" "DRY-RUN-PLACEHOLDER")
        fi
      else
        STEP_ARGS+=("--bastion" "$BASTION_HOST")
      fi
      if [[ -n "$PROD_PASS" ]]; then STEP_ARGS+=("--prod-pass" "$PROD_PASS"); fi
      if [[ -n "$SANDBOX_PASS" ]]; then STEP_ARGS+=("--sandbox-pass" "$SANDBOX_PASS"); fi
      run_step 5 "Database Dump/Restore" "sandbox-db-restore.sh" "${STEP_ARGS[@]}"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Step 6: Environment Verification
# ---------------------------------------------------------------------------
if $SKIP_VERIFY; then
  skip_step 6 "Environment Verification"
else
  STEP_ARGS=()
  if $DRY_RUN; then STEP_ARGS+=("--dry-run"); fi
  STEP_ARGS+=("--verbose")
  run_step 6 "Environment Verification" "verify-sandbox.sh" "${STEP_ARGS[@]}"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
TOTAL_END=$(date +%s)
TOTAL_DURATION=$((TOTAL_END - TOTAL_START))

info ""
info "=========================================="
info "  Setup Summary"
info "=========================================="
info "  ✅ Passed:  $STEPS_PASSED"
info "  ❌ Failed:  $STEPS_FAILED"
info "  ⏭️  Skipped: $STEPS_SKIPPED"
info "  📊 Total:   $((STEPS_PASSED + STEPS_FAILED + STEPS_SKIPPED))"
info "  ⏱️  Duration: $(format_duration $TOTAL_DURATION)"
info "=========================================="

if [[ $STEPS_FAILED -eq 0 ]]; then
  info ""
  info "🎉 Sandbox environment setup completed successfully!"
  exit 0
else
  info ""
  err "⚠️  $STEPS_FAILED step(s) failed. Review the output above for details."
  exit 1
fi
