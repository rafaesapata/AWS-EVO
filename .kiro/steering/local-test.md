---
inclusion: manual
---

# Teste Local de Lambdas

## Script
`backend/scripts/invoke-local.ts` — invoca handlers localmente sem deploy, usando `tsx` direto no TypeScript.

## Como usar

```bash
# Via npm script
npm run invoke --prefix backend -- <handler-path> [options]

# Via npx direto
npx tsx backend/scripts/invoke-local.ts <handler-path> [options]
```

`handler-path` é relativo a `backend/src/handlers/` (ex: `security/waf-dashboard-api`).

## Exemplos

```bash
# POST com action (padrão da maioria dos handlers)
npm run invoke --prefix backend -- security/waf-dashboard-api --body '{"action":"events"}'

# GET request
npm run invoke --prefix backend -- monitoring/health-check -m GET

# Com impersonation (super_admin)
npm run invoke --prefix backend -- security/waf-dashboard-api --body '{"action":"diagnose"}' --impersonate <org-uuid>

# User customizado
npm run invoke --prefix backend -- admin/users --user '{"sub":"abc","email":"admin@test.com","custom:organization_id":"<org-uuid>","custom:roles":"super_admin"}'

# Sem autenticação (handlers públicos)
npm run invoke --prefix backend -- auth/login --no-auth --body '{"email":"test@test.com"}'

# Com query string
npm run invoke --prefix backend -- cost/cost-explorer -m GET --query 'period=30d&account=123'

# Verbose (mostra event completo e headers)
npm run invoke --prefix backend -- monitoring/health-check -m GET -v
```

## Options

| Flag | Descrição |
|------|-----------|
| `--method, -m` | HTTP method (default: POST) |
| `--body, -b` | JSON body string |
| `--query, -q` | Query string (key=val&key2=val2) |
| `--impersonate` | Org ID para impersonar |
| `--user` | JSON com claims customizados |
| `--no-auth` | Sem autenticação |
| `--header, -H` | Header extra (ex: `-H 'X-Custom: value'`) |
| `--verbose, -v` | Output detalhado |

## Variáveis de ambiente

Carrega automaticamente de `backend/.env` e `.env` (root). Pode sobrescrever:

| Variável | Descrição | Default |
|----------|-----------|---------|
| `DATABASE_URL` | Connection string PostgreSQL | backend/.env |
| `LOCAL_USER_SUB` | sub do usuário simulado | UUID aleatório |
| `LOCAL_USER_EMAIL` | email do usuário | local@evo.test |
| `LOCAL_ORG_ID` | organization_id | UUID aleatório |
| `LOCAL_USER_ROLES` | roles do usuário | admin |

## DB Tunnel (acesso ao RDS de produção)

O RDS está em VPC privada. Para testar handlers com DB real, use o SSM tunnel via bastion:

### Setup (uma vez)

1. Instalar Session Manager plugin: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html
2. Deploy do bastion (se ainda não existe):
```bash
aws cloudformation deploy \
  --template-file cloudformation/bastion-ssm-stack.yaml \
  --stack-name evo-uds-v3-production-bastion \
  --parameter-overrides \
    Environment=production \
    VpcId=<VPC_ID> \
    PublicSubnetId=<PUBLIC_SUBNET_ID> \
    DatabaseSecurityGroupId=<DB_SG_ID> \
  --capabilities CAPABILITY_NAMED_IAM
```

### Uso diário

```bash
# Terminal 1: abrir tunnel
./backend/scripts/db-tunnel.sh production

# Terminal 2: invocar handler com DB real
DATABASE_URL="postgresql://evoadmin:<password>@localhost:5432/evouds?schema=public" \
npx tsx backend/scripts/invoke-local.ts security/waf-dashboard-api --body '{"action":"events"}'
```

O bastion é um `t4g.nano` ARM (~$3/mês), sem SSH, sem portas abertas — usa SSM Session Manager.

## Limitações

- **AWS SDK calls**: Handlers que chamam AWS APIs (STS, WAF, etc.) precisam de credenciais AWS configuradas localmente (`~/.aws/credentials` ou env vars).
- **Sem esbuild bundling**: O script roda TypeScript direto via tsx, não passa pelo esbuild. Imports de npm packages funcionam normalmente via node_modules.

## Quando usar

- Testar lógica de handlers antes de fazer push (evita esperar ~10min de deploy)
- Debugar erros de parsing, validação, routing
- Verificar que imports e dependências resolvem corretamente
- Testar com DB real via SSM tunnel
