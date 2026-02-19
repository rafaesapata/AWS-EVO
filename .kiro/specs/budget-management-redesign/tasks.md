# Plano de Implementação: Redesign da Gestão de Orçamento

## Visão Geral

Refatorar o handler `manage-cloud-budget` para suportar orçamento único vigente, criar novo handler `ai-budget-suggestion`, e redesenhar completamente o frontend `BudgetManagement.tsx`. Stack: TypeScript (backend Lambda + frontend React), fast-check para property tests.

## Tasks

- [x] 1. Refatorar handler `manage-cloud-budget`
  - [x] 1.1 Adicionar action `get_current` ao handler `backend/src/handlers/cost/manage-cloud-budget.ts`
    - Implementar query que busca o registro mais recente (ORDER BY year_month DESC LIMIT 1) para org+provider
    - Calcular MTD spend, utilization_percentage e is_over_budget
    - Retornar budget: null quando não existir registro (sem auto-fill)
    - _Requirements: 1.2, 1.5, 4.3, 4.4, 6.3_

  - [x] 1.2 Ajustar action `save` para sempre usar year_month do mês corrente
    - Remover year_month do request body (calcular internamente)
    - Aceitar campo `source` opcional ('manual' | 'ai_suggestion'), default 'manual'
    - Validar amount >= 0, rejeitar negativos com HTTP 400
    - Manter audit log com BUDGET_UPDATE
    - _Requirements: 1.3, 2.6, 5.3, 5.5_

  - [x]* 1.3 Escrever property tests para `manage-cloud-budget`
    - **Property 1: Orçamento vigente é o mais recente**
    - **Property 2: Save persiste com year_month corrente**
    - **Property 3: Source tracking por origem**
    - **Property 5: Cálculo de utilização do orçamento**
    - **Property 8: Rejeição de valores negativos**
    - **Property 9: Orçamento inexistente retorna null**
    - **Validates: Requirements 1.2, 1.3, 1.5, 2.6, 3.6, 4.3, 4.4, 5.5, 6.3**

- [x] 2. Criar handler `ai-budget-suggestion`
  - [x] 2.1 Criar `backend/src/handlers/cost/ai-budget-suggestion.ts`
    - Seguir template padrão de handler Lambda (AuthorizedEvent, corsOptions, auth, prisma)
    - Agregar gasto do mês anterior fechado via daily_costs
    - Agregar savings de cost_optimizations (SUM savings, últimos 30 dias)
    - Agregar savings de waste detections e RI/SP analyses
    - Calcular: suggested = prev_spend - (total_savings × 0.75)
    - Fallback: se suggested <= 0, usar prev_spend × 0.85
    - Retornar data_available: false se não houver dados do mês anterior
    - _Requirements: 3.2, 3.3, 3.4, 3.7, 3.8_

  - [x]* 2.2 Escrever property test para fórmula da sugestão IA
    - **Property 4: Fórmula da sugestão IA**
    - **Validates: Requirements 3.3, 3.4, 3.8**

- [x] 3. Checkpoint - Backend
  - Garantir que todos os testes passam, perguntar ao usuário se houver dúvidas.

- [x] 4. Redesenhar frontend `BudgetManagement`
  - [x] 4.1 Criar componentes de resumo do orçamento
    - Criar `BudgetSummaryCards` com cards: Orçamento Atual, Gasto MTD, % Utilização
    - Criar `BudgetProgressBar` com indicação visual de over-budget (vermelho quando > 100%)
    - Usar shadcn/ui Card, Progress components
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 4.2 Criar componente de input de orçamento com slider
    - Criar `BudgetInput` com input numérico e Slider sincronizados bidirecionalmente
    - Input aceita apenas valores >= 0, rejeita negativos
    - Slider range dinâmico (0 até max(orçamento atual × 2, 50000))
    - Debounce de 800ms antes de chamar API de save
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x]* 4.3 Escrever property test para sincronização input/slider
    - **Property 7: Sincronização bidirecional input/slider**
    - **Validates: Requirements 2.3, 2.4**

  - [x] 4.4 Implementar botão e painel de Sugestão IA
    - Criar `AISuggestionButton` que chama `ai-budget-suggestion` Lambda
    - Ao receber resposta, preencher input e slider com valor sugerido
    - Salvar automaticamente com source 'ai_suggestion'
    - Criar `AISuggestionDetails` painel expandível com breakdown dos savings
    - Exibir mensagem quando data_available: false
    - _Requirements: 3.1, 3.2, 3.5, 3.6, 3.7_

  - [x] 4.5 Reescrever página `BudgetManagement.tsx`
    - Substituir layout de tabela mês-a-mês pelo novo layout com componentes criados
    - Chamar `get_current` ao carregar (em vez de `list`)
    - Manter seletor de provedor cloud (AWS/Azure)
    - Manter suporte a modo demo
    - _Requirements: 1.1, 1.4, 5.4_

- [x] 5. Integração e multi-tenancy
  - [x] 5.1 Verificar isolamento multi-tenant
    - Garantir que todas as queries filtram por organization_id
    - Testar que get_current e ai-budget-suggestion respeitam org isolation
    - _Requirements: 5.1, 5.2_

  - [x]* 5.2 Escrever teste de integração multi-tenant
    - **Property 6: Isolamento multi-tenant**
    - **Validates: Requirements 5.1, 5.2**

- [x] 6. Checkpoint Final
  - Garantir que todos os testes passam, perguntar ao usuário se houver dúvidas.

## Notas

- Tasks marcadas com `*` são opcionais e podem ser puladas para MVP mais rápido
- Cada task referencia requisitos específicos para rastreabilidade
- Property tests usam fast-check com mínimo 100 iterações
- O handler `manage-cloud-budget` mantém action "list" para compatibilidade com dashboard executivo
