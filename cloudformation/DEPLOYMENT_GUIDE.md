# 🚀 EVO UDS - Guia de Implantação CloudFormation

## 📋 Visão Geral

Este guia explica como implantar toda a infraestrutura EVO UDS em uma nova conta AWS usando CloudFormation.

## 🎯 Arquitetura Implantada

### Stacks Criados

1. **Network Stack** - VPC, Subnets, NAT Gateway, Security Groups
2. **Database Stack** - RDS PostgreSQL com backups e monitoring
3. **DynamoDB Stack** - Tabelas Organizations e Profiles
4. **Cognito Stack** - User Pool, Identity Pool, grupos de usuários
5. **Lambda Stack** - Funções Lambda e roles IAM
6. **API Gateway Stack** - API REST com autenticação Cognito
7. **Frontend Stack** - S3 + CloudFront para hospedagem
8. **Monitoring Stack** - CloudWatch Alarms e Dashboards

### Recursos Criados

- ✅ VPC com subnets públicas e privadas em 2 AZs
- ✅ NAT Gateway para acesso à internet das subnets privadas
- ✅ RDS PostgreSQL 15.4 com encryption, backups e Performance Insights
- ✅ DynamoDB tables com encryption e streams
- ✅ Cognito User Pool com MFA opcional
- ✅ API Gateway com autenticação
- ✅ CloudFront distribution para frontend
- ✅ CloudWatch Alarms para monitoramento
- ✅ Secrets Manager para credenciais
- ✅ VPC Endpoints para S3 e DynamoDB

## 📦 Pré-requisitos

### 1. Conta AWS

- Conta AWS com permissões de administrador
- AWS CLI configurado
- Região: us-east-1 (recomendado)

### 2. Ferramentas

```bash
# AWS CLI
aws --version  # >= 2.0

# jq (para processar JSON)
jq --version

# Node.js (para build do frontend)
node --version  # >= 18.0
```

### 3. Preparar Templates

```bash
# Criar bucket S3 para templates
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export PROJECT_NAME=evo-uds
export REGION=us-east-1

aws s3 mb s3://${PROJECT_NAME}-cloudformation-${AWS_ACCOUNT_ID} --region ${REGION}

# Upload dos templates
aws s3 sync cloudformation/ s3://${PROJECT_NAME}-cloudformation-${AWS_ACCOUNT_ID}/ \
  --exclude "*.md" \
  --exclude "deploy-*.sh"
```

## 🚀 Implantação

### Opção 1: Deploy via Console AWS (Recomendado para Primeira Vez)

1. **Acesse o CloudFormation Console**
   ```
   https://console.aws.amazon.com/cloudformation/home?region=us-east-1
   ```

2. **Criar Stack**
   - Clique em "Create stack" → "With new resources"
   - Template source: "Amazon S3 URL"
   - URL: `https://evo-uds-cloudformation-${AWS_ACCOUNT_ID}.s3.amazonaws.com/master-stack.yaml`

3. **Preencher Parâmetros**
   ```
   Environment: production
   ProjectName: evo-uds
   AdminEmail: seu-email@example.com
   
   # Network (usar defaults ou customizar)
   VpcCIDR: 10.0.0.0/16
   
   # Database
   DBInstanceClass: db.t3.micro (dev) ou db.t3.medium (prod)
   DBAllocatedStorage: 20 (dev) ou 100 (prod)
   
   # Domain (opcional)
   DomainName: (deixar vazio ou seu domínio)
   CertificateArn: (deixar vazio ou ARN do certificado)
   ```

4. **Configurar Opções**
   - Tags: adicionar tags conforme necessário
   - Permissions: usar role existente ou criar nova
   - Stack failure options: "Roll back all stack resources"

5. **Review e Create**
   - Revisar todos os parâmetros
   - Marcar: "I acknowledge that AWS CloudFormation might create IAM resources"
   - Clicar em "Submit"

6. **Aguardar Conclusão**
   - Tempo estimado: 15-25 minutos
   - Monitorar na aba "Events"

### Opção 2: Deploy via AWS CLI

```bash
# Definir variáveis
export ENVIRONMENT=production
export PROJECT_NAME=evo-uds
export ADMIN_EMAIL=admin@example.com
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Deploy do master stack
aws cloudformation create-stack \
  --stack-name ${PROJECT_NAME}-${ENVIRONMENT}-master \
  --template-url https://${PROJECT_NAME}-cloudformation-${AWS_ACCOUNT_ID}.s3.amazonaws.com/master-stack.yaml \
  --parameters \
    ParameterKey=Environment,ParameterValue=${ENVIRONMENT} \
    ParameterKey=ProjectName,ParameterValue=${PROJECT_NAME} \
    ParameterKey=AdminEmail,ParameterValue=${ADMIN_EMAIL} \
    ParameterKey=DBInstanceClass,ParameterValue=db.t3.micro \
    ParameterKey=DBAllocatedStorage,ParameterValue=20 \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# Monitorar progresso
aws cloudformation wait stack-create-complete \
  --stack-name ${PROJECT_NAME}-${ENVIRONMENT}-master \
  --region us-east-1

# Ver outputs
aws cloudformation describe-stacks \
  --stack-name ${PROJECT_NAME}-${ENVIRONMENT}-master \
  --query 'Stacks[0].Outputs' \
  --region us-east-1
```

### Opção 3: Deploy via Script Automatizado

```bash
# Usar o script de deploy
chmod +x cloudformation/deploy-infrastructure.sh
./cloudformation/deploy-infrastructure.sh production admin@example.com
```

## 📊 Verificar Implantação

### 1. Obter Outputs

