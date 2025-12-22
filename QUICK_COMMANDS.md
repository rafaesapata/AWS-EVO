# ⚡ Quick Commands Reference

Comandos mais usados para desenvolvimento e deploy do EVO UDS.

---

## 🚀 Deploy

### Deploy Completo
```bash
cd infra
npm run deploy:dev
```

### Deploy Stack Específica
```bash
cd infra
cdk deploy EvoUds-dev-Network
cdk deploy EvoUds-dev-Database
cdk deploy EvoUds-dev-Auth
cdk deploy EvoUds-dev-Api
cdk deploy EvoUds-dev-Frontend
cdk deploy EvoUds-dev-Monitoring
```

### Ver Mudanças Antes de Deploy
```bash
cd infra
cdk diff
```

### Destruir Infraestrutura
```bash
cd infra
cdk destroy EvoUds-dev-Api
# ou
npm run destroy:dev
```

---

## 🗄️ Banco de Dados

### Aplicar Migrações
```bash
cd backend
npx prisma migrate deploy
```

### Gerar Prisma Client
```bash
cd backend
npx prisma generate
```

### Criar Nova Migração
```bash
cd backend
npx prisma migrate dev --name nome_da_migracao
```

### Abrir Prisma Studio
```bash
cd backend
npx prisma studio
```

### Reset Database (DEV ONLY!)
```bash
cd backend
npx prisma migrate reset
```

---

## 👤 Cognito

### Obter User Pool ID
```bash
aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Auth \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text
```

### Criar Usuário
```bash
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username test@example.com \
  --user-attributes \
    Name=email,Value=test@example.com \
    Name=email_verified,Value=true \
  --temporary-password TempPass123!
```

### Definir Senha Permanente
```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username test@example.com \
  --password TestPass123! \
  --permanent
```

### Listar Usuários
```bash
aws cognito-idp list-users \
  --user-pool-id $USER_POOL_ID
```

### Deletar Usuário
```bash
aws cognito-idp admin-delete-user \
  --user-pool-id $USER_POOL_ID \
  --username test@example.com
```

---

## 🔍 Logs

### Ver Logs de Lambda (Follow)
```bash
aws logs tail /aws/lambda/evo-uds-dev-SecurityScan --follow
```

### Ver Logs de Todas as Lambdas
```bash
aws logs tail /aws/lambda/evo-uds-dev- --follow
```

### Ver Logs Específicos
```bash
# Drift Detection
aws logs tail /aws/lambda/evo-uds-dev-DriftDetection --follow

# ML Waste Detection
aws logs tail /aws/lambda/evo-uds-dev-MLWasteDetection --follow

# Auto Alerts
aws logs tail /aws/lambda/evo-uds-dev-AutoAlerts --follow

# Fetch Daily Costs
aws logs tail /aws/lambda/evo-uds-dev-FetchDailyCosts --follow
```

### Ver Últimas 100 Linhas
```bash
aws logs tail /aws/lambda/evo-uds-dev-SecurityScan --since 1h
```

---

## 🧪 Testes

### Testar Backend
```bash
cd backend
npm test
```

### Testar Infraestrutura
```bash
cd infra
npm test
```

### Testar Frontend
```bash
npm test
```

### Build Backend
```bash
cd backend
npm run build
```

### Lint
```bash
npm run lint
```

---

## 🌐 API

### Obter API URL
```bash
aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Api \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text
```

### Testar Endpoint (com token)
```bash
export API_URL="https://..."
export TOKEN="eyJhbGc..."

curl -X POST "${API_URL}security/drift-detection" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"regions": ["us-east-1"]}'
```

### Testar Todos os Endpoints
```bash
# Security
curl -X POST "${API_URL}security/scan" -H "Authorization: Bearer $TOKEN"
curl -X POST "${API_URL}security/compliance-scan" -H "Authorization: Bearer $TOKEN"
curl -X POST "${API_URL}security/guardduty-scan" -H "Authorization: Bearer $TOKEN"
curl -X GET "${API_URL}security/findings" -H "Authorization: Bearer $TOKEN"
curl -X POST "${API_URL}security/drift-detection" -H "Authorization: Bearer $TOKEN"
curl -X POST "${API_URL}security/analyze-cloudtrail" -H "Authorization: Bearer $TOKEN"
curl -X POST "${API_URL}security/well-architected-scan" -H "Authorization: Bearer $TOKEN"

# Cost
curl -X POST "${API_URL}cost/finops-copilot" -H "Authorization: Bearer $TOKEN"
curl -X POST "${API_URL}cost/fetch-daily-costs" -H "Authorization: Bearer $TOKEN"
curl -X POST "${API_URL}cost/ml-waste-detection" -H "Authorization: Bearer $TOKEN"

# Monitoring
curl -X POST "${API_URL}monitoring/fetch-cloudwatch-metrics" -H "Authorization: Bearer $TOKEN"
curl -X POST "${API_URL}monitoring/auto-alerts" -H "Authorization: Bearer $TOKEN"
curl -X POST "${API_URL}monitoring/check-alert-rules" -H "Authorization: Bearer $TOKEN"

# Reports
curl -X POST "${API_URL}reports/generate-excel" -H "Authorization: Bearer $TOKEN"

# KB
curl -X POST "${API_URL}kb/ai-suggestions" -H "Authorization: Bearer $TOKEN"
```

