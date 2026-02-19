#!/bin/bash
# =============================================================================
# Sandbox Database Restore — Dump from Production, Restore to Sandbox
#
# Creates an SSH tunnel to the production RDS via bastion, runs pg_dump,
# then restores directly to the sandbox RDS (publicly accessible).
#
# Prerequisites:
#   - SSH access to the bastion host in the production VPC
#   - PostgreSQL client tools (pg_dump, psql) installed locally
#   - Production bastion host IP/DNS
#   - Database credentials for both environments
#
# Usage:
#   ./scripts/sandbox-db-restore.sh --bastion <host> --prod-pass <pass> --sandbox-pass <pass>
#   ./scripts/sandbox-db-restore.sh --bastion <host>          # prompts for passwords
#   ./scripts/sandbox-db-restore.sh --bastion <host> --dry-run
#   ./scripts/sandbox-db-restore.sh --help
#
# Requirements: 2.2, 2.7
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PROD_RDS_HOST="evo-uds-v3-prod-postgres.cib8kysoo015.us-east-1.rds.amazonaws.com"
SANDBOX_RDS_HOST="evo-uds-v3-sandbox-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com"
DB_NAME="evouds"
DB_USER="evoadmin"
DB_PORT=5432
LOCAL_TUNNEL_PORT=15432
SSH_KEY=""
BASTION_HOST=""
BASTION_USER="ec2-user"
PROD_PASS=""
SANDBOX_PASS=""
DRY_RUN=false
DUMP_FILE=""
KEEP_DUMP=false
TUNNEL_PID=""

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --bastion)
      BASTION_HOST="$2"
      shift 2
      ;;
    --bastion-user)
      BASTION_USER="$2"
      shift 2
      ;;
    --ssh-key|-i)
      SSH_KEY="$2"
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
    --dump-file)
      DUMP_FILE="$2"
      shift 2
      ;;
    --keep-dump)
      KEEP_DUMP=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      cat <<EOF
Usage: $0 --bastion <host> [options]

Required:
  --bastion <host>          Bastion host IP or DNS (production VPC)

Options:
  --bastion-user <user>     SSH user for bastion (default: ec2-user)
  --ssh-key, -i <path>      Path to SSH private key for bastion
  --prod-pass <password>    Production database password (prompted if omitted)
  --sandbox-pass <password> Sandbox database password (prompted if omitted)
  --dump-file <path>        Custom path for the dump file (default: auto-generated)
  --keep-dump               Keep the dump file after restore (default: delete)
  --dry-run                 Show what would be done without making changes
  --help                    Show this help message

Environment:
  Production RDS:  $PROD_RDS_HOST
  Sandbox RDS:     $SANDBOX_RDS_HOST
  Database:        $DB_NAME
  User:            $DB_USER

Prerequisites:
  - SSH access to the bastion host (key-based auth)
  - pg_dump and psql installed locally (PostgreSQL client tools)
  - Network access to sandbox RDS (publicly accessible)

Examples:
  # Full restore with prompts for passwords
  $0 --bastion 10.0.1.50

  # Full restore with all credentials
  $0 --bastion 10.0.1.50 --prod-pass 'secret1' --sandbox-pass 'secret2'

  # Dry run to see what would happen
  $0 --bastion 10.0.1.50 --dry-run

  # Keep dump file for inspection
  $0 --bastion 10.0.1.50 --keep-dump --dump-file /tmp/evouds-prod.sql
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
log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
info() { log "INFO  $*"; }
warn() { log "WARN  $*"; }
err()  { log "ERROR $*" >&2; }

