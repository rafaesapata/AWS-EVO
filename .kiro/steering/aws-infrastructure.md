---
inclusion: always
---

# AWS Infrastructure Reference

## API Gateway

- **REST API ID**: `3l66kn0eaj`
- **Stage**: `prod` (único stage em uso)
- **Custom Domain**: `api-evo.ai.udstec.io`
- **Regional Endpoint**: `d-lh5c9lpit7.execute-api.us-east-1.amazonaws.com`
- **Authorizer ID**: `joelbs` (Cognito User Pools - CognitoAuthorizerV2)
- **Functions Resource ID**: `n9gxy9` (parent de `/api/functions/*`)

### Deploy Commands
```bash
# Deploy API Gateway changes (SEMPRE usar stage 'prod')
aws apigateway create-deployment --rest-api-id 3l66kn0eaj --stage-name prod --region us-east-1

# Flush cache se necessário
aws apigateway flush-stage-cache --rest-api-id 3l66kn0eaj --stage-name prod --region us-east-1
```

## Lambda Layers

### Layer Atual (com Azure SDK)
- **Prisma + Zod + Azure SDK Layer**: `arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:46`
  - Contém: `@prisma/client`, `.prisma/client` (gerado), `zod`, `@azure/*` (SDK completo), `@typespec/ts-http-runtime` (com internal exports fix), `debug`, `ms`, `tslib`, `events`, `jsonwebtoken`, `http-proxy-agent`, `https-proxy-agent`
  - Binários: `rhel-openssl-1.0.x`, `rhel-openssl-3.0.x` (para Lambda)
  - Tamanho: ~45MB comprimido, ~172MB descomprimido

### Versões do Layer
| Versão | Descrição | Data |
|--------|-----------|------|
| 43 | Prisma + Zod + Azure SDK + @typespec + internal exports fix | 2026-01-12 |
| 42 | Prisma + Zod + Azure SDK + @typespec (sem internal exports) | 2026-01-12 |
| 41 | Prisma + Zod + Azure SDK (sem @typespec) | 2026-01-12 |
| 40 | Prisma + Zod + Azure SDK inicial | 2026-01-12 |
| 39 | Prisma com AzureCredential model | 2026-01-12 |
| 2 | Prisma + Zod básico | 2025-xx-xx |

### Atualizar Layer (com Azure SDK)
```bash
# 1. Instalar dependências e gerar Prisma Client
npm install --prefix backend
npm run prisma:generate --prefix backend

# 2. Criar estrutura do layer
rm -rf /tmp/lambda-layer-azure && mkdir -p /tmp/lambda-layer-azure/nodejs/node_modules
cp -r backend/node_modules/@prisma /tmp/lambda-layer-azure/nodejs/node_modules/
cp -r backend/node_modules/.prisma /tmp/lambda-layer-azure/nodejs/node_modules/
cp -r backend/node_modules/zod /tmp/lambda-layer-azure/nodejs/node_modules/
cp -r backend/node_modules/@azure /tmp/lambda-layer-azure/nodejs/node_modules/

# 3. Copiar dependências do Azure SDK
for pkg in tslib uuid ms http-proxy-agent https-proxy-agent agent-base debug events fast-xml-parser strnum; do
  [ -d "backend/node_modules/$pkg" ] && cp -r "backend/node_modules/$pkg" /tmp/lambda-layer-azure/nodejs/node_modules/
done

# 4. Remover arquivos desnecessários para reduzir tamanho
rm -f /tmp/lambda-layer-azure/nodejs/node_modules/.prisma/client/libquery_engine-darwin*.node
rm -rf /tmp/lambda-layer-azure/nodejs/node_modules/.prisma/client/deno
find /tmp/lambda-layer-azure/nodejs/node_modules -name "*.ts" -not -name "*.d.ts" -delete
find /tmp/lambda-layer-azure/nodejs/node_modules -name "*.map" -delete
find /tmp/lambda-layer-azure/nodejs/node_modules -name "*.md" -delete
find /tmp/lambda-layer-azure/nodejs/node_modules -type d -name "test" -exec rm -rf {} + 2>/dev/null
find /tmp/lambda-layer-azure/nodejs/node_modules -type d -name "tests" -exec rm -rf {} + 2>/dev/null

# 5. Criar zip
pushd /tmp/lambda-layer-azure && zip -r /tmp/prisma-azure-layer.zip nodejs && popd

# 6. Upload para S3 (necessário para layers > 50MB)
aws s3 cp /tmp/prisma-azure-layer.zip s3://evo-uds-v3-production-frontend-383234048592/layers/prisma-azure-layer.zip --region us-east-1

# 7. Publicar layer
aws lambda publish-layer-version \
  --layer-name evo-prisma-deps-layer \
  --description "Prisma client with Azure SDK support" \
  --content S3Bucket=evo-uds-v3-production-frontend-383234048592,S3Key=layers/prisma-azure-layer.zip \
  --compatible-runtimes nodejs18.x nodejs20.x \
  --region us-east-1
```

