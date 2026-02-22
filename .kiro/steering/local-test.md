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

## Limitações

- **Database**: O `DATABASE_URL` do `backend/.env` aponta para RDS na VPC. Para queries reais, use SSH tunnel ou aponte para DB local.
- **AWS SDK calls**: Handlers que chamam AWS APIs (STS, WAF, etc.) precisam de credenciais AWS configuradas localmente (`~/.aws/credentials` ou env vars).
- **Sem esbuild bundling**: O script roda TypeScript direto via tsx, não passa pelo esbuild. Imports de npm packages funcionam normalmente via node_modules.

## Quando usar

- Testar lógica de handlers antes de fazer push (evita esperar ~10min de deploy)
- Debugar erros de parsing, validação, routing
- Verificar que imports e dependências resolvem corretamente
- Testar handlers que não dependem de DB ou AWS APIs externas
