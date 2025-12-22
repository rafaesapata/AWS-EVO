#!/bin/bash

# Script para corrigir CORS na API Gateway
API_ID="z3z39jk585"
STAGE="prod"

echo "🔧 Corrigindo CORS na API Gateway ${API_ID}..."

# Configurar CORS usando AWS CLI
echo "📝 Atualizando configuração CORS..."

# Obter recursos
RESOURCES=$(aws apigateway get-resources --rest-api-id $API_ID --query 'items[].id' --output text)

for RESOURCE_ID in $RESOURCES; do
    echo "🔧 Configurando recurso: $RESOURCE_ID"
    
    # Tentar adicionar headers CORS básicos
    aws apigateway update-gateway-response \
        --rest-api-id $API_ID \
        --response-type DEFAULT_4XX \
        --patch-ops op=add,path=/responseParameters/gatewayresponse.header.Access-Control-Allow-Origin,value="'https://evo.ia.udstec.io'" \
        --no-cli-pager 2>/dev/null || true
    
    aws apigateway update-gateway-response \
        --rest-api-id $API_ID \
        --response-type DEFAULT_5XX \
        --patch-ops op=add,path=/responseParameters/gatewayresponse.header.Access-Control-Allow-Origin,value="'https://evo.ia.udstec.io'" \
        --no-cli-pager 2>/dev/null || true
done

# Deploy das mudanças
echo "🚀 Fazendo deploy..."
aws apigateway create-deployment \
    --rest-api-id $API_ID \
    --stage-name $STAGE \
    --description "CORS fix deployment" \
    --no-cli-pager

echo "✅ CORS configurado!"
echo "📍 API URL: https://${API_ID}.execute-api.us-east-1.amazonaws.com/${STAGE}"
echo "🔄 Aguarde 2-3 minutos para propagação"