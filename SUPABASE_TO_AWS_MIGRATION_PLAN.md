# 🔄 Plano de Migração Completa: Supabase → AWS

## 📋 Status Atual
- **Problema Identificado**: Código usando `supabase` como variável global não definida
- **Impacto**: Erros de runtime em produção
- **Urgência**: CRÍTICA - Precisa ser corrigido imediatamente

## 🎯 Objetivo
Substituir TODAS as referências ao Supabase por componentes AWS nativos:
- **Autenticação**: Supabase Auth → AWS Cognito
- **Database**: Supabase Database → AWS API Gateway + Lambda + RDS
- **Edge Functions**: Supabase Functions → AWS Lambda
- **Storage**: Supabase Storage → AWS S3
- **Real-time**: Supabase Realtime → AWS AppSync/EventBridge

## 📊 Análise de Referências Encontradas

### Frontend (React/TypeScript)
1. **Componentes com Supabase Auth**:
   - `src/components/OrganizationSettings.tsx`
   - `src/components/license/SeatManagement.tsx`
   - `src/components/SuperAdminPanel.tsx`
   - `src/components/UserMenu.tsx`
   - `src/components/admin/UserOrganizationManager.tsx`

2. **Componentes com Supabase Database**:
   - `src/components/dashboard/MultiAccountComparison.tsx`
   - `src/components/dashboard/cost-analysis/CostForecast.tsx`
   - `src/components/dashboard/ScheduledScans.tsx`
   - `src/components/dashboard/CostOverview.tsx`
   - `src/components/dashboard/WellArchitectedScorecard.tsx`
   - `src/components/dashboard/AIInsights.tsx`
   - E muitos outros...

3. **Componentes com Supabase Functions**:
   - `src/components/dashboard/cost-analysis/ExportManager.tsx`
   - `src/components/dashboard/CostOptimization.tsx`
   - `src/components/dashboard/WasteDetection.tsx`
   - E muitos outros...

### Backend (Edge Functions)
- **Pasta `supabase/functions/`**: 50+ edge functions que precisam ser migradas para AWS Lambda

## 🔧 Estratégia de Migração

### Fase 1: Correção Imediata (URGENTE)
1. **Definir cliente Supabase temporário** para evitar erros de runtime
2. **Identificar componentes críticos** que estão quebrando
3. **Implementar fallbacks** para funcionalidades essenciais

### Fase 2: Migração Sistemática
1. **Autenticação**: Migrar `supabase.auth.*` → `cognitoAuth.*`
2. **Database**: Migrar `supabase.from().*` → `apiClient.*`
3. **Functions**: Migrar `supabase.functions.invoke()` → `apiClient.lambda()`

### Fase 3: Limpeza
1. **Remover dependências** do Supabase
2. **Atualizar testes**
3. **Documentar mudanças**

## 🚀 Implementação

### Substituições Padrão:

#### Autenticação
```typescript
// ANTES (Supabase)
const { data: { user } } = await supabase.auth.getUser();
const { error } = await supabase.auth.signOut();

// DEPOIS (AWS Cognito)
const user = await cognitoAuth.getCurrentUser();
await cognitoAuth.signOut();
```

#### Database Queries
```typescript
// ANTES (Supabase)
const { data, error } = await supabase
  .from('table')
  .select('*')
  .eq('id', id);

// DEPOIS (AWS API)
const data = await apiClient.get('/table', { id });
```

#### Edge Functions
```typescript
// ANTES (Supabase)
const { data, error } = await supabase.functions.invoke('function-name', {
  body: { param: value }
});

// DEPOIS (AWS Lambda)
const data = await apiClient.lambda('function-name', { param: value });
```

## 📝 Arquivos a Serem Modificados

### Frontend (React Components)
- [ ] `src/components/OrganizationSettings.tsx`
- [ ] `src/components/license/SeatManagement.tsx`
- [ ] `src/components/SuperAdminPanel.tsx`
- [ ] `src/components/UserMenu.tsx`
- [ ] `src/components/dashboard/MultiAccountComparison.tsx`
- [ ] `src/components/dashboard/cost-analysis/CostForecast.tsx`
- [ ] `src/components/dashboard/cost-analysis/ExportManager.tsx`
- [ ] `src/components/dashboard/ScheduledScans.tsx`
- [ ] `src/components/dashboard/CostOverview.tsx`
- [ ] `src/components/dashboard/WellArchitectedScorecard.tsx`
- [ ] `src/components/dashboard/AIInsights.tsx`
- [ ] `src/components/dashboard/CostOptimization.tsx`
- [ ] `src/components/dashboard/WasteDetection.tsx`
- [ ] E mais 30+ componentes...

### Backend (Edge Functions → Lambda)
- [ ] Migrar todas as funções da pasta `supabase/functions/`
- [ ] Atualizar configurações de deploy
- [ ] Migrar variáveis de ambiente

## ⚠️ Riscos e Mitigações

### Riscos
1. **Quebra de funcionalidades** durante a migração
2. **Perda de dados** se não migrar corretamente
3. **Downtime** durante a transição

### Mitigações
1. **Migração incremental** por componente
2. **Testes extensivos** antes do deploy
3. **Rollback plan** para cada mudança
4. **Feature flags** para controlar a migração

## 📈 Cronograma

### Semana 1: Correção Crítica
- [x] Identificar todas as referências
- [ ] Implementar cliente Supabase temporário
- [ ] Corrigir erros de runtime críticos

### Semana 2-3: Migração Core
- [ ] Migrar autenticação (Cognito)
- [ ] Migrar queries principais (API Client)
- [ ] Migrar funções críticas (Lambda)

### Semana 4: Finalização
- [ ] Migrar componentes restantes
- [ ] Remover dependências Supabase
- [ ] Testes finais e deploy

## 🎯 Próximos Passos Imediatos

1. **URGENTE**: Criar cliente Supabase temporário para evitar crashes
2. **Identificar componentes críticos** que estão falhando
3. **Priorizar migração** por impacto no usuário
4. **Implementar substituições** uma por vez
5. **Testar cada mudança** antes de continuar

---

**Status**: 🔴 CRÍTICO - Migração em andamento
**Responsável**: Equipe de Desenvolvimento
**Prazo**: 4 semanas
**Prioridade**: MÁXIMA