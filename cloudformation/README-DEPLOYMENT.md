# EVO Platform - CloudFormation Deployment Guide

## Overview

Este guia descreve como implantar a infraestrutura completa da plataforma EVO usando CloudFormation.

## Arquivos CloudFormation

| Arquivo | Descrição |
|---------|-----------|
| `evo-master-stack.yaml` | Stack principal com VPC, RDS, Cognito, API Gateway, CloudFront, WAF |
| `evo-complete-stack.yaml` | Stack com todas as 203 Lambdas e 146 endpoints (gerado automaticamente) |

### Gerar Template de Lambdas

O template `evo-complete-stack.yaml` é gerado automaticamente pelo script:

```bash
npx tsx scripts/generate-cloudformation.ts
```

Este script:
1. Lê a lista de 203 handlers definidos
2. Gera recursos CloudFormation para cada Lambda
3. Gera endpoints API Gateway para handlers públicos (146)
4. Gera outputs para todos os recursos

## Arquitetura

O template `evo-master-stack.yaml` cria os seguintes recursos:

### Rede (VPC)
- VPC com CIDR configurável (default: 10.0.0.0/16)
- 2 Subnets públicas (para NAT Gateway)
- 2 Subnets privadas (para Lambda)
- 2 Subnets de banco de dados (isoladas)
- NAT Gateway para acesso à internet das Lambdas
- VPC Endpoints para S3 e DynamoDB (sem custo)

### Banco de Dados
- RDS PostgreSQL 15.10 com instâncias Graviton (ARM)
- **RDS Proxy** para connection pooling (recomendado para Lambda)
- Secrets Manager para credenciais
- Multi-AZ em produção
- Performance Insights habilitado
- Backups automáticos (30 dias em produção)

### RDS Proxy (Novo!)
- Connection pooling automático para Lambda
- Reduz conexões ao banco de dados
- Melhora performance em cenários de alta concorrência
- TLS obrigatório para conexões seguras
- Habilitado por padrão (pode ser desabilitado via parâmetro)

### Autenticação
- Cognito User Pool com atributos customizados
- MFA opcional (TOTP)
- Atributos: organization_id, organization_name, roles, tenant_id

### API Gateway
- REST API com Cognito Authorizer
- CORS configurado para todos os endpoints
- Rate limiting (1000 req/s, burst 2000)
- Logging e métricas habilitados

### Lambda Functions
- **203 funções Lambda** organizadas em 26 categorias
- **146 endpoints API Gateway** com autenticação Cognito
- **57 handlers internos/agendados** (sem endpoint público)
- Layer compartilhado com dependências (Prisma, Zod, AWS SDK, Azure SDK)
- VPC-enabled para acesso ao RDS/RDS Proxy

### Categorias de Handlers
| Categoria | Handlers | Descrição |
|-----------|----------|-----------|
| admin | 20 | Administração e gerenciamento |
| ai | 8 | IA e Bedrock |
| auth | 14 | Autenticação e MFA |
| aws | 3 | Credenciais AWS |
| azure | 23 | Multi-cloud Azure |
| cloud | 1 | Credenciais unificadas |
| cost | 12 | FinOps e custos |
| dashboard | 3 | Dashboards executivos |
| data | 5 | Dados e tickets |
| debug | 3 | Debug interno |
| integrations | 2 | Integrações externas |
| jobs | 13 | Jobs em background |
| kb | 7 | Knowledge Base |
| license | 9 | Licenciamento |
| maintenance | 2 | Manutenção |
| ml | 5 | Machine Learning |
| monitoring | 17 | Monitoramento |
| notifications | 4 | Notificações |
| organizations | 2 | Organizações |
| profiles | 3 | Perfis de usuário |
| reports | 5 | Relatórios |
| security | 28 | Segurança e compliance |
| storage | 3 | Armazenamento S3 |
| system | 8 | Sistema e migrações |
| user | 1 | Configurações de usuário |
| websocket | 2 | WebSocket |

### Frontend
- S3 Bucket para assets estáticos
- CloudFront Distribution com HTTP/2 e HTTP/3
- WAF Web ACL com regras de segurança

### Monitoramento
- CloudWatch Alarms para API e Database
- SNS Topic para alertas por email
- Dashboard de monitoramento

## Pré-requisitos

