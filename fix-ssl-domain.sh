#!/bin/bash

DOMAIN_NAME="evo.ia.udstec.io"
API_DOMAIN="api.evo.ia.udstec.io"
HOSTED_ZONE_ID="Z0175676U2UJII1ENJP3"
API_ID="z3z39jk585"
CLOUDFRONT_DOMAIN="del4pu28krnxt.cloudfront.net"
WILDCARD_CERT_ARN="arn:aws:acm:us-east-1:418272799411:certificate/3aa536a1-e2f3-4249-9109-08f52667dc13"

echo "Reconfigurando domínio com certificado wildcard existente: $WILDCARD_CERT_ARN"

# 1. Remover domínio personalizado existente se houver
echo "Removendo configuração anterior..."
aws apigateway delete-base-path-mapping --domain-name $API_DOMAIN --base-path "(none)" 2>/dev/null || true
aws apigateway delete-domain-name --domain-name $API_DOMAIN 2>/dev/null || true

# 2. Criar domínio personalizado com certificado wildcard (EDGE)
echo "Criando domínio personalizado com certificado wildcard..."
aws apigateway create-domain-name \
  --domain-name $API_DOMAIN \
  --certificate-arn $WILDCARD_CERT_ARN \
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

# 5. Atualizar registros DNS
echo "Atualizando registros DNS..."

# Registro CNAME para o domínio principal (CloudFront)
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "'$DOMAIN_NAME'",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "'$CLOUDFRONT_DOMAIN'"}]
      }
    }]
  }'

# Registro CNAME para www
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "www.'$DOMAIN_NAME'",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "'$CLOUDFRONT_DOMAIN'"}]
      }
    }]
  }'

# Registro CNAME para API
if [ ! -z "$API_TARGET" ]; then
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

echo "Domínio reconfigurado com sucesso!"
echo ""
echo "URLs disponíveis:"
echo "Frontend: https://$DOMAIN_NAME"
echo "Frontend (www): https://www.$DOMAIN_NAME"
echo "API: https://$API_DOMAIN"
echo ""
echo "Certificado SSL Wildcard: $WILDCARD_CERT_ARN"

# 6. Aguardar propagação DNS e testar
echo ""
echo "Aguardando propagação DNS (30 segundos)..."
sleep 30

echo "Testando conectividade..."
echo -n "Frontend: "
curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN_NAME --connect-timeout 10 || echo "Timeout/Erro"

echo -n "API Health: "
curl -s -o /dev/null -w "%{http_code}" https://$API_DOMAIN/health --connect-timeout 10 || echo "Timeout/Erro"

echo ""
echo "Configuração concluída! Os domínios podem levar alguns minutos para propagar completamente."