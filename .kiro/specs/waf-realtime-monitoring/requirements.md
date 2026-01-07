# Requirements Document

## Introduction

Sistema de monitoramento em tempo real de logs do AWS WAF para detecção proativa de tentativas de invasão, análise de padrões suspeitos e alertas automáticos. O sistema processará logs do WAF via Kinesis Data Firehose, analisará eventos em tempo real usando Lambda, armazenará dados no PostgreSQL (RDS) e exibirá em um dashboard interativo no frontend React existente.

## Glossary

- **WAF_Monitor**: Sistema Lambda que processa e analisa logs do WAF em tempo real
- **Threat_Detector**: Componente que identifica padrões de ataque nos logs
- **Alert_Engine**: Sistema de notificação para eventos de segurança críticos
- **Dashboard_Service**: API que fornece dados agregados para visualização
- **Kinesis_Firehose**: Serviço AWS para streaming de logs do WAF
- **Attack_Pattern**: Padrão identificado como tentativa de invasão (SQLi, XSS, etc.)
- **Suspicious_User_Agent**: User-Agent que não deveria existir em requisições legítimas
- **Blocked_Request**: Requisição bloqueada pelo WAF

## Requirements

### Requirement 1: WAF Log Ingestion

**User Story:** As a security engineer, I want to capture WAF logs in real-time, so that I can analyze security events as they happen.

#### Acceptance Criteria

1. WHEN AWS WAF blocks or allows a request, THE WAF_Monitor SHALL receive the log event within 60 seconds via Kinesis Data Firehose
2. WHEN a log event is received, THE WAF_Monitor SHALL parse and validate the WAF log format (JSON)
3. WHEN parsing a WAF log, THE WAF_Monitor SHALL extract: timestamp, action (ALLOW/BLOCK/COUNT), rule matched, source IP, user-agent, URI, HTTP method, country, and request headers
4. IF a log event fails parsing, THEN THE WAF_Monitor SHALL log the error and continue processing other events
5. THE WAF_Monitor SHALL process logs from multiple AWS accounts (multi-tenant support)

### Requirement 2: Threat Detection and Pattern Analysis

**User Story:** As a security analyst, I want the system to automatically detect attack patterns, so that I can respond to threats quickly.

#### Acceptance Criteria

1. WHEN a request is blocked by WAF, THE Threat_Detector SHALL classify the attack type (SQLi, XSS, Path Traversal, Command Injection, etc.)
2. WHEN analyzing user-agents, THE Threat_Detector SHALL flag suspicious patterns including: scanner tools (sqlmap, nikto, nmap), empty user-agents, and known malicious signatures
3. WHEN a request targets sensitive paths, THE Threat_Detector SHALL flag attempts to access: /swagger, /api-docs, /.env, /admin, /wp-admin, /phpmyadmin, /.git, /actuator
4. WHEN multiple blocked requests originate from the same IP within 5 minutes, THE Threat_Detector SHALL identify it as a potential attack campaign
5. WHEN analyzing request patterns, THE Threat_Detector SHALL detect rate-based anomalies (sudden spikes in requests from single IP)
6. THE Threat_Detector SHALL assign a severity level (critical, high, medium, low) based on attack type and frequency

### Requirement 3: Real-Time Alerting

**User Story:** As a security team member, I want to receive immediate alerts for critical threats, so that I can take action before damage occurs.

#### Acceptance Criteria

1. WHEN a critical threat is detected, THE Alert_Engine SHALL send a notification within 30 seconds
2. WHEN sending alerts, THE Alert_Engine SHALL support multiple channels: SNS (email/SMS), Slack webhook, and in-app notifications
3. WHEN an alert is triggered, THE Alert_Engine SHALL include: threat type, source IP, target URI, timestamp, severity, and recommended action
4. WHILE an attack campaign is ongoing, THE Alert_Engine SHALL aggregate related events to prevent alert fatigue
5. IF the same IP triggers more than 10 alerts in 5 minutes, THEN THE Alert_Engine SHALL consolidate into a single campaign alert
6. THE Alert_Engine SHALL respect organization-specific notification preferences stored in the database

