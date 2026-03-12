# Implementation Plan: AWS Health Events Monitoring

## Overview

Implementação incremental: Prisma models → libs (classifier, processor) → handler job agendado → handlers API → dashboard integration → SAM template → build/import verification. Cada task builds on previous steps, com checkpoints para validação.

## Tasks

- [x] 1. Prisma migration — modelos AwsHealthEvent e HealthMonitoringConfig
  - [x] 1.1 Adicionar modelo `AwsHealthEvent` ao `backend/prisma/schema.prisma`
    - Campos: id (uuid), organization_id, event_arn, type_code, category, region, start_time, end_time, status_code, description, aws_account_id, severity, is_credential_exposure, remediation_ticket_id, metadata (Json?), created_at, updated_at
    - `@@unique([event_arn, organization_id])`, indexes compostos conforme design
    - Relation com `Organization` (onDelete: Cascade), `@@map("aws_health_events")`
    - _Requirements: 1.4, 1.5, 1.6_
  - [x] 1.2 Adicionar modelo `HealthMonitoringConfig` ao `backend/prisma/schema.prisma`
    - Campos: id (uuid), organization_id (unique), enabled (default true), auto_ticket_severities (String[], default ["critical","high"]), polling_frequency_minutes (default 15), created_at, updated_at
    - Relation com `Organization` (onDelete: Cascade), `@@map("health_monitoring_configs")`
    - _Requirements: 6.1, 6.2, 6.4_
  - [x] 1.3 Adicionar relações reversas no modelo `Organization`
    - Adicionar `aws_health_events AwsHealthEvent[]` e `health_monitoring_config HealthMonitoringConfig?`
    - _Requirements: 1.4, 6.4_
  - [x] 1.4 Gerar migration Prisma
    - Executar `npx prisma migrate dev --name add-aws-health-events-monitoring`
    - _Requirements: 1.4, 6.4_

- [x] 2. Implementar health-event-classifier.ts
  - [x] 2.1 Criar `backend/src/lib/health-event-classifier.ts`
    - Exportar interface `HealthEventInput` (typeCode, category, statusCode)
    - Exportar type `Severity = 'critical' | 'high' | 'medium' | 'low'`
    - Implementar `classifySeverity(event): Severity` com regras de prioridade do design
    - Implementar `isCredentialExposure(typeCode): boolean`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  - [ ]* 2.2 Criar factory `backend/tests/factories/health-event.factory.ts`
    - Arbitraries fast-check: `typeCodeArb`, `categoryArb`, `statusCodeArb`, `healthEventInputArb`, `severityArb`, `processableEventArb`, `monitoringConfigArb`
    - Reutilizável por todos os testes da feature
  - [ ]* 2.3 Write property test: Corretude da classificação (`backend/tests/unit/lib/health-event-classifier.test.ts`)
    - **Property 1: Corretude da classificação de severidade**
    - Usar `healthEventInputArb` da factory, AAA pattern, naming Given-When-Then
    - Mínimo 100 iterações
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
  - [ ]* 2.4 Write property test: Idempotência da classificação (mesmo arquivo)
    - **Property 2: Idempotência da classificação**
    - `classify(e) === classify(e)` para todo `e`
    - **Validates: Requirements 2.6**
  - [ ]* 2.5 Write unit tests: Exemplos específicos de classificação (mesmo arquivo)
    - 6 testes unitários: CREDENTIALS_EXPOSED→critical, COMPROMISED→critical, RISK+accountNotification→high, issue+open→medium, scheduledChange→low, isCredentialExposure→true
    - AAA pattern, naming: `it('should classify X as Y when Z')`