cleanup() {
  local exit_code=$?
  if [[ -n "$TUNNEL_PID" ]] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    info "Closing SSH tunnel (PID: $TUNNEL_PID)..."
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
    info "✓ SSH tunnel closed"
  fi
  if [[ "$KEEP_DUMP" == false && -n "$DUMP_FILE" && -f "$DUMP_FILE" && "$DRY_RUN" == false ]]; then
    info "Cleaning up dump file: $DUMP_FILE"
    rm -f "$DUMP_FILE"
  fi
  if [[ $exit_code -ne 0 ]]; then
    err "Script failed with exit code $exit_code"
    err "You can retry by running the same command again (script is idempotent)"
  fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
info "=== Sandbox Database Restore ==="
info "Production RDS: $PROD_RDS_HOST"
info "Sandbox RDS:    $SANDBOX_RDS_HOST"
info "Database:       $DB_NAME | User: $DB_USER"

if $DRY_RUN; then
  info "*** DRY-RUN MODE — no changes will be made ***"
fi

# Check required argument
if [[ -z "$BASTION_HOST" ]]; then
  err "Bastion host is required. Use --bastion <host>"
  err "Run '$0 --help' for usage."
  exit 1
fi
info "Bastion:        $BASTION_USER@$BASTION_HOST"

# Check required tools
for cmd in pg_dump psql ssh; do
  if ! command -v "$cmd" &>/dev/null; then
    err "Required command '$cmd' not found. Please install it."
    exit 1
  fi
done
info "✓ Required tools available (pg_dump, psql, ssh)"

# Prompt for passwords if not provided
if [[ -z "$PROD_PASS" ]] && ! $DRY_RUN; then
  echo ""
  read -r -s -p "Production database password: " PROD_PASS
  echo ""
  if [[ -z "$PROD_PASS" ]]; then
    err "Production password is required."
    exit 1
  fi
fi

if [[ -z "$SANDBOX_PASS" ]] && ! $DRY_RUN; then
  read -r -s -p "Sandbox database password: " SANDBOX_PASS
  echo ""
  if [[ -z "$SANDBOX_PASS" ]]; then
    err "Sandbox password is required."
    exit 1
  fi
fi

# Set default dump file path
if [[ -z "$DUMP_FILE" ]]; then
  DUMP_FILE="/tmp/evouds-prod-dump-$(date '+%Y%m%d-%H%M%S').sql"
fi
info "Dump file:      $DUMP_FILE"

# ---------------------------------------------------------------------------
# Step 1: Create SSH tunnel to production RDS via bastion
# ---------------------------------------------------------------------------
info ""
info "--- Step 1: Creating SSH tunnel to production RDS ---"

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10 -o ServerAliveInterval=30 -N -f"
if [[ -n "$SSH_KEY" ]]; then
  SSH_OPTS="$SSH_OPTS -i $SSH_KEY"
fi

if $DRY_RUN; then
  info "[DRY-RUN] Would create SSH tunnel: localhost:$LOCAL_TUNNEL_PORT -> $PROD_RDS_HOST:$DB_PORT via $BASTION_HOST"
else
  # Kill any existing tunnel on the same port
  if lsof -i ":$LOCAL_TUNNEL_PORT" &>/dev/null; then
    warn "Port $LOCAL_TUNNEL_PORT already in use, attempting to free it..."
    lsof -ti ":$LOCAL_TUNNEL_PORT" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi

  info "Opening SSH tunnel: localhost:$LOCAL_TUNNEL_PORT -> $PROD_RDS_HOST:$DB_PORT"
  # shellcheck disable=SC2086
  ssh $SSH_OPTS \
    -L "$LOCAL_TUNNEL_PORT:$PROD_RDS_HOST:$DB_PORT" \
    "$BASTION_USER@$BASTION_HOST"

  # Wait for tunnel to be ready
  sleep 2

  # Find the SSH tunnel PID
  TUNNEL_PID=$(lsof -ti ":$LOCAL_TUNNEL_PORT" 2>/dev/null | head -1)
  if [[ -z "$TUNNEL_PID" ]]; then
    err "Failed to establish SSH tunnel. Check bastion connectivity."
    err "Try: ssh $BASTION_USER@$BASTION_HOST"
    exit 1
  fi
  info "✓ SSH tunnel established (PID: $TUNNEL_PID)"

  # Verify tunnel connectivity
  if ! PGPASSWORD="$PROD_PASS" psql -h localhost -p "$LOCAL_TUNNEL_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &>/dev/null; then
    err "SSH tunnel is up but cannot connect to production database."
    err "Check database credentials and RDS security group."
    exit 1
  fi
  info "✓ Production database reachable through tunnel"
fi

# ---------------------------------------------------------------------------
# Step 2: Dump production database
# ---------------------------------------------------------------------------
info ""
info "--- Step 2: Dumping production database ---"

if $DRY_RUN; then
  info "[DRY-RUN] Would run: pg_dump --no-owner --no-privileges -h localhost -p $LOCAL_TUNNEL_PORT -U $DB_USER $DB_NAME > $DUMP_FILE"
else
  info "Running pg_dump (this may take several minutes for large databases)..."
  DUMP_START=$(date +%s)

  PGPASSWORD="$PROD_PASS" pg_dump \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    --verbose \
    -h localhost \
    -p "$LOCAL_TUNNEL_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -f "$DUMP_FILE" \
    2>&1 | while IFS= read -r line; do log "pg_dump: $line"; done

  DUMP_END=$(date +%s)
  DUMP_DURATION=$((DUMP_END - DUMP_START))
  DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)

  if [[ ! -s "$DUMP_FILE" ]]; then
    err "Dump file is empty. pg_dump may have failed."
    exit 1
  fi

  info "✓ Dump completed in ${DUMP_DURATION}s — File: $DUMP_FILE ($DUMP_SIZE)"
