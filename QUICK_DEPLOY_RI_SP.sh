#!/bin/bash

# 🚀 Quick Deploy Script - RI/SP Analysis System
# Execute este script para fazer o deploy completo do sistema

set -e  # Exit on error

echo "=================================================="
echo "🚀 Deploy - Análise de RI/SP"
echo "=================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
RDS_HOST="evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com"
RDS_USER="postgres"
RDS_DB="evouds"
S3_BUCKET="evo-uds-v3-production-frontend-383234048592"
CLOUDFRONT_ID="E1PY7U3VNT6P1R"

# Step 1: Database Migration
echo -e "${YELLOW}Step 1/4: Aplicando migração do banco de dados...${NC}"
read -p "Deseja aplicar a migração do banco? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Conectando ao RDS..."
    psql -h $RDS_HOST -U $RDS_USER -d $RDS_DB \
         -f backend/prisma/migrations/20260101000000_add_ri_sp_tables/migration.sql
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Migração aplicada com sucesso!${NC}"
    else
        echo -e "${RED}❌ Erro ao aplicar migração${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⏭️  Pulando migração do banco${NC}"
fi
echo ""

# Step 2: Backend Build
echo -e "${YELLOW}Step 2/4: Compilando backend...${NC}"
cd backend
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Backend compilado com sucesso!${NC}"
else
    echo -e "${RED}❌ Erro ao compilar backend${NC}"
    exit 1
fi
cd ..
echo ""

# Step 3: CDK Deploy
echo -e "${YELLOW}Step 3/4: Deploy da infraestrutura (CDK)...${NC}"
read -p "Deseja fazer deploy do CDK? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    cd infra
    
    # Show diff first
    echo "Verificando mudanças..."
    npm run cdk diff
    
    echo ""
    read -p "Confirma o deploy? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm run cdk deploy --require-approval never
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ CDK deployado com sucesso!${NC}"
        else
            echo -e "${RED}❌ Erro ao fazer deploy do CDK${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}⏭️  Deploy do CDK cancelado${NC}"
    fi
    
    cd ..
else
    echo -e "${YELLOW}⏭️  Pulando deploy do CDK${NC}"
fi
echo ""

# Step 4: Frontend Deploy
echo -e "${YELLOW}Step 4/4: Deploy do frontend...${NC}"
read -p "Deseja fazer deploy do frontend? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Build frontend
    echo "Compilando frontend..."
    npm run build
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Frontend compilado com sucesso!${NC}"
    else
        echo -e "${RED}❌ Erro ao compilar frontend${NC}"
        exit 1
    fi
    
    # Deploy to S3
    echo "Fazendo upload para S3..."
    aws s3 sync dist/ s3://$S3_BUCKET \
        --delete \
        --cache-control "public, max-age=31536000, immutable" \
        --exclude "index.html" \
        --exclude "*.map"
    
    # Deploy index.html without cache
    aws s3 cp dist/index.html s3://$S3_BUCKET/index.html \
        --cache-control "no-cache, no-store, must-revalidate"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Upload para S3 concluído!${NC}"
    else
        echo -e "${RED}❌ Erro ao fazer upload para S3${NC}"
        exit 1
    fi
    
    # Invalidate CloudFront
    echo "Invalidando cache do CloudFront..."
    aws cloudfront create-invalidation \
        --distribution-id $CLOUDFRONT_ID \
        --paths "/*"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ CloudFront invalidado com sucesso!${NC}"
    else
        echo -e "${RED}❌ Erro ao invalidar CloudFront${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⏭️  Pulando deploy do frontend${NC}"
fi
echo ""

# Summary
echo "=================================================="
echo -e "${GREEN}🎉 Deploy Concluído!${NC}"
echo "=================================================="
echo ""
echo "📋 Próximos passos:"
echo "1. Verificar logs da Lambda:"
echo "   aws logs tail /aws/lambda/RiSpAnalysisFunction --follow"
echo ""
echo "2. Testar endpoint:"
echo "   curl -X POST https://api-evo.ai.udstec.io/finops/ri-sp-analysis \\"
echo "     -H 'Authorization: Bearer YOUR_TOKEN' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"accountId\":\"uuid\",\"analysisType\":\"all\"}'"
echo ""
echo "3. Acessar frontend:"
echo "   https://evo.ai.udstec.io"
echo ""
echo "4. Monitorar métricas:"
echo "   CloudWatch > Lambda > RiSpAnalysisFunction"
echo ""
echo "=================================================="
