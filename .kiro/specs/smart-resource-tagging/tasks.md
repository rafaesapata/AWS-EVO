# Implementation Plan: Smart Resource Tagging

## Overview

Implementação incremental do sistema de tagging local para a plataforma EVO. Começa pela camada de dados (Prisma + validação), segue para os handlers Lambda, depois relatórios, e finaliza com os componentes frontend e integração com páginas existentes. TypeScript (CommonJS) no backend, React 18 + Vite no frontend.

## Tasks

- [x] 1. Data layer — Prisma schema e validação
  - [x] 1.1 Adicionar modelos `Tag` e `ResourceTagAssignment` ao Prisma schema
    - Adicionar enum `TagCategory` com os 7 valores
    - Criar model `Tag` com campos, unique constraint `uq_tag_org_key_value`, e indexes
    - Criar model `ResourceTagAssignment` com campos, unique constraint `uq_assignment_org_tag_resource`, e indexes
    - Adicionar relations em `Organization` para `Tag[]` e `ResourceTagAssignment[]`
    - Gerar migration com `npx prisma migrate dev`
    - _Requirements: R1, R6, R22, NFR-2_

  - [x] 1.2 Implementar `lib/tags/tag-validation.ts`
    - Exportar constantes: `TAG_KEY_REGEX`, `TAG_KEY_MAX_LENGTH`, `TAG_VALUE_MAX_LENGTH`, `TAG_VALUE_REGEX`, `TAG_DESCRIPTION_MAX_LENGTH`, `MAX_TAGS_PER_ORG`, `MAX_TAGS_PER_RESOURCE`, `MAX_BULK_RESOURCES`, `BULK_BATCH_SIZE`, `PREDEFINED_COLORS`, `TagCategory` type
    - Implementar `normalizeTagKey`, `normalizeTagValue` (trim + lowercase)
    - Implementar `validateTagKey`, `validateTagValue`, `validateTagColor`, `validateTagCategory`, `validateTagDescription`
    - Implementar `sanitizeHtml` para XSS prevention (escape `<>& "' `)
    - Implementar `validateCreateTagInput` e `validateUpdateTagInput` compostos
    - Cada função retorna `TagValidationResult` com `valid` boolean e `errors` array
    - _Requirements: R1.2, R1.3, R1.4, R1.5, R1.6, R1.7, R1.8, NFR-4.5_

  - [ ]* 1.3 Property tests para validação (Properties 1 e 2)
    - **Property 1: Tag key/value normalization is idempotent**
    - **Validates: Requirements 1.2, 1.4**
    - **Property 2: Validation accepts only conforming inputs**
    - **Validates: Requirements 1.3, 1.5, 1.6, 1.7, 1.8**
    - Arquivo: `backend/src/__tests__/tags/tag-validation.property.test.ts`
    - Usar `fast-check` com `numRuns: 100`

- [ ] 2. Checkpoint — Validar schema e validação
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Tag cache e service core
  - [x] 3.1 Implementar `lib/tags/tag-cache.ts`
    - Criar classe `TagCacheManager` usando `RedisCacheManager` existente
    - Implementar métodos get/set para: tag list (TTL 5min), usage count (TTL 5min), suggestions (TTL 2min), coverage (TTL 10min), cost report (TTL 1h), security report (TTL 15min)
    - Implementar métodos de invalidação: `invalidateTagList`, `invalidateUsageCount`, `invalidateSuggestions`, `invalidateCoverage`, `invalidateOnAssignmentChange`
    - Wrap todas operações em try/catch com logger.warn para graceful degradation quando Redis indisponível
    - _Requirements: NFR-6, NFR-3.4_

  - [x] 3.2 Implementar `lib/tags/tag-service.ts`
    - `createTag`: validação, check limite 500/org, check duplicata (org+key+value), insert via Prisma, audit log `TAG_CREATED`, invalidar cache
    - `listTags`: cursor-based pagination, filtros (category, key prefix, search substring), sort_by (usage_count, key, created_at), usage_count do cache
    - `getTagDetails`: buscar tag + usage breakdown (por resource_type top 10, por cloud_provider), verificar org_id, retornar 404 para cross-org
    - `updateTag`: validar campos mutáveis (color, category, description), rejeitar mudanças em key/value, audit log `TAG_UPDATED`
    - `deleteTag`: verificar role admin, cascade delete assignments em transação, audit log `TAG_DELETED`, retornar count de assignments removidos
    - Usar `getUserFromEvent`, `getOrganizationId` de `lib/auth.js`
    - _Requirements: R1, R2, R3, R4, R5, R23_

  - [ ]* 3.3 Property tests para tag service (Properties 3, 9, 10, 11)
    - **Property 3: Duplicate tag detection by normalized key+value**
    - **Validates: Requirements 1.9**
    - **Property 9: Usage count accuracy**
    - **Validates: Requirements 2.4**
    - **Property 10: Tag details breakdown consistency**
    - **Validates: Requirements 3.1**
    - **Property 11: Key and value immutability after creation**
    - **Validates: Requirements 4.2**
    - Arquivo: `backend/src/__tests__/tags/tag-service.property.test.ts`

