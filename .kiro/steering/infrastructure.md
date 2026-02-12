---
inclusion: manual
---

# Infraestrutura AWS

## Ambientes

| Ambiente | Account | Branch | Prefix | Profile |
|----------|---------|--------|--------|---------|
| Sandbox | `971354623291` | `main` | `evo-uds-v3-sandbox-*` | `EVO_SANDBOX` |
| Production | `523115032346` | `production` | `evo-uds-v3-prod-*` | `EVO_PRODUCTION` |

## Domínios
- Sandbox: `evo.sandbox.nuevacore.com` / `api.evo.sandbox.nuevacore.com`
- Production: `evo.nuevacore.com` / `api.evo.nuevacore.com`

## SANDBOX (971354623291)

| Recurso | Valor |
|---------|-------|
| API Gateway (HTTP) | `igyifo56v7` / Stage: `prod` / Authorizer: `shn0ze` |
| CloudFront | `E93EL7AJZ6QAQ` / `dikd2ie8x3ihv.cloudfront.net` |
| S3 Frontend | `evo-uds-v3-sandbox-frontend-971354623291` |
| Cognito | Pool: `us-east-1_HPU98xnmT` / Client: `6gls4r44u96v6o0mkm1l6sbmgd` |
| VPC | `vpc-0c55e2a97fd92a5ca` |
| Subnets | `subnet-0edbe4968ff3a5a9e`, `subnet-01931c820b0b0e864` |
| SG | `sg-0f14fd661fc5c41ba` |

## PRODUCTION (523115032346)

| Recurso | Valor |
|---------|-------|
| Prefix | `evo-uds-v3-production-*` |
| Cognito | Pool: `us-east-1_BUJecylbm` / Client: `a761ofnfjjo7u5mhpe2r54b7j` |
| VPC | `vpc-07424c3d1d6fb2dc6` |
| Subnets | `subnet-0494b6594914ba898`, `subnet-0f68017cc0b95edda` |
| SG Lambda | `sg-066e845f73d46814d` |
| SG RDS | `sg-098e3163e78182351` |
| CloudFront | `E2NW0IZ2OX493I` |
| S3 Frontend | `evo-uds-v3-production-frontend-523115032346` |
| API Domain | `api.evo.nuevacore.com` |

## RDS PostgreSQL

| Env | Endpoint | DB | User |
|-----|----------|----|------|
| Sandbox | `evo-uds-v3-sandbox-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com` | `evouds` | `evoadmin` |
| Production | `evo-uds-v3-prod-postgres.cib8kysoo015.us-east-1.rds.amazonaws.com` | `evouds` | `evoadmin` |

DATABASE_URL (Sandbox): `postgresql://evoadmin:%29V7%3F9ygLec%3FAMSqn%29.UIU4%24vOfRl%2C%24%5EL@evo-uds-v3-sandbox-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com:5432/evouds?schema=public`

## Layer ARN
`arn:aws:lambda:us-east-1:971354623291:layer:evo-uds-v3-sandbox-deps:1`

## CI/CD
`GitHub Push → CodePipeline → CodeBuild → Deploy`
- `cicd/buildspec-sam.yml` — BuildSpec
- `sam/frontend-stack.yaml` — Frontend stack
- `cicd/cloudformation/sam-pipeline-stack.yaml` — Pipeline stack

## Troubleshooting
- "Can't reach database server" → Verificar DATABASE_URL, VPC config, Lambda na VPC
- "Cannot find module" → Verificar layer, handler path
- Lambda 504 → Verificar NAT Gateway, rotas private subnets