fi

# ---------------------------------------------------------------------------
# Step 3: Close SSH tunnel
# ---------------------------------------------------------------------------
info ""
info "--- Step 3: Closing SSH tunnel ---"

if $DRY_RUN; then
  info "[DRY-RUN] Would close SSH tunnel"
else
  if [[ -n "$TUNNEL_PID" ]] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
    info "✓ SSH tunnel closed"
    TUNNEL_PID=""  # Prevent double-close in cleanup
  fi
fi

# ---------------------------------------------------------------------------
# Step 4: Restore to sandbox database
# ---------------------------------------------------------------------------
info ""
info "--- Step 4: Restoring to sandbox database ---"

if $DRY_RUN; then
  info "[DRY-RUN] Would run: psql -h $SANDBOX_RDS_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME < $DUMP_FILE"
else
  # Verify sandbox connectivity first
  info "Verifying sandbox database connectivity..."
  if ! PGPASSWORD="$SANDBOX_PASS" psql -h "$SANDBOX_RDS_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &>/dev/null; then
    err "Cannot connect to sandbox database."
    err "Check: credentials, security group allows your IP, RDS is publicly accessible."
    err "Dump file preserved at: $DUMP_FILE"
    KEEP_DUMP=true  # Preserve dump on failure
    exit 1
  fi
  info "✓ Sandbox database reachable"

  info "Running restore (this may take several minutes)..."
  RESTORE_START=$(date +%s)

  PGPASSWORD="$SANDBOX_PASS" psql \
    -h "$SANDBOX_RDS_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -f "$DUMP_FILE" \
    --set ON_ERROR_STOP=off \
    2>&1 | while IFS= read -r line; do
      # Filter out noise, show only errors and important messages
      case "$line" in
        ERROR*|FATAL*|WARNING*)
          log "psql: $line"
          ;;
      esac
    done

  RESTORE_END=$(date +%s)
  RESTORE_DURATION=$((RESTORE_END - RESTORE_START))
  info "✓ Restore completed in ${RESTORE_DURATION}s"

  # Quick sanity check — verify tables exist
  TABLE_COUNT=$(PGPASSWORD="$SANDBOX_PASS" psql \
    -h "$SANDBOX_RDS_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')

  if [[ "$TABLE_COUNT" -gt 0 ]]; then
    info "✓ Sanity check passed — $TABLE_COUNT tables in public schema"
  else
    warn "No tables found in public schema after restore. Check dump file contents."
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
info ""
info "=== Done ==="
info "Production dump → Sandbox restore completed successfully."
if $KEEP_DUMP; then
  info "Dump file preserved at: $DUMP_FILE"
else
  info "Dump file cleaned up."
fi
info ""
info "Verify with:"
info "  PGPASSWORD='<sandbox-pass>' psql -h $SANDBOX_RDS_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c '\\dt'"
