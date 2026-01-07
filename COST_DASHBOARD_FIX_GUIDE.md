# 🔧 Guia de Correção: Dashboard de Custos Zerado

## Problema
O dashboard financeiro está mostrando valores zerados:
- MTD Cost: $0.00
- YTD Cost: $0
- Budget Utilization: 0.0%
- Savings Opportunities: $0

## Diagnóstico Rápido

### Opção 1: Script Automático (Recomendado)
1. Abra o console do navegador (F12)
2. Copie e cole o conteúdo do arquivo `force-cost-fetch.js`
3. Pressione Enter e aguarde o processamento
4. Siga as instruções exibidas no console

### Opção 2: Diagnóstico Manual
1. Abra o console do navegador (F12)
2. Copie e cole o conteúdo do arquivo `test-cost-diagnosis.js`
3. Pressione Enter para ver o diagnóstico detalhado

## Soluções por Problema Identificado

### 1. Nenhuma Conta AWS Configurada
**Sintoma**: "No AWS credentials configured"

**Solução**:
1. Acesse: https://evo.ai.udstec.io/app?tab=aws-credentials
2. Clique em "Adicionar Conta AWS"
3. Configure com:
   - Nome da conta
   - Role ARN (formato: `arn:aws:iam::ACCOUNT-ID:role/ROLE-NAME`)
   - External ID (se necessário)
4. Teste a conexão
5. Certifique-se que está marcada como "Ativa"

### 2. Erro de Permissões AWS
**Sintoma**: "AssumeRole", "not authorized", "Access Denied"

**Solução - IAM Role**:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ce:GetCostAndUsage",
                "ce:GetReservationUtilization",
                "ce:GetSavingsPlansUtilization",
                "ce:GetReservationPurchaseRecommendation",
                "ce:GetSavingsPlansPurchaseRecommendation",
                "ce:ListCostCategoryDefinitions",
                "ce:GetDimensionValues"
            ],
            "Resource": "*"
        }
    ]
}
```

**Solução - Trust Policy**:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "AWS": "arn:aws:iam::383234048592:root"
            },
            "Action": "sts:AssumeRole",
            "Condition": {
                "StringEquals": {
                    "sts:ExternalId": "SEU-EXTERNAL-ID"
                }
            }
        }
    ]
}
```

### 3. Cost Explorer Não Habilitado
**Sintoma**: "Cost Explorer not available"

**Solução**:
1. Acesse o AWS Console
2. Vá para Cost Management > Cost Explorer
3. Clique em "Enable Cost Explorer"
4. Aguarde até 24h para ativação completa

### 4. Nenhum Dado de Custos
**Sintoma**: "No cost data found in database"

**Solução**:
1. Acesse: https://evo.ai.udstec.io/app?tab=cost-analysis
2. Clique em "Busca Completa" ou "Atualizar"
3. Aguarde o processamento (pode levar 5-10 minutos)
4. Verifique se aparecem dados na tabela

## Busca Manual de Custos

Se os scripts automáticos não funcionarem:

1. **Via Interface**:
   - Vá para Dashboard > Análise de Custos
   - Clique em "Busca Completa"
   - Aguarde o processamento

2. **Via API (Console)**:
```javascript
fetch('/api/functions/fetch-daily-costs', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
  },
  body: JSON.stringify({
    accountId: 'SEU-ACCOUNT-ID',
    days: 90,
    incremental: false
  })
}).then(r => r.json()).then(console.log);
```

## Verificação Final

Após executar as correções:

1. **Recarregue a página** do dashboard
2. **Aguarde alguns segundos** para os dados carregarem
3. **Verifique se os valores** não estão mais zerados:
   - MTD Cost deve mostrar valor > $0
   - Gráfico deve mostrar dados dos últimos dias
   - Top services deve listar serviços AWS

## Monitoramento

Para evitar o problema no futuro:

1. **Configurar busca automática**:
   - Os custos são buscados automaticamente diariamente às 2h
   - Verifique se não há erros nos logs

2. **Verificar permissões periodicamente**:
   - IAM Roles podem expirar ou ser alteradas
   - Teste a conexão AWS mensalmente

## Suporte

Se o problema persistir:

1. **Logs detalhados**: Execute o script de diagnóstico e envie os logs
2. **Informações da conta**: Nome da conta AWS e região
3. **Mensagens de erro**: Copie exatamente as mensagens de erro

## Links Úteis

- **AWS Credentials**: https://evo.ai.udstec.io/app?tab=aws-credentials
- **Cost Analysis**: https://evo.ai.udstec.io/app?tab=cost-analysis
- **Dashboard**: https://evo.ai.udstec.io/app?tab=dashboard

---

**Nota**: Este problema geralmente é causado por falta de dados no banco ou permissões AWS incorretas. A solução mais comum é executar a busca de custos manualmente após verificar as permissões.