- [x] 4. Tag CRUD handler
  - [x] 4.1 Implementar `handlers/admin/tag-crud.ts`
    - Handler multi-method: POST (create), GET list, GET :id (details), PATCH :id (update), DELETE :id (delete)
    - Roteamento por `event.requestContext.http.method` e path params
    - RBAC: POST/PATCH → editor+, DELETE → admin only, GET → viewer+
    - Usar `success()`, `error()`, `corsOptions()` de `lib/response.js`
    - Audit logging via `logAuditAsync` para todas mutações
    - Multi-tenancy via `getOrganizationId(user)` e `getOrganizationIdWithImpersonation(event, user)`
    - _Requirements: R1, R2, R3, R4, R5, R23.1, R23.2, R23.5, R23.6_

  - [ ]* 4.2 Property tests para RBAC e tenant isolation (Properties 4, 5, 13)
    - **Property 4: Tenant isolation invariant**
    - **Validates: Requirements 1.11, 2.5, 3.2, 3.3, 5.3, 23.1**
    - **Property 5: Audit log completeness for mutations**
    - **Validates: Requirements 1.12, 4.4, 5.6**
    - **Property 13: RBAC permission enforcement**
    - **Validates: Requirements 5.5, 23.2, 23.4**
    - Arquivo: `backend/src/__tests__/tags/tag-rbac.property.test.ts`

- [x] 5. Tag assignment service e handlers
  - [x] 5.1 Implementar `lib/tags/tag-assignment-service.ts`
    - `assignTag`: partial success, check duplicatas (skip), check limite 50 tags/resource, verificar account ownership, audit `TAG_ASSIGNED`
    - `unassignTag`: delete assignments, retornar removed_count + not_found_count, audit `TAG_REMOVED`
    - `bulkAssign`: processar em batches de 100, transações independentes por batch, rate limit check, audit `TAG_BULK_ASSIGNED`
    - `getTagsForResource`: retornar tags de um resource_id, array vazio se nenhum
    - `getResourcesByTag`: cursor-based pagination, filtros resource_type e cloud_provider
    - `getUntaggedResources`: LEFT JOIN ResourceInventory sem assignments, filtros por type/provider/region/account
    - Invalidar cache após cada mutação via `TagCacheManager.invalidateOnAssignmentChange`
    - _Requirements: R6, R7, R8, R9, R10, R26_

  - [x] 5.2 Implementar `handlers/admin/tag-assign.ts`
    - POST `/tags/:id/assign` e POST `/tags/:id/unassign`
    - RBAC: editor+ para ambos
    - Validar lista de resources (1–100 por chamada)
    - _Requirements: R6, R7, R23.2_

  - [x] 5.3 Implementar `handlers/admin/tag-bulk-assign.ts`
    - POST `/tags/bulk-assign`
    - Validar 1–1000 resource_ids, rejeitar >1000 com 422
    - Rate limiting tier `api_heavy` (20 req/min/org)
    - RBAC: editor+
    - _Requirements: R8, R23.2_

  - [x] 5.4 Implementar `handlers/admin/tag-resources.ts`
    - GET `/resources/:id/tags` e GET `/tags/:id/resources`
    - Cursor-based pagination, filtros
    - RBAC: viewer+
    - _Requirements: R9, R10_

  - [x] 5.5 Implementar `handlers/admin/tag-untagged-resources.ts`
    - GET `/resources/untagged`
    - Cursor-based pagination, filtros por resource_type, cloud_provider, region, account
    - RBAC: viewer+
    - _Requirements: R26_

  - [ ]* 5.6 Property tests para assignment (Properties 14, 15, 16, 17)
    - **Property 14: Partial success count invariant**
    - **Validates: Requirements 6.1, 7.1, 7.2, 8.1**
    - **Property 15: Idempotent assignment (skip on duplicate)**
    - **Validates: Requirements 6.3**
    - **Property 16: Batch independence in bulk operations**
    - **Validates: Requirements 8.4, 8.5**
    - **Property 17: Tags-for-resource round trip**
    - **Validates: Requirements 9.1, 9.3**
    - Arquivo: `backend/src/__tests__/tags/tag-assignment.property.test.ts`

