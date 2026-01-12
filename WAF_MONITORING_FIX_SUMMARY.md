# Correção do Monitoramento WAF - Resumo

## Problema Identificado

Os indicadores WAF estavam zerados porque:

1. **Problema de região cross-region**: O CloudWatch Logs destination em `sa-east-1` estava configurado para invocar uma Lambda em `us-east-1`, mas CloudWatch Logs destinations só podem invocar Lambdas na **mesma região**.

2. **Sem Lambda em sa-east-1**: Não existia uma Lambda `waf-log-processor` em `sa-east-1` para receber os logs dos WAFs nessa região.

## Solução Implementada

### 1. Criado Layer Prisma em sa-east-1
```
arn:aws:lambda:sa-east-1:383234048592:layer:evo-prisma-deps-layer:1
```

### 2. Criado Lambda Forwarder em sa-east-1
- **Arquivo**: `backend/src/handlers/security/waf-log-forwarder.ts`
- **Função**: Recebe logs do CloudWatch Logs em sa-east-1 e encaminha para a Lambda principal em us-east-1
- **Handler**: `waf-log-forwarder.handler`

### 3. Atualizado Destination em sa-east-1
O destination agora aponta para a Lambda local:
```
arn:aws:lambda:sa-east-1:383234048592:function:evo-uds-v3-production-waf-log-processor
```

### 4. Testado o Fluxo
- ✅ Lambda forwarder em sa-east-1 funcionando
- ✅ Encaminhamento para us-east-1 funcionando
- ✅ Lambda principal em us-east-1 recebendo eventos

## Status Atual

A infraestrutura está configurada corretamente:
- ✅ Destinations em us-east-1 e sa-east-1
- ✅ Lambdas em ambas as regiões
- ✅ Políticas de acesso cross-account configuradas

## Por que os indicadores ainda estão zerados?

Os indicadores estão zerados porque **não há logs WAF chegando da conta do cliente**. Isso pode significar:

1. **WAF logging não está habilitado** no Web ACL do cliente
2. **Log group não existe** na conta do cliente
3. **Subscription filter não está configurado** corretamente
4. **Não há tráfego** passando pelo WAF

## O que o usuário precisa fazer

### Opção 1: Usar o Diagnóstico no Painel WAF

1. Acesse o painel de Monitoramento WAF
2. Na aba "Configuração", clique no ícone de estetoscópio (🩺) ao lado do WAF configurado
3. O diagnóstico verificará:
   - Se o WAF logging está habilitado
   - Se o log group existe
   - Se há log streams (tráfego)
   - Se o subscription filter está configurado
   - Se há eventos no banco de dados

### Opção 2: Verificar manualmente na conta do cliente

1. **Verificar WAF Logging**:
   - AWS Console → WAF & Shield → Web ACLs
   - Selecione o Web ACL
   - Aba "Logging and metrics"
   - Verifique se o logging está habilitado

2. **Verificar Log Group**:
   - AWS Console → CloudWatch → Log groups
   - Procure por `aws-waf-logs-*`
   - Verifique se há log streams recentes

3. **Verificar Subscription Filter**:
   - Dentro do log group, aba "Subscription filters"
   - Deve haver um filtro chamado `evo-waf-monitoring`
   - O destination deve ser `arn:aws:logs:sa-east-1:383234048592:destination:evo-uds-v3-production-waf-logs-destination`

### Opção 3: Reconfigurar o monitoramento

Se o diagnóstico mostrar problemas, tente:
1. Desativar o monitoramento do WAF
2. Ativar novamente
3. Isso recriará o subscription filter

## Script de Diagnóstico

Execute o script para verificar a infraestrutura:
```bash
./scripts/diagnose-waf-monitoring.sh
```

## Arquivos Modificados

- `backend/src/handlers/security/waf-log-forwarder.ts` - Novo handler de forwarding
- `scripts/diagnose-waf-monitoring.sh` - Script de diagnóstico

## Próximos Passos

1. O usuário deve executar o diagnóstico no painel WAF
2. Verificar se o WAF logging está habilitado na conta do cliente
3. Verificar se há tráfego passando pelo WAF
4. Se necessário, reconfigurar o monitoramento

---
**Data**: 2026-01-12
**Status**: Infraestrutura corrigida, aguardando verificação na conta do cliente
