# Documento de Requisitos: Relatórios Agendados de Serviços

## Introdução

A plataforma EVO precisa permitir que organizações configurem a frequência de execução de scans de segurança (e futuramente outros serviços como otimização de custos) por conta cloud (AWS/Azure). Após cada execução agendada, um email detalhado deve ser enviado com os resultados do scan, incluindo comparação com o scan anterior (novos findings, findings resolvidos). Todo envio de email passa pela central de comunicação (CommunicationLog). O agendamento é por conta — o usuário seleciona a conta no header e define a frequência. Máximo de um scan automático por dia por conta. Integração com alarmes inteligentes (AiNotificationRule) para alertas proativos baseados em resultados.

## Glossário

- **Executor_de_Agendamento**: O handler Lambda `scheduled-scan-executor` que roda a cada hora via EventBridge, consulta a tabela `ScanSchedule` e invoca as Lambdas de scan apropriadas
- **Gerador_de_Relatório**: Novo componente responsável por compilar resultados de scan em relatórios comparativos e gerar o conteúdo do email
- **Central_de_Comunicação**: Sistema existente baseado na tabela `CommunicationLog` que registra todo envio de email, SMS e notificações
- **Motor_de_Comparação**: Lógica que compara findings entre o scan atual e o scan anterior para identificar novos findings, findings resolvidos e findings persistentes
- **ScanSchedule**: Tabela existente no PostgreSQL que armazena configurações de agendamento por conta cloud
- **Finding**: Registro de vulnerabilidade ou problema de segurança identificado durante um scan, com fingerprint para rastreamento de ciclo de vida
- **Conta_Cloud**: Uma credencial AWS (AwsCredential) ou Azure (AzureCredential) vinculada a uma organização
- **Alarme_Inteligente**: Regra configurável na tabela `AiNotificationRule` que dispara notificações proativas baseadas em condições dos resultados de scan

## Requisitos

### Requisito 1: Configuração de Agendamento por Conta

**User Story:** Como usuário da plataforma, quero configurar a frequência de scans automáticos para cada conta cloud da minha organização, para que os scans rodem sem intervenção manual.

#### Critérios de Aceitação

1. QUANDO um usuário seleciona uma conta cloud e define uma frequência de agendamento (diário, semanal ou mensal), O Executor_de_Agendamento DEVE criar ou atualizar o registro na tabela ScanSchedule com o schedule_type e schedule_config correspondentes
2. QUANDO um usuário tenta criar um segundo agendamento para a mesma conta cloud e mesmo tipo de scan, O Executor_de_Agendamento DEVE rejeitar a operação e retornar erro informando que já existe um agendamento ativo
3. QUANDO um usuário desativa um agendamento, O Executor_de_Agendamento DEVE marcar o registro como is_active=false e não executar mais scans para aquele agendamento
4. QUANDO um agendamento semanal é configurado, O ScanSchedule DEVE armazenar o dia da semana (0-6) no campo schedule_config
5. QUANDO um agendamento mensal é configurado, O ScanSchedule DEVE armazenar o dia do mês (1-28) no campo schedule_config
6. O ScanSchedule DEVE restringir schedule_type aos valores "daily", "weekly" ou "monthly" exclusivamente

### Requisito 2: Execução de Scans Agendados

**User Story:** Como administrador de segurança, quero que os scans agendados executem automaticamente na frequência configurada, para que eu tenha visibilidade contínua da postura de segurança.

#### Critérios de Aceitação

1. QUANDO o next_run_at de um ScanSchedule é menor ou igual ao horário atual, O Executor_de_Agendamento DEVE invocar a Lambda de scan correspondente ao cloud_provider (start-security-scan para AWS, start-azure-security-scan para Azure)
2. QUANDO um scan agendado é executado com sucesso, O Executor_de_Agendamento DEVE atualizar last_run_at com o horário atual e calcular o próximo next_run_at baseado no schedule_type
3. QUANDO a credencial cloud associada ao agendamento está inativa, O Executor_de_Agendamento DEVE pular a execução e registrar o motivo no log
4. O Executor_de_Agendamento DEVE garantir que no máximo um scan automático por dia seja executado para cada combinação de conta cloud e tipo de scan
5. QUANDO um scan agendado falha durante a invocação, O Executor_de_Agendamento DEVE registrar o erro e manter o next_run_at para a próxima execução programada sem retry imediato

### Requisito 3: Geração de Relatório Comparativo

**User Story:** Como administrador de segurança, quero receber um relatório comparando os resultados do scan atual com o anterior, para que eu identifique rapidamente mudanças na postura de segurança.

#### Critérios de Aceitação

