#!/bin/bash
# =============================================================================
# EVO CI/CD Pipeline Setup Script
# Configura o pipeline de CI/CD para um ambiente específico
# =============================================================================

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Verificar argumentos
if [ -z "$1" ]; then
  echo "Uso: $0 <sandbox|production> [github-owner] [github-connection-arn]"
  echo ""
  echo "Exemplos:"
  echo "  $0 sandbox myuser arn:aws:codestar-connections:us-east-1:971354623291:connection/xxx"
  echo "  $0 production myuser arn:aws:codestar-connections:us-east-1:523115032346:connection/xxx"
  exit 1
fi

ENV=$1
GITHUB_OWNER=${2:-""}
CONNECTION_ARN=${3:-""}

# Configurações por ambiente
# NOTA: DATABASE_URL deve ser obtida do arquivo .env ou passada como variável de ambiente
# para evitar credenciais hardcoded no código
if [ "$ENV" = "sandbox" ]; then
  AWS_PROFILE="EVO_SANDBOX"
  BRANCH="main"
  ACCOUNT_ID="971354623291"
  RDS_HOST="evo-uds-v3-sandbox-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com"
  COGNITO_POOL_ID="us-east-1_cnesJ48lR"
elif [ "$ENV" = "production" ]; then
  AWS_PROFILE="--profile EVO_PRODUCTION"
  BRANCH="production"
  ACCOUNT_ID="523115032346"
  RDS_HOST="evo-uds-v3-prod-postgres.cib8kysoo015.us-east-1.rds.amazonaws.com"
  COGNITO_POOL_ID="us-east-1_WVljEXXs9"
else
  log_error "Ambiente inválido: $ENV (use sandbox ou production)"
  exit 1
fi

# Obter DATABASE_URL de forma segura
if [ -n "$DATABASE_URL" ]; then
  DATABASE_URL_PARAM="$DATABASE_URL"
elif [ -f "backend/.env" ]; then
  DATABASE_URL_PARAM=$(grep "^DATABASE_URL=" backend/.env | cut -d'=' -f2-)
else
  log_error "DATABASE_URL não encontrada. Defina a variável de ambiente ou crie backend/.env"
  exit 1
fi

if [ -z "$DATABASE_URL_PARAM" ]; then
  log_error "DATABASE_URL está vazia"
  exit 1
fi

REGION="us-east-1"

echo ""
echo "=========================================="
echo "  EVO CI/CD Pipeline Setup - $ENV"
echo "=========================================="
echo ""

# Step 1: Criar secret no Secrets Manager
log_info "Step 1: Configurando Secrets Manager..."

SECRET_NAME="evo/$ENV/secrets"

# Criar JSON com os segredos
SECRET_JSON=$(cat <<EOF
{
  "DATABASE_URL": "$DATABASE_URL_PARAM",
  "COGNITO_USER_POOL_ID": "$COGNITO_POOL_ID"
}
EOF
)

# Verificar se o secret já existe
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region $REGION $AWS_PROFILE > /dev/null 2>&1; then
  log_info "Atualizando secret existente..."
  aws secretsmanager put-secret-value \
    --secret-id "$SECRET_NAME" \
    --secret-string "$SECRET_JSON" \
    --region $REGION \
    $AWS_PROFILE > /dev/null
else
  log_info "Criando novo secret..."
  aws secretsmanager create-secret \
    --name "$SECRET_NAME" \
    --description "EVO $ENV environment secrets" \
    --secret-string "$SECRET_JSON" \
    --region $REGION \
    $AWS_PROFILE > /dev/null
fi
log_success "Secret $SECRET_NAME configurado"

# Step 2: Verificar conexão CodeStar
log_info "Step 2: Verificando conexão CodeStar..."

if [ -z "$CONNECTION_ARN" ]; then
  log_warning "Conexão CodeStar não fornecida."
  echo ""
  echo "Para criar uma conexão CodeStar com GitHub:"
  echo "1. Acesse: https://console.aws.amazon.com/codesuite/settings/connections"
  echo "2. Clique em 'Create connection'"
  echo "3. Selecione 'GitHub'"
  echo "4. Autorize o acesso ao repositório"
  echo "5. Copie o ARN da conexão"
  echo ""
  read -p "Cole o ARN da conexão CodeStar: " CONNECTION_ARN
fi

if [ -z "$CONNECTION_ARN" ]; then
  log_error "ARN da conexão CodeStar é obrigatório"
  exit 1
fi

# Step 3: Verificar GitHub owner
if [ -z "$GITHUB_OWNER" ]; then
  read -p "Digite o owner do repositório GitHub: " GITHUB_OWNER
fi

if [ -z "$GITHUB_OWNER" ]; then
  log_error "GitHub owner é obrigatório"
  exit 1
fi

# Step 4: Deploy do CloudFormation Stack
log_info "Step 3: Criando stack CloudFormation..."

STACK_NAME="evo-cicd-$ENV"

aws cloudformation deploy \
  --template-file cicd/cloudformation/codepipeline-stack.yaml \
  --stack-name $STACK_NAME \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    Environment=$ENV \
    GitHubOwner=$GITHUB_OWNER \
    GitHubRepo=AWS-EVO \
    GitHubBranch=$BRANCH \
    GitHubConnectionArn=$CONNECTION_ARN \
  --region $REGION \
  $AWS_PROFILE

log_success "Stack $STACK_NAME criado/atualizado"

# Step 5: Obter outputs
log_info "Step 4: Obtendo informações do pipeline..."

PIPELINE_URL=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --query 'Stacks[0].Outputs[?OutputKey==`PipelineUrl`].OutputValue' \
  --output text \
  --region $REGION \
  $AWS_PROFILE)

SNS_TOPIC=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --query 'Stacks[0].Outputs[?OutputKey==`NotificationTopicArn`].OutputValue' \
  --output text \
  --region $REGION \
  $AWS_PROFILE)

echo ""
echo "=========================================="
echo "  Setup Completo!"
echo "=========================================="
echo ""
log_success "Pipeline criado com sucesso!"
echo ""
echo "📊 Pipeline URL:"
echo "   $PIPELINE_URL"
echo ""
echo "📧 Para receber notificações por email:"
echo "   aws sns subscribe \\"
echo "     --topic-arn $SNS_TOPIC \\"
echo "     --protocol email \\"
echo "     --notification-endpoint seu-email@exemplo.com \\"
echo "     --region $REGION $AWS_PROFILE"
echo ""
echo "🚀 Próximos passos:"
echo "   1. Faça um push para a branch '$BRANCH'"
echo "   2. O pipeline será executado automaticamente"
echo "   3. Acompanhe o progresso no console AWS"
echo ""
