#!/bin/bash

# Deploy Frontend com Invalidação Automática do CloudFront
# Este script faz o build e deploy do frontend, invalidando automaticamente o cache

set -e  # Para na primeira falha

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para logging
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1${NC}"
}

# Configurações padrão
ENVIRONMENT="development"
SKIP_BUILD=false
SKIP_INVALIDATION=false
VERBOSE=false
DISTRIBUTION_ID=""
S3_BUCKET=""

# Parse argumentos
while [[ $# -gt 0 ]]; do
    case $1 in
        --env=*)
            ENVIRONMENT="${1#*=}"
            shift
            ;;
        --distribution-id=*)
            DISTRIBUTION_ID="${1#*=}"
            shift
            ;;
        --bucket=*)
            S3_BUCKET="${1#*=}"
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-invalidation)
            SKIP_INVALIDATION=true
            shift
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            echo "🚀 Deploy Frontend com Invalidação CloudFront"
            echo ""
            echo "Uso: $0 [opções]"
            echo ""
            echo "Opções:"
            echo "  --env=<env>              Environment (development|staging|production) [default: development]"
            echo "  --distribution-id=<id>   ID da distribuição CloudFront"
            echo "  --bucket=<bucket>        Nome do bucket S3"
            echo "  --skip-build             Pula o build do frontend"
            echo "  --skip-invalidation      Pula a invalidação do CloudFront"
            echo "  --verbose, -v            Output detalhado"
            echo "  --help, -h               Mostra esta ajuda"
            echo ""
            echo "Exemplos:"
            echo "  $0                                    # Deploy development"
            echo "  $0 --env=production --verbose"
            echo "  $0 --skip-build --distribution-id=E123456789"
            exit 0
            ;;
        *)
            error "Argumento desconhecido: $1"
            exit 1
            ;;
    esac
done

log "🚀 Iniciando deploy do frontend..."
log "📋 Environment: $ENVIRONMENT"

# Verificar pré-requisitos
log "🔍 Verificando pré-requisitos..."

# Verificar AWS CLI
if ! command -v aws &> /dev/null; then
    error "AWS CLI não encontrado. Instale: https://aws.amazon.com/cli/"
    exit 1
fi

# Verificar credenciais AWS
if ! aws sts get-caller-identity &> /dev/null; then
    error "Credenciais AWS inválidas. Configure: aws configure"
    exit 1
fi

success "Pré-requisitos verificados"

# Build do frontend (se não pulado)
if [ "$SKIP_BUILD" = false ]; then
    log "🏗️  Fazendo build do frontend..."
    
    # Verificar se package.json existe
    if [ ! -f "package.json" ]; then
        error "package.json não encontrado. Execute este script na raiz do projeto."
        exit 1
    fi
    
    # Instalar dependências se node_modules não existir
    if [ ! -d "node_modules" ]; then
        log "📦 Instalando dependências..."
        npm install
    fi
    
    # Build
    if [ "$ENVIRONMENT" = "production" ]; then
        npm run build
    else
        npm run build:dev
    fi
    
    # Verificar se build foi criado
    if [ ! -d "dist" ]; then
        error "Build falhou - pasta dist não encontrada"
        exit 1
    fi
    
    success "Build do frontend concluído"
else
    warn "Build pulado - usando build existente"
    
    if [ ! -d "dist" ]; then
        error "Pasta dist não encontrada. Execute o build primeiro ou remova --skip-build"
        exit 1
    fi
fi

