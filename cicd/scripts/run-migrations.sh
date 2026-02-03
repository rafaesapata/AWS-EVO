#!/bin/bash
# =============================================================================
# Database Migration Script for CI/CD Pipeline
# =============================================================================
#
# Este script executa migrações Prisma de forma segura no pipeline CI/CD.
#
# Estratégia:
# 1. Verificar conectividade com o banco
# 2. Verificar se há migrações pendentes
# 3. Aplicar migrações usando `prisma migrate deploy`
# 4. Verificar integridade do schema pós-migração
#
# Uso:
#   ./cicd/scripts/run-migrations.sh [--dry-run] [--force]
#
# Opções:
#   --dry-run   Apenas verifica, não aplica migrações
#   --force     Aplica migrações mesmo se houver warnings
#
# =============================================================================

set -e

# Cores para output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Configurações
readonly SCRIPT_DIR="$(dirname "$0")"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
readonly BACKEND_DIR="$PROJECT_ROOT/backend"
readonly SCHEMA_PATH="$BACKEND_DIR/prisma/schema.prisma"
readonly MAX_RETRIES=3
readonly RETRY_DELAY_SECONDS=5
readonly DEFAULT_SCHEMA="public"

# Parse argumentos
DRY_RUN=false
FORCE=false

for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
  esac
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Database Migration Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Verificar se DATABASE_URL está definida
if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}❌ ERROR: DATABASE_URL environment variable is not set${NC}"
  echo ""
  echo "Set DATABASE_URL before running migrations:"
  echo "  export DATABASE_URL='postgresql://user:pass@host:5432/db'"
  exit 1
fi

# Mascarar senha no log
MASKED_URL=$(echo "$DATABASE_URL" | sed 's/:[^:@]*@/:***@/')
echo -e "${BLUE}📍 Database:${NC} $MASKED_URL"
echo -e "${BLUE}📁 Backend:${NC} $BACKEND_DIR"
echo -e "${BLUE}🔧 Dry Run:${NC} $DRY_RUN"
echo -e "${BLUE}⚡ Force:${NC} $FORCE"
echo ""

# =============================================================================
# Step 1: Verificar conectividade
# =============================================================================
echo -e "${YELLOW}Step 1: Checking database connectivity...${NC}"

for i in $(seq 1 $MAX_RETRIES); do
  if npx prisma db execute --stdin --schema="$SCHEMA_PATH" <<< "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Database connection successful${NC}"
    break
  else
    if [ $i -eq $MAX_RETRIES ]; then
      echo -e "${RED}❌ Failed to connect to database after $MAX_RETRIES attempts${NC}"
      exit 1
    fi
    echo -e "${YELLOW}⏳ Connection attempt $i failed, retrying in ${RETRY_DELAY_SECONDS}s...${NC}"
    sleep $RETRY_DELAY_SECONDS
  fi
done

echo ""

# =============================================================================
# Step 2: Verificar status das migrações
# =============================================================================
echo -e "${YELLOW}Step 2: Checking migration status...${NC}"

# Capturar output do migrate status
MIGRATE_STATUS=$(npx prisma migrate status --schema="$SCHEMA_PATH" 2>&1) || true

echo "$MIGRATE_STATUS"
echo ""

# Verificar se há migrações pendentes
if echo "$MIGRATE_STATUS" | grep -q "Database schema is up to date"; then
  echo -e "${GREEN}✅ No pending migrations${NC}"
  
  if [ "$DRY_RUN" = true ]; then
    echo -e "${BLUE}ℹ️  Dry run complete - no changes needed${NC}"
    exit 0
  fi
  
  # Mesmo sem migrações pendentes, gerar Prisma Client
  echo ""
  echo -e "${YELLOW}Step 3: Generating Prisma Client...${NC}"
  npx prisma generate --schema="$SCHEMA_PATH"
  echo -e "${GREEN}✅ Prisma Client generated${NC}"
  
  exit 0
fi

# Verificar se há migrações para aplicar
if echo "$MIGRATE_STATUS" | grep -q "Following migration"; then
  PENDING_COUNT=$(echo "$MIGRATE_STATUS" | grep -c "Following migration" || echo "1")
  echo -e "${YELLOW}⚠️  Found $PENDING_COUNT pending migration(s)${NC}"
fi

# =============================================================================
# Step 3: Aplicar migrações (se não for dry-run)
# =============================================================================
if [ "$DRY_RUN" = true ]; then
  echo -e "${BLUE}ℹ️  Dry run mode - skipping migration deployment${NC}"
  echo ""
  echo "To apply migrations, run without --dry-run:"
  echo "  ./cicd/scripts/run-migrations.sh"
  exit 0
fi

echo ""
echo -e "${YELLOW}Step 3: Applying migrations...${NC}"

# Executar migrate deploy
if npx prisma migrate deploy --schema="$SCHEMA_PATH"; then
  echo -e "${GREEN}✅ Migrations applied successfully${NC}"
else
  echo -e "${RED}❌ Migration failed${NC}"
  
  if [ "$FORCE" = true ]; then
    echo -e "${YELLOW}⚠️  Force mode enabled - continuing despite error${NC}"
  else
    exit 1
  fi
fi

echo ""

# =============================================================================
# Step 4: Gerar Prisma Client
# =============================================================================
echo -e "${YELLOW}Step 4: Generating Prisma Client...${NC}"

npx prisma generate --schema="$SCHEMA_PATH"

echo -e "${GREEN}✅ Prisma Client generated${NC}"
echo ""

# =============================================================================
# Step 5: Verificar integridade pós-migração
# =============================================================================
echo -e "${YELLOW}Step 5: Verifying schema integrity...${NC}"

# Verificar se tabelas essenciais existem
ESSENTIAL_TABLES=(
  "organizations"
  "profiles"
  "aws_credentials"
  "azure_credentials"
  "security_scans"
  "findings"
  "daily_costs"
  "licenses"
)

MISSING_TABLES=()

for table in "${ESSENTIAL_TABLES[@]}"; do
  EXISTS=$(npx prisma db execute --schema="$SCHEMA_PATH" --stdin <<< "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = '$DEFAULT_SCHEMA' AND tablename = '$table');" 2>/dev/null | grep -c "t" || echo "0")
  
  if [ "$EXISTS" -eq "0" ]; then
    MISSING_TABLES+=("$table")
  fi
done

if [ ${#MISSING_TABLES[@]} -eq 0 ]; then
  echo -e "${GREEN}✅ All essential tables present${NC}"
else
  echo -e "${RED}❌ Missing essential tables: ${MISSING_TABLES[*]}${NC}"
  
  if [ "$FORCE" = false ]; then
    exit 1
  fi
fi

echo ""

# =============================================================================
# Summary
# =============================================================================
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}   Migration Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Next steps:"
echo -e "  1. Deploy Lambda functions with updated Prisma Client"
echo -e "  2. Verify application functionality"
echo -e "  3. Monitor for any database errors"
echo ""
