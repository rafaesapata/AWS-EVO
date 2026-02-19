# Documento de Requisitos: Redesign da Gestão de Orçamento

## Introdução

Redesign completo da tela de Gestão de Orçamento do EVO. A tela atual exige entrada manual de orçamento mês a mês, o que é impraticável. O novo design substitui isso por um único indicador de orçamento que se aplica a todos os meses futuros, com uma opção de sugestão inteligente por IA baseada em dados reais de otimização de custos, Reserved Instances e detecção de desperdício.

## Glossário

- **Sistema_Orcamento**: Módulo de gestão de orçamento do EVO (backend Lambda + frontend React)
- **Sugestao_IA**: Motor de cálculo que sugere o orçamento ideal baseado em dados históricos e indicadores de otimização
- **Indicador_Unico**: Valor único de orçamento mensal que se aplica automaticamente a todos os meses futuros
- **Slider_Orcamento**: Componente de interface que permite ajuste visual do valor de orçamento
- **Mes_Anterior_Fechado**: Último mês completo com dados de custo consolidados
- **Fator_Realizacao**: Percentual (~75%) aplicado sobre o total de savings propostos, reconhecendo que 100% de economia nunca é atingido
- **Dados_Otimizacao**: Conjunto de dados de cost-optimization, ml-waste-detection e ri-sp-analyzer usados para calcular a sugestão

## Requisitos

### Requisito 1: Indicador Único de Orçamento

**User Story:** Como usuário, quero definir um único valor de orçamento mensal que se aplique automaticamente a todos os meses futuros, para não precisar configurar orçamento mês a mês.

#### Critérios de Aceitação

1. THE Sistema_Orcamento SHALL exibir um único campo de orçamento mensal por provedor cloud (AWS/Azure)
2. WHEN o usuário define um valor de orçamento, THE Sistema_Orcamento SHALL aplicar esse valor ao mês atual e a todos os meses futuros até que o usuário altere o valor
3. WHEN o usuário altera o valor de orçamento, THE Sistema_Orcamento SHALL persistir o novo valor na tabela cloud_budgets com source "manual"
4. THE Sistema_Orcamento SHALL exibir o gasto atual do mês corrente em comparação com o orçamento definido
5. WHEN o orçamento não foi definido pelo usuário, THE Sistema_Orcamento SHALL exibir o campo vazio sem auto-fill automático

### Requisito 2: Entrada de Orçamento via Input e Slider

**User Story:** Como usuário, quero poder digitar um valor de orçamento ou usar um slider para ajustá-lo visualmente, para ter flexibilidade na definição do orçamento.

#### Critérios de Aceitação

1. THE Sistema_Orcamento SHALL exibir um campo de input numérico onde o usuário pode digitar o valor de orçamento em USD
2. THE Sistema_Orcamento SHALL exibir um Slider_Orcamento sincronizado com o campo de input numérico
3. WHEN o usuário altera o valor no input numérico, THE Slider_Orcamento SHALL atualizar sua posição para refletir o novo valor
4. WHEN o usuário move o Slider_Orcamento, THE Sistema_Orcamento SHALL atualizar o campo de input numérico com o valor correspondente
5. WHEN o valor de orçamento é alterado (via input ou slider), THE Sistema_Orcamento SHALL salvar o valor após um debounce de 800ms
6. IF o usuário digitar um valor negativo, THEN THE Sistema_Orcamento SHALL rejeitar o valor e manter o valor anterior

### Requisito 3: Sugestão de Orçamento por IA

**User Story:** Como usuário, quero receber uma sugestão inteligente de orçamento baseada nos indicadores de otimização do EVO, para definir um orçamento realista e otimizado.

#### Critérios de Aceitação

1. THE Sistema_Orcamento SHALL exibir um botão "Sugestão IA" que calcula o orçamento ideal
2. WHEN o usuário clica em "Sugestão IA", THE Sugestao_IA SHALL calcular o orçamento sugerido usando dados do Mes_Anterior_Fechado
3. THE Sugestao_IA SHALL calcular o orçamento sugerido como: gasto_mes_anterior - (total_savings_propostos × Fator_Realizacao)
4. THE Sugestao_IA SHALL obter total_savings_propostos agregando dados de cost-optimization (savings), ml-waste-detection (potential savings) e ri-sp-analyzer (potential waste)
5. WHEN a Sugestao_IA calcula o valor, THE Sistema_Orcamento SHALL preencher o campo de input e o Slider_Orcamento com o valor sugerido
6. WHEN a Sugestao_IA é aplicada, THE Sistema_Orcamento SHALL persistir o orçamento com source "ai_suggestion"
7. IF não existirem dados suficientes do Mes_Anterior_Fechado para calcular a sugestão, THEN THE Sistema_Orcamento SHALL exibir mensagem informando que dados insuficientes estão disponíveis
8. THE Sugestao_IA SHALL garantir que o valor sugerido seja maior que zero, usando o gasto do mês anterior como fallback caso os savings excedam o gasto

### Requisito 4: Visualização de Resumo do Orçamento

**User Story:** Como usuário, quero ver um resumo visual do meu orçamento atual versus gasto real, para acompanhar minha situação financeira cloud.

#### Critérios de Aceitação

1. THE Sistema_Orcamento SHALL exibir o valor do orçamento atual definido
2. THE Sistema_Orcamento SHALL exibir o gasto acumulado do mês corrente (MTD spend)
3. THE Sistema_Orcamento SHALL exibir o percentual de utilização do orçamento (gasto / orçamento × 100)
4. WHEN o gasto acumulado ultrapassa o orçamento definido, THE Sistema_Orcamento SHALL destacar visualmente a situação de over-budget com indicador vermelho
5. THE Sistema_Orcamento SHALL exibir uma barra de progresso representando a utilização do orçamento

### Requisito 5: Persistência e Multi-tenancy

**User Story:** Como administrador da plataforma, quero que os orçamentos sejam isolados por organização e provedor cloud, para garantir segurança e separação de dados.

#### Critérios de Aceitação

1. THE Sistema_Orcamento SHALL filtrar todos os dados de orçamento por organization_id
2. THE Sistema_Orcamento SHALL manter orçamentos separados por provedor cloud (AWS, Azure)
3. WHEN o orçamento é salvo, THE Sistema_Orcamento SHALL registrar audit log com ação BUDGET_UPDATE incluindo organizationId, userId, provider e amount
4. IF a organização estiver em modo demo, THEN THE Sistema_Orcamento SHALL bloquear operações de escrita e retornar dados de demonstração
5. THE Sistema_Orcamento SHALL armazenar o orçamento na tabela cloud_budgets com o year_month do mês corrente

### Requisito 6: Migração do Modelo de Dados

**User Story:** Como desenvolvedor, quero que o modelo de dados suporte o novo conceito de orçamento único, para que a transição do modelo antigo (mês a mês) para o novo seja transparente.

#### Critérios de Aceitação

1. THE Sistema_Orcamento SHALL continuar usando a tabela cloud_budgets existente sem alterações de schema
2. WHEN o novo orçamento é salvo, THE Sistema_Orcamento SHALL gravar o registro com year_month do mês corrente
3. WHEN o sistema consulta o orçamento vigente, THE Sistema_Orcamento SHALL buscar o registro mais recente (por year_month) para a combinação organization_id + cloud_provider
4. THE Sistema_Orcamento SHALL ignorar registros de meses passados ao exibir o orçamento vigente, usando apenas o registro mais recente como referência
