# 🚀 Guia de Deploy - EVO UDS AWS

## 📋 Pré-requisitos

### Ferramentas Necessárias
- ✅ Node.js 20.x ou superior
- ✅ AWS CLI configurado
- ✅ AWS CDK CLI: `npm install -g aws-cdk`
- ✅ Git
- ✅ jq (para parsing de JSON)

### Permissões AWS
- Administrador ou permissões para:
  - CloudFormation, VPC, EC2, RDS, Lambda
  - API Gateway, Cognito, S3, CloudFront
  - IAM, CloudWatch, Secrets Manager

---

## 🎯 Deploy Rápido (15 minutos)

### 1. Preparar Ambiente

```bash
# Clone o repositório (se ainda não fez)
git clone <repo-url>
cd evo-uds-main

# Instalar dependências
cd backend && npm install
cd ../infra && npm install
cd ../scripts && npm install
cd ..
```

### 2. Configurar AWS CLI

```bash
# Verificar configuração
aws configure list

# Se necessário, configurar
aws configure
# AWS Access Key ID: [sua key]
# AWS Secret Access Key: [seu secret]
# Default region: us-east-1
# Default output format: json

# Testar acesso
aws sts get-caller-identity
```

### 3. Bootstrap CDK (Primeira vez apenas)

```bash
cd infra

# Bootstrap na região us-east-1
cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/us-east-1

# Se usar outras regiões, bootstrap nelas também
# cdk bootstrap aws://ACCOUNT-ID/us-west-2
```

### 4. Build do Backend

```bash
cd ../backend

# Build das Lambdas
npm run build

# Verificar se gerou os arquivos
ls -la dist/
```

### 5. Deploy da Infraestrutura

```bash
cd ../infra

# Ver o que será criado (opcional)
cdk diff

# Deploy de tudo (ambiente dev)
npm run deploy:dev

# Ou deploy stack por stack (recomendado para primeira vez)
cdk deploy EvoUds-dev-Network --require-approval never
cdk deploy EvoUds-dev-Database --require-approval never
cdk deploy EvoUds-dev-Auth --require-approval never
cdk deploy EvoUds-dev-Api --require-approval never
cdk deploy EvoUds-dev-Frontend --require-approval never
cdk deploy EvoUds-dev-Monitoring --require-approval never
```

**⏱️ Tempo estimado**: 15-20 minutos

### 6. Capturar Outputs

```bash
# Salvar outputs importantes
aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Database \
  --query 'Stacks[0].Outputs' > outputs-database.json

aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Auth \
  --query 'Stacks[0].Outputs' > outputs-auth.json

aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Api \
  --query 'Stacks[0].Outputs' > outputs-api.json

aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Frontend \
  --query 'Stacks[0].Outputs' > outputs-frontend.json

# Capturar Distribution ID do CloudFront para invalidação
export CLOUDFRONT_DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Frontend \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
  --output text)

echo "CloudFront Distribution ID: $CLOUDFRONT_DISTRIBUTION_ID"

# Ou usar script helper
./scripts/get-outputs.sh
```

### 7. Aplicar Migrações do Banco

```bash
cd ../backend

# Obter endpoint do RDS
export DB_HOST=$(aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Database \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' \
  --output text)

# Obter credenciais do Secrets Manager
export DB_SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Database \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecretArn`].OutputValue' \
  --output text)

export DB_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id $DB_SECRET_ARN \
  --query SecretString \
  --output text)

export DB_USER=$(echo $DB_SECRET | jq -r .username)
export DB_PASS=$(echo $DB_SECRET | jq -r .password)

# Configurar DATABASE_URL
export DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:5432/evouds"

# Aplicar migrações
npx prisma migrate deploy

# Verificar
npx prisma db pull
```

### 8. Criar Usuário de Teste

```bash
# Obter User Pool ID
export USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Auth \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text)

# Criar usuário admin
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username admin@example.com \
  --user-attributes \
    Name=email,Value=admin@example.com \
    Name=email_verified,Value=true \
    Name=name,Value="Admin User" \
  --temporary-password TempPass123!

# Definir senha permanente
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username admin@example.com \
  --password AdminPass123! \
  --permanent