1. QUANDO um scan agendado é concluído, O Gerador_de_Relatório DEVE buscar o scan anterior da mesma conta cloud e tipo de scan para comparação
2. QUANDO existem findings no scan atual que não existiam no scan anterior (baseado no fingerprint), O Motor_de_Comparação DEVE classificar esses findings como "novos"
3. QUANDO findings do scan anterior possuem resolved_at preenchido ou não aparecem no scan atual, O Motor_de_Comparação DEVE classificar esses findings como "resolvidos"
4. QUANDO findings existem em ambos os scans (atual e anterior), O Motor_de_Comparação DEVE classificar esses findings como "persistentes"
5. O Gerador_de_Relatório DEVE produzir um resumo contendo: total de findings por severidade (critical, high, medium, low), contagem de novos findings, contagem de findings resolvidos e contagem de findings persistentes
6. QUANDO não existe scan anterior para comparação, O Gerador_de_Relatório DEVE gerar o relatório apenas com os dados do scan atual, indicando que é o primeiro scan

### Requisito 4: Envio de Email com Relatório

**User Story:** Como usuário da plataforma, quero receber um email detalhado e visualmente atrativo com os resultados do scan agendado, para que eu possa avaliar a situação de segurança sem acessar a plataforma.

#### Critérios de Aceitação

1. QUANDO o Gerador_de_Relatório produz um relatório, O Gerador_de_Relatório DEVE enviar um email HTML contendo: nome da organização, nome da conta cloud, tipo de scan, data/hora da execução, resumo de findings por severidade, lista de novos findings com título e severidade, e lista de findings resolvidos
2. QUANDO o email é enviado, A Central_de_Comunicação DEVE registrar o envio na tabela CommunicationLog com channel="email", subject, recipient, status e metadata contendo o scan_id
3. QUANDO o envio do email falha, A Central_de_Comunicação DEVE registrar a falha na tabela CommunicationLog com status="failed" e a mensagem de erro nos metadata
4. O Gerador_de_Relatório DEVE enviar o email para todos os usuários da organização que possuem notificações por email habilitadas na tabela NotificationSettings
5. O Gerador_de_Relatório DEVE utilizar o EmailService existente com templates HTML para gerar emails com formatação profissional

### Requisito 5: Integração com Alarmes Inteligentes

**User Story:** Como administrador de segurança, quero que o sistema gere alarmes inteligentes automaticamente quando os resultados de um scan agendado indicam situações críticas, para que eu seja alertado proativamente.

#### Critérios de Aceitação

1. QUANDO um scan agendado identifica novos findings com severidade "critical", O Gerador_de_Relatório DEVE criar uma notificação na tabela AiNotification com priority="critical" e suggested_action descrevendo os findings críticos encontrados
2. QUANDO a quantidade total de findings aumenta em mais de 20% comparado ao scan anterior, O Gerador_de_Relatório DEVE criar uma notificação na tabela AiNotification com priority="high" indicando degradação significativa da postura de segurança
3. QUANDO todos os findings críticos do scan anterior foram resolvidos, O Gerador_de_Relatório DEVE criar uma notificação na tabela AiNotification com priority="low" e tipo positivo indicando melhoria na postura de segurança

### Requisito 6: Extensibilidade para Outros Serviços

**User Story:** Como arquiteto da plataforma, quero que o sistema de agendamento e relatórios seja extensível para outros tipos de serviço além de security scan, para que possamos adicionar cost optimization e savings plans no futuro.

#### Critérios de Aceitação

1. O Executor_de_Agendamento DEVE utilizar o campo scan_type do ScanSchedule para determinar qual Lambda invocar, usando o mapeamento existente em getScanLambdaName
2. O Gerador_de_Relatório DEVE aceitar um parâmetro de tipo de serviço que determine o template de email e a lógica de comparação a ser utilizada
3. QUANDO um novo tipo de serviço é adicionado ao mapeamento de getScanLambdaName, O Executor_de_Agendamento DEVE ser capaz de agendar e executar esse serviço sem modificações no fluxo principal

### Requisito 7: Controle de Frequência e Limites

**User Story:** Como administrador da plataforma, quero garantir que o sistema respeite limites de execução para evitar sobrecarga e custos excessivos.

#### Critérios de Aceitação

1. QUANDO o Executor_de_Agendamento processa um schedule com last_run_at no mesmo dia (UTC), O Executor_de_Agendamento DEVE pular a execução e manter o next_run_at atual
2. QUANDO o cálculo de next_run_at para agendamento diário é realizado, O Executor_de_Agendamento DEVE definir o horário para as 02:00 UTC do próximo dia (ou o horário configurado em schedule_config.hour)
3. QUANDO o cálculo de next_run_at para agendamento semanal é realizado, O Executor_de_Agendamento DEVE definir o próximo dia da semana configurado no schedule_config.dayOfWeek às 02:00 UTC
4. QUANDO o cálculo de next_run_at para agendamento mensal é realizado, O Executor_de_Agendamento DEVE definir o dia do mês configurado no schedule_config.dayOfMonth às 02:00 UTC do próximo mês aplicável