### Requirement 4: Data Persistence and Storage

**User Story:** As a compliance officer, I want WAF events stored for audit purposes, so that I can review historical attack data.

#### Acceptance Criteria

1. WHEN a WAF event is processed, THE WAF_Monitor SHALL persist it to PostgreSQL (RDS) with full event details
2. THE WAF_Monitor SHALL store events with organization_id for multi-tenant isolation
3. WHEN storing events, THE WAF_Monitor SHALL include geolocation data (country, region) derived from source IP
4. THE WAF_Monitor SHALL retain events for at least 90 days (configurable per organization)
5. WHEN querying historical data, THE Dashboard_Service SHALL support filtering by: date range, severity, attack type, source IP, and target URI

### Requirement 5: Dashboard and Visualization

**User Story:** As a security analyst, I want a real-time dashboard showing attack activity, so that I can monitor the security posture continuously.

#### Acceptance Criteria

1. WHEN the dashboard loads, THE Dashboard_Service SHALL display real-time metrics: total requests, blocked requests, attack types distribution, and top attacking IPs
2. WHEN new events arrive, THE Dashboard_Service SHALL update the UI within 5 seconds via WebSocket or polling
3. WHEN displaying attack data, THE Dashboard_Service SHALL show a geographic map of attack origins
4. WHEN displaying trends, THE Dashboard_Service SHALL show time-series charts for the last 24 hours, 7 days, and 30 days
5. THE Dashboard_Service SHALL display a live feed of the most recent blocked requests with details
6. WHEN a user clicks on an event, THE Dashboard_Service SHALL show full event details including raw WAF log data

### Requirement 6: Automated Response Actions

**User Story:** As a security engineer, I want the system to automatically block persistent attackers, so that I can reduce manual intervention.

#### Acceptance Criteria

1. WHEN an IP exceeds a configurable threshold of blocked requests, THE WAF_Monitor SHALL add it to a temporary block list
2. WHEN adding an IP to the block list, THE WAF_Monitor SHALL create an IP set rule in AWS WAF via API
3. WHEN an IP is auto-blocked, THE Alert_Engine SHALL notify the security team with justification
4. THE WAF_Monitor SHALL automatically remove IPs from the block list after a configurable cooldown period (default: 24 hours)
5. WHERE manual review is required, THE Dashboard_Service SHALL provide a UI to approve or reject auto-block recommendations

### Requirement 7: Integration with Existing Security Infrastructure

**User Story:** As a platform administrator, I want WAF monitoring integrated with existing security features, so that I have a unified security view.

#### Acceptance Criteria

1. WHEN a WAF event is detected, THE WAF_Monitor SHALL correlate it with existing findings in the security_findings table
2. WHEN displaying the executive dashboard, THE Dashboard_Service SHALL include WAF attack metrics alongside other security metrics
3. THE WAF_Monitor SHALL use the existing authentication system (Cognito) for API access
4. THE WAF_Monitor SHALL follow the existing multi-tenant architecture using organization_id
5. WHEN generating reports, THE Dashboard_Service SHALL include WAF attack data in security PDF exports

### Requirement 8: Performance and Scalability

**User Story:** As a platform operator, I want the system to handle high volumes of WAF logs, so that it remains responsive during attacks.

#### Acceptance Criteria

1. THE WAF_Monitor SHALL process at least 10,000 events per minute without degradation
2. WHEN under high load, THE WAF_Monitor SHALL use batch processing to optimize database writes
3. THE Dashboard_Service SHALL respond to API queries within 500ms for the last 24 hours of data
4. WHEN querying large date ranges, THE Dashboard_Service SHALL use pagination with a maximum of 1000 records per page
5. THE WAF_Monitor SHALL use Redis cache for frequently accessed aggregations (attack counts, top IPs)