# Criar organização no banco
psql $DATABASE_URL << EOF
INSERT INTO organizations (id, name, slug) 
VALUES (gen_random_uuid(), 'Test Organization', 'test-org');

INSERT INTO profiles (id, user_id, organization_id, full_name, role)
SELECT gen_random_uuid(), 'admin@example.com', id, 'Admin User', 'admin'
FROM organizations WHERE slug = 'test-org';
EOF
```

### 9. Testar Endpoints

```bash
# Obter URL da API
export API_URL=$(aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Api \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text)

echo "API URL: $API_URL"

# Testar health check (não requer autenticação)
curl "${API_URL}monitoring/health"

# Para testar endpoints autenticados, obter token via Cognito
# (usar Postman ou script de autenticação)
```

---

## 🔍 Validação Pós-Deploy

### Checklist Rápido

```bash
# 1. Verificar stacks criadas
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE \
  --query 'StackSummaries[?contains(StackName, `EvoUds-dev`)].StackName'

# 2. Verificar RDS
aws rds describe-db-instances \
  --query 'DBInstances[?DBInstanceIdentifier==`evo-uds-dev`].[DBInstanceStatus,Endpoint.Address]'

# 3. Verificar Lambdas
aws lambda list-functions \
  --query 'Functions[?contains(FunctionName, `evo-uds-dev`)].FunctionName'

# 4. Verificar API Gateway
aws apigateway get-rest-apis \
  --query 'items[?name==`evo-uds-dev`].[id,name]'

# 5. Verificar Cognito
aws cognito-idp list-user-pools \
  --max-results 10 \
  --query 'UserPools[?Name==`evo-uds-dev`].[Id,Name]'

# 6. Testar conexão com banco
psql $DATABASE_URL -c "SELECT COUNT(*) FROM organizations;"
```

### Verificar Logs

```bash
# Logs da Lambda
aws logs tail /aws/lambda/evo-uds-dev-SecurityScan --follow

# Logs do API Gateway
aws logs tail /aws/apigateway/evo-uds-dev --follow

# Logs do RDS
aws logs tail /aws/rds/instance/evo-uds-dev/postgresql --follow
```

---

## 🐛 Troubleshooting

### Erro: "Unable to connect to database"

```bash
# Verificar security group
aws ec2 describe-security-groups \
  --filters "Name=tag:Name,Values=*Database*" \
  --query 'SecurityGroups[*].[GroupId,GroupName,IpPermissions]'

# Verificar se Lambda está na VPC
aws lambda get-function-configuration \
  --function-name evo-uds-dev-SecurityScan \
  --query 'VpcConfig'
```

### Erro: "Cognito token invalid"

```bash
# Verificar authorizer
aws apigateway get-authorizers \
  --rest-api-id $(aws apigateway get-rest-apis --query 'items[?name==`evo-uds-dev`].id' --output text)

# Verificar User Pool
aws cognito-idp describe-user-pool \
  --user-pool-id $USER_POOL_ID
```

### Erro: "Lambda timeout"

```bash
# Aumentar timeout
aws lambda update-function-configuration \
  --function-name evo-uds-dev-SecurityScan \
  --timeout 60

# Aumentar memory
aws lambda update-function-configuration \
  --function-name evo-uds-dev-SecurityScan \
  --memory-size 1024
```

### Erro: "CDK bootstrap required"

```bash
# Bootstrap novamente
cdk bootstrap --force
```

---

## 🔄 Atualizar Deploy

### Atualizar Frontend (com invalidação automática)

```bash
# Deploy completo do frontend
npm run deploy:frontend

# Deploy para produção
npm run deploy:frontend:prod

# Deploy manual com opções
./scripts/deploy-frontend.sh --env=development --verbose

# Apenas invalidar cache (sem rebuild)
npm run invalidate-cloudfront

# Verificar status das invalidações
npm run invalidate-cloudfront:check

# Ver histórico de invalidações
npm run invalidate-cloudfront:list
```

### Atualizar Lambdas

```bash
cd backend
npm run build

cd ../infra
cdk deploy EvoUds-dev-Api --hotswap
```

### Atualizar Infraestrutura

```bash
cd infra
cdk deploy EvoUds-dev-Network
# ou
cdk deploy --all
```

### Invalidação Manual do CloudFront

```bash
# Obter Distribution ID
export DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Frontend \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
  --output text)

