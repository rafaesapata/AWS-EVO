#!/bin/bash

DISTRIBUTION_ID="E2XXQNM8HXHY56"
WILDCARD_CERT_ARN="arn:aws:acm:us-east-1:418272799411:certificate/3aa536a1-e2f3-4249-9109-08f52667dc13"
DOMAIN_NAME="evo.ia.udstec.io"

echo "Atualizando CloudFront para usar certificado SSL wildcard..."

# 1. Obter configuração atual do CloudFront
echo "Obtendo configuração atual..."
aws cloudfront get-distribution-config --id $DISTRIBUTION_ID --output json > current-config.json

# 2. Extrair ETag e DistributionConfig
ETAG=$(jq -r '.ETag' current-config.json)
echo "ETag atual: $ETAG"

# 3. Extrair apenas a DistributionConfig e atualizar
jq '.DistributionConfig | 
    .Aliases.Quantity = 2 | 
    .Aliases.Items = ["'$DOMAIN_NAME'", "www.'$DOMAIN_NAME'"] |
    .ViewerCertificate = {
      "ACMCertificateArn": "'$WILDCARD_CERT_ARN'",
      "SSLSupportMethod": "sni-only",
      "MinimumProtocolVersion": "TLSv1.2_2021",
      "CertificateSource": "acm"
    }' current-config.json > updated-distribution-config.json

# 4. Aplicar configuração atualizada
echo "Aplicando configuração atualizada..."
aws cloudfront update-distribution \
  --id $DISTRIBUTION_ID \
  --distribution-config file://updated-distribution-config.json \
  --if-match $ETAG

if [ $? -eq 0 ]; then
  echo "CloudFront atualizado com sucesso!"
  echo "A distribuição pode levar alguns minutos para ser atualizada."
  
  echo ""
  echo "Aguardando deploy da distribuição..."
  aws cloudfront wait distribution-deployed --id $DISTRIBUTION_ID
  
  echo "Deploy concluído!"
else
  echo "Erro ao atualizar CloudFront"
fi

# 5. Limpar arquivos temporários
rm -f current-config.json updated-distribution-config.json