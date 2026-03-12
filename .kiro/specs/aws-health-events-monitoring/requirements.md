# Documento de Requisitos — AWS Health Events Monitoring

## Introdução

Feature para integrar e monitorar eventos do AWS Health API, com foco em eventos de segurança relacionados a credenciais expostas ou comprometidas. Quando um evento de risco é detectado, o sistema cria automaticamente um ticket de remediação com prioridade adequada e notifica o dashboard executivo. O objetivo é reduzir o tempo de resposta a incidentes críticos de segurança, especialmente vazamentos de credenciais AWS.

Esta feature reutiliza extensivamente componentes existentes da plataforma EVO (sistema de tickets, audit logging, email, dashboard executivo) e segue os padrões já estabelecidos para jobs agendados via EventBridge e handlers Lambda.

## Glossário

- **Health_Monitor**: Lambda handler (`backend/src/handlers/monitoring/health-monitor.ts` — novo) responsável por consultar a AWS Health API periodicamente e processar os eventos retornados. Segue o padrão do `scheduled-scan-executor.ts` existente (EventBridge → Lambda → Prisma → processamento)
- **Ticket_Generator**: Componente (`backend/src/lib/health-event-processor.ts` — novo) responsável por criar tickets de remediação automaticamente a partir de eventos do AWS Health. Reutiliza `findAssignment()` e `autoWatch()` de `backend/src/lib/ticket-workflow.ts` e o modelo `RemediationTicket` existente no Prisma
- **Dashboard_Notifier**: Componente (parte de `health-event-processor.ts` — novo) que registra alertas de alta prioridade para exibição no dashboard executivo. Integra com `get-executive-dashboard.ts` existente adicionando contagem de Health Events à interface `SecurityPosture`
- **Health_Event**: Evento retornado pela AWS Health API (`DescribeEvents`/`DescribeEventDetails`) contendo informações sobre problemas operacionais, manutenções ou riscos de segurança
- **Credential_Exposure_Event**: Subconjunto de Health Events com typeCode relacionado a credenciais expostas (ex: `AWS_RISK_CREDENTIALS_EXPOSED`, `RISK_CREDENTIALS_COMPROMISED`)
- **Event_Store**: Modelo Prisma `AwsHealthEvent` (novo) — tabela PostgreSQL `aws_health_events` que armazena os eventos processados para histórico e deduplicação
- **Severity_Classifier**: Lógica em `backend/src/lib/health-event-classifier.ts` (novo) que mapeia o tipo e categoria do Health Event para um nível de severidade (`critical`, `high`, `medium`, `low`)
- **Monitoring_Config**: Modelo Prisma `HealthMonitoringConfig` (novo) — tabela PostgreSQL para configurações de monitoramento por organização
- **EmailService**: Classe existente em `backend/src/lib/email-service.ts` com métodos `sendEmail()`, `sendBulkEmail()`, `sendAlert()`, `sendSecurityNotification()` via AWS SES
- **AuditService**: Serviço existente em `backend/src/lib/audit-service.ts` com `logAuditAsync()`, `getIpFromEvent()`, `getUserAgentFromEvent()`
- **CommunicationLog**: Modelo Prisma existente para registro de comunicações (canal, destinatário, assunto, mensagem, status, metadata)

## Componentes Existentes Reutilizados

| Componente | Arquivo | Uso nesta Feature |
|---|---|---|
| Sistema de Tickets | `backend/src/lib/ticket-workflow.ts` | `findAssignment()` para auto-atribuição, `autoWatch()` para auto-watching, `STATUS_TRANSITIONS` para máquina de estados |
| Modelo RemediationTicket | `backend/prisma/schema.prisma` | Criação de tickets com severity, priority, status, category, metadata (Json), business_impact, finding_ids, assigned_to, campos SLA |
| Notificações de Ticket | `backend/src/lib/ticket-notifications.ts` | `notifyTicketWatchers()` para enviar emails reais via SES aos watchers |
| Audit Logging | `backend/src/lib/audit-service.ts` | `logAuditAsync()` para registrar ações como `HEALTH_EVENT_TICKET_CREATE` e `HEALTH_MONITORING_CONFIG_UPDATE` |
| Email Service | `backend/src/lib/email-service.ts` | `EmailService.sendSecurityNotification()` para alertas de credenciais expostas, `EmailService.sendAlert()` para notificações críticas |
| Communication Log | Modelo Prisma `CommunicationLog` | Registro de emails enviados com canal, destinatário, assunto, status e metadata |
| Credenciais AWS | `backend/src/lib/aws-helpers.ts` | `resolveAwsCredentials()` e `assumeRole()` com cache para acessar AWS Health API de cada conta |
| Dashboard Executivo | `backend/src/handlers/dashboard/get-executive-dashboard.ts` | Modificação da interface `SecurityPosture` e função `getSecurityData()` para incluir contagem de Health Events |
| Padrão de Jobs Agendados | `backend/src/handlers/jobs/scheduled-scan-executor.ts` | Padrão EventBridge → Lambda → Prisma query → processamento → atualização |
| Padrão de Verificação SLA | `backend/src/handlers/jobs/check-sla-escalations.ts` | Padrão de job periódico que verifica condições e envia notificações |
| Handler de Ticket | `backend/src/handlers/security/create-remediation-ticket.ts` | Exemplo de referência para criação de ticket com `findAssignment()` + `autoWatch()` + audit logging |

