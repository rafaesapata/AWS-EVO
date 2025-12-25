---
inclusion: always
---

# AWS Infrastructure Reference

## API Gateway

- **REST API ID**: `3l66kn0eaj`
- **Stage**: `prod` (único stage em uso)
- **Custom Domain**: `api-evo.ai.udstec.io`
- **Regional Endpoint**: `d-lh5c9lpit7.execute-api.us-east-1.amazonaws.com`
- **Authorizer ID**: `ez5xqt` (Cognito User Pools)
- **Functions Resource ID**: `n9gxy9` (parent de `/api/functions/*`)

### Deploy Commands
```bash
# Deploy API Gateway changes (SEMPRE usar stage 'prod')
aws apigateway create-deployment --rest-api-id 3l66kn0eaj --stage-name prod --region us-east-1

# Flush cache se necessário
aws apigateway flush-stage-cache --rest-api-id 3l66kn0eaj --stage-name prod --region us-east-1
```

## Lambda Layers

- **Prisma + Zod Layer**: `arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:2`
  - Contém: `@prisma/client`, `.prisma/client` (gerado), `zod`
  - Binários: `rhel-openssl-1.0.x`, `rhel-openssl-3.0.x` (para Lambda)

### Atualizar Layer
```bash
# 1. Gerar Prisma Client
cd backend && npm run prisma:generate

# 2. Criar estrutura do layer
rm -rf /tmp/lambda-layer-prisma && mkdir -p /tmp/lambda-layer-prisma/nodejs/node_modules
cp -r node_modules/@prisma /tmp/lambda-layer-prisma/nodejs/node_modules/
cp -r node_modules/.prisma /tmp/lambda-layer-prisma/nodejs/node_modules/
cp -r node_modules/zod /tmp/lambda-layer-prisma/nodejs/node_modules/

# 3. Remover binários desnecessários (manter apenas rhel)
rm -f /tmp/lambda-layer-prisma/nodejs/node_modules/.prisma/client/libquery_engine-darwin-arm64.dylib.node
rm -rf /tmp/lambda-layer-prisma/nodejs/node_modules/.prisma/client/deno

# 4. Criar zip e publicar
pushd /tmp/lambda-layer-prisma; zip -r /tmp/prisma-layer.zip nodejs; popd
aws lambda publish-layer-version --layer-name evo-prisma-deps-layer --zip-file fileb:///tmp/prisma-layer.zip --compatible-runtimes nodejs18.x nodejs20.x --region us-east-1
```

## Lambda Functions (Prefixo: `evo-uds-v3-production-`)

Todas as Lambdas usam o layer `evo-prisma-deps-layer:1`.

### Principais Lambdas
- `security-scan` - Scan de segurança AWS
- `well-architected-scan` - Análise Well-Architected
- `compliance-scan` - Verificação de compliance
- `list-aws-credentials` - Listar credenciais AWS
- `query-table` - Consultas genéricas ao banco
- `fetch-daily-costs` - Custos diários
- `webauthn-register` - Registro WebAuthn/Passkey
- `webauthn-authenticate` - Autenticação WebAuthn

### Atualizar Layer em Todas as Lambdas
```bash
LAYER_ARN="arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:1"
for func in $(aws lambda list-functions --region us-east-1 --query 'Functions[?starts_with(FunctionName, `evo-uds-v3-production`)].FunctionName' --output text); do
  aws lambda update-function-configuration --function-name "$func" --layers "$LAYER_ARN" --region us-east-1
done
```

## Cognito

- **User Pool ID**: `us-east-1_qGmGkvmpL`
- **Region**: `us-east-1`

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
aws apigateway put-method --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method POST --authorization-type COGNITO_USER_POOLS --authorizer-id ez5xqt --region us-east-1

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