- [-] 3. Implementar health-event-processor.ts
  - [x] 3.1 Criar `backend/src/lib/health-event-processor.ts`
    - Exportar interfaces `ProcessableEvent`, `ProcessingConfig`, `ProcessingResult`
    - Implementar `processHealthEvent(prisma, event, config): Promise<ProcessingResult>`
    - Verificar se evento já tem ticket (skip se `remediationTicketId !== null`)
    - Verificar se severidade está em `autoTicketSeverities`
    - Criar `RemediationTicket` com título `[AWS Health] {typeCode} - {region} ({awsAccountId})`
    - Executar `findAssignment()` e `autoWatch()` de `ticket-workflow.ts`
    - Para credential exposure: priority `urgent`, business_impact fixo, instruções de remediação no description
    - Para severidade `critical`: criar `Alert` no dashboard
    - Para severidade `critical` ou `high`: enviar email via `EmailService.sendSecurityNotification()`
    - Para credential exposure: registrar `CommunicationLog` com metadata source/event_arn/org_id
    - Registrar audit log via `logAuditAsync()` com action `HEALTH_EVENT_TICKET_CREATE`
    - Atualizar `AwsHealthEvent.remediation_ticket_id`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.4, 7.1, 7.2, 7.3, 7.4_
  - [ ]* 3.2 Write property test: Corretude do conteúdo do ticket (`backend/tests/unit/lib/health-event-processor.test.ts`)
    - **Property 5: Corretude do conteúdo do ticket**
    - Usar `processableEventArb` da factory, mock Prisma, AAA pattern
    - Verificar título formato `[AWS Health] {typeCode} - {region} ({awsAccountId})`, metadata completa
    - **Validates: Requirements 3.2, 3.3**
  - [ ]* 3.3 Write property test: Não duplicação de tickets (mesmo arquivo)
    - **Property 6: Não duplicação de tickets**
    - Gerar eventos com `remediationTicketId` preenchido, verificar nenhum ticket criado
    - **Validates: Requirements 3.5**
  - [ ]* 3.4 Write property test: Tratamento especial de credential exposure (mesmo arquivo)
    - **Property 7: Tratamento especial de credential exposure**
    - Verificar priority=urgent, business_impact correto, instruções de remediação presentes
    - **Validates: Requirements 3.6, 7.1, 7.3**
  - [ ]* 3.5 Write unit tests: Exemplos específicos do processor (mesmo arquivo)
    - 7 testes unitários: título correto, priority=urgent, instruções remediação, skip quando tem ticket, Alert criado para critical, email enviado para critical/high, CommunicationLog para credential exposure
    - AAA pattern, mock Prisma/EmailService/audit-service, naming Given-When-Then

- [ ] 4. Checkpoint — Verificar libs
  - Ensure all tests pass, ask the user if questions arise.
  - Verificar que `health-event-classifier.ts` e `health-event-processor.ts` compilam sem erros
  - Executar `npm run build --prefix backend` para validar TypeScript

- [ ] 5. Implementar health-monitor.ts (handler job agendado)
  - [~] 5.1 Criar `backend/src/handlers/monitoring/health-monitor.ts`
    - Handler EventBridge scheduled (padrão `scheduled-scan-executor.ts`)
    - Imports: `logger` de `../../lib/logger.js`, `getPrismaClient` de `../../lib/database.js`, `resolveAwsCredentials`/`assumeRole` de `../../lib/aws-helpers.js`, `classifySeverity`/`isCredentialExposure` de `../../lib/health-event-classifier.js`, `processHealthEvent` de `../../lib/health-event-processor.js`
    - Buscar organizações com `HealthMonitoringConfig.enabled = true`
    - Para cada org, buscar contas AWS ativas (`AwsCredential` com `is_active = true`)
    - Para cada conta: resolver credenciais, chamar `DescribeEvents` (filtros: `accountNotification`, `issue`), chamar `DescribeEventDetails`
    - Classificar via `classifySeverity()`, marcar `isCredentialExposure`
    - Upsert no `AwsHealthEvent` por `event_arn + organization_id` (atualizar status_code, end_time, description)
    - Para eventos novos com severidade qualificada: chamar `processHealthEvent()`
    - Continuar processando em caso de erro individual (try/catch por conta/evento)
    - Retornar resultado com contadores por org
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_
  - [ ]* 5.2 Write property test: Idempotência do upsert de eventos (`backend/tests/unit/handlers/monitoring/health-monitor.test.ts`)
    - **Property 3: Idempotência do upsert de eventos**
    - Mock AWS Health API e Prisma, gerar eventos com mesmo event_arn e campos mutáveis variados
    - Verificar exatamente 1 registro no DB após N upserts
    - **Validates: Requirements 1.4, 1.5**
  - [ ]* 5.3 Write property test: Resiliência a erros (mesmo arquivo)
    - **Property 13: Resiliência a erros — continuidade do processamento**
    - Gerar N contas, K falham aleatoriamente, verificar processadas = N - K
    - **Validates: Requirements 1.7**
  - [ ]* 5.4 Write unit tests: Exemplos específicos do health-monitor (mesmo arquivo)
    - 2 testes unitários: continue processing when one account fails, skip org with no active AWS accounts
    - AAA pattern, mock AWS SDK/Prisma, naming Given-When-Then

