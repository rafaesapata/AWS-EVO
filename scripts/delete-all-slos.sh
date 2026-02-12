#!/bin/bash
# Delete ALL SLOs from CloudWatch Application Signals
export AWS_PROFILE=EVO_PRODUCTION
export AWS_DEFAULT_REGION=us-east-1

echo "=== Listando todas as SLOs ==="
ALL_SLOS=$(aws application-signals list-service-level-objectives --query 'SloSummaries[].Name' --output text 2>/dev/null)

if [ -z "$ALL_SLOS" ]; then
  echo "Nenhuma SLO encontrada."
  exit 0
fi

TOTAL=$(echo "$ALL_SLOS" | wc -w | tr -d ' ')
echo "Total de SLOs encontradas: $TOTAL"
echo ""

COUNT=0
DELETED=0
FAILED=0

for SLO_NAME in $ALL_SLOS; do
  COUNT=$((COUNT + 1))
  echo -n "[$COUNT/$TOTAL] Deletando $SLO_NAME ... "
  
  RESULT=$(aws application-signals delete-service-level-objective --id "$SLO_NAME" 2>&1)
  if [ $? -eq 0 ]; then
    echo "✅"
    DELETED=$((DELETED + 1))
  else
    echo "❌ $RESULT"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "=== CONCLUÍDO ==="
echo "Total: $TOTAL | Deletadas: $DELETED | Falhas: $FAILED"
