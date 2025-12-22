# 🚀 Referência Rápida - Comandos Úteis

Comandos mais usados durante a migração e operação do sistema.

---

## 📦 Setup Inicial

### Backend
```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npm run build
```

### Infraestrutura
```bash
cd infra
npm install
cdk bootstrap  # Primeira vez apenas
cdk synth      # Ver CloudFormation gerado
```

### Frontend
```bash
npm install
npm run dev    # Desenvolvimento local
npm run build  # Build para produção
```

---

## 🏗️ AWS CDK

### Deploy
```bash
cd infra

# Deploy tudo (dev)
npm run deploy:dev

# Deploy tudo (prod)
npm run deploy:prod

# Deploy stack específico
cdk deploy EvoUds-dev-Database

# Deploy com hotswap (mais rápido, apenas dev)
cdk deploy --hotswap

# Deploy sem confirmação
cdk deploy --require-approval never
```

### Visualização
```bash
# Ver diferenças antes de deploy
cdk diff

# Ver CloudFormation template
cdk synth

# Listar stacks
cdk list
```

### Destruição
```bash
# Destruir tudo (CUIDADO!)
cdk destroy --all

# Destruir stack específico
cdk destroy EvoUds-dev-Api
```

---

## 🗄️ Banco de Dados (Prisma)

### Migrações
```bash
cd backend

# Criar nova migração
npx prisma migrate dev --name nome_da_migracao

# Aplicar migrações (prod)
npx prisma migrate deploy

# Resetar banco (DEV ONLY!)
npx prisma migrate reset

# Ver status das migrações
npx prisma migrate status
```

### Prisma Studio
```bash
# Abrir interface visual
npx prisma studio
```

### Geração de Cliente
```bash
# Gerar cliente Prisma após mudanças no schema
npx prisma generate

# Forçar regeneração
npx prisma generate --force
```

### Seed
```bash
# Popular banco com dados de teste
npx prisma db seed
```

---

## 🔐 AWS Cognito

### Criar Usuário
```bash
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username user@example.com \
  --user-attributes \
    Name=email,Value=user@example.com \
    Name=email_verified,Value=true \
  --temporary-password TempPass123!
```

### Atualizar Atributos
```bash
aws cognito-idp admin-update-user-attributes \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username user@example.com \
  --user-attributes \
    Name=custom:organization_id,Value=ORG_UUID \
    Name=custom:roles,Value='["admin"]'
```

### Listar Usuários
```bash
aws cognito-idp list-users \
  --user-pool-id us-east-1_XXXXXXXXX
```

### Deletar Usuário
```bash
aws cognito-idp admin-delete-user \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username user@example.com
```

### Resetar Senha
```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username user@example.com \
  --password NewPass123! \
  --permanent
```

---

## 📊 CloudWatch Logs

### Ver Logs em Tempo Real
```bash
# Lambda específica
aws logs tail /aws/lambda/evo-uds-dev-SecurityScan --follow

# Últimas 1 hora
aws logs tail /aws/lambda/evo-uds-dev-SecurityScan --since 1h

# Filtrar por texto
aws logs tail /aws/lambda/evo-uds-dev-SecurityScan \
  --follow \
  --filter-pattern "ERROR"
```

### Buscar Logs
```bash
# Buscar em período específico
aws logs filter-log-events \
  --log-group-name /aws/lambda/evo-uds-dev-SecurityScan \
  --start-time $(date -u -d '1 hour ago' +%s)000 \
  --filter-pattern "ERROR"
```

---

## 🔍 RDS

### Conectar ao Banco
```bash
# Obter endpoint
export DB_HOST=$(aws rds describe-db-instances \
  --db-instance-identifier evo-uds-dev \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

# Obter credenciais
export DB_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id /dev/evo-uds/database/credentials \
  --query SecretString \
  --output text)

export DB_USER=$(echo $DB_SECRET | jq -r .username)
export DB_PASS=$(echo $DB_SECRET | jq -r .password)

# Conectar
psql -h $DB_HOST -U $DB_USER -d evouds
```

### Backup Manual
```bash
# Criar snapshot
aws rds create-db-snapshot \
  --db-instance-identifier evo-uds-dev \
  --db-snapshot-identifier evo-uds-dev-manual-$(date +%Y%m%d-%H%M%S)
```

### Restaurar Snapshot
```bash
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier evo-uds-dev-restored \
  --db-snapshot-identifier evo-uds-dev-manual-20251211-120000
```

---

## 🌐 API Gateway

### Testar Endpoint
```bash
# Obter URL da API
export API_URL=$(aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Api \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text)

# Testar sem autenticação
curl $API_URL/health

# Testar com autenticação
curl -H "Authorization: Bearer $TOKEN" \
  $API_URL/security/findings
```

