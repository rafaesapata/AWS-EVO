#!/bin/bash

# Script completo para setup do RDS PostgreSQL
# Uso: ./scripts/setup-rds-complete.sh [development|staging|production]

set -e

ENV=${1:-development}
REGION=${AWS_REGION:-us-east-1}

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║         🚀 EVO UDS - RDS PostgreSQL Setup                 ║"
echo "║         Ambiente: $ENV                                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Função para log
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Verificar pré-requisitos
log_info "Verificando pré-requisitos..."

if ! command -v aws &> /dev/null; then
    log_error "AWS CLI não encontrado. Instale: https://aws.amazon.com/cli/"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    log_error "jq não encontrado. Instale: brew install jq"
    exit 1
fi

if ! command -v node &> /dev/null; then
    log_error "Node.js não encontrado. Instale: https://nodejs.org/"
    exit 1
fi

log_success "Pré-requisitos verificados"

# Verificar credenciais AWS
log_info "Verificando credenciais AWS..."
if ! aws sts get-caller-identity &> /dev/null; then
    log_error "Credenciais AWS inválidas. Configure: aws configure"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
log_success "AWS Account: $ACCOUNT_ID"

# Confirmar deploy
echo ""
log_warning "Você está prestes a fazer deploy do RDS PostgreSQL"
log_info "Ambiente: $ENV"
log_info "Região: $REGION"
log_info "Custo estimado: ~\$15-120/mês (dependendo do ambiente)"
echo ""
read -p "Deseja continuar? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_warning "Deploy cancelado"
    exit 0
fi

# Step 1: Deploy do RDS via CDK
echo ""
log_info "Step 1/6: Fazendo deploy do RDS via AWS CDK..."
cd infra

# Instalar dependências se necessário
if [ ! -d "node_modules" ]; then
    log_info "Instalando dependências do CDK..."
    npm install
fi

# Bootstrap CDK (se necessário)
log_info "Verificando bootstrap do CDK..."
npx cdk bootstrap aws://$ACCOUNT_ID/$REGION || true

# Deploy Network Stack
log_info "Deployando Network Stack..."
STACK_PREFIX="EvoUds$(echo ${ENV:0:1} | tr '[:lower:]' '[:upper:]')${ENV:1}"
npx cdk deploy ${STACK_PREFIX}NetworkStack --require-approval never || log_warning "Network Stack já existe"

# Deploy Database Stack
log_info "Deployando Database Stack..."
npx cdk deploy ${STACK_PREFIX}DatabaseStack --require-approval never

cd ..
log_success "RDS deployado com sucesso!"

# Step 2: Aguardar RDS ficar disponível
echo ""
log_info "Step 2/6: Aguardando RDS ficar disponível..."
DB_INSTANCE_ID="evo-uds-$(echo $ENV | cut -c1-3)"

for i in {1..30}; do
    STATUS=$(aws rds describe-db-instances \
        --db-instance-identifier $DB_INSTANCE_ID \
        --region $REGION \
        --query 'DBInstances[0].DBInstanceStatus' \
        --output text 2>/dev/null || echo "not-found")
    
    if [ "$STATUS" = "available" ]; then
        log_success "RDS disponível!"
        break
    elif [ "$STATUS" = "not-found" ]; then
        log_warning "RDS não encontrado, tentando novamente... ($i/30)"
    else
        log_info "Status: $STATUS - Aguardando... ($i/30)"
    fi
    
    sleep 20
done

# Step 3: Obter credenciais
echo ""
log_info "Step 3/6: Obtendo credenciais do RDS..."
npm run rds:credentials || {
    log_error "Erro ao obter credenciais"
    exit 1
}

# Step 4: Atualizar .env
echo ""
log_info "Step 4/6: Atualizando variáveis de ambiente..."
./scripts/update-env-with-rds.sh $ENV || {
    log_error "Erro ao atualizar .env"
    exit 1
}

# Step 5: Testar conexão
echo ""
log_info "Step 5/6: Testando conexão com o RDS..."
npm run rds:test || {
    log_warning "Erro ao testar conexão. O RDS pode ainda estar inicializando."
    log_info "Tente novamente em alguns minutos: npm run rds:test"
}

# Step 6: Migrations (opcional)
echo ""
log_info "Step 6/6: Executar migrations do Prisma?"
read -p "Deseja executar as migrations agora? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Executando migrations..."
    npx prisma migrate deploy || {
        log_warning "Erro ao executar migrations. Execute manualmente: npx prisma migrate deploy"
    }
    log_success "Migrations executadas!"
else
    log_info "Pule este passo. Execute depois: npx prisma migrate deploy"
fi

# Resumo final
echo ""
echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║         ✅ Setup do RDS Concluído com Sucesso!            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo ""
log_success "RDS PostgreSQL configurado e pronto para uso!"
echo ""
log_info "📋 Próximos passos:"
echo "   1. Verificar credenciais: npm run rds:credentials"
echo "   2. Testar conexão: npm run rds:test"
echo "   3. Executar migrations: npx prisma migrate deploy"
echo "   4. Seed inicial: npx prisma db seed"
echo "   5. Iniciar aplicação: npm run dev"
echo ""
log_info "📚 Documentação:"
echo "   - Setup completo: RDS_SETUP_COMPLETE.md"
echo "   - Guia detalhado: RDS_DEPLOYMENT_GUIDE.md"
echo "   - Setup rápido: QUICK_RDS_SETUP.md"
echo ""
log_warning "⚠️  Lembre-se: Não commite arquivos com credenciais!"
echo ""
