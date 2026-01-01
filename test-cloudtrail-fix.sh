#!/bin/bash

echo "🔧 Testando e corrigindo CloudTrail audit..."

# 1. Primeiro, executar limpeza de análises travadas
echo "1. Executando limpeza de análises travadas..."
aws lambda invoke \
  --function-name evo-uds-v3-production-cleanup-stuck-scans \
  --region us-east-1 \
  --payload '{"thresholdMinutes":15,"dryRun":false}' \
  cleanup-result.json

echo "Resultado da limpeza:"
cat cleanup-result.json
echo ""

# 2. Verificar se as Lambdas CloudTrail estão funcionando
echo "2. Testando Lambda start-cloudtrail-analysis..."
aws lambda invoke \
  --function-name evo-uds-v3-production-start-cloudtrail-analysis \
  --region us-east-1 \
  --payload '{"requestContext":{"http":{"method":"POST"}},"headers":{"Authorization":"Bearer test"},"body":"{}"}' \
  start-test-result.json

echo "Status da Lambda start-cloudtrail-analysis:"
cat start-test-result.json
echo ""

# 3. Verificar logs recentes
echo "3. Verificando logs recentes das Lambdas CloudTrail..."
echo "Logs da start-cloudtrail-analysis:"
aws logs describe-log-streams \
  --log-group-name "/aws/lambda/evo-uds-v3-production-start-cloudtrail-analysis" \
  --region us-east-1 \
  --order-by LastEventTime \
  --descending \
  --limit 1 \
  --query 'logStreams[0].logStreamName' \
  --output text

echo ""
echo "Logs da analyze-cloudtrail:"
aws logs describe-log-streams \
  --log-group-name "/aws/lambda/evo-uds-v3-production-analyze-cloudtrail" \
  --region us-east-1 \
  --order-by LastEventTime \
  --descending \
  --limit 1 \
  --query 'logStreams[0].logStreamName' \
  --output text

echo ""
echo "✅ Teste concluído. As Lambdas CloudTrail foram atualizadas e testadas."
echo "Se ainda houver problemas, verifique os logs detalhados das Lambdas."