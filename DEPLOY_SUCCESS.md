# EVO UDS - Deploy Completo v3 ✅

## URLs de Produção

| Serviço | URL |
|---------|-----|
| **Frontend** | https://evo.ai.udstec.io |
| **API** | https://api-evo.ai.udstec.io |

## Credenciais de Acesso

- **Email**: `admin@udstec.io`
- **Senha**: `EvoAdmin@2025`

## Recursos AWS (Stack: evo-uds-v3)

| Recurso | Identificador |
|---------|---------------|
| **Cognito User Pool** | `us-east-1_qGmGkvmpL` |
| **Cognito Client ID** | `1pa9qjk1nqve664crea9bclpo4` |
| **API Gateway** | `3l66kn0eaj` |
| **CloudFront** | `E1PY7U3VNT6P1R` |
| **S3 Frontend** | `evo-uds-v3-production-frontend-383234048592` |
| **DynamoDB Organizations** | `evo-uds-v3-production-organizations` |
| **DynamoDB Profiles** | `evo-uds-v3-production-profiles` |

## Endpoints da API

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/health` | GET | Health check |
| `/api/profiles/check` | POST | Verificar se usuário tem organização |
| `/api/profiles/create-with-org` | POST | Criar perfil com organização |

## Variáveis de Ambiente

```env
VITE_AWS_REGION=us-east-1
VITE_AWS_USER_POOL_ID=us-east-1_qGmGkvmpL
VITE_AWS_USER_POOL_CLIENT_ID=1pa9qjk1nqve664crea9bclpo4
VITE_API_BASE_URL=https://api-evo.ai.udstec.io
```

## Comandos de Deploy

```bash
# Build e deploy do frontend
npm run build
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete
aws cloudfront create-invalidation --distribution-id E1PY7U3VNT6P1R --paths "/*"
```

## Data: 22/12/2025
