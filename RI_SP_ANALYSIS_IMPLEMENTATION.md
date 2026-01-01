# Análise Avançada de Reserved Instances & Savings Plans

## 📋 Resumo da Implementação

Sistema completo de análise, monitoramento e recomendações para Reserved Instances (RIs) e Savings Plans (SPs) da AWS, integrado ao sistema de análise de custos.

## 🎯 Funcionalidades Implementadas

### 1. Backend - Lambda Handler
**Arquivo**: `backend/src/handlers/cost/analyze-ri-sp.ts`

#### Análise de Reserved Instances
- ✅ Busca todas as RIs ativas via AWS EC2 API
- ✅ Calcula utilização percentual de cada RI
- ✅ Identifica RIs subutilizadas (<75% de utilização)
- ✅ Calcula economia mensal e custo equivalente on-demand
- ✅ Armazena histórico de utilização

#### Análise de Savings Plans
- ✅ Busca dados de utilização via AWS Cost Explorer
- ✅ Calcula utilização e cobertura percentual
- ✅ Identifica SPs subutilizados
- ✅ Calcula compromisso usado vs não usado
- ✅ Armazena histórico de utilização

#### Recomendações Inteligentes
- ✅ Gera recomendações de compra de RIs via Cost Explorer
- ✅ Gera recomendações de Savings Plans
- ✅ Calcula ROI e período de payback
- ✅ Prioriza recomendações por economia potencial
- ✅ Classifica por nível de confiança (high/medium/low)

### 2. Banco de Dados - Schema Prisma
**Arquivo**: `backend/prisma/schema.prisma`

#### Novas Tabelas

**reserved_instances**
- Armazena todas as RIs com detalhes completos
- Campos de utilização e economia
- Índices otimizados para queries de análise

**savings_plans**
- Armazena todos os Savings Plans
- Métricas de utilização e cobertura
- Tracking de compromisso usado/não usado

**ri_sp_recommendations**
- Recomendações de compra geradas pela AWS
- Análise financeira (economia, ROI, payback)
- Priorização e nível de confiança
- Status de implementação

**ri_sp_utilization_history**
- Histórico temporal de utilização
- Permite análise de tendências
- Suporta tanto RIs quanto SPs

#### Migração SQL
**Arquivo**: `backend/prisma/migrations/20260101000000_add_ri_sp_tables/migration.sql`
- ✅ Criação de todas as tabelas
- ✅ Índices otimizados
- ✅ Constraints e unique keys

### 3. Frontend - Componente React
**Arquivo**: `src/components/cost/RiSpAnalysis.tsx`

#### Interface de Usuário
- ✅ Dashboard com cards de resumo
- ✅ 4 abas de navegação:
  - **Visão Geral**: Métricas consolidadas
  - **Reserved Instances**: Detalhes e RIs subutilizadas
  - **Savings Plans**: Detalhes e SPs subutilizados
  - **Recomendações**: Oportunidades de economia

#### Visualizações
- ✅ Progress bars de utilização
- ✅ Tabelas com detalhes de recursos
- ✅ Cards de recomendações priorizadas
- ✅ Badges de status e prioridade
- ✅ Alertas para recursos subutilizados

#### Integração
**Arquivo**: `src/pages/CostAnalysisPage.tsx`
- ✅ Componente integrado no topo da página de análise de custos
- ✅ Usa contexto de conta AWS selecionada
- ✅ Refresh automático e manual

## 📊 Métricas Calculadas

### Reserved Instances
- **Utilização Média**: Percentual médio de uso das RIs
- **Economia Mensal**: Economia total comparado a on-demand
- **RIs Subutilizadas**: Contagem de RIs com <75% utilização
- **Desperdício Potencial**: Custo de horas não utilizadas

### Savings Plans
- **Utilização Média**: Percentual do compromisso utilizado
- **Cobertura Média**: Percentual de custos cobertos pelo SP
- **Compromisso Não Usado**: Valor do compromisso desperdiçado
- **Economia Mensal**: Economia total vs on-demand

### Recomendações
- **Economia Anual Potencial**: Total de economia possível
- **ROI em Meses**: Tempo para recuperar investimento inicial
- **Prioridade**: 1-5 baseado em economia e confiança
- **Nível de Confiança**: high/medium/low baseado em padrões de uso

## 🔧 Configuração e Deploy