- [ ] 6. Checkpoint — Validar CRUD e assignments
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Suggestions, templates e coverage
  - [x] 7.1 Implementar smart suggestions em `tag-service.ts`
    - Scoring model: Score 3 (type match), Score 2 (account+region), Score 1 (name substring)
    - Deduplicar por tag_id, manter maior score
    - Sort: score DESC, usage_count DESC
    - Limite 10 resultados
    - Cache Redis TTL 2min por resource_type+account
    - _Requirements: R11.1, R11.2, R11.3, R11.4, R11.5_

  - [x] 7.2 Implementar `handlers/admin/tag-suggestions.ts`
    - GET `/tags/suggestions` com params: resource_type, resource_name, account_id, region
    - RBAC: editor+
    - _Requirements: R11, R23.2_

  - [x] 7.3 Implementar templates em `tag-service.ts`
    - `getTemplates`: retornar lista estática (Environment, Cost Center, Team, Criticality, Project, Compliance)
    - `applyTemplates`: criar tags que não existem, skip duplicatas, retornar created_count + skipped_count
    - _Requirements: R12.1, R12.2, R12.3, R12.5_

  - [x] 7.4 Implementar `handlers/admin/tag-templates.ts`
    - GET `/tags/templates` e POST `/tags/templates/apply`
    - RBAC: editor+
    - _Requirements: R12, R23.2_

  - [x] 7.5 Implementar coverage em `tag-service.ts`
    - `getCoverage`: total_resources, tagged_resources, untagged_resources, coverage_percentage (1 decimal), breakdown_by_provider
    - Cache Redis TTL 10min
    - _Requirements: R25.1, R25.2, R25.3_

  - [x] 7.6 Implementar `handlers/admin/tag-coverage.ts`
    - GET `/tags/coverage`
    - RBAC: viewer+
    - _Requirements: R25, R23.2_

  - [ ]* 7.7 Property tests para suggestions, templates e coverage (Properties 18, 19, 24, 25)
    - **Property 18: Suggestion scoring and output invariants**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4**
    - **Property 19: Template application correctness**
    - **Validates: Requirements 12.2, 12.3, 12.5**
    - **Property 24: Coverage calculation accuracy**
    - **Validates: Requirements 25.1, 25.4**
    - **Property 25: Untagged resource discovery correctness**
    - **Validates: Requirements 26.1**
    - Arquivos: `backend/src/__tests__/tags/tag-suggestions.property.test.ts`, `backend/src/__tests__/tags/tag-coverage.property.test.ts`