## Lambda Functions (Prefixo: `evo-uds-v3-production-`)

Todas as Lambdas usam o layer `evo-prisma-deps-layer:40`.

### Principais Lambdas AWS
- `security-scan` - Scan de segurança AWS
- `well-architected-scan` - Análise Well-Architected
- `compliance-scan` - Verificação de compliance
- `list-aws-credentials` - Listar credenciais AWS
- `query-table` - Consultas genéricas ao banco
- `fetch-daily-costs` - Custos diários
- `webauthn-register` - Registro WebAuthn/Passkey
- `webauthn-authenticate` - Autenticação WebAuthn

### Lambdas Azure (Multi-Cloud)
- `validate-azure-credentials` - Validar credenciais Azure
- `save-azure-credentials` - Salvar credenciais Azure
- `list-azure-credentials` - Listar credenciais Azure
- `delete-azure-credentials` - Remover credenciais Azure
- `azure-security-scan` - Scan de segurança Azure
- `start-azure-security-scan` - Iniciar scan Azure (async)
- `azure-defender-scan` - Microsoft Defender for Cloud
- `azure-compliance-scan` - Compliance CIS/Azure Benchmark
- `azure-well-architected-scan` - Azure Well-Architected Framework
- `azure-cost-optimization` - Azure Advisor cost recommendations
- `azure-reservations-analyzer` - Azure Reserved Instances analysis
- `azure-fetch-costs` - Buscar custos Azure
- `azure-resource-inventory` - Inventário de recursos Azure
- `azure-activity-logs` - Logs de atividade Azure
- `list-cloud-credentials` - Listar credenciais unificadas (AWS + Azure)

### Atualizar Layer em Todas as Lambdas
```bash
LAYER_ARN="arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:43"
for func in $(aws lambda list-functions --region us-east-1 --query 'Functions[?starts_with(FunctionName, `evo-uds-v3-production`)].FunctionName' --output text); do
  aws lambda update-function-configuration --function-name "$func" --layers "$LAYER_ARN" --region us-east-1
done
```

## Cognito

### Development Environment
- **User Pool ID**: `us-east-1_cnesJ48lR`
- **User Pool Client ID**: `4p0okvsr983v2f8rrvgpls76d6`
- **Region**: `us-east-1`
- **Custom Attributes**: `organization_id`, `organization_name`, `roles`, `tenant_id`
- **Admin User**: `admin@udstec.io` / `AdminPass123!`
- **MFA**: Optional (usuários podem configurar se desejarem)

### Production Environment
- **Status**: ⏳ A ser configurado
- **User Pool ID**: TBD
- **User Pool Client ID**: TBD

