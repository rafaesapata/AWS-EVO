# Plano de Implementação: Relatórios Agendados de Serviços

## Visão Geral

Implementação incremental: primeiro a lib de comparação (pura, testável), depois templates de email, depois o gerador de relatório, depois o CRUD de agendamentos, e por fim a integração com alarmes inteligentes. Cada etapa constrói sobre a anterior.

## Tasks

- [x] 1. Implementar report-comparison-engine (lib pura)
  - [x] 1.1 Criar `backend/src/lib/report-comparison-engine.ts` com a função `compareFindings`
    - Recebe `ComparisonInput` (currentFindings, previousFindings)
    - Retorna `ComparisonResult` com newFindings, resolvedFindings, persistentFindings e summary
    - Matching por fingerprint: novo = fingerprint só no atual, resolvido = fingerprint só no anterior ou resolved_at preenchido, persistente = fingerprint em ambos
    - Calcular changePercentage: `((currentTotal - previousTotal) / previousTotal) * 100`, tratar previousTotal=0
    - Calcular contagens por severidade (critical, high, medium, low)
    - Exportar interfaces `ComparisonInput`, `ComparisonResult`, `FindingSummary`
    - _Requirements: 3.2, 3.3, 3.4, 3.5_

  - [x]* 1.2 Escrever property test para particionamento de findings
    - **Property 7: Particionamento correto de findings na comparação**
    - Gerar dois arrays aleatórios de findings com fingerprints, verificar que as três categorias são disjuntas e a soma é consistente
    - **Validates: Requirements 3.2, 3.3, 3.4**

  - [ ]* 1.3 Escrever property test para corretude do resumo
    - **Property 8: Corretude do resumo do relatório**
    - Verificar que contagens por severidade somam ao total e contagens de categorias correspondem às listas
    - **Validates: Requirements 3.5**

- [x] 2. Implementar cálculo de next_run_at aprimorado
  - [x] 2.1 Extrair `calculateNextRun` para `backend/src/lib/schedule-calculator.ts`
    - Mover a função existente de `scheduled-scan-executor.ts` para lib compartilhada
    - Adicionar função `isSameDayUTC(date1: Date, date2: Date): boolean` para validação de limite diário
    - Exportar ambas funções
    - Atualizar import em `scheduled-scan-executor.ts` para usar a nova lib
    - _Requirements: 2.2, 2.4, 7.1, 7.2, 7.3, 7.4_

  - [ ]* 2.2 Escrever property test para calculateNextRun
    - **Property 6: Cálculo correto de next_run_at**
    - Para qualquer schedule_type e config válido, next_run_at deve ser estritamente no futuro e respeitar os parâmetros configurados
    - **Validates: Requirements 2.2, 7.2, 7.3, 7.4**

  - [ ]* 2.3 Escrever property test para limite diário
    - **Property 5: Limite de uma execução diária por conta**
    - Para qualquer data last_run_at no mesmo dia UTC que now, isSameDayUTC deve retornar true
    - **Validates: Requirements 2.4, 7.1**

- [x] 3. Checkpoint - Verificar que libs puras estão funcionando
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implementar templates de email para relatórios
  - [x] 4.1 Criar `backend/src/lib/report-email-templates.ts`
    - Implementar `generateSecurityReportHtml(data: ReportEmailData): string` com template HTML responsivo
    - Template inclui: header com logo, badge cloud provider, resumo por severidade com cores, seção novos findings, seção findings resolvidos, contagem persistentes, botão CTA, footer
    - Implementar `generateReportSubject(report: ScanReport): string` com formato: `[EVO] Relatório de Segurança - {accountName} - {date}`
    - Exportar interfaces `ReportEmailData`, `ScanReport`
    - _Requirements: 4.1, 4.5_

  - [ ]* 4.2 Escrever property test para conteúdo do email HTML
    - **Property 9: Email HTML contém todas as informações obrigatórias**
    - Para qualquer ScanReport válido, o HTML deve conter nome da organização, conta, tipo de scan, data, contagens por severidade, títulos de novos e resolvidos
    - **Validates: Requirements 4.1**