```bash
aws cloudformation describe-stacks \
  --stack-name evo-uds-production-master \
  --query 'Stacks[0].Outputs' \
  --output table
```

### 2. Salvar Configurações

```bash
# Criar arquivo .env com outputs
cat > .env.production << EOF
# AWS Region
AWS_REGION=us-east-1
VITE_AWS_REGION=us-east-1

# Cognito
VITE_AWS_USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name evo-uds-production-master --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text)
VITE_AWS_USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks --stack-name evo-uds-production-master --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' --output text)

# API Gateway
VITE_API_BASE_URL=$(aws cloudformation describe-stacks --stack-name evo-uds-production-master --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text)

# Database
DATABASE_URL=postgresql://postgres:PASSWORD@$(aws cloudformation describe-stacks --stack-name evo-uds-production-master --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' --output text):5432/evouds

# CloudFront
VITE_CLOUDFRONT_DOMAIN=$(aws cloudformation describe-stacks --stack-name evo-uds-production-master --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDomain`].OutputValue' --output text)
EOF

echo "✅ Configurações salvas em .env.production"
```

## 🔐 Pós-Implantação

### 1. Obter Senha do Banco de Dados

```bash
# Obter ARN do secret
SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name evo-uds-production-master \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecretArn`].OutputValue' \
  --output text)

# Obter credenciais
aws secretsmanager get-secret-value \
  --secret-id $SECRET_ARN \
  --query SecretString \
  --output text | jq -r '.password'
```

### 2. Criar Usuário Admin no Cognito

```bash
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name evo-uds-production-master \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text)

# Criar usuário
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username admin-user \
  --user-attributes \
    Name=email,Value=admin@example.com \
    Name=email_verified,Value=true \
    Name=name,Value="Admin User" \
  --temporary-password TempPass123!

# Definir senha permanente
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username admin-user \
  --password AdminPass123! \
  --permanent

# Adicionar ao grupo admin
aws cognito-idp admin-add-user-to-group \
  --user-pool-id $USER_POOL_ID \
  --username admin-user \
  --group-name admin
```

### 3. Executar Migrations do Banco

```bash
# Atualizar DATABASE_URL no .env com a senha real
# Executar migrations
npx prisma migrate deploy
```

### 4. Deploy do Frontend

```bash
# Build do frontend
npm run build

# Upload para S3
FRONTEND_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name evo-uds-production-master \
  --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucket`].OutputValue' \
  --output text)

aws s3 sync dist/ s3://${FRONTEND_BUCKET}/ --delete

# Invalidar cache do CloudFront
DISTRIBUTION_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Origins.Items[0].DomainName=='${FRONTEND_BUCKET}.s3.amazonaws.com'].Id" \
  --output text)

aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"
```

### 5. Deploy das Funções Lambda

```bash
# Build do backend
cd backend
npm run build

# Deploy via script
./deploy-lambdas.sh production
```

## 💰 Estimativa de Custos

### Development
- VPC: $0 (free tier)
- NAT Gateway: ~$32/mês
- RDS db.t3.micro: ~$15/mês
- DynamoDB: ~$5/mês (pay-per-request)
- Lambda: ~$5/mês (1M requests)
- CloudFront: ~$10/mês
- **Total: ~$67/mês**

### Production
- VPC: $0
- NAT Gateway: ~$32/mês
- RDS db.t3.medium (Multi-AZ): ~$120/mês
- DynamoDB: ~$20/mês
- Lambda: ~$20/mês
- CloudFront: ~$50/mês
- **Total: ~$242/mês**

## 🔄 Atualização da Stack

```bash
# Atualizar templates no S3
aws s3 sync cloudformation/ s3://${PROJECT_NAME}-cloudformation-${AWS_ACCOUNT_ID}/

# Atualizar stack
aws cloudformation update-stack \
  --stack-name evo-uds-production-master \
  --template-url https://${PROJECT_NAME}-cloudformation-${AWS_ACCOUNT_ID}.s3.amazonaws.com/master-stack.yaml \
  --parameters \
    ParameterKey=Environment,UsePreviousValue=true \
    ParameterKey=ProjectName,UsePreviousValue=true \
    ParameterKey=AdminEmail,UsePreviousValue=true \
  --capabilities CAPABILITY_NAMED_IAM
```

## 🗑️ Remoção da Stack

```bash
# ATENÇÃO: Isso vai deletar TODOS os recursos!

# Esvaziar buckets S3 primeiro
FRONTEND_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name evo-uds-production-master \
  --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucket`].OutputValue' \
  --output text)

aws s3 rm s3://${FRONTEND_BUCKET}/ --recursive

# Deletar stack
aws cloudformation delete-stack \
  --stack-name evo-uds-production-master

# Aguardar conclusão
aws cloudformation wait stack-delete-complete \
  --stack-name evo-uds-production-master
```

## 🆘 Troubleshooting

### Stack Falhou ao Criar

```bash
# Ver eventos de erro
aws cloudformation describe-stack-events \
  --stack-name evo-uds-production-master \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`]' \
  --output table

# Deletar e tentar novamente
aws cloudformation delete-stack --stack-name evo-uds-production-master
```

### RDS Não Conecta

- Verificar Security Groups
- Verificar se Lambda está na mesma VPC
- Verificar credenciais no Secrets Manager

### CloudFront Não Atualiza

```bash
# Invalidar cache
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"
```

## 📞 Suporte

- Documentação AWS CloudFormation: https://docs.aws.amazon.com/cloudformation/
- AWS Support: https://console.aws.amazon.com/support/

---

**Criado em**: 2024-12-16  
**Versão**: 1.0.0  
**Status**: ✅ Pronto para Produção
