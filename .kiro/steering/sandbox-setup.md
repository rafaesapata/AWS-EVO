---
inclusion: manual
---

# Configuração Local para Sandbox

Quando o usuário pedir para "trabalhar em sandbox" ou "ajustar para sandbox", aplique estas configurações automaticamente sem perguntar.

## backend/.env

Substituir o conteúdo completo por:

```env
DATABASE_URL="postgresql://evoadmin:SandboxEvo2026Safe@evo-uds-v3-sandbox-postgres.csno4kowwmc9.us-east-1.rds.amazonaws.com:5432/evouds?schema=public"

AWS_SES_REGION=us-east-1
AWS_SES_FROM_EMAIL=evo@nuevacore.com
AWS_SES_FROM_NAME=EVO Platform
AWS_SES_DOMAIN=nuevacore.com

NODE_ENV=sandbox
ENVIRONMENT=sandbox

COGNITO_USER_POOL_ID=us-east-1_HPU98xnmT

APP_DOMAIN=evo.sandbox.nuevacore.com
API_DOMAIN=api.evo.sandbox.nuevacore.com
AZURE_OAUTH_REDIRECT_URI=https://evo.sandbox.nuevacore.com/azure/callback

WEBAUTHN_RP_ID=nuevacore.com
WEBAUTHN_RP_NAME=EVO Platform (Sandbox)
```

## backend/.env.tunnel

```env
DATABASE_URL="postgresql://evoadmin:SandboxEvo2026Safe@localhost:5433/evouds?schema=public"
```

## .env.local (frontend — normalmente já está correto)

Verificar que contém:

```env
VITE_AWS_REGION=us-east-1
VITE_AWS_ACCOUNT_ID=971354623291
VITE_AWS_USER_POOL_ID=us-east-1_HPU98xnmT
VITE_AWS_USER_POOL_CLIENT_ID=6gls4r44u96v6o0mkm1l6sbmgd
VITE_API_BASE_URL=https://api.evo.sandbox.nuevacore.com
VITE_CLOUDFRONT_DOMAIN=evo.sandbox.nuevacore.com
VITE_ENVIRONMENT=sandbox
```

## Referência rápida — Sandbox (971354623291)

| Recurso | Valor |
|---------|-------|
| RDS Endpoint | `evo-uds-v3-sandbox-postgres.csno4kowwmc9.us-east-1.rds.amazonaws.com` |
| RDS User/DB | `evoadmin` / `evouds` |
| RDS Acesso | PubliclyAccessible=true (sem tunnel) |
| Cognito Pool | `us-east-1_HPU98xnmT` |
| Cognito Client | `6gls4r44u96v6o0mkm1l6sbmgd` |
| API Gateway | `igyifo56v7` / Stage: `prod` |
| Frontend S3 | `evo-uds-v3-sandbox-frontend-971354623291` |
| CloudFront | `E93EL7AJZ6QAQ` |
| Lambda Layer | `arn:aws:lambda:us-east-1:971354623291:layer:evo-uds-v3-sandbox-deps:1` |
| Lambda Stack | `evo-uds-v3-sandbox-lambdas` |
| AWS Profile | `EVO_SANDBOX` |

## Deploy para sandbox

```bash
git tag sandbox-v<versão>
git push origin sandbox-v<versão>
```

Nunca push direto no branch `sandbox`. Sempre via tag.