1. **AWS CLI v2** configurado com credenciais
2. **Node.js 18+** instalado
3. **jq** instalado (para parsing de JSON)

```bash
# Verificar AWS CLI
aws --version

# Verificar credenciais
aws sts get-caller-identity

# Verificar Node.js
node --version

# Instalar jq (macOS)
brew install jq

# Instalar jq (Linux)
sudo apt-get install jq
```

## Deploy Rápido (5 minutos)

```bash
# 1. Deploy da infraestrutura
./cloudformation/deploy-stack.sh \
  --stack-name evo-uds-v3-production \
  --region us-east-1 \
  --environment production \
  --alert-email admin@example.com

# 2. Aguardar conclusão (15-30 minutos)
# O script aguarda automaticamente

# 3. Os outputs serão exibidos ao final
```

## Deploy Passo a Passo

### 1. Validar Template

```bash
aws cloudformation validate-template \
  --template-body file://cloudformation/evo-master-stack.yaml \
  --region us-east-1
```

### 2. Criar Stack

```bash
aws cloudformation create-stack \
  --stack-name evo-uds-v3-production \
  --template-body file://cloudformation/evo-master-stack.yaml \
  --parameters \
    ParameterKey=Environment,ParameterValue=production \
    ParameterKey=ProjectName,ParameterValue=evo-uds-v3 \
    ParameterKey=AlertEmail,ParameterValue=admin@example.com \
    ParameterKey=DBInstanceClass,ParameterValue=db.t3.small \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

### 3. Monitorar Progresso

```bash
# Via CLI - ver eventos
aws cloudformation describe-stack-events \
  --stack-name evo-uds-v3-production \
  --region us-east-1 \
  --query 'StackEvents[0:10].[Timestamp,ResourceStatus,ResourceType,LogicalResourceId]' \
  --output table

# Aguardar conclusão
aws cloudformation wait stack-create-complete \
  --stack-name evo-uds-v3-production \
  --region us-east-1
```

### 4. Obter Outputs

```bash
# Todos os outputs
aws cloudformation describe-stacks \
  --stack-name evo-uds-v3-production \
  --query 'Stacks[0].Outputs' \
  --output table \
  --region us-east-1

# Outputs específicos
LAMBDA_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name evo-uds-v3-production \
  --query 'Stacks[0].Outputs[?OutputKey==`LambdaCodeBucketName`].OutputValue' \
  --output text --region us-east-1)

FRONTEND_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name evo-uds-v3-production \
  --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' \
  --output text --region us-east-1)

CLOUDFRONT_ID=$(aws cloudformation describe-stacks \
  --stack-name evo-uds-v3-production \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
  --output text --region us-east-1)

USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name evo-uds-v3-production \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' \
  --output text --region us-east-1)
```

### 5. Criar Lambda Layer

```bash
# Instalar dependências e gerar Prisma Client
cd backend
npm install
npm run prisma:generate
cd ..

# Criar estrutura do layer
mkdir -p /tmp/lambda-layer/nodejs/node_modules
cp -r backend/node_modules/@prisma /tmp/lambda-layer/nodejs/node_modules/
cp -r backend/node_modules/.prisma /tmp/lambda-layer/nodejs/node_modules/
cp -r backend/node_modules/zod /tmp/lambda-layer/nodejs/node_modules/

# Copiar AWS SDK (se necessário)
node scripts/copy-deps.cjs backend /tmp/lambda-layer/nodejs \
  @aws-sdk/client-sts \
  @aws-sdk/client-bedrock-runtime \
  @aws-sdk/client-ses

# Criar zip
cd /tmp/lambda-layer
zip -qr deps-layer.zip nodejs
cd -

# Upload para S3
aws s3 cp /tmp/lambda-layer/deps-layer.zip \
  "s3://$LAMBDA_BUCKET/layers/deps-layer.zip" \
  --region us-east-1

# Atualizar layer no CloudFormation (ou via console)
```

### 6. Upload do Código Lambda

```bash
# Build do backend
npm run build --prefix backend

