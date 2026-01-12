#!/bin/bash
# Diagnóstico completo do monitoramento WAF
# Este script verifica toda a cadeia de logs WAF

echo "=========================================="
echo "Diagnóstico do Monitoramento WAF"
echo "=========================================="
echo ""

# 1. Verificar destinations em todas as regiões
echo "1. Verificando CloudWatch Logs Destinations..."
echo ""

for region in us-east-1 sa-east-1; do
  echo "   Região: $region"
  dest=$(aws logs describe-destinations \
    --destination-name-prefix evo-uds-v3-production-waf-logs-destination \
    --region $region \
    --query 'destinations[0].{name: destinationName, targetArn: targetArn}' \
    --output json 2>/dev/null)
  
  if [ -n "$dest" ] && [ "$dest" != "null" ]; then
    echo "   ✅ Destination encontrado:"
    echo "      $dest"
  else
    echo "   ❌ Destination não encontrado"
  fi
  echo ""
done

# 2. Verificar Lambdas WAF
echo "2. Verificando Lambdas WAF..."
echo ""

for region in us-east-1 sa-east-1; do
  echo "   Região: $region"
  lambda_state=$(aws lambda get-function \
    --function-name evo-uds-v3-production-waf-log-processor \
    --region $region \
    --query 'Configuration.{State: State, Handler: Handler}' \
    --output json 2>/dev/null)
  
  if [ -n "$lambda_state" ] && [ "$lambda_state" != "null" ]; then
    echo "   ✅ Lambda encontrada:"
    echo "      $lambda_state"
  else
    echo "   ❌ Lambda não encontrada"
  fi
  echo ""
done

# 3. Verificar invocações recentes
echo "3. Verificando invocações nas últimas 24h..."
echo ""

for region in us-east-1 sa-east-1; do
  echo "   Região: $region"
  invocations=$(aws cloudwatch get-metric-statistics \
    --namespace AWS/Lambda \
    --metric-name Invocations \
    --dimensions Name=FunctionName,Value=evo-uds-v3-production-waf-log-processor \
    --start-time $(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
    --period 86400 \
    --statistics Sum \
    --region $region \
    --query 'Datapoints[0].Sum' \
    --output text 2>/dev/null)
  
  if [ -n "$invocations" ] && [ "$invocations" != "None" ] && [ "$invocations" != "null" ]; then
    echo "   📊 Invocações: $invocations"
  else
    echo "   📊 Invocações: 0"
  fi
  echo ""
done

# 4. Verificar erros recentes
echo "4. Verificando erros nas últimas 24h..."
echo ""

for region in us-east-1 sa-east-1; do
  echo "   Região: $region"
  errors=$(aws cloudwatch get-metric-statistics \
    --namespace AWS/Lambda \
    --metric-name Errors \
    --dimensions Name=FunctionName,Value=evo-uds-v3-production-waf-log-processor \
    --start-time $(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
    --period 86400 \
    --statistics Sum \
    --region $region \
    --query 'Datapoints[0].Sum' \
    --output text 2>/dev/null)
  
  if [ -n "$errors" ] && [ "$errors" != "None" ] && [ "$errors" != "null" ]; then
    echo "   ⚠️  Erros: $errors"
  else
    echo "   ✅ Erros: 0"
  fi
  echo ""
done

# 5. Verificar logs recentes
echo "5. Verificando logs recentes (últimos 10 minutos)..."
echo ""

for region in us-east-1 sa-east-1; do
  echo "   Região: $region"
  log_count=$(aws logs filter-log-events \
    --log-group-name /aws/lambda/evo-uds-v3-production-waf-log-processor \
    --start-time $(date -u -v-10M +%s 2>/dev/null || date -u -d '10 minutes ago' +%s)000 \
    --region $region \
    --query 'events | length(@)' \
    --output text 2>/dev/null)
  
  if [ -n "$log_count" ] && [ "$log_count" != "None" ] && [ "$log_count" != "null" ]; then
    echo "   📝 Logs: $log_count eventos"
  else
    echo "   📝 Logs: 0 eventos"
  fi
  echo ""
done

echo "=========================================="
echo "Diagnóstico concluído"
echo "=========================================="
echo ""
echo "Se não há invocações, verifique:"
echo "1. Se o WAF logging está habilitado no Web ACL do cliente"
echo "2. Se o log group aws-waf-logs-* existe na conta do cliente"
echo "3. Se o subscription filter está configurado corretamente"
echo "4. Se há tráfego passando pelo WAF"
echo ""
echo "Use a função de Diagnóstico no painel WAF para verificar"
echo "a configuração na conta do cliente."
