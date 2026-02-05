---
inclusion: always
---

# Infraestrutura AWS - Referência Completa

## Ambientes

| Ambiente | AWS Account | Branch | Lambda Prefix | AWS Profile |
|----------|-------------|--------|---------------|-------------|
| **Sandbox** | `971354623291` | `main` | `evo-uds-v3-sandbox-*` | `EVO_SANDBOX` |
| **Production** | `523115032346` | `production` | `evo-uds-v3-prod-*` | `EVO_PRODUCTION` |

## Domínios (nuevacore.com)

| Ambiente | Frontend | API |
|----------|----------|-----|
| **Sandbox** | `evo.sandbox.nuevacore.com` | `api.evo.sandbox.nuevacore.com` |
| **Production** | `evo.nuevacore.com` | `api.evo.nuevacore.com` |

---

## Recursos por Ambiente

### SANDBOX (971354623291)

| Recurso | Valor |
|---------|-------|
| **API Gateway ID (HTTP API)** | `igyifo56v7` |
| **API Gateway URL** | `https://igyifo56v7.execute-api.us-east-1.amazonaws.com/prod` |
| **Stage** | `prod` |
| **Authorizer ID** | `shn0ze` (JWT/Cognito) |
| **CloudFront Distribution** | `E93EL7AJZ6QAQ` |
| **CloudFront Domain** | `dikd2ie8x3ihv.cloudfront.net` |
| **S3 Frontend** | `evo-uds-v3-sandbox-frontend-971354623291` |
| **Cognito User Pool ID** | `us-east-1_HPU98xnmT` |
| **Cognito Client ID** | `6gls4r44u96v6o0mkm1l6sbmgd` |
| **VPC ID** | `vpc-0c55e2a97fd92a5ca` |
| **Private Subnets** | `subnet-0edbe4968ff3a5a9e`, `subnet-01931c820b0b0e864` |
| **Security Group** | `sg-0f14fd661fc5c41ba` |

### PRODUCTION (523115032346)

| Recurso | Valor |
|---------|-------|
| **Lambda Prefix** | `evo-uds-v3-prod-*` |
| **Cognito User Pool ID** | `us-east-1_WVljEXXs9` |
| **VPC ID** | `vpc-07424c3d1d6fb2dc6` |
| **Private Subnets** | `subnet-0494b6594914ba898`, `subnet-0f68017cc0b95edda` |
| **Security Group (Lambda)** | `sg-066e845f73d46814d` |
| **Security Group (RDS)** | `sg-098e3163e78182351` |
| **CloudFront Distribution** | `E2NW0IZ2OX493I` |
| **S3 Frontend** | `evo-uds-v3-production-frontend-523115032346` |

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

---

## Lambda Layers

### Layers Atuais
| Versão | Nome | Descrição |
|--------|------|-----------|
| **1** | `evo-uds-v3-sandbox-deps` | Prisma + Zod (criada pelo SAM) |

### ARNs
```
arn:aws:lambda:us-east-1:971354623291:layer:evo-uds-v3-sandbox-deps:1  # Sandbox
```

---

## CI/CD Pipeline

Deploy automático via CodePipeline + CodeBuild: `GitHub Push → CodePipeline → CodeBuild → Deploy`

**Arquivos:**
- `sam/frontend-stack.yaml` - Stack CloudFormation do Frontend (S3 + CloudFront)
- `cicd/buildspec-sam.yml` - BuildSpec do CodeBuild
- `cicd/cloudformation/sam-pipeline-stack.yaml` - Stack do Pipeline

---

## Comandos Úteis

### Deploy Frontend (Manual)
```bash
npm run build
AWS_PROFILE=EVO_SANDBOX aws s3 sync dist/ s3://evo-uds-v3-sandbox-frontend-971354623291 --delete
AWS_PROFILE=EVO_SANDBOX aws cloudfront create-invalidation --distribution-id E93EL7AJZ6QAQ --paths "/*"
```

### Verificar Lambda
```bash
aws lambda get-function-configuration --function-name LAMBDA_NAME --region us-east-1 --query '{Handler: Handler, Layers: Layers[*].Arn}'
```

### Listar Rotas da API
```bash
AWS_PROFILE=EVO_SANDBOX aws apigatewayv2 get-routes --api-id igyifo56v7 --region us-east-1 --no-cli-pager
```

---

## Troubleshooting

### "Can't reach database server"
1. Verificar DATABASE_URL
2. Verificar VPC config da Lambda
3. Lambda DEVE estar na VPC se usa Prisma

### "Cannot find module"
1. Verificar layer anexado
2. Verificar handler path

### Lambda 504 Timeout
1. Verificar NAT Gateway ativo
2. Verificar rotas das private subnets

---

**Última atualização:** 2026-02-04
