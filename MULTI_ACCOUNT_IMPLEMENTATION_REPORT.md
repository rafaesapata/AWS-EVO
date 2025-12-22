# Relatório de Implementação - Suporte Multi-Conta AWS

## Resumo Executivo

Este documento detalha a implementação do suporte a múltiplas contas AWS dentro de uma mesma organização, com isolamento completo de dados entre contas.

## 1. Arquitetura Implementada

### 1.1 Contexto Global de Conta (`AwsAccountContext`)
- **Arquivo**: `src/contexts/AwsAccountContext.tsx`
- **Função**: Gerencia o estado da conta AWS selecionada globalmente
- **Recursos**:
  - Persistência da seleção no localStorage
  - Auto-seleção da primeira conta se nenhuma estiver selecionada
  - Invalidação automática de cache ao trocar de conta
  - Hook `useAwsAccount()` para acessar conta selecionada

### 1.2 Seletor de Conta (`AwsAccountSelector`)
- **Arquivo**: `src/components/AwsAccountSelector.tsx`
- **Localização**: Header da aplicação (ao lado do AWSStatusIndicator)
- **Comportamento**:
  - Exibe dropdown se houver múltiplas contas
  - Exibe badge se houver apenas uma conta
  - Esconde se não houver contas

### 1.3 Hook de Query com Isolamento (`useAccountQuery`)
- **Arquivo**: `src/hooks/useAccountQuery.ts`
- **Query Key**: Inclui `organizationId` E `accountId` para isolamento de cache
- **Uso**: Substitui `useOrganizationQuery` para dados que devem ser isolados por conta

## 2. Regras de Isolamento

### 2.1 Query Key Pattern
```typescript
// CORRETO - Isolamento completo
queryKey: ['data-type', 'org', organizationId, 'account', accountId]

// INCORRETO - Não isola por conta
queryKey: ['data-type', organizationId]
```

### 2.2 Invalidação de Cache
Ao trocar de conta, as seguintes queries são automaticamente invalidadas:
- `aws-account-data`
- `security-scan`
- `cost-data`
- `findings`
- `anomalies`
- `waste-detection`
- `well-architected`
- `daily-costs`
- `resource-inventory`
- `compliance`
- `budget-forecast`

## 3. Componentes Atualizados

| Componente | Arquivo | Status |
|------------|---------|--------|
| Index (Dashboard) | `src/pages/Index.tsx` | ✅ Atualizado |
| AuthGuard | `src/components/AuthGuard.tsx` | ✅ Provedor adicionado |
| GlobalSystemUpdater | `src/components/GlobalSystemUpdater.tsx` | ✅ Usa `selectedAccountId` |

## 4. Componentes que DEVEM ser Atualizados

Os seguintes componentes precisam usar `useAccountQuery` ou `useAwsAccount`:

### Alta Prioridade (Dados de Conta)
- [ ] `SecurityAnalysisContent` - Scans de segurança
- [ ] `CostAnalysis` - Análise de custos
- [ ] `CostOverview` - Visão geral de custos
- [ ] `ExecutiveDashboard` - Dashboard executivo
- [ ] `WellArchitectedScorecard` - Scores Well-Architected
- [ ] `WasteDetection` - Detecção de desperdício
- [ ] `ResourceMonitoringDashboard` - Monitoramento de recursos
- [ ] `EdgeMonitoring` - Monitoramento de borda
- [ ] `BudgetForecasting` - Previsão de orçamento
- [ ] `AnomalyDashboard` - Dashboard de anomalias
- [ ] `PredictiveIncidents` - Incidentes preditivos
- [ ] `SecurityPosture` - Postura de segurança
- [ ] `ComplianceFrameworks` - Compliance
- [ ] `IntelligentAlerts` - Alertas inteligentes

### Média Prioridade (Edge Functions)
- [ ] `fetch-daily-costs` - Adicionar filtro por accountId
- [ ] `security-scan` - Adicionar filtro por accountId
- [ ] `cost-optimization` - Adicionar filtro por accountId
- [ ] `well-architected-scan` - Adicionar filtro por accountId
- [ ] `waste-detection` - Adicionar filtro por accountId
- [ ] `anomaly-detection` - Adicionar filtro por accountId

## 5. Padrão de Implementação para Componentes

### Frontend
```typescript
import { useAccountQuery } from '@/hooks/useAccountQuery';
import { useAwsAccount } from '@/contexts/AwsAccountContext';

// Para queries
const { data, isLoading } = useAccountQuery(
  ['my-data-type'],
  async ({ organizationId, accountId }) => {
    const { data } = await supabase
      .from('my_table')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('aws_account_id', accountId);
    return data;
  }
);

// Para acessar conta selecionada diretamente
const { selectedAccountId, selectedAccount } = useAwsAccount();
```

### Edge Functions
```typescript
// Requer accountId no body
const { accountId } = await req.json();

if (!accountId) {
  return new Response(
    JSON.stringify({ error: 'accountId is required' }),
    { status: 400 }
  );
}

// Validar que account pertence à organização do usuário
const { data: account } = await supabase
  .from('aws_credentials')
  .select('organization_id')
  .eq('id', accountId)
  .single();

if (account.organization_id !== userOrganizationId) {
  return new Response(
    JSON.stringify({ error: 'Unauthorized access to account' }),
    { status: 403 }
  );
}
```

## 6. Segurança

### 6.1 Validações Implementadas
1. **Frontend**: Query key inclui accountId para isolamento de cache
2. **Contexto**: Só permite selecionar contas da organização do usuário
3. **Persistência**: Valida que conta selecionada ainda é válida ao recarregar

### 6.2 RLS Policies (Banco de Dados)
A maioria das tabelas já possui `aws_account_id` e policies que validam via join com `aws_credentials.organization_id`:
```sql
-- Exemplo existente
CREATE POLICY "Users can view their organization data" 
ON waste_detection FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM aws_credentials ac
    WHERE ac.id = waste_detection.aws_account_id
    AND ac.organization_id = get_user_organization(auth.uid())
  )
);
```

## 7. Testes Recomendados

### 7.1 Testes de Isolamento
- [ ] Criar 2 contas AWS na mesma organização
- [ ] Verificar que dados de uma conta não aparecem na outra
- [ ] Verificar que cache é limpo ao trocar de conta
- [ ] Verificar que seleção persiste após refresh

### 7.2 Testes de Regressão
- [ ] Verificar que dashboards carregam corretamente
- [ ] Verificar que scans funcionam com conta selecionada
- [ ] Verificar que exportações usam conta correta

## 8. Próximos Passos

1. **Fase 1 (Concluída)**: Infraestrutura base
   - ✅ Contexto de conta
   - ✅ Seletor de conta no header
   - ✅ Hook useAccountQuery
   - ✅ Integração com AuthGuard

2. **Fase 2 (Pendente)**: Atualizar componentes principais
   - Migrar queries para useAccountQuery
   - Adicionar accountId às chamadas de edge functions

3. **Fase 3 (Pendente)**: Edge Functions
   - Atualizar functions para requerer accountId
   - Adicionar validação de acesso

---

**Data**: 2025-12-02
**Versão**: 1.0
**Status**: Fase 1 Completa
