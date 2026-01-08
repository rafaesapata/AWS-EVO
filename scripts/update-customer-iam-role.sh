#!/bin/bash

# Script para atualizar o IAM Role do cliente com as novas permissões WAF
# Este script deve ser executado pelo CLIENTE na conta AWS dele

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}EVO Platform - IAM Role Update${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Verificar se está na conta correta
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo -e "${YELLOW}📋 Conta AWS atual: ${ACCOUNT_ID}${NC}"
echo ""

# Perguntar o nome do stack
read -p "Nome do stack CloudFormation (padrão: evo-platform-role): " STACK_NAME
STACK_NAME=${STACK_NAME:-evo-platform-role}

# Verificar se o stack existe
echo -e "${YELLOW}🔍 Verificando stack '${STACK_NAME}'...${NC}"
if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region us-east-1 &>/dev/null; then
    echo -e "${RED}❌ Stack '${STACK_NAME}' não encontrado!${NC}"
    echo ""
    echo "Stacks disponíveis:"
    aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --region us-east-1 --query 'StackSummaries[].StackName' --output table
    exit 1
fi

echo -e "${GREEN}✅ Stack encontrado!${NC}"
echo ""

# Obter parâmetros atuais
echo -e "${YELLOW}📥 Obtendo parâmetros atuais...${NC}"
EXTERNAL_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region us-east-1 --query 'Stacks[0].Parameters[?ParameterKey==`ExternalId`].ParameterValue' --output text)

if [ -z "$EXTERNAL_ID" ]; then
    echo -e "${RED}❌ Não foi possível obter o External ID do stack${NC}"
    exit 1
fi

echo -e "${GREEN}✅ External ID: ${EXTERNAL_ID:0:8}...${NC}"
echo ""

# URL do template atualizado
TEMPLATE_URL="https://evo-uds-cloudformation-383234048592.s3.us-east-1.amazonaws.com/customer-iam-role-waf.yaml"

echo -e "${YELLOW}📦 Template URL: ${TEMPLATE_URL}${NC}"
echo ""

# Confirmar atualização
echo -e "${YELLOW}⚠️  Esta atualização adiciona as seguintes permissões:${NC}"
echo "   - logs:PutResourcePolicy (para WAF logging)"
echo "   - logs:DescribeResourcePolicies (para WAF logging)"
echo ""
read -p "Deseja continuar com a atualização? (s/N): " CONFIRM

if [[ ! "$CONFIRM" =~ ^[Ss]$ ]]; then
    echo -e "${YELLOW}❌ Atualização cancelada${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}🚀 Atualizando stack...${NC}"

# Atualizar o stack
aws cloudformation update-stack \
    --stack-name "$STACK_NAME" \
    --template-url "$TEMPLATE_URL" \
    --parameters \
        ParameterKey=ExternalId,ParameterValue="$EXTERNAL_ID" \
        ParameterKey=EVOAccountId,UsePreviousValue=true \
        ParameterKey=EVOWafLogProcessorArn,UsePreviousValue=true \
    --capabilities CAPABILITY_NAMED_IAM \
    --region us-east-1

echo ""
echo -e "${GREEN}✅ Atualização iniciada!${NC}"
echo ""
echo -e "${YELLOW}⏳ Aguardando conclusão da atualização...${NC}"

# Aguardar conclusão
aws cloudformation wait stack-update-complete --stack-name "$STACK_NAME" --region us-east-1

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Stack atualizado com sucesso!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Mostrar outputs
echo -e "${YELLOW}📋 Informações do stack:${NC}"
aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region us-east-1 --query 'Stacks[0].Outputs' --output table

echo ""
echo -e "${GREEN}🎉 Atualização concluída!${NC}"
echo -e "${YELLOW}Agora você pode configurar o monitoramento WAF na plataforma EVO.${NC}"
echo ""
