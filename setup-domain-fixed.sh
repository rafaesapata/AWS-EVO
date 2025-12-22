#!/bin/bash

DOMAIN_NAME="evo.ia.udstec.io"
API_DOMAIN="api.evo.ia.udstec.io"
HOSTED_ZONE_ID="Z0175676U2UJII1ENJP3"
API_ID="z3z39jk585"
CLOUDFRONT_DOMAIN="del4pu28krnxt.cloudfront.net"
CERT_ARN="arn:aws:acm:us-east-1:418272799411:certificate/9584be3b-0b96-429f-8322-4da8ef9bbc53"

echo "Configurando domínio personalizado com certificado existente: $CERT_ARN"

# 1. Verificar se o certificado está validado
CERT_STATUS=$(aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --region us-east-1 \
  --query 'Certificate.Status' \
  --output text)

echo "Status do certificado: $CERT_STATUS"

if [ "$CERT_STATUS" != "ISSUED" ]; then
  echo "Aguardando validação do certificado..."
  aws acm wait certificate-validated --certificate-arn $CERT_ARN --region us-east-1
fi

# 2. Criar domínio personalizado para API Gateway (EDGE)
echo "Criando domínio personalizado para API Gateway (EDGE)..."
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

# 5. Criar registros DNS
echo "Criando registros DNS..."

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

echo "Domínio configurado com sucesso!"
echo ""
echo "URLs disponíveis:"
echo "Frontend: https://$DOMAIN_NAME"
echo "Frontend (www): https://www.$DOMAIN_NAME"
echo "API: https://$API_DOMAIN"
echo ""
echo "Certificado SSL: $CERT_ARN"

# 6. Testar conectividade
echo ""
echo "Testando conectividade..."
echo "Frontend: $(curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN_NAME || echo "Erro")"
echo "API Health: $(curl -s -o /dev/null -w "%{http_code}" https://$API_DOMAIN/health || echo "Erro")"