### Criar Usuário com Atributos Customizados
```bash
# 1. Criar usuário
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_cnesJ48lR \
  --username user@example.com \
  --user-attributes Name=email,Value=user@example.com Name=email_verified,Value=true \
  --temporary-password TempPass123! \
  --message-action SUPPRESS

# 2. Definir senha permanente
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_cnesJ48lR \
  --username user@example.com \
  --password UserPass123! \
  --permanent

# 3. Definir atributos customizados
aws cognito-idp admin-update-user-attributes \
  --user-pool-id us-east-1_cnesJ48lR \
  --username user@example.com \
  --user-attributes \
    'Name=custom:organization_id,Value=ORG-UUID-HERE' \
    'Name=custom:organization_name,Value=Organization Name' \
    'Name=custom:roles,Value="[\"org_admin\"]"'
```

## CloudFront

- **Frontend Distribution ID**: `E1PY7U3VNT6P1R`
- **Frontend Domain**: `evo.ai.udstec.io`
- **S3 Bucket**: `evo-uds-v3-production-frontend-383234048592`

### Deploy Frontend
```bash
npm run build
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete
aws cloudfront create-invalidation --distribution-id E1PY7U3VNT6P1R --paths "/*"
```

## VPC & Networking

- **VPC ID**: `vpc-09773244a2156129c`
- **VPC CIDR**: `10.0.0.0/16`
- **Region**: `us-east-1`

### Subnets
| Tipo | Subnet ID | CIDR | AZ |
|------|-----------|------|-----|
| Public | `subnet-0c7857d8ca2b5a4e0` | 10.0.1.0/24 | us-east-1a |
| Private | `subnet-0dbb444e4ef54d211` | 10.0.3.0/24 | us-east-1a |
| Private | `subnet-05383447666913b7b` | 10.0.4.0/24 | us-east-1b |

### NAT Gateway (para Lambda acessar internet)
- **NAT Gateway ID**: `nat-071801f85e8109355`
- **Elastic IP**: `eipalloc-0f905bf31aaa39ca1` (54.165.51.84)
- **Subnet**: Public Subnet 1 (`subnet-0c7857d8ca2b5a4e0`)

### Route Tables
- **Public RT**: `rtb-00c15edb16b14d53b` → Internet Gateway
- **Private RT**: `rtb-060d53b4730d4507c` → NAT Gateway

### Internet Gateway
- **IGW ID**: `igw-0d7006c2a96e4ef47`

### VPC Endpoints (Gateway - sem custo)
- S3: `com.amazonaws.us-east-1.s3`
- DynamoDB: `com.amazonaws.us-east-1.dynamodb`

## RDS PostgreSQL

- **Engine**: PostgreSQL 15.10
- **Stack**: `evo-uds-v3-nodejs-infra`
- **ORM**: Prisma
- **Schema**: `backend/prisma/schema.prisma`

## Criar Novo Endpoint no API Gateway

```bash
# 1. Criar resource
aws apigateway create-resource --rest-api-id 3l66kn0eaj --parent-id n9gxy9 --path-part NOME-ENDPOINT --region us-east-1

# 2. Criar OPTIONS (CORS)
aws apigateway put-method --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method OPTIONS --authorization-type NONE --region us-east-1

aws apigateway put-integration --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method OPTIONS --type MOCK --request-templates '{"application/json": "{\"statusCode\": 200}"}' --region us-east-1

aws apigateway put-method-response --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method OPTIONS --status-code 200 --response-parameters '{"method.response.header.Access-Control-Allow-Headers":true,"method.response.header.Access-Control-Allow-Methods":true,"method.response.header.Access-Control-Allow-Origin":true}' --region us-east-1

aws apigateway put-integration-response --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method OPTIONS --status-code 200 --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' --region us-east-1

# 3. Criar POST com Cognito
aws apigateway put-method --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method POST --authorization-type COGNITO_USER_POOLS --authorizer-id joelbs --region us-east-1

aws apigateway put-integration --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method POST --type AWS_PROXY --integration-http-method POST --uri "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:383234048592:function:LAMBDA_NAME/invocations" --region us-east-1

# 4. Deploy (IMPORTANTE: usar stage 'prod')
aws apigateway create-deployment --rest-api-id 3l66kn0eaj --stage-name prod --region us-east-1
```

