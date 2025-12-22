# ✅ Checklist de Validação da Migração

Use este checklist para validar cada etapa da migração e garantir que nada foi esquecido.

---

## 🏗️ Infraestrutura

### Network
- [ ] VPC criada com 2 AZs
- [ ] Subnets públicas criadas
- [ ] Subnets privadas criadas
- [ ] Subnets isoladas (database) criadas
- [ ] NAT Gateway configurado
- [ ] Internet Gateway configurado
- [ ] Route tables configuradas
- [ ] Security Groups criados
- [ ] VPC Endpoints criados (Secrets Manager, SSM)

### Database
- [ ] RDS PostgreSQL provisionado
- [ ] Multi-AZ habilitado (produção)
- [ ] Encryption at rest habilitada
- [ ] Backups automáticos configurados (7-35 dias)
- [ ] Deletion protection habilitada (produção)
- [ ] Performance Insights habilitado (produção)
- [ ] CloudWatch Logs habilitado
- [ ] Secret no Secrets Manager criado
- [ ] Security Group permite acesso apenas de Lambdas
- [ ] Banco não é publicamente acessível

### Autenticação
- [ ] Cognito User Pool criado
- [ ] Custom attributes configurados (organization_id, tenant_id, roles)
- [ ] Password policy configurada (12+ chars, complexidade)
- [ ] MFA configurado (TOTP + SMS)
- [ ] Account recovery configurado (email)
- [ ] Advanced security mode habilitado (produção)
- [ ] User Pool Client criado
- [ ] Auth flows configurados (USER_PASSWORD, USER_SRP)
- [ ] Token validity configurada (1h access, 30d refresh)

### API
- [ ] API Gateway criado
- [ ] Cognito Authorizer configurado
- [ ] CORS configurado
- [ ] CloudWatch Logs habilitado
- [ ] X-Ray tracing habilitado
- [ ] Throttling configurado
- [ ] API Keys configuradas (se necessário)
- [ ] Custom domain configurado (se necessário)

### Lambda
- [ ] Todas as Lambdas criadas
- [ ] VPC integration configurada
- [ ] Security Groups corretos
- [ ] IAM roles com least privilege
- [ ] Environment variables configuradas
- [ ] Timeout adequado (30s+)
- [ ] Memory adequada (512MB+)
- [ ] Layers compartilhados criados
- [ ] CloudWatch Logs habilitado
- [ ] X-Ray tracing habilitado
- [ ] Dead Letter Queue configurada (opcional)

### Frontend
- [ ] S3 bucket criado
- [ ] Bucket não é público
- [ ] Encryption habilitada
- [ ] CloudFront distribution criada
- [ ] HTTPS redirect configurado
- [ ] SPA routing configurado (404 → index.html)
- [ ] Cache policies configuradas
- [ ] Custom domain configurado (se necessário)
- [ ] ACM certificate configurado (se necessário)

### Monitoring
- [ ] CloudWatch Dashboard criado
- [ ] Alarmes de API errors configurados
- [ ] Alarmes de API latency configurados
- [ ] Alarmes de RDS CPU configurados
- [ ] Alarmes de RDS connections configurados
- [ ] SNS topic para alertas criado
- [ ] Email subscription configurada
- [ ] Log retention configurada (30-90 dias)

---

## 🗄️ Banco de Dados

### Schema
- [ ] Todas as tabelas criadas
- [ ] Indexes criados
- [ ] Foreign keys configuradas
- [ ] Constraints configuradas
- [ ] Default values configurados
- [ ] Triggers criados (se necessário)
- [ ] Views criadas (se necessário)
- [ ] Functions criadas (se necessário)

### Dados
- [ ] Dados exportados do Supabase
- [ ] Dados importados no RDS
- [ ] Contagem de registros validada
- [ ] Integridade referencial validada
- [ ] Dados sensíveis mascarados (dev)
- [ ] Backup inicial criado

### Prisma
- [ ] Schema Prisma criado
- [ ] Migrações aplicadas
- [ ] Cliente Prisma gerado
- [ ] Connection pooling configurado
- [ ] Prisma Studio testado

---

## 🔐 Autenticação & Autorização

### Cognito
- [ ] Usuários migrados
- [ ] Atributos customizados configurados
- [ ] Grupos criados (se necessário)
- [ ] Políticas de senha testadas
- [ ] MFA testado
- [ ] Password reset testado
- [ ] Email verification testado

### Frontend
- [ ] Cliente Cognito implementado
- [ ] Login funciona
- [ ] Logout funciona
- [ ] Refresh token funciona
- [ ] MFA funciona
- [ ] Password reset funciona
- [ ] Session persistence funciona
- [ ] Token expiration tratado

### Backend
- [ ] JWT validation funciona
- [ ] Claims extraídos corretamente
- [ ] Organization ID validado
- [ ] Tenant ID validado
- [ ] Roles validados
- [ ] Unauthorized retorna 401
- [ ] Forbidden retorna 403

