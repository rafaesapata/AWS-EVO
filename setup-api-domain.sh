#!/bin/bash

API_DOMAIN="api.evo.ia.udstec.io"
HOSTED_ZONE_ID="Z0175676U2UJII1ENJP3"
API_ID="z3z39jk585"
CERT_ARN="arn:aws:acm:us-east-1:418272799411:certificate/9584be3b-0b96-429f-8322-4da8ef9bbc53"

echo "Configurando domínio personalizado para API Gateway..."

# 1. Remover domínio personalizado existente se houver
echo "Removendo configuração anterior..."
aws apigateway delete-base-path-mapping --domain-name $API_DOMAIN --base-path "(none)" 2>/dev/null || true
aws apigateway delete-domain-name --domain-name $API_DOMAIN 2>/dev/null || true

# 2. Criar domínio personalizado para API Gateway (EDGE)
echo "Criando domínio personalizado para API Gateway..."
aws apigateway create-domain-name \
  --domain-name $API_DOMAIN \
  --certificate-arn $CERT_ARN \
  --endpoint-configuration types=EDGE \
  --security-policy TLS_1_2

# 3. Mapear API para domínio personalizado
echo "Mapeando API para domínio personalizado..."
aws apigateway create-base-path-mapping \
  --domain-name $API_DOMAIN \
  --rest-api-id $API_ID \
  --stage dev

# 4. Obter target do domínio personalizado
API_TARGET=$(aws apigateway get-domain-name \
  --domain-name $API_DOMAIN \
  --query 'distributionDomainName' \
  --output text)

echo "Target do API Gateway: $API_TARGET"

# 5. Criar registro DNS para API
if [ ! -z "$API_TARGET" ]; then
  echo "Criando registro DNS para API..."
  aws route53 change-resource-record-sets \
    --hosted-zone-id $HOSTED_ZONE_ID \
    --change-batch '{
      "Changes": [{
        "Action": "UPSERT",
        "ResourceRecordSet": {
          "Name": "'$API_DOMAIN'",
          "Type": "CNAME",
          "TTL": 300,
          "ResourceRecords": [{"Value": "'$API_TARGET'"}]
        }
      }]
    }'
fi

echo "Domínio da API configurado com sucesso!"
echo "API URL: https://$API_DOMAIN"

# 6. Testar conectividade
echo ""
echo "Aguardando propagação DNS (30 segundos)..."
sleep 30

echo "Testando conectividade da API..."
echo -n "API Health: "
curl -s -o /dev/null -w "%{http_code}" https://$API_DOMAIN/health --connect-timeout 10 || echo "Timeout/Erro"