# Upload de todos os handlers
./scripts/upload-lambda-code.sh "$LAMBDA_BUCKET" us-east-1
```

### 7. Executar Migrações do Banco

```bash
# Obter credenciais do Secrets Manager
DB_SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name evo-uds-v3-production \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecretArn`].OutputValue' \
  --output text --region us-east-1)

DB_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name evo-uds-v3-production \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' \
  --output text --region us-east-1)

DB_CREDS=$(aws secretsmanager get-secret-value \
  --secret-id "$DB_SECRET_ARN" \
  --query SecretString \
  --output text --region us-east-1)

DB_USER=$(echo "$DB_CREDS" | jq -r '.username')
DB_PASS=$(echo "$DB_CREDS" | jq -r '.password')

# Executar migrações
DATABASE_URL="postgresql://$DB_USER:$DB_PASS@$DB_ENDPOINT:5432/evouds?schema=public" \
  npx prisma migrate deploy --schema backend/prisma/schema.prisma

# Ou invocar a Lambda db-init para verificar
aws lambda invoke \
  --function-name evo-uds-v3-production-db-init \
  --payload '{"action": "verify"}' \
  --region us-east-1 \
  /tmp/db-init-output.json

cat /tmp/db-init-output.json | jq
```

### 8. Deploy do Frontend

```bash
# Configurar variáveis de ambiente
cat > .env.production << EOF
VITE_COGNITO_USER_POOL_ID=$USER_POOL_ID
VITE_COGNITO_CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name evo-uds-v3-production \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolClientId`].OutputValue' \
  --output text --region us-east-1)
VITE_API_URL=$(aws cloudformation describe-stacks \
  --stack-name evo-uds-v3-production \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
  --output text --region us-east-1)
VITE_REGION=us-east-1
EOF

# Build
npm run build

# Deploy para S3
aws s3 sync dist/ "s3://$FRONTEND_BUCKET" --delete --region us-east-1

# Invalidar cache do CloudFront
aws cloudfront create-invalidation \
  --distribution-id "$CLOUDFRONT_ID" \
  --paths "/*" \
  --region us-east-1
```

### 9. Criar Usuário Admin

```bash
# Criar usuário
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username admin@example.com \
  --user-attributes \
    Name=email,Value=admin@example.com \
    Name=email_verified,Value=true \
  --temporary-password TempPass123! \
  --message-action SUPPRESS \
  --region us-east-1

# Definir senha permanente
aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username admin@example.com \
  --password AdminPass123! \
  --permanent \
  --region us-east-1

# Definir atributos customizados (após criar organização no banco)
aws cognito-idp admin-update-user-attributes \
  --user-pool-id "$USER_POOL_ID" \
  --username admin@example.com \
  --user-attributes \
    'Name=custom:organization_id,Value=ORG-UUID-HERE' \
    'Name=custom:roles,Value="[\"super_admin\"]"' \
  --region us-east-1