- [x] 8. Report service e handlers
  - [x] 8.1 Implementar `lib/tags/report-service.ts`
    - `getCostReport`: JOIN DailyCost via service-level aggregation, retornar totalCost, costByService, costByProvider, timeSeries, resourceCount, disclaimer
    - `getSecurityFindings`: JOIN Finding via resource_id com AND logic (HAVING COUNT = tag count), cursor pagination, filtros severity/status/provider
    - `getInventoryReport`: counts agrupados por resource_type e cloud_provider
    - Cache: cost report TTL 1h, security report TTL 15min
    - Suporte a export CSV/PDF via `format` param com rate limit tier export (3/5min/org)
    - _Requirements: R13, R14, R15_

  - [x] 8.2 Implementar `handlers/admin/tag-cost-report.ts`
    - GET `/tags/:id/cost-report` com params: start_date, end_date, cloud_provider, account_id, format
    - RBAC: viewer+
    - _Requirements: R13, R23.2_

  - [x] 8.3 Implementar `handlers/admin/tag-security-findings.ts`
    - GET `/tags/security-findings` com params: tag_ids, severity, status, cloud_provider, cursor, limit
    - RBAC: viewer+
    - _Requirements: R14, R23.2_

  - [x] 8.4 Implementar `handlers/admin/tag-inventory-report.ts`
    - GET `/tags/:id/inventory` com params: resource_type, cloud_provider, format
    - RBAC: viewer+
    - _Requirements: R15, R23.2_

  - [ ]* 8.5 Property tests para reports (Properties 20, 28)
    - **Property 20: AND-logic tag filtering**
    - **Validates: Requirements 14.1, 20.2, 24.2**
    - **Property 28: Cost report structure consistency**
    - **Validates: Requirements 13.1, 13.3**
    - Arquivo: `backend/src/__tests__/tags/tag-reports.property.test.ts`

- [ ] 9. Checkpoint — Validar backend completo
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. SAM template — registrar Lambda handlers
  - [x] 10.1 Adicionar os 11 Lambda handlers em `sam/production-lambdas-only.yaml`
    - `TagCrudFunction` → `backend/src/handlers/admin/tag-crud.ts`
    - `TagAssignFunction` → `backend/src/handlers/admin/tag-assign.ts`
    - `TagBulkAssignFunction` → `backend/src/handlers/admin/tag-bulk-assign.ts`
    - `TagResourcesFunction` → `backend/src/handlers/admin/tag-resources.ts`
    - `TagSuggestionsFunction` → `backend/src/handlers/admin/tag-suggestions.ts`
    - `TagTemplatesFunction` → `backend/src/handlers/admin/tag-templates.ts`
    - `TagCostReportFunction` → `backend/src/handlers/admin/tag-cost-report.ts`
    - `TagSecurityFindingsFunction` → `backend/src/handlers/admin/tag-security-findings.ts`
    - `TagInventoryReportFunction` → `backend/src/handlers/admin/tag-inventory-report.ts`
    - `TagCoverageFunction` → `backend/src/handlers/admin/tag-coverage.ts`
    - `TagUntaggedResourcesFunction` → `backend/src/handlers/admin/tag-untagged-resources.ts`
    - Cada função com Metadata esbuild, ARM64, External `['@prisma/client', '.prisma/client']`
    - Configurar rotas no API Gateway (HttpApi Events)
    - _Requirements: R1–R15, R25, R26_

