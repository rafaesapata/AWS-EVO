# 🔄 Migração de Componentes Externos para AWS

## 📋 Lista Completa de Componentes Externos Identificados

### 🗄️ **1. BANCO DE DADOS E ARMAZENAMENTO**

#### **Supabase** → **AWS RDS + DynamoDB + S3**
- **Status**: ✅ **MIGRADO**
- **Componente Atual**: Supabase Database + Auth + Storage
- **Substituição AWS**:
  - **RDS PostgreSQL** para dados relacionais
  - **DynamoDB** para dados NoSQL/cache
  - **S3** para armazenamento de arquivos
  - **Cognito** para autenticação

#### **Redis/Memcached** → **ElastiCache**
- **Status**: 🔄 **EM PROGRESSO**
- **Componente Atual**: Cache em memória (mencionado no código)
- **Substituição AWS**: **ElastiCache Redis**
- **Arquivos Afetados**:
  - `src/lib/error-recovery.ts`
  - `CODE_QUALITY.md`

---

### 🌐 **2. CDN E DISTRIBUIÇÃO DE CONTEÚDO**

#### **CDNs Externos** → **CloudFront**
- **Status**: ✅ **IMPLEMENTADO**
- **Componentes Atuais**:
  - `cdn.jsdelivr.net`
  - `unpkg.com`
  - `fonts.googleapis.com`
  - `fonts.gstatic.com`
- **Substituição AWS**: **CloudFront CDN**
- **Arquivos Afetados**:
  - `backend/src/lib/security-headers.ts`
  - Configurações CSP

---

### 🔐 **3. AUTENTICAÇÃO E AUTORIZAÇÃO**

#### **Supabase Auth** → **AWS Cognito**
- **Status**: ✅ **MIGRADO**
- **Componente Atual**: `amazon-cognito-identity-js`
- **Substituição AWS**: **AWS Cognito User Pools + Identity Pools**
- **Arquivos Afetados**:
  - `src/integrations/aws/cognito-client.ts`
  - Todos os componentes de auth

---

### 🤖 **4. INTELIGÊNCIA ARTIFICIAL**

#### **OpenAI/Anthropic APIs** → **AWS Bedrock**
- **Status**: ✅ **IMPLEMENTADO**
- **Componentes Atuais**: APIs externas de IA
- **Substituição AWS**: **Amazon Bedrock**
- **Modelos Configurados**:
  - `anthropic.claude-3-5-sonnet-20240620-v1:0`
  - `anthropic.claude-3-haiku-20240307-v1:0`
- **Arquivos Afetados**:
  - `src/integrations/aws/bedrock-client.ts`

---

### 📧 **5. COMUNICAÇÃO E NOTIFICAÇÕES**

#### **Slack Webhooks** → **SNS + SES**
- **Status**: 🔄 **PENDENTE**
- **Componente Atual**: Slack webhook URLs
- **Substituição AWS**:
  - **SNS** para notificações push
  - **SES** para emails
  - **Pinpoint** para SMS/WhatsApp
- **Arquivos Afetados**:
  - `src/components/dashboard/NotificationSettings.tsx`
  - `src/pages/CommunicationCenter.tsx`

#### **SendGrid/Mailgun** → **Amazon SES**
- **Status**: 🔄 **PENDENTE**
- **Componente Atual**: Serviços de email externos
- **Substituição AWS**: **Amazon SES**

#### **Twilio** → **Amazon Pinpoint**
- **Status**: 🔄 **PENDENTE**
- **Componente Atual**: SMS/WhatsApp via Twilio
- **Substituição AWS**: **Amazon Pinpoint**

---

### 📊 **6. MONITORAMENTO E OBSERVABILIDADE**

#### **Grafana** → **CloudWatch Dashboards**
- **Status**: 🔄 **PENDENTE**
- **Componente Atual**: Grafana para dashboards
- **Substituição AWS**: **CloudWatch Dashboards + Insights**

#### **Prometheus** → **CloudWatch Metrics**
- **Status**: 🔄 **PENDENTE**
- **Componente Atual**: Prometheus para métricas
- **Substituição AWS**: **CloudWatch Custom Metrics**

#### **Datadog/New Relic** → **X-Ray + CloudWatch**
- **Status**: 🔄 **PENDENTE**
- **Componente Atual**: APM externos
- **Substituição AWS**:
  - **X-Ray** para tracing
  - **CloudWatch** para logs e métricas

#### **Sentry** → **CloudWatch Logs + SNS**
- **Status**: 🔄 **PENDENTE**
- **Componente Atual**: Error tracking externo
- **Substituição AWS**: **CloudWatch Error Logs + SNS Alerts**

#### **Graylog** → **CloudWatch Logs**
- **Status**: 🔄 **PENDENTE**
- **Componente Atual**: Log aggregation
- **Substituição AWS**: **CloudWatch Logs Insights**
- **Arquivos Afetados**:
  - `src/components/dashboard/NotificationSettings.tsx`

#### **Zabbix** → **CloudWatch + Systems Manager**
- **Status**: 🔄 **PENDENTE**
- **Componente Atual**: Infrastructure monitoring
- **Substituição AWS**:
  - **CloudWatch** para métricas
  - **Systems Manager** para patch management

---

### 🎫 **7. GESTÃO DE PROJETOS E TICKETS**