```

## Parâmetros do Template

| Parâmetro | Descrição | Default | Valores Permitidos |
|-----------|-----------|---------|-------------------|
| Environment | Ambiente | production | development, staging, production |
| ProjectName | Prefixo para recursos | evo-uds-v3 | - |
| VpcCidr | CIDR block da VPC | 10.0.0.0/16 | - |
| EnableNatGateway | Habilitar NAT Gateway | true | true, false |
| DBInstanceClass | Classe da instância RDS (Graviton) | db.t4g.small | db.t4g.micro, db.t4g.small, db.t4g.medium, db.t4g.large, db.r6g.large, db.r6g.xlarge, db.r6g.2xlarge, db.r7g.large, db.r7g.xlarge, db.r7g.2xlarge |
| EnableRDSProxy | Habilitar RDS Proxy | true | true, false |
| DBAllocatedStorage | Storage do RDS em GB | 20 | 20-1000 |
| DBMasterUsername | Username do banco | evoadmin | - |
| LambdaDefaultTimeout | Timeout padrão Lambda | 30 | 3-900 |
| LambdaDefaultMemory | Memória padrão Lambda | 256 | 128, 256, 512, 1024, 2048, 3008 |
| DomainName | Domínio customizado | (vazio) | - |
| CertificateArn | ARN do certificado ACM | (vazio) | - |
| AlertEmail | Email para alertas | admin@example.com | - |

### Notas sobre RDS Proxy

- **Recomendado para produção**: RDS Proxy melhora significativamente a performance em cenários de alta concorrência
- **Connection Pooling**: Reduz o número de conexões ao banco de dados
- **Failover mais rápido**: Em caso de failover Multi-AZ, o proxy mantém as conexões
- **TLS obrigatório**: Todas as conexões via proxy usam TLS
- **Custo adicional**: ~$0.015/hora por vCPU provisionada

### Instâncias Graviton (ARM)

O template usa instâncias Graviton (ARM) por padrão:
- **Melhor custo-benefício**: ~20% mais baratas que instâncias x86
- **Compatíveis com RDS Proxy**: Todas as instâncias listadas suportam RDS Proxy
- **Performance**: Melhor performance por dólar gasto

## Custos Estimados (us-east-1)

| Recurso | Custo Mensal |
|---------|--------------|
| RDS db.t4g.small (Multi-AZ) | ~$45 |
| RDS Proxy | ~$15-25 |
| NAT Gateway | ~$32 + $0.045/GB |
| CloudFront | ~$1-10 (depende do tráfego) |
| Lambda | ~$0-5 (depende do uso) |
| S3 | ~$1-5 |
| WAF | ~$5 |
| Secrets Manager | ~$0.40 |
| CloudWatch | ~$1-5 |
| **Total Estimado** | **~$100-145/mês** |

Para reduzir custos em desenvolvimento:
- Use `DBInstanceClass=db.t4g.micro`
- Desabilite Multi-AZ (`Environment=development`)
- Desabilite RDS Proxy (`EnableRDSProxy=false`) - não recomendado para produção
- Considere desabilitar NAT Gateway se não precisar de acesso externo

## Troubleshooting

### Stack falha na criação

```bash
# Ver eventos de erro
aws cloudformation describe-stack-events \
  --stack-name evo-uds-v3-production \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`].[Timestamp,LogicalResourceId,ResourceStatusReason]' \
  --output table \
  --region us-east-1
```

### Lambda não consegue acessar RDS

1. Verificar se Lambda está na VPC correta
2. Verificar Security Groups
3. Verificar se NAT Gateway está ativo

```bash
# Verificar VPC config da Lambda
aws lambda get-function-configuration \
  --function-name evo-uds-v3-production-query-table \
  --query 'VpcConfig' \
  --region us-east-1
```

### Erro de CORS

1. Verificar se OPTIONS está configurado no endpoint
2. Verificar headers CORS nas respostas Lambda
3. Verificar se o deployment do API Gateway foi feito

```bash
# Redeployar API Gateway
aws apigateway create-deployment \
  --rest-api-id $(aws cloudformation describe-stacks \
    --stack-name evo-uds-v3-production \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayId`].OutputValue' \
    --output text) \
  --stage-name prod \
  --region us-east-1
```

### Lambda retorna 502

1. Verificar logs do CloudWatch
2. Verificar se o layer está anexado
3. Verificar se os imports estão corretos

```bash
# Ver logs
aws logs tail /aws/lambda/evo-uds-v3-production-query-table \
  --since 10m \
  --region us-east-1
```

## Atualização do Stack

```bash
# Atualizar stack existente
aws cloudformation update-stack \
  --stack-name evo-uds-v3-production \
  --template-body file://cloudformation/evo-master-stack.yaml \
  --parameters \
    ParameterKey=Environment,UsePreviousValue=true \
    ParameterKey=ProjectName,UsePreviousValue=true \
    ParameterKey=AlertEmail,UsePreviousValue=true \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# Aguardar atualização
aws cloudformation wait stack-update-complete \
  --stack-name evo-uds-v3-production \
  --region us-east-1
```

## Limpeza

```bash
# ⚠️ CUIDADO: Isso remove TODOS os recursos!
# O RDS será snapshotted antes de deletar

# Esvaziar buckets S3 primeiro
aws s3 rm "s3://$FRONTEND_BUCKET" --recursive
aws s3 rm "s3://$LAMBDA_BUCKET" --recursive

# Deletar stack
aws cloudformation delete-stack \
  --stack-name evo-uds-v3-production \
  --region us-east-1

# Aguardar deleção
aws cloudformation wait stack-delete-complete \
  --stack-name evo-uds-v3-production \
  --region us-east-1
```

## Referências

- [AWS CloudFormation User Guide](https://docs.aws.amazon.com/cloudformation/)
- [Prisma Migrations](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [AWS Lambda Layers](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html)

---

**Última atualização:** 2026-02-03
**Versão:** 2.0