### Ver Logs
```bash
aws logs tail /aws/apigateway/evo-uds-dev --follow
```

---

## 📦 S3 & CloudFront

### Deploy Frontend
```bash
# Build
npm run build

# Sync para S3
aws s3 sync dist/ s3://evo-uds-dev-frontend-ACCOUNT_ID/ \
  --delete \
  --cache-control "public, max-age=31536000, immutable"

# Invalidar cache do CloudFront
aws cloudfront create-invalidation \
  --distribution-id DISTRIBUTION_ID \
  --paths "/*"
```

### Listar Buckets
```bash
aws s3 ls
```

### Ver Conteúdo do Bucket
```bash
aws s3 ls s3://evo-uds-dev-frontend-ACCOUNT_ID/ --recursive
```

---

## 🔧 Lambda

### Invocar Lambda Diretamente
```bash
# Invocar com payload
aws lambda invoke \
  --function-name evo-uds-dev-SecurityScan \
  --payload '{"accountId":"123"}' \
  response.json

# Ver resposta
cat response.json | jq
```

### Atualizar Código
```bash
# Build
cd backend && npm run build

# Atualizar função
aws lambda update-function-code \
  --function-name evo-uds-dev-SecurityScan \
  --zip-file fileb://dist/security-scan.zip
```

### Ver Configuração
```bash
aws lambda get-function-configuration \
  --function-name evo-uds-dev-SecurityScan
```

---

## 🔐 Secrets Manager

### Criar Secret
```bash
aws secretsmanager create-secret \
  --name /dev/evo-uds/api-key \
  --secret-string "my-secret-value"
```

### Obter Secret
```bash
aws secretsmanager get-secret-value \
  --secret-id /dev/evo-uds/api-key \
  --query SecretString \
  --output text
```

### Atualizar Secret
```bash
aws secretsmanager update-secret \
  --secret-id /dev/evo-uds/api-key \
  --secret-string "new-secret-value"
```

---

## 📊 CloudWatch Metrics

### Ver Métricas
```bash
# Lambda invocations
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=evo-uds-dev-SecurityScan \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

### Criar Alarme
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name evo-uds-dev-api-errors \
  --alarm-description "API Gateway 5xx errors" \
  --metric-name 5XXError \
  --namespace AWS/ApiGateway \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2
```

---

## 🧪 Testes

### Backend
```bash
cd backend

# Rodar todos os testes
npm test

# Testes com coverage
npm run test:coverage

# Testes em watch mode
npm run test:watch

# Teste específico
npm test -- security-scan.test.ts
```

### Frontend
```bash
# Rodar testes
npm test

# Testes E2E (se configurado)
npm run test:e2e
```

---

## 🔄 CI/CD

### GitHub Actions (exemplo)
```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run build
      - run: cdk deploy --require-approval never
```

---

## 🐛 Debug

### Lambda Local (SAM)
```bash
# Instalar SAM CLI
brew install aws-sam-cli

# Invocar localmente
sam local invoke SecurityScan \
  --event events/security-scan.json
```

### Prisma Debug
```bash
# Ver queries SQL
DEBUG=prisma:query npx prisma studio
```

### AWS CLI Debug
```bash
# Ver requests HTTP
aws s3 ls --debug
```

---

## 📋 Variáveis de Ambiente

### Obter Outputs do CDK
```bash
# Todos os outputs
aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Api \
  --query 'Stacks[0].Outputs'

# Output específico
aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Api \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text
```

### Criar .env Automaticamente
```bash
cat > .env << EOF
API_URL=$(aws cloudformation describe-stacks --stack-name EvoUds-dev-Api --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text)
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name EvoUds-dev-Auth --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text)
USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks --stack-name EvoUds-dev-Auth --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' --output text)
EOF
```

---

## 🧹 Limpeza

### Limpar Logs Antigos
```bash
# Deletar log groups antigos
aws logs describe-log-groups \
  --query 'logGroups[*].logGroupName' \
  --output text | \
  xargs -I {} aws logs delete-log-group --log-group-name {}
```

### Limpar Snapshots Antigos
```bash
# Listar snapshots
aws rds describe-db-snapshots \
  --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime]'

# Deletar snapshot
aws rds delete-db-snapshot \
  --db-snapshot-identifier snapshot-id
```

---

## 📚 Recursos Úteis

### AWS CLI
```bash
# Configurar perfil
aws configure --profile evo-uds

# Usar perfil
export AWS_PROFILE=evo-uds

# Ver configuração atual
aws configure list
```

### jq (JSON processor)
```bash
# Instalar
brew install jq  # macOS
apt install jq   # Linux

# Exemplos
echo '{"name":"test"}' | jq .name
aws s3api list-buckets | jq '.Buckets[].Name'
```

---

**Última atualização**: 2025-12-11