### 1. Aplicar Migração do Banco
```bash
# Conectar ao RDS e executar
psql -h evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com \
     -U postgres -d evouds \
     -f backend/prisma/migrations/20260101000000_add_ri_sp_tables/migration.sql
```

### 2. Deploy do Backend
```bash
# Build já realizado
cd backend && npm run build

# Deploy via CDK (adicionar Lambda ao stack)
cd infra && npm run deploy
```

### 3. Deploy do Frontend
```bash
# Build
npm run build

# Deploy para S3
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete

# Invalidar CloudFront
aws cloudfront create-invalidation --distribution-id E1PY7U3VNT6P1R --paths "/*"
```

## 🔐 Permissões AWS Necessárias

A Lambda precisa das seguintes permissões IAM:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeReservedInstances",
        "ce:GetReservationUtilization",
        "ce:GetSavingsPlansUtilization",
        "ce:GetReservationPurchaseRecommendation",
        "ce:GetSavingsPlansPurchaseRecommendation"
      ],
      "Resource": "*"
    }
  ]
}
```

## 📈 Próximos Passos

### Melhorias Sugeridas
1. **Alertas Automáticos**: Notificar quando utilização cai abaixo de threshold
2. **Análise de Tendências**: Gráficos de utilização ao longo do tempo
3. **Simulador de Economia**: Calcular economia com diferentes cenários
4. **Exportação de Relatórios**: PDF/Excel com análise completa
5. **Integração com Jira**: Criar tickets para implementar recomendações
6. **Análise Multi-Região**: Consolidar RIs/SPs de todas as regiões
7. **Previsão de Expiração**: Alertas 30/60/90 dias antes do vencimento

### Otimizações Técnicas
1. **Cache de Dados**: Reduzir chamadas à AWS API
2. **Processamento Assíncrono**: Background jobs para análises pesadas
3. **Webhooks**: Notificações em tempo real de mudanças
4. **API de Terceiros**: Integrar com ferramentas de FinOps

## 🎨 Características da UI

### Design
- ✅ Interface moderna com shadcn/ui
- ✅ Responsiva para mobile/tablet/desktop
- ✅ Tema consistente com resto da aplicação
- ✅ Animações suaves e feedback visual

### UX
- ✅ Navegação intuitiva por abas
- ✅ Informações hierarquizadas por importância
- ✅ Ações rápidas (refresh, filtros)
- ✅ Estados de loading e erro tratados
- ✅ Tooltips e descrições contextuais

## 📝 Notas Técnicas

### Limitações Conhecidas
1. **AWS API Limits**: Cost Explorer tem limites de rate
2. **Dados Históricos**: AWS mantém apenas 14 meses de dados
3. **Latência**: Análise completa pode levar 10-30 segundos
4. **Custos**: Chamadas ao Cost Explorer têm custo ($0.01 por request)

### Boas Práticas Implementadas
- ✅ Multi-tenancy: Isolamento por organization_id
- ✅ Segurança: Validação de inputs e sanitização
- ✅ Performance: Índices otimizados no banco
- ✅ Observabilidade: Logs estruturados
- ✅ Resiliência: Tratamento de erros e retries
- ✅ Manutenibilidade: Código TypeScript tipado

## 🚀 Como Usar

### Para Usuários
1. Acesse a página "Análise de Custos"
2. Selecione a conta AWS desejada
3. Visualize o painel de RI/SP no topo
4. Navegue pelas abas para ver detalhes
5. Clique em "Atualizar" para buscar dados mais recentes

### Para Desenvolvedores
```typescript
// Chamar a Lambda diretamente
const result = await apiClient.invoke('analyze-ri-sp', {
  body: { 
    accountId: 'uuid-da-conta',
    analysisType: 'all', // ou 'ri', 'sp', 'recommendations'
    lookbackDays: 30
  }
});
```

## 📚 Referências

- [AWS Reserved Instances](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-reserved-instances.html)
- [AWS Savings Plans](https://docs.aws.amazon.com/savingsplans/latest/userguide/what-is-savings-plans.html)
- [AWS Cost Explorer API](https://docs.aws.amazon.com/cost-management/latest/APIReference/Welcome.html)
- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)

---

**Status**: ✅ Implementação Completa - Pronto para Deploy
**Data**: 2026-01-01
**Versão**: 1.0.0