## Novos Componentes

| Componente | Arquivo | Descrição |
|---|---|---|
| Modelo AwsHealthEvent | `backend/prisma/schema.prisma` | Nova tabela para armazenar eventos do AWS Health com campos: event_arn, type_code, category, region, start_time, end_time, status, description, aws_account_id, organization_id, severity, is_credential_exposure, remediation_ticket_id, metadata |
| Modelo HealthMonitoringConfig | `backend/prisma/schema.prisma` | Nova tabela para configurações de monitoramento por organização: auto_ticket_severities, polling_frequency_minutes, enabled |
| Health Monitor Handler | `backend/src/handlers/monitoring/health-monitor.ts` | Lambda disparada por EventBridge para polling da AWS Health API |
| Get Health Events Handler | `backend/src/handlers/monitoring/get-health-events.ts` | Endpoint GET para listar eventos com paginação e filtros |
| Get Health Event Details Handler | `backend/src/handlers/monitoring/get-health-event-details.ts` | Endpoint GET para detalhes de um evento específico |
| Get Health Events Summary Handler | `backend/src/handlers/monitoring/get-health-events-summary.ts` | Endpoint GET para resumo agregado de eventos |
| Manage Health Monitoring Config Handler | `backend/src/handlers/monitoring/manage-health-monitoring-config.ts` | Endpoint para configurar monitoramento por organização |
| Health Event Classifier | `backend/src/lib/health-event-classifier.ts` | Lógica de classificação de severidade baseada em typeCode e categoria |
| Health Event Processor | `backend/src/lib/health-event-processor.ts` | Lógica de criação de tickets e notificação do dashboard, reutilizando componentes existentes |

## Requisitos

### Requisito 1: Polling de Eventos do AWS Health

**User Story:** Como administrador da plataforma, quero que o sistema consulte periodicamente a AWS Health API de todas as contas AWS cadastradas, para que eventos de risco sejam detectados automaticamente.

#### Critérios de Aceitação

1. WHEN o EventBridge dispara a execução periódica (seguindo o padrão de `scheduled-scan-executor.ts`), THE Health_Monitor SHALL consultar a AWS Health API usando `DescribeEvents` com filtro de categoria `accountNotification` e `issue` para cada conta AWS ativa da organização
2. WHEN a AWS Health API retorna eventos, THE Health_Monitor SHALL buscar os detalhes completos de cada evento usando `DescribeEventDetails`
3. WHEN o Health_Monitor precisa acessar a AWS Health API de uma conta, THE Health_Monitor SHALL resolver as credenciais usando `resolveAwsCredentials()` e `assumeRole()` de `backend/src/lib/aws-helpers.ts` com cache de sessão
4. WHEN um evento é processado, THE Health_Monitor SHALL persistir o evento no modelo Prisma `AwsHealthEvent` com os campos: event_arn, type_code, category, region, start_time, end_time, status_code, description, aws_account_id, organization_id, severity, is_credential_exposure e metadata (Json)
5. WHEN um evento já existe no `AwsHealthEvent` (mesmo event_arn e organization_id), THE Health_Monitor SHALL atualizar os campos mutáveis (status_code, end_time, description) sem criar duplicatas (upsert por event_arn)
6. THE Health_Monitor SHALL filtrar eventos por `organization_id` em todas as queries ao `AwsHealthEvent`, respeitando o isolamento multi-tenant
7. IF a AWS Health API retornar erro ou timeout, THEN THE Health_Monitor SHALL registrar o erro via `logger.error()` e continuar processando as demais contas AWS sem interromper a execução