# Invalidar todos os arquivos
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"

# Invalidar arquivos específicos
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/index.html" "/assets/*"

# Verificar status da invalidação
aws cloudfront list-invalidations \
  --distribution-id $DISTRIBUTION_ID \
  --query "InvalidationList.Items[0].{Id:Id,Status:Status,CreateTime:CreateTime}"
```

### Rollback

```bash
# Ver histórico de stacks
aws cloudformation describe-stack-events \
  --stack-name EvoUds-dev-Api \
  --max-items 10

# Rollback (se necessário)
aws cloudformation cancel-update-stack \
  --stack-name EvoUds-dev-Api
```

---

## 🧹 Destruir Ambiente

```bash
cd infra

# Destruir tudo (CUIDADO!)
cdk destroy --all

# Ou stack por stack
cdk destroy EvoUds-dev-Monitoring
cdk destroy EvoUds-dev-Frontend
cdk destroy EvoUds-dev-Api
cdk destroy EvoUds-dev-Auth
cdk destroy EvoUds-dev-Database
cdk destroy EvoUds-dev-Network
```

---

## 📊 Monitoramento

### Dashboard CloudWatch

```bash
# Abrir dashboard
open "https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=evo-uds-dev"
```

### Métricas Importantes

- **API Gateway**: Requests, Latency, 4xx, 5xx
- **Lambda**: Invocations, Duration, Errors, Throttles
- **RDS**: CPU, Connections, IOPS, Storage
- **CloudFront**: Requests, BytesDownloaded, 4xxErrorRate, 5xxErrorRate, OriginLatency

### Monitoramento do CloudFront

```bash
# Métricas do CloudFront
aws cloudwatch get-metric-statistics \
  --namespace AWS/CloudFront \
  --metric-name Requests \
  --dimensions Name=DistributionId,Value=$DISTRIBUTION_ID \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum

# Taxa de erro 4xx/5xx
aws cloudwatch get-metric-statistics \
  --namespace AWS/CloudFront \
  --metric-name 4xxErrorRate \
  --dimensions Name=DistributionId,Value=$DISTRIBUTION_ID \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average
```

### Alarmes

```bash
# Listar alarmes
aws cloudwatch describe-alarms \
  --alarm-name-prefix evo-uds-dev

# Ver estado dos alarmes
aws cloudwatch describe-alarms \
  --state-value ALARM

# Criar alarme para CloudFront (alta taxa de erro)
aws cloudwatch put-metric-alarm \
  --alarm-name "evo-uds-dev-cloudfront-4xx-errors" \
  --alarm-description "CloudFront 4xx error rate too high" \
  --metric-name 4xxErrorRate \
  --namespace AWS/CloudFront \
  --statistic Average \
  --period 300 \
  --threshold 5.0 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=DistributionId,Value=$DISTRIBUTION_ID \
  --evaluation-periods 2
```

---

## 💰 Custos

### Estimar Custos

```bash
# Usar AWS Cost Explorer
aws ce get-cost-and-usage \
  --time-period Start=2025-12-01,End=2025-12-11 \
  --granularity DAILY \
  --metrics UnblendedCost \
  --group-by Type=TAG,Key=Environment
```

### Configurar Budget

```bash
# Criar budget de $50/mês
aws budgets create-budget \
  --account-id $(aws sts get-caller-identity --query Account --output text) \
  --budget file://budget.json
```

---

## 🎓 Próximos Passos

1. ✅ Validar que tudo funciona
2. ✅ Implementar invalidação automática do CloudFront
3. ⏳ Implementar Lambdas restantes
4. ⏳ Migrar frontend
5. ⏳ Configurar CI/CD
6. ⏳ Deploy em produção

## 📚 Guias Relacionados

- [📋 Guia de Invalidação do CloudFront](./CLOUDFRONT_INVALIDATION_GUIDE.md)
- [🔧 Scripts de Deploy](./scripts/)
- [📊 Monitoramento](./MONITORING_GUIDE.md)

---

**Tempo total estimado**: 30-45 minutos  
**Custo estimado (dev)**: ~$35/mês  
**Status**: ✅ Pronto para deploy com invalidação automática
