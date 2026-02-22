# Documento de Requisitos — Cost Overhead

## Introdução

Feature de overhead de custos que permite ao super admin configurar um percentual de acréscimo (overhead) por organização. Quando configurado, todos os valores monetários de custos exibidos para os usuários daquela organização são automaticamente acrescidos do percentual definido. O overhead é transparente ao usuário final — ele nunca vê o valor original nem sabe que existe overhead. Organizações sem overhead configurado não são afetadas em nenhum momento.

A aplicação centralizada do overhead na camada de resposta da API garante consistência em todos os pontos de exibição (custos diários, dashboard executivo, forecast, otimizações, RI/SP, waste detection, budgets) sem modificar dados armazenados no banco ou no cache.

## Glossário

- **Overhead_Service**: Serviço centralizado (lib compartilhada) responsável por buscar o percentual de overhead da organização e aplicar o multiplicador sobre valores monetários nas respostas da API
- **Organization**: Entidade multi-tenant que agrupa contas cloud, usuários e configurações. Mapeada na tabela `organizations` do PostgreSQL
- **Super_Admin**: Usuário com role `super_admin` que gerencia organizações e tem acesso a configurações globais como overhead
- **Overhead_Percentage**: Valor numérico decimal (ex: 3.00 = 3%) armazenado na tabela `organizations`, representando o percentual de acréscimo a ser aplicado nos custos
- **Cost_Handler**: Qualquer Lambda handler que retorna valores monetários de custos ao frontend (ex: `fetch-daily-costs`, `get-executive-dashboard`, `budget-forecast`, etc.)
- **Redis_Cache**: Cache SWR (Stale-While-Revalidate) usado pelos Cost_Handlers com prefix `cost`
- **DailyCost**: Modelo Prisma que armazena custos diários por organização, conta cloud e serviço — valores originais da AWS/Azure sem overhead

## Requisitos

### Requisito 1: Armazenamento do Overhead por Organização

**User Story:** Como super admin, quero configurar um percentual de overhead por organização, para que os custos exibidos aos usuários reflitam a margem operacional da empresa.

#### Critérios de Aceitação

1. THE Organization SHALL armazenar o campo `cost_overhead_percentage` como valor decimal com precisão de duas casas, com valor padrão `0.00`
2. WHEN o `cost_overhead_percentage` for `0.00` ou `NULL`, THE Overhead_Service SHALL retornar os valores de custo sem nenhuma modificação
3. THE Organization SHALL restringir o `cost_overhead_percentage` a valores entre `0.00` e `100.00` inclusive

### Requisito 2: API de Gerenciamento do Overhead

**User Story:** Como super admin, quero uma API para configurar e consultar o overhead de uma organização, para que eu possa ajustar a margem conforme necessário.

#### Critérios de Aceitação

1. WHEN o Super_Admin enviar uma requisição PUT com um valor de overhead válido, THE Cost_Handler SHALL atualizar o `cost_overhead_percentage` da organização especificada e invalidar o cache Redis associado
2. WHEN o Super_Admin enviar uma requisição GET, THE Cost_Handler SHALL retornar o `cost_overhead_percentage` atual da organização especificada
3. WHEN um usuário sem role `super_admin` tentar acessar a API de overhead, THE Cost_Handler SHALL retornar erro 403 Forbidden
4. WHEN o valor enviado estiver fora do intervalo `0.00` a `100.00`, THE Cost_Handler SHALL retornar erro 400 com mensagem descritiva
5. WHEN o overhead for atualizado, THE Cost_Handler SHALL registrar um audit log com a ação `OVERHEAD_UPDATED`, o valor anterior e o novo valor

### Requisito 3: Aplicação Centralizada do Overhead nos Custos

**User Story:** Como operador da plataforma, quero que o overhead seja aplicado de forma centralizada e consistente em todas as respostas de custo, para que não haja risco de valores inconsistentes entre diferentes telas.

#### Critérios de Aceitação

1. THE Overhead_Service SHALL aplicar o overhead multiplicando cada valor monetário por `(1 + overhead_percentage / 100)`
2. THE Overhead_Service SHALL buscar o `cost_overhead_percentage` da organização com cache Redis dedicado (chave `overhead:{organization_id}`) com TTL de 300 segundos
3. WHEN o cache Redis do overhead expirar ou não existir, THE Overhead_Service SHALL buscar o valor diretamente do banco de dados PostgreSQL e atualizar o cache
4. THE Overhead_Service SHALL aplicar o overhead em todos os Cost_Handlers que retornam valores monetários, incluindo: `fetch-daily-costs`, `get-executive-dashboard`, `get-executive-dashboard-public`, `budget-forecast`, `generate-cost-forecast`, `cost-optimization`, `ai-budget-suggestion`, `ml-waste-detection`, `get-ri-sp-data`, `get-ri-sp-analysis`, `list-ri-sp-history`, `ri-sp-analyzer`, `azure-fetch-costs` e `azure-detect-anomalies`
5. THE Overhead_Service SHALL aplicar o overhead somente nos valores monetários da resposta final da API, sem modificar dados armazenados no banco de dados ou no cache SWR
6. WHEN o overhead for `0.00` ou não configurado, THE Overhead_Service SHALL retornar a resposta sem nenhuma transformação, com custo computacional zero (short-circuit)

