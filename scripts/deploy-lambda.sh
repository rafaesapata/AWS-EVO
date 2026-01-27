#!/bin/bash
# =============================================================================
# Script de Deploy de Lambda - EVO Platform
# =============================================================================
# Este script garante que o deploy seja feito corretamente, incluindo:
# 1. Build do backend
# 2. Ajuste de imports (../../lib/ -> ./lib/)
# 3. Inclusão de lib/ e types/ no ZIP
# 4. Atualização do handler path
# 5. Verificação pós-deploy
#
# Uso:
#   ./scripts/deploy-lambda.sh <handler-path> <lambda-name>
#
# Exemplo:
#   ./scripts/deploy-lambda.sh cost/fetch-daily-costs fetch-daily-costs
#   ./scripts/deploy-lambda.sh security/security-scan security-scan
#
# =============================================================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parâmetros
HANDLER_PATH=$1
LAMBDA_NAME=$2
REGION=${3:-us-east-1}
LAMBDA_PREFIX="evo-uds-v3-production"

# Validar parâmetros
if [ -z "$HANDLER_PATH" ] || [ -z "$LAMBDA_NAME" ]; then
    echo -e "${RED}Uso: $0 <handler-path> <lambda-name> [region]${NC}"
    echo "Exemplo: $0 cost/fetch-daily-costs fetch-daily-costs"
    exit 1
fi

FULL_LAMBDA_NAME="${LAMBDA_PREFIX}-${LAMBDA_NAME}"
HANDLER_FILE=$(basename "$HANDLER_PATH")

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Deploying: ${FULL_LAMBDA_NAME}${NC}"
echo -e "${YELLOW}Handler: ${HANDLER_PATH}${NC}"
echo -e "${YELLOW}========================================${NC}"

# 1. Build do backend
echo -e "\n${GREEN}[1/6] Building backend...${NC}"
npm run build --prefix backend

# 2. Verificar se o arquivo compilado existe
COMPILED_FILE="backend/dist/handlers/${HANDLER_PATH}.js"
if [ ! -f "$COMPILED_FILE" ]; then
    echo -e "${RED}Erro: Arquivo compilado não encontrado: ${COMPILED_FILE}${NC}"
    exit 1
fi

# 3. Criar diretório temporário
echo -e "\n${GREEN}[2/6] Preparing deploy package...${NC}"
DEPLOY_DIR="/tmp/lambda-deploy-${LAMBDA_NAME}"
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

# 4. Copiar e ajustar imports
echo -e "\n${GREEN}[3/6] Adjusting imports...${NC}"
sed 's|require("../../lib/|require("./lib/|g' "$COMPILED_FILE" | \
sed 's|require("../lib/|require("./lib/|g' | \
sed 's|require("../../types/|require("./types/|g' | \
sed 's|require("../types/|require("./types/|g' > "$DEPLOY_DIR/${HANDLER_FILE}.js"

# 5. Copiar lib/ e types/
cp -r backend/dist/lib "$DEPLOY_DIR/"
cp -r backend/dist/types "$DEPLOY_DIR/"

# 6. Criar ZIP
echo -e "\n${GREEN}[4/6] Creating ZIP...${NC}"
pushd "$DEPLOY_DIR" > /dev/null
zip -r "/tmp/${LAMBDA_NAME}.zip" . > /dev/null
popd > /dev/null

ZIP_SIZE=$(ls -lh "/tmp/${LAMBDA_NAME}.zip" | awk '{print $5}')
echo "ZIP size: $ZIP_SIZE"

# 7. Deploy
echo -e "\n${GREEN}[5/6] Deploying to AWS Lambda...${NC}"
aws lambda update-function-code \
    --function-name "$FULL_LAMBDA_NAME" \
    --zip-file "fileb:///tmp/${LAMBDA_NAME}.zip" \
    --region "$REGION" \
    --no-cli-pager > /dev/null

# 8. Atualizar handler path
echo "Updating handler path to: ${HANDLER_FILE}.handler"
aws lambda update-function-configuration \
    --function-name "$FULL_LAMBDA_NAME" \
    --handler "${HANDLER_FILE}.handler" \
    --region "$REGION" \
    --no-cli-pager > /dev/null

# 9. Aguardar atualização
echo "Waiting for function update..."
aws lambda wait function-updated \
    --function-name "$FULL_LAMBDA_NAME" \
    --region "$REGION"

# 10. Verificar deploy
echo -e "\n${GREEN}[6/6] Verifying deployment...${NC}"
CURRENT_HANDLER=$(aws lambda get-function-configuration \
    --function-name "$FULL_LAMBDA_NAME" \
    --region "$REGION" \
    --query 'Handler' \
    --output text)

if [ "$CURRENT_HANDLER" == "${HANDLER_FILE}.handler" ]; then
    echo -e "${GREEN}✅ Handler path correct: ${CURRENT_HANDLER}${NC}"
else
    echo -e "${RED}❌ Handler path incorrect: ${CURRENT_HANDLER}${NC}"
    echo -e "${RED}   Expected: ${HANDLER_FILE}.handler${NC}"
    exit 1
fi

# 11. Testar invocação OPTIONS
echo "Testing OPTIONS invocation..."
aws lambda invoke \
    --function-name "$FULL_LAMBDA_NAME" \
    --cli-binary-format raw-in-base64-out \
    --payload '{"requestContext":{"http":{"method":"OPTIONS"}}}' \
    --region "$REGION" \
    "/tmp/test-${LAMBDA_NAME}.json" > /dev/null 2>&1

if grep -q '"statusCode":200' "/tmp/test-${LAMBDA_NAME}.json"; then
    echo -e "${GREEN}✅ OPTIONS test passed${NC}"
else
    echo -e "${YELLOW}⚠️  OPTIONS test returned non-200 (may be expected for some handlers)${NC}"
fi

# Cleanup
rm -rf "$DEPLOY_DIR"

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Deploy completed: ${FULL_LAMBDA_NAME}${NC}"
echo -e "${GREEN}========================================${NC}"
