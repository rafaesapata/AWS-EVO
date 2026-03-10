---
inclusion: manual
---

# Configuração Local para Production

Quando o usuário pedir para "trabalhar em production" ou "ajustar para production", aplique estas configurações automaticamente sem perguntar.

## backend/.env

Substituir o conteúdo completo por:

```env
DATABASE_URL="postgresql://evoadmin:ProductionEvo2026Secure@evo-uds-v3-production-postgres.csno4kowwmc9.us-east-1.rds.amazonaws.com:5432/evouds?schema=public"

AWS_SES_REGION=us-east-1
AWS_SES_FROM_EMAIL=evo@nuevacore.com
AWS_SES_FROM_NAME=EVO Platform
AWS_SES_DOMAIN=nuevacore.com

NODE_ENV=production
ENVIRONMENT=production

COGNITO_USER_POOL_ID=us-east-1_PRODUCTION_POOL_ID

APP_DOMAIN=evo.nuevacore.com
API_DOMAIN=api.evo.nuevacore.com
AZURE_OAUTH_REDIRECT_URI=https://evo.nuevacore.com/azure/callback

WEBAUTHN_RP_ID=nuevacore.com
WEBAUTHN_RP_NAME=EVO Platform
```

## backend/.env.tunnel

```env
DATABASE_URL="postgresql://evoadmin:ProductionEvo2026Secure@localhost:5433/evouds?schema=public"
```

## .env.local (frontend)

Verificar que contém:

```env
VITE_AWS_REGION=us-east-1
VITE_AWS_ACCOUNT_ID=523115032346
VITE_AWS_USER_POOL_ID=us-east-1_PRODUCTION_POOL_ID
VITE_AWS_USER_POOL_CLIENT_ID=PRODUCTION_CLIENT_ID
VITE_API_BASE_URL=https://api.evo.nuevacore.com
VITE_CLOUDFRONT_DOMAIN=evo.nuevacore.com
VITE_ENVIRONMENT=production
```

## Referência rápida — Production (523115032346)

| Recurso | Valor |
|---------|-------|
| RDS Endpoint | `evo-uds-v3-production-postgres.csno4kowwmc9.us-east-1.rds.amazonaws.com` |
| RDS User/DB | `evoadmin` / `evouds` |
| RDS Acesso | Via Bastion Server (PubliclyAccessible=false) |
| Cognito Pool | `us-east-1_PRODUCTION_POOL_ID` |
| Cognito Client | `PRODUCTION_CLIENT_ID` |
| API Gateway | TBD / Stage: `prod` |
| Frontend S3 | `evo-uds-v3-production-frontend-523115032346` |
| CloudFront | TBD |
| Lambda Layer | `arn:aws:lambda:us-east-1:523115032346:layer:evo-uds-v3-production-deps:1` |
| Lambda Stack | `evo-uds-v3-production-lambdas` |
| AWS Profile | `EVO_PRODUCTION` |

## Deploy para production

```bash
git tag production-v<versão>
git push origin production-v<versão>
```

Nunca push direto no branch `production`. Sempre via tag.

## ⚠️ Cuidados Especiais em Production

- Sempre testar em sandbox primeiro
- Validar migrações de banco antes de aplicar
- Monitorar CloudWatch Logs após deploy
- Ter plano de rollback pronto
- Comunicar equipe antes de deploys críticos
- Evitar deploys em horários de pico
- Verificar sessão SSO ativa: `aws sso login --profile EVO_PRODUCTION`