---

## 🔧 Backend (Lambdas)

### Segurança
- [x] security-scan implementada
- [ ] compliance-scan implementada
- [ ] guardduty-scan implementada
- [ ] drift-detection implementada
- [ ] get-findings implementada
- [ ] get-security-posture implementada
- [ ] get-security-scan implementada
- [ ] validate-waf-security implementada
- [ ] iam-behavior-analysis implementada
- [ ] iam-deep-analysis implementada
- [ ] lateral-movement-detection implementada
- [ ] anomaly-detection implementada
- [ ] detect-anomalies implementada
- [ ] threat-detection implementada
- [ ] generate-remediation-script implementada

### FinOps
- [ ] finops-copilot implementada
- [ ] finops-copilot-v2 implementada
- [ ] cost-optimization implementada
- [ ] budget-forecast implementada
- [ ] generate-cost-forecast implementada
- [ ] fetch-daily-costs implementada
- [ ] ri-sp-analyzer implementada
- [ ] ml-waste-detection implementada
- [ ] waste-detection implementada

### Monitoramento
- [ ] aws-realtime-metrics implementada
- [ ] fetch-cloudwatch-metrics implementada
- [ ] fetch-cloudtrail implementada
- [ ] analyze-cloudtrail implementada
- [ ] endpoint-monitor-check implementada
- [ ] health-check implementada
- [ ] process-events implementada

### Relatórios
- [ ] generate-pdf-report implementada
- [ ] generate-excel-report implementada
- [ ] generate-security-pdf implementada
- [ ] security-scan-pdf-export implementada
- [ ] kb-export-pdf implementada

### Jobs
- [ ] execute-scheduled-job implementada
- [ ] process-background-jobs implementada
- [ ] scheduled-scan-executor implementada
- [ ] scheduled-view-refresh implementada
- [ ] daily-license-validation implementada
- [ ] cleanup-expired-external-ids implementada

### Gestão
- [ ] create-organization-account implementada
- [ ] sync-organization-accounts implementada
- [ ] sync-resource-inventory implementada
- [ ] initial-data-load implementada
- [ ] cloudformation-webhook implementada

### Usuários
- [ ] create-user implementada
- [ ] admin-manage-user implementada
- [ ] webauthn-register implementada
- [ ] webauthn-authenticate implementada
- [ ] verify-tv-token implementada

### Alertas
- [ ] auto-alerts implementada
- [ ] check-alert-rules implementada
- [ ] intelligent-alerts-analyzer implementada
- [ ] send-notification implementada
- [ ] get-communication-logs implementada

### Knowledge Base
- [ ] kb-ai-suggestions implementada
- [ ] kb-analytics-dashboard implementada
- [ ] generate-ai-insights implementada
- [ ] ai-prioritization implementada

### Licenciamento
- [ ] check-license implementada
- [ ] validate-license implementada
- [ ] well-architected-scan implementada

### Integrações
- [ ] create-jira-ticket implementada
- [ ] validate-aws-credentials implementada

### Outros
- [ ] predict-incidents implementada

---

## 🎨 Frontend

### Estrutura
- [ ] Dependência do Supabase removida
- [ ] Cliente Cognito criado
- [ ] Cliente HTTP AWS criado
- [ ] Variáveis de ambiente atualizadas
- [ ] Build funciona sem erros
- [ ] Linter passa sem erros
- [ ] TypeScript compila sem erros

### Componentes
- [ ] AuthGuard atualizado
- [ ] UserMenu atualizado
- [ ] OrganizationSwitcher atualizado
- [ ] MFASettings atualizado
- [ ] UserSettings atualizado
- [ ] Todos os componentes testados

### Páginas
- [ ] Auth page atualizada
- [ ] Index page atualizada
- [ ] Security pages atualizadas
- [ ] Cost pages atualizadas
- [ ] Settings pages atualizadas
- [ ] Knowledge Base atualizada
- [ ] Todas as páginas testadas

### Integrações
- [ ] Todas as chamadas de API atualizadas
- [ ] Todos os hooks atualizados
- [ ] Todos os contexts atualizados
- [ ] React Query configurado
- [ ] Error handling implementado
- [ ] Loading states implementados

---

## 🧪 Testes

### Unitários
- [ ] Testes de helpers
- [ ] Testes de utilitários
- [ ] Testes de validações
- [ ] Coverage > 80%

### Integração
- [ ] Testes de APIs
- [ ] Testes de banco de dados
- [ ] Testes de autenticação
- [ ] Testes de autorização

### E2E
- [ ] Fluxo de login
- [ ] Fluxo de security scan
- [ ] Fluxo de relatórios
- [ ] Fluxo de gestão de contas

### Performance
- [ ] Load testing (Artillery/k6)
- [ ] Latência < 500ms (p95)
- [ ] Throughput adequado
- [ ] Memory usage adequado

