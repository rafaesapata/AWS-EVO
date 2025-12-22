#!/bin/bash

DOMAIN_NAME="evo.ia.udstec.io"
API_DOMAIN="api.evo.ia.udstec.io"
HOSTED_ZONE_ID="Z0175676U2UJII1ENJP3"
API_ID="z3z39jk585"
CLOUDFRONT_DOMAIN="del4pu28krnxt.cloudfront.net"

echo "Configurando domínio personalizado: $DOMAIN_NAME"

# 1. Solicitar certificado SSL
echo "Solicitando certificado SSL..."
CERT_ARN=$(aws acm request-certificate \
  --domain-name $DOMAIN_NAME \
  --subject-alternative-names "www.$DOMAIN_NAME" "$API_DOMAIN" \
  --validation-method DNS \
  --region us-east-1 \
  --query 'CertificateArn' \
  --output text)

echo "Certificado solicitado: $CERT_ARN"

# 2. Obter registros de validação DNS
echo "Aguardando registros de validação DNS..."
sleep 10

VALIDATION_RECORDS=$(aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --region us-east-1 \
  --query 'Certificate.DomainValidationOptions[*].ResourceRecord' \
  --output json)

echo "Registros de validação: $VALIDATION_RECORDS"

# 3. Criar registros DNS para validação
echo "Criando registros DNS para validação..."
echo $VALIDATION_RECORDS | jq -r '.[] | "aws route53 change-resource-record-sets --hosted-zone-id '$HOSTED_ZONE_ID' --change-batch '"'"'{ \"Changes\": [{ \"Action\": \"CREATE\", \"ResourceRecordSet\": { \"Name\": \"" + .Name + "\", \"Type\": \"" + .Type + "\", \"TTL\": 300, \"ResourceRecords\": [{ \"Value\": \"" + .Value + "\" }] } }] }'"'"'"' | bash

echo "Aguardando validação do certificado (isso pode levar alguns minutos)..."
aws acm wait certificate-validated --certificate-arn $CERT_ARN --region us-east-1

echo "Certificado validado com sucesso!"

# 4. Criar domínio personalizado para API Gateway
echo "Criando domínio personalizado para API Gateway..."
aws apigateway create-domain-name \
  --domain-name $API_DOMAIN \
  --certificate-arn $CERT_ARN \
  --endpoint-configuration types=REGIONAL \
  --security-policy TLS_1_2

# 5. Mapear API para domínio personalizado
echo "Mapeando API para domínio personalizado..."
aws apigateway create-base-path-mapping \
  --domain-name $API_DOMAIN \
  --rest-api-id $API_ID \
  --stage dev

# 6. Obter target do domínio personalizado
API_TARGET=$(aws apigateway get-domain-name \
  --domain-name $API_DOMAIN \
  --query 'regionalDomainName' \
  --output text)

echo "Target do API Gateway: $API_TARGET"

# 7. Criar registros DNS
echo "Criando registros DNS..."

# Registro A para o domínio principal (CloudFront)
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

echo "Domínio configurado com sucesso!"
echo ""
echo "URLs disponíveis:"
echo "Frontend: https://$DOMAIN_NAME"
echo "Frontend (www): https://www.$DOMAIN_NAME"
echo "API: https://$API_DOMAIN"
echo ""
echo "Certificado SSL: $CERT_ARN"