- [x] 11. Frontend — componentes base
  - [x] 11.1 Implementar componente `TagBadge`
    - Props: tag (key, value, color), variant (evo-local | native-cloud), cloudProvider, onRemove
    - Calcular luminância relativa do hex color para determinar texto escuro (#0F172A) ou claro (#FFFFFF)
    - Background: hex color @ 13% opacity, border: hex color @ 27% opacity
    - Variante native-cloud: monochrome outline com ícone cloud provider
    - Overflow: mostrar 3 tags + `+N` indicator com popover
    - _Requirements: R17.1, R17.2, R17.3, R17.4, R17.5, R17.6_

  - [ ]* 11.2 Property tests para TagBadge (Properties 22, 23)
    - **Property 22: WCAG AA contrast ratio for tag badges**
    - **Validates: Requirements 17.3**
    - **Property 23: Tag badge rendering correctness**
    - **Validates: Requirements 17.1, 17.2, 17.4**
    - Arquivo: `src/__tests__/tags/TagBadge.property.test.ts`

  - [x] 11.3 Implementar componente `TagSelector` (combobox)
    - Searchable combobox com debounce 150ms
    - Filtro por category e free-text (key + value)
    - Tags já atribuídas como checked, removíveis por deselect
    - "Create '{text}'" option quando sem match, com inline form (key, value, color picker 12 swatches, category)
    - Auto-populate key/value quando input contém `:` (ex: `env:prod`)
    - Optimistic UI com rollback em erro
    - Keyboard navigation completa (arrow keys, Enter, Escape)
    - _Requirements: R18.1, R18.2, R18.3, R18.4, R18.5, R18.6, R18.7, NFR-5.3_

  - [ ]* 11.4 Property test para TagSelector (Property 29)
    - **Property 29: Tag selector search filtering**
    - **Validates: Requirements 18.2, 18.6**
    - Arquivo: `src/__tests__/tags/TagSelector.property.test.ts`

  - [x] 11.5 Implementar componente `TagFilterBar`
    - Horizontal bar com label "Filter by tag:", trigger button, chips removíveis
    - AND logic only com tooltip explicativo
    - Sync com URL query params `?tags=uuid1,uuid2`
    - Re-fetch < 500ms após mudança
    - "Clear all" action que remove params da URL
    - Limpar filtros ao navegar entre páginas
    - _Requirements: R20.1, R20.2, R20.3, R20.4, R20.5, R20.6, R20.7_

  - [ ]* 11.6 Property test para TagFilterBar (Property 27)
    - **Property 27: URL-synced tag filters**
    - **Validates: Requirements 20.5, 20.7**
    - Arquivo: `src/__tests__/tags/TagFilterBar.property.test.ts`

- [x] 12. Frontend — páginas e drawer
  - [x] 12.1 Implementar `BulkTaggingDrawer` (wizard 3 steps)
    - Step 1: Select Resources — lista filterable/searchable/paginada com virtual scrolling, multi-select, filtros (cloud_provider, account, region, resource_type, tag_status), "Select All Matching", limite 1000 com warning ≥900
    - Step 2: Select Tags — tags agrupadas por category, multi-select, smart suggestions, "+ Create New Tag" inline
    - Step 3: Review & Confirm — summary (count + breakdown), warning duplicatas, progress bar determinado durante execução
    - Success screen: total tagged, tags applied, time elapsed, action buttons
    - Desktop (≥1024px): 3-column side-by-side | Mobile (<1024px): sequential stepper
    - ARIA live regions para transições de step
    - _Requirements: R19.1, R19.2, R19.3, R19.4, R19.5, R19.6, R19.7, R19.8, NFR-5.4_

  - [x] 12.2 Implementar `TagManagementPage` com 5 tabs
    - Rota: `/tag-management`
    - Overview tab: total tags, total assignments, untagged count, coverage % (progress bar com color coding), top-5 cost-by-tag bar chart
    - Tags Library tab: tabela searchable/filterable por category, cada row com key, value, color swatch, category badge, usage count, actions (Edit, Delete com confirmation dialog mostrando count de assignments)
    - Cost Reports tab: tag selector → cost breakdown chart + table
    - Security tab: tag selector → findings filtrados por tags
    - Settings tab: placeholder para futuro
    - Zero-state: auto-display Quickstart Wizard quando 0 tags
    - _Requirements: R16.1, R16.2, R16.3, R16.4, R16.5, R16.6_

  - [x] 12.3 Implementar `QuickstartWizard`
    - Full-page overlay quando org tem 0 tags
    - Multi-select checklist: Cost Center, Environment, Team, Criticality, Project, Compliance
    - Loading state → success screen com tags criadas
    - "Skip — I'll set up tags manually" action
    - Não mostrar novamente após completar ou skip
    - _Requirements: R21.1, R21.2, R21.3, R21.4, R21.5_

  - [x] 12.4 Adicionar entrada "Tag Management" no AppSidebar
    - Ícone Tag (Lucide), posicionado após grupo "Cost Analysis"
    - Rota: `/tag-management`
    - _Requirements: R16.5_

- [ ] 13. Checkpoint — Validar frontend
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Integração com páginas existentes
  - [x] 14.1 Integrar `TagFilterBar` nas 6 páginas existentes
    - CostAnalysisPage (`/cost-analysis`)
    - MonthlyInvoicesPage (`/monthly-invoices`)
    - SecurityPosturePage (`/security-posture`)
    - SecurityScansPage (`/security-scans`)
    - CostOptimizationPage (`/cost-optimization`)
    - Dashboard (`/dashboard`)
    - Passar `tag_ids` como query param nos API calls quando filtros ativos
    - _Requirements: R24.1, R24.2, R24.6_

  - [ ] 14.2 Adicionar `ResourceTagPanel` com `TagSelector` nos drawers de detalhe
    - Cost Analysis → Resource detail drawer
    - Security Scans → Finding detail drawer
    - Resource Monitoring → Resource detail panel
    - Inline assign/remove via TagSelector
    - _Requirements: R24.4_

  - [x] 14.3 Adicionar widget "Tag Coverage" no Executive Dashboard
    - Coverage % progress bar, total tagged vs total, link "View Untagged" → BulkTaggingDrawer pre-filtered
    - _Requirements: R24.5_

  - [ ] 14.4 Atualizar endpoints existentes para aceitar `tag_ids` query param
    - JOIN contra `resource_tag_assignments` com AND logic quando `tag_ids` presente
    - Response payload mantém estrutura idêntica — apenas filtra result set
    - Sem mudanças em tabelas existentes
    - _Requirements: R24.2, R24.3, R24.6, R24.7_

  - [ ]* 14.5 Property tests para paginação, filtros e cache (Properties 6, 7, 8, 21, 26)
    - **Property 6: Cursor-based pagination completeness**
    - **Validates: Requirements 2.3, 10.2, 14.2, 26.2**
    - **Property 7: Filter correctness**
    - **Validates: Requirements 2.2, 10.3, 13.2, 14.4, 15.2, 26.3**
    - **Property 8: Sort order preservation**
    - **Validates: Requirements 2.6**
    - **Property 21: Resource type normalization**
    - **Validates: Requirements 22.1, 22.2**
    - **Property 26: Cache invalidation on mutation**
    - **Validates: Requirements 25.3**
    - Arquivos: `backend/src/__tests__/tags/tag-pagination.property.test.ts`, `backend/src/__tests__/tags/resource-type.property.test.ts`, `backend/src/__tests__/tags/tag-cache.property.test.ts`

- [x] 15. Multi-cloud resource type normalization
  - [x] 15.1 Implementar parsing de resource type em `tag-validation.ts`
    - AWS ARN → `aws:{service}:{resource-type}` (ex: `arn:aws:ec2:...` → `aws:ec2:instance`)
    - Azure Resource ID → `azure:{provider-namespace}:{type}` (ex: `/subscriptions/.../Microsoft.Compute/virtualMachines/...` → `azure:compute:virtualmachine`)
    - Formatos não reconhecidos: armazenar as-is com `type_normalized: false`
    - _Requirements: R22.1, R22.2_

  - [x] 15.2 Adicionar badges de cloud provider na UI
    - Badge laranja "AWS" para recursos AWS, badge azul "AZ" para Azure
    - Chip filter `cloud_provider` no TagFilterBar (independente de tag filters)
    - _Requirements: R22.3, R22.4_

- [x] 16. Validação de imports e build final
  - [x] 16.1 Rodar `npx tsx scripts/validate-lambda-imports.ts` para validar todos os novos handlers
    - Verificar que imports relativos com extensão `.js` resolvem corretamente
    - Corrigir qualquer import quebrado ou dependência circular
    - _Requirements: Workspace rule import-validation_

  - [x] 16.2 Rodar `npm run build --prefix backend` e `npm run build` (frontend)
    - Garantir zero erros de compilação TypeScript
    - _Requirements: Workspace rule development-standards_

- [ ] 17. Final checkpoint — Validar sistema completo
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marcadas com `*` são opcionais e podem ser puladas para MVP mais rápido
- Cada task referencia requirements específicos para rastreabilidade
- Checkpoints garantem validação incremental
- Property tests validam propriedades universais de corretude (29 properties no design)
- Unit tests validam exemplos específicos e edge cases
- Todos os handlers seguem o template Lambda padrão do projeto (CommonJS, ARM64, esbuild)
- Multi-tenancy obrigatório: todas queries filtram por `organization_id`
- Audit logging obrigatório para todas mutações via `lib/audit-service.ts`