---

## 📊 Monitoramento

### Abrir CloudWatch Dashboard
```bash
open "https://console.aws.amazon.com/cloudwatch/home#dashboards:name=evo-uds-dev"
```

### Ver Métricas de Lambda
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=evo-uds-dev-SecurityScan \
  --start-time 2025-12-11T00:00:00Z \
  --end-time 2025-12-11T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

### Ver Erros de Lambda
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=evo-uds-dev-SecurityScan \
  --start-time 2025-12-11T00:00:00Z \
  --end-time 2025-12-11T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

---

## 🔐 Secrets

### Obter Database Secret
```bash
aws secretsmanager get-secret-value \
  --secret-id /dev/evo-uds/database/credentials \
  --query SecretString \
  --output text | jq
```

### Criar Novo Secret
```bash
aws secretsmanager create-secret \
  --name /dev/evo-uds/api-key \
  --secret-string '{"key":"value"}'
```

### Atualizar Secret
```bash
aws secretsmanager update-secret \
  --secret-id /dev/evo-uds/api-key \
  --secret-string '{"key":"new-value"}'
```

---

## 🗑️ Limpeza

### Deletar Logs Antigos
```bash
aws logs delete-log-group \
  --log-group-name /aws/lambda/evo-uds-dev-OldFunction
```

### Limpar Build Artifacts
```bash
cd backend && rm -rf dist node_modules
cd ../infra && rm -rf cdk.out node_modules
cd .. && rm -rf node_modules
```

### Reinstalar Dependências
```bash
cd backend && npm install
cd ../infra && npm install
cd .. && npm install
```

---

## 📦 Build & Package

### Build Backend
```bash
cd backend
npm run build
```

### Build Frontend
```bash
npm run build
```

### Package Lambda
```bash
cd backend
npm run build
cd dist
zip -r lambda.zip .
```

---

## 🔄 Git

### Status
```bash
git status
```

### Commit
```bash
git add .
git commit -m "feat: add 10 new Lambda functions"
git push
```

### Ver Mudanças
```bash
git diff
```

### Ver Histórico
```bash
git log --oneline -10
```

---

## 🚨 Troubleshooting

### Lambda Timeout
```bash
aws lambda update-function-configuration \
  --function-name evo-uds-dev-SecurityScan \
  --timeout 60
```

### Lambda Memory
```bash
aws lambda update-function-configuration \
  --function-name evo-uds-dev-SecurityScan \
  --memory-size 1024
```

### Reinvocar Lambda
```bash
aws lambda invoke \
  --function-name evo-uds-dev-SecurityScan \
  --payload '{"test": true}' \
  response.json
```

### Ver Configuração de Lambda
```bash
aws lambda get-function-configuration \
  --function-name evo-uds-dev-SecurityScan
```

### Ver Security Group
```bash
aws ec2 describe-security-groups \
  --group-ids sg-xxxxx
```

### Testar Conexão RDS
```bash
psql -h your-rds-endpoint.rds.amazonaws.com \
     -U postgres \
     -d evouds
```

---

## 📋 Checklist Rápido

### Antes de Deploy
- [ ] `cd backend && npm run build`
- [ ] `cd infra && cdk diff`
- [ ] Revisar mudanças
- [ ] Backup do banco (se prod)

### Depois de Deploy
- [ ] Verificar logs: `aws logs tail /aws/lambda/evo-uds-dev- --follow`
- [ ] Testar endpoints principais
- [ ] Verificar CloudWatch Dashboard
- [ ] Validar métricas

### Troubleshooting
- [ ] Ver logs de erro
- [ ] Verificar security groups
- [ ] Testar credenciais AWS
- [ ] Verificar DATABASE_URL
- [ ] Testar conexão RDS

---

## 🔗 Links Úteis

### AWS Console
- CloudFormation: https://console.aws.amazon.com/cloudformation
- Lambda: https://console.aws.amazon.com/lambda
- API Gateway: https://console.aws.amazon.com/apigateway
- RDS: https://console.aws.amazon.com/rds
- Cognito: https://console.aws.amazon.com/cognito
- CloudWatch: https://console.aws.amazon.com/cloudwatch

### Documentação
- AWS CDK: https://docs.aws.amazon.com/cdk/
- Prisma: https://www.prisma.io/docs
- AWS SDK v3: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/

---

**Última Atualização**: 2025-12-11  
**Versão**: 1.0