- [x] 5. Implementar avaliação de alarmes inteligentes
  - [x] 5.1 Criar `backend/src/lib/alarm-evaluator.ts`
    - Implementar `evaluateAlarmConditions(report: ScanReport): AlarmCondition[]`
    - Condição `new_critical`: novos findings com severity="critical" → priority="critical"
    - Condição `degradation`: changePercentage > 20 → priority="high"
    - Condição `improvement`: todos critical anteriores resolvidos → priority="low"
    - Exportar interface `AlarmCondition`
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 5.2 Escrever property tests para alarmes inteligentes
    - **Property 10: Findings críticos novos disparam alarme crítico**
    - **Property 11: Degradação >20% dispara alarme high**
    - **Property 12: Resolução de todos os críticos dispara alarme positivo**
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [x] 6. Implementar scan-report-generator Lambda
  - [x] 6.1 Criar `backend/src/handlers/jobs/scan-report-generator.ts`
    - Handler Lambda que recebe `ReportGeneratorPayload` via invocação async
    - Buscar scan atual (SecurityScan + Findings) via Prisma
    - Buscar scan anterior da mesma conta/tipo (ORDER BY created_at DESC LIMIT 1)
    - Chamar `compareFindings` do report-comparison-engine
    - Montar `ScanReport` com dados da organização e conta
    - Buscar destinatários com email habilitado via NotificationSettings
    - Enviar email via EmailService usando template de `report-email-templates`
    - Registrar envio na CommunicationLog (channel="email", metadata com scan_id)
    - Chamar `evaluateAlarmConditions` e criar AiNotification se necessário
    - Seguir template padrão de handler Lambda com logging e error handling
    - _Requirements: 3.1, 3.6, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3_

  - [ ]* 6.2 Escrever testes unitários para scan-report-generator
    - Testar cenário de primeiro scan (sem comparação)
    - Testar cenário de falha no envio de email (registro na CommunicationLog com status="failed")
    - Testar cenário sem destinatários com email habilitado
    - _Requirements: 3.6, 4.2, 4.3_

- [x] 7. Aprimorar scheduled-scan-executor
  - [x] 7.1 Atualizar `backend/src/handlers/jobs/scheduled-scan-executor.ts`
    - Importar `isSameDayUTC` de `schedule-calculator.ts`
    - Adicionar validação de limite diário: se `isSameDayUTC(schedule.last_run_at, now)`, pular execução
    - Após invocação bem-sucedida do scan, invocar `scan-report-generator` assincronamente passando scanId, organizationId, accountId/azureCredentialId, cloudProvider, scanType, scheduledExecution=true, scheduleId
    - Usar `calculateNextRun` da nova lib compartilhada
    - _Requirements: 2.1, 2.3, 2.4, 2.5_

- [x] 8. Implementar CRUD de agendamentos
  - [x] 8.1 Criar `backend/src/handlers/jobs/manage-scan-schedules.ts`
    - Handler REST com rotas: POST (criar), GET (listar por conta), PATCH (atualizar), DELETE (remover)
    - Validação com Zod: schedule_type em ["daily", "weekly", "monthly"], dayOfWeek 0-6, dayOfMonth 1-28
    - Verificar unicidade: não permitir dois agendamentos ativos para mesma conta + scan_type
    - Multi-tenancy: todas queries filtram por organization_id
    - Audit logging obrigatório para criação, atualização e remoção
    - Calcular next_run_at na criação usando `calculateNextRun`
    - Seguir template padrão de handler Lambda
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ]* 8.2 Escrever property tests para validação de agendamentos
    - **Property 4: Validação de schedule_type**
    - Para qualquer string que não seja daily/weekly/monthly, a validação deve rejeitar
    - **Validates: Requirements 1.6**

  - [ ]* 8.3 Escrever testes unitários para CRUD de agendamentos
    - Testar criação com schedule_type inválido (400)
    - Testar duplicata de agendamento (409)
    - Testar desativação (PATCH is_active=false)
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 9. Adicionar recursos SAM para novas Lambdas
  - [x] 9.1 Atualizar SAM template com as novas funções Lambda
    - Adicionar `ScanReportGeneratorFunction` apontando para `handlers/jobs/scan-report-generator.ts`
    - Adicionar `ManageScanSchedulesFunction` apontando para `handlers/jobs/manage-scan-schedules.ts` com rotas HTTP API
    - Configurar Metadata esbuild (Minify, Target es2022, External @prisma/client)
    - Configurar permissões IAM para SES e Lambda invoke
    - _Requirements: 6.1, 6.3_

- [x] 10. Checkpoint final - Verificar integração completa
  - Ensure all tests pass, ask the user if questions arise.

## Notas

- Tasks marcadas com `*` são opcionais e podem ser puladas para MVP mais rápido
- Cada task referencia requisitos específicos para rastreabilidade
- Checkpoints garantem validação incremental
- Property tests validam propriedades universais de corretude
- Testes unitários validam exemplos específicos e edge cases
- O projeto já usa Vitest — usar fast-check para property-based testing