### Requisito 2: Classificação de Severidade de Eventos

**User Story:** Como administrador de segurança, quero que os eventos do AWS Health sejam classificados por severidade automaticamente, para que eu possa priorizar a resposta aos incidentes mais críticos.

#### Critérios de Aceitação

1. WHEN um Health_Event possui typeCode contendo `RISK_CREDENTIALS_EXPOSED` ou `RISK_CREDENTIALS_COMPROMISED`, THE Severity_Classifier SHALL classificar o evento como `critical`
2. WHEN um Health_Event possui typeCode contendo `RISK` e categoria `accountNotification`, THE Severity_Classifier SHALL classificar o evento como `high` (exceto quando já classificado como `critical` pela regra anterior)
3. WHEN um Health_Event possui categoria `issue` e statusCode `open`, THE Severity_Classifier SHALL classificar o evento como `medium`
4. WHEN um Health_Event não se enquadra nas regras anteriores, THE Severity_Classifier SHALL classificar o evento como `low`
5. THE Severity_Classifier SHALL retornar exatamente um dos valores: `critical`, `high`, `medium`, `low` para cada evento processado
6. FOR ALL Health_Events, classificar o mesmo evento duas vezes SHALL produzir o mesmo resultado (idempotência da classificação)

### Requisito 3: Criação Automática de Tickets de Remediação

**User Story:** Como administrador de segurança, quero que tickets de remediação sejam criados automaticamente quando eventos de risco são detectados, para que a equipe possa agir rapidamente sem depender de detecção manual.

#### Critérios de Aceitação

1. WHEN um Health_Event com severidade `critical` ou `high` é detectado, THE Ticket_Generator SHALL criar um `RemediationTicket` (modelo Prisma existente) com categoria `security`, prioridade correspondente à severidade, e status `open`
2. WHEN o Ticket_Generator cria um ticket, THE Ticket_Generator SHALL incluir no campo `metadata` (Json) do `RemediationTicket`: o event_arn, typeCode, conta AWS afetada, região, e a descrição completa do evento
3. WHEN o Ticket_Generator cria um ticket, THE Ticket_Generator SHALL definir o título no formato: `[AWS Health] {typeCode} - {região} ({conta AWS})`
4. WHEN um ticket é criado automaticamente, THE Ticket_Generator SHALL executar `findAssignment()` de `backend/src/lib/ticket-workflow.ts` para auto-atribuição e `autoWatch()` para registrar o criador como watcher, seguindo o padrão de `create-remediation-ticket.ts`
5. WHEN um Health_Event já possui um `remediation_ticket_id` no `AwsHealthEvent`, THE Ticket_Generator SHALL ignorar o evento e não criar ticket duplicado
6. WHEN um Credential_Exposure_Event é detectado, THE Ticket_Generator SHALL definir a prioridade do ticket como `urgent` e o campo `business_impact` do `RemediationTicket` com a mensagem "Credenciais AWS potencialmente expostas — ação imediata necessária"
7. WHEN um ticket é criado automaticamente, THE Ticket_Generator SHALL registrar um audit log usando `logAuditAsync()` de `backend/src/lib/audit-service.ts` com action `HEALTH_EVENT_TICKET_CREATE`, resourceType `ticket` e resourceId com o ID do ticket criado

### Requisito 4: Notificação no Dashboard Executivo

**User Story:** Como executivo, quero ser notificado no dashboard quando eventos críticos do AWS Health são detectados, para que eu tenha visibilidade imediata sobre riscos que exigem ação prioritária.

#### Critérios de Aceitação

1. WHEN um Health_Event com severidade `critical` é detectado, THE Dashboard_Notifier SHALL criar um registro na tabela `Alert` (modelo Prisma existente) visível na seção de segurança do dashboard executivo
2. WHEN o Dashboard_Notifier cria um alerta, THE Dashboard_Notifier SHALL incluir: severidade, título do evento, conta AWS afetada, horário de detecção, e o ID do `RemediationTicket` associado
3. WHEN o endpoint `get-executive-dashboard.ts` é chamado, THE Dashboard_Notifier SHALL incluir a contagem de `AwsHealthEvent` ativos (agrupados por severidade) como campo separado `healthEvents` (ao lado de `findings`) na resposta da interface `SecurityPosture` existente, com a mesma estrutura de contagem: critical/high/medium/low/total
4. WHEN um Health_Event com severidade `critical` ou `high` é detectado, THE Dashboard_Notifier SHALL enviar notificação por email aos administradores da organização usando `EmailService.sendSecurityNotification()` de `backend/src/lib/email-service.ts`