## Troubleshooting

### CORS 403 no OPTIONS
1. Verificar se o deployment foi feito no stage `prod` (não `production`)
2. Verificar se o OPTIONS tem `authorizationType: NONE`
3. Verificar se a integration response tem os headers CORS

### Prisma "did not initialize yet"
1. Rodar `prisma generate` no backend
2. Atualizar o layer com o novo `.prisma/client`
3. Atualizar as Lambdas para usar o novo layer

### Lambda 502 "Cannot find module"
1. Verificar se o layer está anexado à Lambda
2. Verificar se o módulo está no layer
3. Verificar o path do handler (ex: `handlers/security/security-scan.handler`)

### Lambda 504 Timeout (VPC)
Lambdas em VPC precisam de NAT Gateway para acessar APIs AWS (STS, EC2, RDS, S3, etc.)

1. Verificar se NAT Gateway está ativo:
```bash
aws ec2 describe-nat-gateways --filter "Name=state,Values=available" --region us-east-1
```

2. Verificar se private subnets têm rota para NAT:
```bash
aws ec2 describe-route-tables --route-table-ids rtb-060d53b4730d4507c --region us-east-1
```

3. Verificar se Lambda está nas private subnets corretas:
```bash
aws lambda get-function-configuration --function-name FUNCTION_NAME --query 'VpcConfig' --region us-east-1
```

### Azure SDK "not installed" Error
Se receber erro "Azure SDK not installed", significa que o layer da Lambda não inclui os pacotes Azure.

**Solução:**
1. Verificar versão do layer na Lambda:
```bash
aws lambda get-function-configuration --function-name FUNCTION_NAME --query 'Layers[0].Arn' --output text --region us-east-1
```

2. Atualizar para layer versão 46 (com Azure SDK + @typespec + internal exports fix):
```bash
aws lambda update-function-configuration \
  --function-name FUNCTION_NAME \
  --layers "arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:46" \
  --region us-east-1
```

3. Se precisar atualizar todas as Lambdas Azure:
```bash
LAYER_ARN="arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:46"
for func in validate-azure-credentials save-azure-credentials list-azure-credentials delete-azure-credentials azure-security-scan start-azure-security-scan azure-defender-scan azure-compliance-scan azure-well-architected-scan azure-cost-optimization azure-reservations-analyzer azure-fetch-costs azure-resource-inventory azure-activity-logs list-cloud-credentials; do
  aws lambda update-function-configuration --function-name "evo-uds-v3-production-$func" --layers "$LAYER_ARN" --region us-east-1
done
```

### API Gateway 500 "Cannot read properties of undefined (reading 'authorizer')"
A Lambda não está recebendo o contexto de autorização do Cognito.

**Causas:**
1. Método POST não tem `authorizationType: COGNITO_USER_POOLS`
2. `authorizerId` incorreto (deve ser `joelbs`)
3. Permissão Lambda com path incorreto

**Solução:**
```bash
# Verificar permissões da Lambda
aws lambda get-policy --function-name LAMBDA_NAME --region us-east-1

# O source-arn DEVE incluir o path completo:
# arn:aws:execute-api:us-east-1:383234048592:3l66kn0eaj/*/POST/api/functions/ENDPOINT-NAME
# NÃO: arn:aws:execute-api:us-east-1:383234048592:3l66kn0eaj/*/POST/ENDPOINT-NAME

# Adicionar permissão correta se necessário:
aws lambda add-permission \
  --function-name LAMBDA_NAME \
  --statement-id apigateway-ENDPOINT-NAME-fix \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:us-east-1:383234048592:3l66kn0eaj/*/POST/api/functions/ENDPOINT-NAME" \
  --region us-east-1
```