# Obter informações da infraestrutura se não fornecidas
if [ -z "$S3_BUCKET" ] || [ -z "$DISTRIBUTION_ID" ]; then
    log "🔍 Obtendo informações da infraestrutura..."
    
    # Tentar diferentes nomes de stack baseados no environment
    ENV_CAPITALIZED=$(echo "${ENVIRONMENT}" | sed 's/./\U&/')
    STACK_NAMES=(
        "EvoUds${ENV_CAPITALIZED}FrontendStack"
        "EvoUds-${ENVIRONMENT}-Frontend"
        "evo-uds-${ENVIRONMENT}-frontend"
    )
    
    for STACK_NAME in "${STACK_NAMES[@]}"; do
        if [ -z "$S3_BUCKET" ]; then
            BUCKET_RESULT=$(aws cloudformation describe-stacks \
                --stack-name "$STACK_NAME" \
                --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" \
                --output text 2>/dev/null || echo "")
            
            if [ "$BUCKET_RESULT" != "" ] && [ "$BUCKET_RESULT" != "None" ]; then
                S3_BUCKET="$BUCKET_RESULT"
                log "✅ Bucket S3 encontrado: $S3_BUCKET (stack: $STACK_NAME)"
            fi
        fi
        
        if [ -z "$DISTRIBUTION_ID" ]; then
            DIST_RESULT=$(aws cloudformation describe-stacks \
                --stack-name "$STACK_NAME" \
                --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" \
                --output text 2>/dev/null || echo "")
            
            if [ "$DIST_RESULT" != "" ] && [ "$DIST_RESULT" != "None" ]; then
                DISTRIBUTION_ID="$DIST_RESULT"
                log "✅ Distribution ID encontrado: $DISTRIBUTION_ID (stack: $STACK_NAME)"
            fi
        fi
        
        # Se encontrou ambos, para de procurar
        if [ -n "$S3_BUCKET" ] && [ -n "$DISTRIBUTION_ID" ]; then
            break
        fi
    done
fi

# Verificar se encontrou o bucket
if [ -z "$S3_BUCKET" ]; then
    error "Bucket S3 não encontrado. Especifique com --bucket= ou faça deploy da infraestrutura primeiro."
    exit 1
fi

# Deploy para S3
log "📤 Fazendo upload para S3..."
log "🪣 Bucket: $S3_BUCKET"

# Sync com S3
aws s3 sync dist/ "s3://$S3_BUCKET" \
    --delete \
    --cache-control "public, max-age=31536000, immutable" \
    --exclude "*.html" \
    --exclude "*.json"

# Upload HTML e JSON com cache menor
aws s3 sync dist/ "s3://$S3_BUCKET" \
    --cache-control "public, max-age=0, must-revalidate" \
    --include "*.html" \
    --include "*.json"

success "Upload para S3 concluído"

# Invalidação do CloudFront
if [ "$SKIP_INVALIDATION" = false ]; then
    if [ -n "$DISTRIBUTION_ID" ]; then
        log "🔄 Invalidando cache do CloudFront..."
        log "📋 Distribution ID: $DISTRIBUTION_ID"
        
        # Verificar se há invalidações em progresso
        IN_PROGRESS=$(aws cloudfront list-invalidations \
            --distribution-id "$DISTRIBUTION_ID" \
            --query "InvalidationList.Items[?Status=='InProgress'].Id" \
            --output text)
        
        if [ "$IN_PROGRESS" != "" ] && [ "$IN_PROGRESS" != "None" ]; then
            warn "Invalidação em progresso detectada: $IN_PROGRESS"
            warn "Aguardando conclusão antes de criar nova invalidação..."
            
            # Aguarda até 5 minutos
            WAIT_COUNT=0
            while [ $WAIT_COUNT -lt 30 ]; do
                sleep 10
                STATUS=$(aws cloudfront get-invalidation \
                    --distribution-id "$DISTRIBUTION_ID" \
                    --id "$IN_PROGRESS" \
                    --query "Invalidation.Status" \
                    --output text 2>/dev/null || echo "InProgress")
                
                if [ "$STATUS" = "Completed" ]; then
                    success "Invalidação anterior concluída"
                    break
                fi
                
                WAIT_COUNT=$((WAIT_COUNT + 1))
                log "⏳ Aguardando... (${WAIT_COUNT}/30)"
            done
        fi
        
        # Criar nova invalidação
        INVALIDATION_ID=$(aws cloudfront create-invalidation \
            --distribution-id "$DISTRIBUTION_ID" \
            --paths "/*" \
            --query "Invalidation.Id" \
            --output text)
        
        if [ "$INVALIDATION_ID" != "" ] && [ "$INVALIDATION_ID" != "None" ]; then
            success "Invalidação criada: $INVALIDATION_ID"
            log "ℹ️  A invalidação será processada em 2-5 minutos"
            
            # Se verbose, aguarda conclusão
            if [ "$VERBOSE" = true ]; then
                log "⏳ Aguardando conclusão da invalidação..."
                
                WAIT_COUNT=0
                while [ $WAIT_COUNT -lt 30 ]; do
                    sleep 10
                    STATUS=$(aws cloudfront get-invalidation \
                        --distribution-id "$DISTRIBUTION_ID" \
                        --id "$INVALIDATION_ID" \
                        --query "Invalidation.Status" \
                        --output text 2>/dev/null || echo "InProgress")
                    
                    log "📊 Status: $STATUS (${WAIT_COUNT}/30)"
                    
                    if [ "$STATUS" = "Completed" ]; then
                        success "Invalidação concluída!"
                        break
                    fi
                    
                    WAIT_COUNT=$((WAIT_COUNT + 1))
                done
                
                if [ $WAIT_COUNT -eq 30 ]; then
                    warn "Timeout aguardando invalidação. Verifique no console AWS."
                fi
            fi
        else
            error "Falha ao criar invalidação"
            exit 1
        fi
    else
        warn "Distribution ID não encontrado - pulando invalidação do CloudFront"
        warn "Especifique com --distribution-id= ou faça deploy da infraestrutura primeiro"
    fi
else
    warn "Invalidação do CloudFront pulada"
fi

# Resumo final
log "🎉 Deploy do frontend concluído!"
log "═══════════════════════════════════════"

if [ -n "$S3_BUCKET" ]; then
    log "🪣 S3 Bucket: $S3_BUCKET"
fi

if [ -n "$DISTRIBUTION_ID" ]; then
    # Obter URL do CloudFront
    CLOUDFRONT_URL=$(aws cloudfront get-distribution \
        --id "$DISTRIBUTION_ID" \
        --query "Distribution.DomainName" \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$CLOUDFRONT_URL" ]; then
        log "🌐 CloudFront URL: https://$CLOUDFRONT_URL"
    fi
    log "📋 Distribution ID: $DISTRIBUTION_ID"
fi

log "✅ Frontend está online e cache invalidado!"

# Comandos úteis
log ""
log "📋 Comandos úteis:"
log "   Verificar invalidações: npm run invalidate-cloudfront:check"
log "   Listar histórico: npm run invalidate-cloudfront:list"
log "   Nova invalidação: npm run invalidate-cloudfront"