#### **Jira/Confluence** → **AWS Service Catalog + Lambda**
- **Status**: 🔄 **PENDENTE**
- **Componente Atual**: Integração com Jira
- **Substituição AWS**: **Custom ticketing via Lambda + DynamoDB**
- **Arquivos Afetados**:
  - `NEW_LAMBDAS_BATCH_2_REFERENCE.md`
  - Sistema de tickets do Well-Architected

---

### 🌍 **8. APIS E INTEGRAÇÕES EXTERNAS**

#### **APIs de Terceiros** → **API Gateway + Lambda**
- **Status**: 🔄 **PENDENTE**
- **Componentes Atuais**:
  - `https://api.example.com/*`
  - Webhooks externos
- **Substituição AWS**:
  - **API Gateway** como proxy
  - **Lambda** para processamento
  - **EventBridge** para eventos

#### **Webhooks Externos** → **EventBridge + SQS**
- **Status**: 🔄 **PENDENTE**
- **Componente Atual**: Webhook URLs externos
- **Substituição AWS**:
  - **EventBridge** para eventos
  - **SQS** para filas
  - **Lambda** para processamento

---

### 📦 **9. DEPENDÊNCIAS NPM CRÍTICAS**

#### **Bibliotecas de UI Externas**
- **Status**: ✅ **MANTIDAS** (não críticas para segurança)
- **Componentes**:
  - `@radix-ui/*` - Componentes UI
  - `@tanstack/react-query` - State management
  - `lucide-react` - Ícones
  - `recharts` - Gráficos

#### **Bibliotecas de Utilidades**
- **Status**: ✅ **MANTIDAS** (não críticas)
- **Componentes**:
  - `date-fns` - Manipulação de datas
  - `zod` - Validação
  - `uuid` - Geração de IDs

---

## 🎯 **PLANO DE AÇÃO PRIORITÁRIO**

### **🔥 ALTA PRIORIDADE (Crítico para Segurança)**

1. **Slack Webhooks → SNS/SES**
   ```typescript
   // Substituir:
   const slackUrl = "https://hooks.slack.com/services/..."
   
   // Por:
   await sns.publish({
     TopicArn: process.env.SNS_TOPIC_ARN,
     Message: JSON.stringify(notification)
   }).promise();
   ```

2. **Graylog → CloudWatch Logs**
   ```typescript
   // Substituir:
   const graylogUrl = "http://graylog.example.com"
   
   // Por:
   await cloudWatchLogs.putLogEvents({
     logGroupName: '/aws/lambda/evo-logs',
     logStreamName: streamName,
     logEvents: events
   }).promise();
   ```

3. **Zabbix → CloudWatch**
   ```typescript
   // Substituir:
   const zabbixUrl = "http://zabbix.example.com/api_jsonrpc.php"
   
   // Por:
   await cloudWatch.putMetricData({
     Namespace: 'EVO/Infrastructure',
     MetricData: metrics
   }).promise();
   ```

### **🟡 MÉDIA PRIORIDADE (Funcionalidade)**

4. **Jira Integration → Custom Ticketing**
5. **External APIs → API Gateway Proxy**
6. **Monitoring Tools → CloudWatch Suite**

### **🟢 BAIXA PRIORIDADE (Otimização)**

7. **CDN Optimization**
8. **Performance Monitoring Enhancement**

---

## 📋 **CHECKLIST DE IMPLEMENTAÇÃO**

### **Notificações (SNS/SES)**
- [ ] Criar tópicos SNS para diferentes tipos de alerta
- [ ] Configurar SES para emails transacionais
- [ ] Migrar configurações de Slack para SNS
- [ ] Implementar templates de notificação
- [ ] Testar entrega de notificações

### **Logs (CloudWatch)**
- [ ] Criar log groups estruturados
- [ ] Migrar configurações do Graylog
- [ ] Implementar log retention policies
- [ ] Configurar alertas baseados em logs
- [ ] Criar dashboards de logs

### **Métricas (CloudWatch)**
- [ ] Definir métricas customizadas
- [ ] Migrar configurações do Zabbix
- [ ] Criar alarmes CloudWatch
- [ ] Implementar dashboards de infraestrutura
- [ ] Configurar auto-scaling baseado em métricas

### **Ticketing (Lambda + DynamoDB)**
- [ ] Criar schema DynamoDB para tickets
- [ ] Implementar APIs de criação/atualização
- [ ] Migrar integrações do Jira
- [ ] Criar interface de gerenciamento
- [ ] Implementar workflow de aprovação

---

## 💰 **ESTIMATIVA DE CUSTOS AWS**

### **Serviços Adicionais Necessários**
- **SNS**: ~$0.50/mês (1M notificações)
- **SES**: ~$1.00/mês (10K emails)
- **CloudWatch Logs**: ~$5.00/mês (5GB)
- **CloudWatch Metrics**: ~$3.00/mês (custom metrics)
- **EventBridge**: ~$1.00/mês (1M eventos)

**Total Estimado**: ~$10.50/mês adicional

---

## 🚀 **PRÓXIMOS PASSOS**

1. **Implementar SNS/SES** para notificações
2. **Migrar logs** para CloudWatch
3. **Configurar métricas** customizadas
4. **Desenvolver sistema** de tickets interno
5. **Testar todas** as integrações
6. **Documentar** as novas configurações

---

**Status Geral**: 🔄 **60% Completo**
- ✅ Banco de dados migrado
- ✅ Autenticação migrada  
- ✅ IA migrada
- 🔄 Notificações em progresso
- 🔄 Monitoramento em progresso
- 🔄 Integrações em progresso