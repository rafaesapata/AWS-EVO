---
inclusion: always
---

# Infraestrutura AWS - Referência Completa

## Ambientes

| Ambiente | AWS Account | Branch | Lambda Prefix | AWS Profile |
|----------|-------------|--------|---------------|-------------|
| **Sandbox** | `971354623291` | `main` | `evo-uds-v3-sandbox-*` | `EVO_SANDBOX` |
| **Production** | `523115032346` | `production` | `evo-uds-v3-prod-*` | `EVO_PRODUCTION` |

### CI/CD Pipeline (SAM)
Deploy automático via CodePipeline + SAM: `GitHub Push → CodePipeline → CodeBuild → SAM Deploy`

**Arquivos SAM:**
- `sam/template.yaml` - Template SAM com 203 funções Lambda
- `sam/samconfig.toml` - Configuração para sandbox e production
- `cicd/buildspec-sam.yml` - BuildSpec do CodeBuild
- `cicd/cloudformation/sam-pipeline-stack.yaml` - Stack do Pipeline

**Regenerar template SAM:**
```bash
npx tsx scripts/generate-sam-template.ts
```

---

## Recursos por Ambiente

### SANDBOX (971354623291)

| Recurso | Valor |
|---------|-------|
| **API Gateway ID** | `3l66kn0eaj` |
| **Stage** | `prod` |
| **Custom Domain** | `api-evo.ai.udstec.io` |
| **Authorizer ID** | `joelbs` (Cognito) |
| **Functions Resource ID** | `n9gxy9` |
| **CloudFront Distribution** | `E1PY7U3VNT6P1R` |
| **Frontend Domain** | `evo.ai.udstec.io` |
| **S3 Frontend** | `evo-uds-v3-production-frontend-971354623291` |
| **Cognito User Pool ID** | `us-east-1_cnesJ48lR` |
| **Cognito Client ID** | `4p0okvsr983v2f8rrvgpls76d6` |
| **VPC ID** | `vpc-0c55e2a97fd92a5ca` |
| **Private Subnets** | `subnet-0edbe4968ff3a5a9e`, `subnet-01931c820b0b0e864` |
| **Security Group** | `sg-0f14fd661fc5c41ba` |

### PRODUCTION (523115032346)

| Recurso | Valor |
|---------|-------|
| **Lambda Prefix** | `evo-uds-v3-prod-*` |
| **Cognito User Pool ID** | `us-east-1_WVljEXXs9` |
| **VPC ID** | `vpc-06bce393935428844` |
| **Private Subnets** | `subnet-0af7face420b9f317`, `subnet-099b0fbc0a342fb0f` |
| **Security Group** | `sg-07ea931d32276e039` |

---

## Banco de Dados (RDS PostgreSQL)

### Sandbox
| Propriedade | Valor |
|-------------|-------|
| **Instance** | `evo-uds-v3-sandbox-postgres` |
| **Endpoint** | `evo-uds-v3-sandbox-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com` |
| **Database** | `evouds` |
| **Username** | `evoadmin` |
| **Engine** | PostgreSQL 15.10 |

### Production
| Propriedade | Valor |
|-------------|-------|
| **Endpoint** | `evo-uds-v3-prod-postgres.cib8kysoo015.us-east-1.rds.amazonaws.com` |
| **Database** | `evouds` |

### DATABASE_URL (Sandbox - URL-encoded)
```
postgresql://evoadmin:%29V7%3F9ygLec%3FAMSqn%29.UIU4%24vOfRl%2C%24%5EL@evo-uds-v3-sandbox-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com:5432/evouds?schema=public
```

### ⛔ NUNCA USAR
```
❌ evo-uds-v3-nodejs-infra-rdsinstance-*.rds.amazonaws.com (não existe)
```

---

## Lambda Layers

### Layers Atuais
| Versão | Uso | Descrição |
|--------|-----|-----------|
| **92** | AWS + SES | Prisma + Zod + AWS SDK (SES, STS, WAFV2, Bedrock, Lambda, Cognito) |
| **91** | Azure | Prisma + Zod + Azure SDK + jsonwebtoken + lodash |
| **65** | AWS | Prisma + Zod + AWS SDK completo |