- [ ] 6. Implementar handlers de API de consulta
  - [~] 6.1 Criar `backend/src/handlers/monitoring/get-health-events.ts`
    - Handler POST `/api/functions/get-health-events`
    - Imports: `AuthorizedEvent`, `success`/`error`/`corsOptions` de `response.js`, `getUserFromEvent`/`getOrganizationId` de `auth.js`, `getPrismaClient`, `logger` de `logger.js`
    - Body params: limit (default 20, max 100), offset (default 0), severity, status_code, aws_account_id, is_credential_exposure
    - Validar params (limit > 0, offset >= 0)
    - Query `AwsHealthEvent` filtrado por `organization_id`, com paginação e filtros opcionais
    - Retornar `{ events, total, limit, offset }`
    - _Requirements: 5.1, 5.2_
  - [~] 6.2 Criar `backend/src/handlers/monitoring/get-health-event-details.ts`
    - Handler POST `/api/functions/get-health-event-details`
    - Body params: id (UUID)
    - Query `AwsHealthEvent` por id + organization_id, incluir `RemediationTicket` associado via remediation_ticket_id
    - Retornar 404 se não encontrado ou de outra org
    - Retornar `{ event, ticket }`
    - _Requirements: 5.3_
  - [~] 6.3 Criar `backend/src/handlers/monitoring/get-health-events-summary.ts`
    - Handler POST `/api/functions/get-health-events-summary`
    - Query agregada: contagem por severidade, openEvents (status_code='open'), totalTicketsCreated (remediation_ticket_id not null), credentialExposures (is_credential_exposure=true), total
    - Filtrado por `organization_id`
    - Retornar `{ bySeverity, openEvents, totalTicketsCreated, credentialExposures, total }`
    - _Requirements: 5.4_
  - [ ]* 6.4 Write property test: Paginação e isolamento multi-tenant (`backend/tests/unit/handlers/monitoring/get-health-events.test.ts`)
    - **Property 10: Paginação e isolamento multi-tenant na listagem**
    - Gerar limit/offset variados, múltiplas orgs, verificar max `limit` resultados e apenas org do usuário
    - **Validates: Requirements 5.1, 5.2**
  - [ ]* 6.5 Write property test: Corretude do resumo agregado (`backend/tests/unit/handlers/monitoring/get-health-events-summary.test.ts`)
    - **Property 11: Corretude do resumo agregado**
    - Gerar conjuntos de eventos com status/severidade variados, verificar contagens corretas
    - **Validates: Requirements 5.4**
  - [ ]* 6.6 Write unit tests: Exemplos específicos dos handlers de API
    - `get-health-events.test.ts`: return 400 when limit=0, return 400 when offset negative
    - `get-health-event-details.test.ts`: return 404 when event belongs to different org, include RemediationTicket in details
    - `get-health-events-summary.test.ts`: return zero counts when no events exist
    - AAA pattern, mock Prisma, naming Given-When-Then

- [ ] 7. Implementar manage-health-monitoring-config.ts
  - [~] 7.1 Criar `backend/src/handlers/monitoring/manage-health-monitoring-config.ts`
    - Handler POST `/api/functions/manage-health-monitoring-config`
    - Imports: `AuthorizedEvent`, `success`/`error`/`corsOptions`, `getUserFromEvent`/`getOrganizationId`, `getPrismaClient`, `logger`, `logAuditAsync`/`getIpFromEvent`/`getUserAgentFromEvent` de `audit-service.js`
    - Action `get`: retornar config da org (criar com defaults se não existir)
    - Action `update`: validar campos (autoTicketSeverities subset de ['critical','high','medium','low'], pollingFrequencyMinutes > 0), atualizar config
    - Audit log `HEALTH_MONITORING_CONFIG_UPDATE` em toda alteração
    - Filtro obrigatório por `organization_id`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ]* 7.2 Write property test: Persistência da configuração (`backend/tests/unit/handlers/monitoring/manage-health-monitoring-config.test.ts`)
    - **Property 12: Persistência da configuração de monitoramento (round-trip)**
    - Usar `monitoringConfigArb` da factory, salvar + ler = mesmos valores
    - **Validates: Requirements 6.1, 6.2**
  - [ ]* 7.3 Write unit tests: Exemplos específicos do config handler (mesmo arquivo)
    - 4 testes unitários: return 400 when severity invalid, return 400 when polling<=0, create default config on first GET, register audit log on update
    - AAA pattern, mock Prisma/audit-service, naming Given-When-Then