### Segurança
- [ ] Penetration testing
- [ ] OWASP Top 10 verificado
- [ ] Secrets não expostos
- [ ] CORS configurado corretamente
- [ ] Rate limiting testado

---

## 📊 Validação de Dados

### Integridade
- [ ] Contagem de registros match
- [ ] Foreign keys válidas
- [ ] Dados não nulos onde esperado
- [ ] Formatos de data corretos
- [ ] JSON válido onde esperado

### Migração
- [ ] Organizations migradas
- [ ] Profiles migrados
- [ ] AWS Credentials migradas
- [ ] Findings migrados
- [ ] Security Scans migrados
- [ ] Background Jobs migrados
- [ ] Knowledge Base migrada
- [ ] Licenses migradas

### Tenant Isolation
- [ ] Queries filtram por organization_id
- [ ] Usuário não vê dados de outra org
- [ ] Admin não vê dados de outra org
- [ ] Super admin vê tudo (se aplicável)

---

## 🚀 Deploy

### Desenvolvimento
- [ ] Deploy bem-sucedido
- [ ] Todas as stacks criadas
- [ ] Outputs disponíveis
- [ ] Endpoints acessíveis
- [ ] Logs funcionando

### Staging
- [ ] Deploy bem-sucedido
- [ ] Dados de teste carregados
- [ ] Testes executados
- [ ] Performance validada
- [ ] Segurança validada

### Produção
- [ ] Backup do Supabase criado
- [ ] Janela de manutenção comunicada
- [ ] Deploy bem-sucedido
- [ ] Dados migrados
- [ ] DNS atualizado (se aplicável)
- [ ] Smoke tests executados
- [ ] Monitoramento ativo
- [ ] Rollback plan testado

---

## 📚 Documentação

### Técnica
- [ ] README atualizado
- [ ] Arquitetura documentada
- [ ] APIs documentadas
- [ ] Schema do banco documentado
- [ ] Variáveis de ambiente documentadas

### Operacional
- [ ] Runbooks criados
- [ ] Procedimentos de deploy documentados
- [ ] Procedimentos de rollback documentados
- [ ] Disaster recovery documentado
- [ ] Troubleshooting guide criado

### Usuário
- [ ] Guia de migração para usuários
- [ ] Mudanças comunicadas
- [ ] FAQ atualizado
- [ ] Vídeos de treinamento (se aplicável)

---

## 🔄 Pós-Deploy

### Monitoramento
- [ ] Dashboard sendo monitorado
- [ ] Alarmes configurados
- [ ] Logs sendo revisados
- [ ] Métricas sendo coletadas
- [ ] Erros sendo tratados

### Performance
- [ ] Latência dentro do esperado
- [ ] Throughput adequado
- [ ] Custos dentro do orçamento
- [ ] Escalabilidade validada

### Feedback
- [ ] Usuários notificados
- [ ] Feedback coletado
- [ ] Issues reportados
- [ ] Melhorias identificadas

---

## 🧹 Limpeza

### Supabase
- [ ] Backup final criado
- [ ] Projeto desabilitado
- [ ] Assinatura cancelada
- [ ] Dados deletados (após período de retenção)

### Código
- [ ] Diretório `supabase/` removido
- [ ] Dependência `@supabase/supabase-js` removida
- [ ] Imports antigos removidos
- [ ] Código morto removido
- [ ] Comentários atualizados

### AWS
- [ ] Recursos não utilizados deletados
- [ ] Logs antigos deletados
- [ ] Snapshots antigos deletados
- [ ] Alarmes desnecessários removidos

---

## ✅ Critérios de Aceitação Final

### Funcionalidade
- [ ] 100% das features funcionando
- [ ] Zero regressões identificadas
- [ ] UX mantida ou melhorada
- [ ] Performance igual ou melhor

### Segurança
- [ ] Autenticação funcionando
- [ ] Autorização funcionando
- [ ] Multi-tenant isolation validado
- [ ] Compliance mantido
- [ ] Penetration test passou

### Operacional
- [ ] Deploy automatizado
- [ ] Monitoramento funcionando
- [ ] Alertas funcionando
- [ ] Backup funcionando
- [ ] Disaster recovery testado

### Financeiro
- [ ] Custos dentro do orçamento
- [ ] Billing alerts configurados
- [ ] Cost optimization implementado
- [ ] ROI positivo

---

## 📝 Sign-off

### Técnico
- [ ] Arquiteto de Software aprovou
- [ ] Tech Lead aprovou
- [ ] DevOps aprovou
- [ ] Security aprovou

### Negócio
- [ ] Product Owner aprovou
- [ ] Stakeholders notificados
- [ ] Usuários treinados
- [ ] Go-live autorizado

---

**Data de Conclusão**: _______________  
**Responsável**: _______________  
**Aprovado por**: _______________