### ARNs
```
arn:aws:lambda:us-east-1:971354623291:layer:evo-prisma-deps-layer:92  # AWS+SES
arn:aws:lambda:us-east-1:971354623291:layer:evo-prisma-deps-layer:91  # Azure
arn:aws:lambda:us-east-1:971354623291:layer:evo-prisma-deps-layer:65  # AWS
```

### Checklist para Novo Layer

**AWS SDK (obrigatório):**
- [ ] `@prisma/client`, `.prisma/client`
- [ ] `zod`
- [ ] `@aws-sdk/client-sts`, `@aws-sdk/client-wafv2`, `@aws-sdk/client-bedrock-runtime`
- [ ] `@aws-sdk/client-lambda`, `@aws-sdk/client-cognito-identity-provider`
- [ ] Todas dependências `@smithy/*` (80+ pacotes)
- [ ] `tslib`, `uuid`, `fast-xml-parser`

**Azure SDK (se necessário):**
- [ ] `@azure/identity`, `@azure/arm-resources`, `@azure/arm-*`
- [ ] `@azure/msal-node`, `@azure/msal-common`
- [ ] `@typespec/ts-http-runtime` + arquivos em `internal/`
- [ ] `jsonwebtoken` + dependências
- [ ] `lodash.*` (includes, camelcase, defaults, isinteger, etc.)

---

## Migrações de Banco

### 🚨 REGRA: Migrações APENAS no CI/CD

**NUNCA** execute migrações em runtime de Lambda!

```bash
# Desenvolvimento local
cd backend && npx prisma migrate dev --name <nome>

# CI/CD aplica automaticamente
npx prisma migrate deploy
```

### Verificar Status
```bash
npx prisma migrate status
npx prisma generate
```

---

## Comandos Úteis

### Deploy Frontend
```bash
npm run build
AWS_PROFILE=EVO_SANDBOX aws s3 sync dist/ s3://evo-uds-v3-production-frontend-971354623291 --delete
AWS_PROFILE=EVO_SANDBOX aws cloudfront create-invalidation --distribution-id E1PY7U3VNT6P1R --paths "/*"
```

### Deploy API Gateway
```bash
aws apigateway create-deployment --rest-api-id 3l66kn0eaj --stage-name prod --region us-east-1
```

### Verificar Lambda
```bash
aws lambda get-function-configuration --function-name LAMBDA_NAME --region us-east-1 --query '{Handler: Handler, Layers: Layers[*].Arn}'
```

### Atualizar DATABASE_URL
```bash
aws lambda update-function-configuration \
  --function-name NOME_DA_LAMBDA \
  --environment 'Variables={DATABASE_URL="postgresql://...",NODE_PATH="/opt/nodejs/node_modules"}' \
  --region us-east-1
```

### Configurar VPC em Lambda
```bash
aws lambda update-function-configuration \
  --function-name LAMBDA_NAME \
  --vpc-config "SubnetIds=subnet-0edbe4968ff3a5a9e,subnet-01931c820b0b0e864,SecurityGroupIds=sg-0f14fd661fc5c41ba" \
  --region us-east-1
```

---

## Troubleshooting

### "Can't reach database server"
1. Verificar DATABASE_URL: `aws lambda get-function-configuration --query 'Environment.Variables.DATABASE_URL'`
2. Verificar VPC: `aws lambda get-function-configuration --query 'VpcConfig'`
3. Lambda DEVE estar na VPC se usa Prisma

### "Cannot find module"
1. Verificar layer anexado
2. Verificar handler path (deve ser `handler.handler`, não `handlers/xxx/handler.handler`)
3. Refazer deploy seguindo processo correto

### "Azure SDK not installed"
1. Atualizar para layer 91 (com Azure SDK)
2. Verificar se tem `jsonwebtoken` e `lodash.*`

### Lambda 504 Timeout
1. Verificar NAT Gateway ativo
2. Verificar rotas das private subnets

---

**Última atualização:** 2026-02-03