- [ ] 8. Checkpoint — Verificar handlers
  - Ensure all tests pass, ask the user if questions arise.
  - Executar `npm run build --prefix backend` para validar compilação de todos os handlers

- [ ] 9. Integração com dashboard executivo
  - [~] 9.1 Modificar `backend/src/handlers/dashboard/get-executive-dashboard.ts`
    - Adicionar campo `healthEvents` à interface `SecurityPosture` (ao lado de `findings`)
    - Estrutura: `{ critical: number, high: number, medium: number, low: number, total: number }`
    - Na função `getSecurityData()`, adicionar query: `SELECT severity, COUNT(*) FROM aws_health_events WHERE organization_id = $1 AND status_code = 'open' GROUP BY severity`
    - Usar Prisma `groupBy` para contar `AwsHealthEvent` por severidade com filtro org + status_code='open'
    - _Requirements: 4.3_
  - [ ]* 9.2 Write property test: Corretude da contagem de healthEvents (`backend/tests/integration/monitoring/health-events-dashboard.test.ts`)
    - **Property 9: Corretude da contagem de healthEvents no dashboard**
    - Gerar conjuntos de AwsHealthEvent com severidades variadas, verificar contagens corretas e total = soma
    - **Validates: Requirements 4.3**

- [ ] 10. Adicionar Lambdas ao SAM template
  - [~] 10.1 Adicionar 5 funções Lambda ao `sam/production-lambdas-only.yaml`
    - `HealthMonitorFunction`: health-monitor.ts, Timeout 300, MemorySize 512, Schedule rate(15 minutes), rota POST /api/functions/health-monitor
    - `GetHealthEventsFunction`: get-health-events.ts, Timeout 30, MemorySize 256, rota POST /api/functions/get-health-events
    - `GetHealthEventDetailsFunction`: get-health-event-details.ts, Timeout 30, MemorySize 256, rota POST /api/functions/get-health-event-details
    - `GetHealthEventsSummaryFunction`: get-health-events-summary.ts, Timeout 30, MemorySize 256, rota POST /api/functions/get-health-events-summary
    - `ManageHealthMonitoringConfigFunction`: manage-health-monitoring-config.ts, Timeout 30, MemorySize 256, rota POST /api/functions/manage-health-monitoring-config
    - Todas: ARM64, esbuild, External ['@prisma/client', '.prisma/client'], `@aws-sdk/*` bundled (NOT external)
    - CodeUri: `../backend/src/handlers/monitoring/`, Role: `!GetAtt LambdaExecutionRole.Arn`, ApiId: `!Ref HttpApi`
    - _Requirements: 1.1, 5.1, 5.3, 5.4, 6.1_

- [ ] 11. Build verification
  - [~] 11.1 Executar `npm run build --prefix backend`
    - Verificar que todos os novos arquivos compilam sem erros TypeScript
    - _Requirements: 1.1, 2.1, 3.1, 5.1, 6.1_
  - [~] 11.2 Executar `npx tsx scripts/validate-lambda-imports.ts`
    - Verificar que todos os imports dos novos handlers resolvem corretamente
    - Verificar ausência de dependências circulares
    - _Requirements: 1.1, 2.1, 3.1, 5.1, 6.1_

- [ ] 12. Final checkpoint — Validação completa
  - Ensure all tests pass, ask the user if questions arise.
  - Confirmar que todos os handlers compilam, imports validam, e SAM template está correto

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Todos os handlers usam `import { logger } from '../../lib/logger.js'` (NOT logging.js)
- SAM template: `sam/production-lambdas-only.yaml` (NOT template.yaml)
- `@aws-sdk/*` é bundled pelo esbuild (NOT external, NOT na Layer)
- Multi-tenancy: ALL queries filtram por `organization_id`
- Audit logging obrigatório em handlers que modificam dados

### Padrões de Teste UDS
- Framework: Vitest (config em `backend/vitest.config.ts`)
- PBT: fast-check v4.5.3 com mínimo 100 iterações por propriedade
- Padrão AAA (Arrange, Act, Assert) em todos os testes
- Naming Given-When-Then: `it('should X when Y')`
- Factories com fast-check arbitraries em `backend/tests/factories/`
- Mocks apenas para dependências externas (AWS SDK, Prisma, EmailService)
- Testes independentes, sem dependência de ordem
- Cobertura mínima: 80% linhas, 70% branches
- Quality gates: ≥80% coverage, >98% tests passing