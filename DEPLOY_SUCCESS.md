# EVO UDS - Deploy Completo ✅

## URLs de Produção

| Serviço | URL |
|---------|-----|
| **Frontend** | https://evo.ai.udstec.io |
| **API** | https://api-evo.ai.udstec.io |

## Recursos AWS Criados

### Stack: `evo-uds-v2`

| Recurso | Identificador |
|---------|---------------|
| **Cognito User Pool** | `us-east-1_QY2yorzh9` |
| **Cognito Client ID** | `5l4qo9ncvqucu5av781v24fa6k` |
| **API Gateway** | `ebmmhm7k4e` |
| **CloudFront** | `E1EUAOLY8ZG2JO` |
| **S3 Frontend** | `evo-uds-v2-production-frontend-383234048592` |
| **DynamoDB Organizations** | `evo-uds-v2-production-organizations` |
| **DynamoDB Profiles** | `evo-uds-v2-production-profiles` |
| **DynamoDB Sessions** | `evo-uds-v2-production-sessions` |

## Endpoints da API

| Endpoint | Método | Auth | Descrição |
|----------|--------|------|-----------|
| `/health` | GET | Não | Health check |
| `/organizations/check` | POST | Não | Verificar se slug existe |
| `/organizations` | POST | Cognito | Criar organização |
| `/profiles/{user_id}` | GET | Cognito | Obter perfil do usuário |

## Variáveis de Ambiente (Frontend)

```env
VITE_AWS_REGION=us-east-1
VITE_AWS_USER_POOL_ID=us-east-1_QY2yorzh9
VITE_AWS_USER_POOL_CLIENT_ID=5l4qo9ncvqucu5av781v24fa6k
VITE_API_BASE_URL=https://api-evo.ai.udstec.io
VITE_CLOUDFRONT_DOMAIN=evo.ai.udstec.io
```

## Comandos Úteis

```bash
# Deploy do frontend
npm run build
aws s3 sync dist/ s3://evo-uds-v2-production-frontend-383234048592 --delete
aws cloudfront create-invalidation --distribution-id E1EUAOLY8ZG2JO --paths "/*"

# Ver logs das Lambdas
aws logs tail /aws/lambda/evo-uds-v2-production-health --follow
aws logs tail /aws/lambda/evo-uds-v2-production-check-org --follow

# Deletar stack (se necessário)
aws cloudformation delete-stack --stack-name evo-uds-v2
```

## Arquitetura

```
                    ┌─────────────────┐
                    │   Route53 DNS   │
                    │  ai.udstec.io   │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
    ┌─────────▼─────────┐       ┌──────────▼──────────┐
    │    CloudFront     │       │    API Gateway      │
    │ evo.ai.udstec.io  │       │ api-evo.ai.udstec.io│
    └─────────┬─────────┘       └──────────┬──────────┘
              │                            │
    ┌─────────▼─────────┐       ┌──────────▼──────────┐
    │    S3 Bucket      │       │   Lambda Functions  │
    │    (Frontend)     │       │   (Python 3.12)     │
    └───────────────────┘       └──────────┬──────────┘
                                           │
                        ┌──────────────────┼──────────────────┐
                        │                  │                  │
              ┌─────────▼─────┐  ┌─────────▼─────┐  ┌────────▼────────┐
              │   DynamoDB    │  │   DynamoDB    │  │     Cognito     │
              │ Organizations │  │   Profiles    │  │   User Pool     │
              └───────────────┘  └───────────────┘  └─────────────────┘
```

## Data do Deploy

- **Data**: 22/12/2025
- **CloudFormation Stack**: `evo-uds-v2`
- **Status**: ✅ CREATE_COMPLETE