### Requisito 4: Isolamento Multi-Tenant do Overhead

**User Story:** Como operador da plataforma, quero garantir que o overhead de uma organização nunca afete outra organização, para manter a integridade dos dados em ambiente multi-tenant.

#### Critérios de Aceitação

1. THE Overhead_Service SHALL buscar o overhead exclusivamente pelo `organization_id` extraído do token de autenticação do usuário ou do contexto de impersonação
2. WHEN uma organização não possuir overhead configurado, THE Overhead_Service SHALL tratar o valor como `0.00` e retornar custos originais sem modificação
3. THE Overhead_Service SHALL utilizar chaves de cache Redis isoladas por organização no formato `overhead:{organization_id}`
4. IF ocorrer falha na busca do overhead (erro de banco ou Redis), THEN THE Overhead_Service SHALL tratar o overhead como `0.00` e logar um warning, garantindo que custos originais sejam exibidos em vez de falhar a requisição

### Requisito 5: Invalidação de Cache ao Atualizar Overhead

**User Story:** Como super admin, quero que ao alterar o overhead os novos valores sejam refletidos rapidamente nas consultas de custo, para que a mudança tenha efeito imediato.

#### Critérios de Aceitação

1. WHEN o overhead de uma organização for atualizado, THE Cost_Handler SHALL invalidar a chave de cache Redis `overhead:{organization_id}`
2. WHEN o overhead de uma organização for atualizado, THE Cost_Handler SHALL invalidar todas as chaves de cache SWR de custo da organização usando o padrão `cost:*:{organization_id}:*`
3. THE Overhead_Service SHALL garantir que após invalidação do cache, a próxima requisição de custo utilize o novo valor de overhead

### Requisito 6: Transparência do Overhead para o Usuário Final

**User Story:** Como operador da plataforma, quero que o overhead seja completamente invisível ao usuário final, para que ele veja apenas os valores finais sem saber da existência do acréscimo.

#### Critérios de Aceitação

1. THE Cost_Handler SHALL retornar valores monetários já com overhead aplicado, sem incluir campos que indiquem a existência ou o valor do overhead na resposta da API
2. THE Overhead_Service SHALL preservar a estrutura original da resposta JSON de cada Cost_Handler, alterando apenas os valores numéricos monetários
3. WHEN o frontend exibir custos em qualquer tela (dashboard, detalhamento, forecast, otimizações), THE Cost_Handler SHALL fornecer valores já com overhead, sem necessidade de cálculo no frontend

### Requisito 7: Consistência entre Dados AWS e Azure

**User Story:** Como operador da plataforma, quero que o overhead seja aplicado igualmente em custos AWS e Azure, para que não haja discrepância entre provedores cloud.

#### Critérios de Aceitação

1. THE Overhead_Service SHALL aplicar o mesmo percentual de overhead tanto em custos originados da AWS quanto da Azure para a mesma organização
2. THE Overhead_Service SHALL aplicar o overhead nos handlers Azure (`azure-fetch-costs`, `azure-detect-anomalies`, `azure-reservations-analyzer`) com a mesma lógica utilizada nos handlers AWS
3. WHEN uma organização possuir contas em ambos os provedores, THE Overhead_Service SHALL garantir que o total consolidado reflita o overhead aplicado uniformemente em todas as contas

### Requisito 8: Auditoria e Rastreabilidade

**User Story:** Como super admin, quero rastrear todas as alterações de overhead, para manter controle e compliance sobre as margens aplicadas.

#### Critérios de Aceitação

1. WHEN o overhead for criado ou atualizado, THE Cost_Handler SHALL registrar um audit log contendo: `organization_id`, `user_id`, ação (`OVERHEAD_CREATED` ou `OVERHEAD_UPDATED`), valor anterior, novo valor, `ip_address` e `user_agent`
2. THE Cost_Handler SHALL utilizar o serviço de audit existente (`logAuditAsync`) com `resourceType` igual a `organization_overhead`