### Requisito 5: API de Consulta de Health Events

**User Story:** Como administrador da plataforma, quero consultar os eventos do AWS Health armazenados via API, para que eu possa visualizar o histórico e status dos eventos no frontend.

#### Critérios de Aceitação

1. THE Health_Monitor SHALL expor um endpoint GET (`get-health-events.ts`) que retorna os `AwsHealthEvent` da organização com suporte a paginação (limit/offset) e filtros por severidade, status_code e aws_account_id
2. WHEN o endpoint de listagem é chamado, THE Health_Monitor SHALL filtrar os resultados por `organization_id` do usuário autenticado usando `getOrganizationId(user)` ou `getOrganizationIdWithImpersonation(event, user)` de `backend/src/lib/auth.ts`
3. THE Health_Monitor SHALL expor um endpoint GET (`get-health-event-details.ts`) que retorna os detalhes de um `AwsHealthEvent` específico pelo ID, incluindo o `RemediationTicket` associado via `remediation_ticket_id` (se existir)
4. THE Health_Monitor SHALL expor um endpoint GET (`get-health-events-summary.ts`) que retorna um resumo agregado: total de eventos por severidade, total de eventos com status_code `open`, e total de tickets criados automaticamente (contagem de `AwsHealthEvent` com `remediation_ticket_id` não nulo)

### Requisito 6: Configuração do Monitoramento

**User Story:** Como administrador da plataforma, quero configurar quais tipos de eventos do AWS Health devem gerar tickets automaticamente, para que eu possa ajustar o comportamento conforme as necessidades da organização.

#### Critérios de Aceitação

1. THE Health_Monitor SHALL permitir configurar via API (`manage-health-monitoring-config.ts`) quais severidades de eventos geram tickets automaticamente, armazenando no modelo Prisma `HealthMonitoringConfig` (padrão: `critical` e `high`)
2. THE Health_Monitor SHALL permitir configurar via API a frequência de polling do AWS Health em minutos, armazenando no campo `polling_frequency_minutes` do `HealthMonitoringConfig` (padrão: 15 minutos)
3. WHEN a configuração de monitoramento é alterada, THE Health_Monitor SHALL registrar um audit log usando `logAuditAsync()` de `backend/src/lib/audit-service.ts` com action `HEALTH_MONITORING_CONFIG_UPDATE`, resourceType `health_monitoring_config` e resourceId com o ID da configuração
4. THE Health_Monitor SHALL armazenar as configurações por organização no `HealthMonitoringConfig` com campo `organization_id`, respeitando o isolamento multi-tenant (uma configuração por organização)

### Requisito 7: Tratamento de Credenciais Expostas (Fluxo Prioritário)

**User Story:** Como administrador de segurança, quero que eventos de credenciais expostas recebam tratamento especial e urgente, para que a equipe possa mitigar o risco de comprometimento da conta AWS o mais rápido possível.

#### Critérios de Aceitação

1. WHEN um Credential_Exposure_Event é detectado, THE Health_Monitor SHALL marcar o evento com `is_credential_exposure = true` no modelo `AwsHealthEvent`
2. WHEN um Credential_Exposure_Event é detectado, THE Dashboard_Notifier SHALL enviar notificação imediata por email a todos os administradores da organização usando `EmailService.sendSecurityNotification()` de `backend/src/lib/email-service.ts` com assunto contendo "[URGENTE] Credenciais AWS Expostas"
3. WHEN um Credential_Exposure_Event é detectado, THE Ticket_Generator SHALL incluir no campo `description` do `RemediationTicket` as instruções de remediação recomendadas pela AWS (rotacionar credenciais, revogar sessões ativas, verificar CloudTrail)
4. WHEN um Credential_Exposure_Event é detectado, THE Health_Monitor SHALL registrar uma entrada no modelo Prisma `CommunicationLog` existente com canal `email`, status do envio, e metadata contendo `{ source: "aws-health-credential-exposure", event_arn: "<arn>", organization_id: "<id>" }`
