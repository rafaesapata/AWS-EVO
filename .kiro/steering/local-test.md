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

O RDS está em VPC privada. Para testar handlers com DB real, use SSH tunnel via bastion existente:

### Uso diário

```bash
# Terminal 1: abrir tunnel (porta 5433 local → RDS produção)
./backend/scripts/db-tunnel.sh

# Terminal 2: invocar handler com DB real
npx tsx backend/scripts/invoke-local.ts monitoring/health-check -m GET --tunnel

# Ou qualquer handler
npx tsx backend/scripts/invoke-local.ts security/waf-dashboard-api --body '{"action":"events"}' --tunnel
```

A flag `--tunnel` carrega `backend/.env.tunnel` que aponta DATABASE_URL para `localhost:5433`.

### Pré-requisitos
- Key SSH em `~/.ssh/evo-production-bastion.pem` (ou definir `BASTION_KEY=/path/to/key.pem`)
- Bastion: `i-00d8aa3ee551d4215` (t3.micro, IP `44.213.112.31`)

## Limitações

- **AWS SDK calls**: Handlers que chamam AWS APIs (STS, WAF, etc.) precisam de credenciais AWS configuradas localmente (`~/.aws/credentials` ou env vars).
- **Sem esbuild bundling**: O script roda TypeScript direto via tsx, não passa pelo esbuild. Imports de npm packages funcionam normalmente via node_modules.

## Quando usar

- Testar lógica de handlers antes de fazer push (evita esperar ~10min de deploy)
- Debugar erros de parsing, validação, routing
- Verificar que imports e dependências resolvem corretamente
- Testar com DB real via SSH tunnel

## Servidor Local (Frontend + Backend integrado)

`backend/scripts/local-server.ts` — servidor Express que emula o API Gateway, roteando requests para os handlers Lambda. Permite usar o frontend React apontando pro backend local.

### Como usar

```bash
# Terminal 1: tunnel SSH (se precisar de DB)
./backend/scripts/db-tunnel.sh

# Terminal 2: servidor backend local (porta 4201)
npm run serve --prefix backend -- --tunnel

# Terminal 3: frontend Vite (porta 4200, proxy automático para :4201)
npm run dev
```

O Vite já tem proxy configurado: `/api/*` → `http://localhost:4201`. O frontend funciona normalmente — login via Cognito, JWT real decodificado pelo servidor local.

### Portas locais

| Serviço | Porta | URL |
|---------|-------|-----|
| Frontend (Vite) | 4200 | http://localhost:4200 |
| Backend (Express) | 4201 | http://localhost:4201 |

Portas escolhidas para evitar conflito com serviços comuns (3000, 3001, 5173, 8080).

### Options do servidor

| Flag | Descrição |
|------|-----------|
| `--tunnel, -t` | Usar .env.tunnel (DB via SSH) |
| `--port, -p` | Porta (default: 4201) |
| `--no-auth` | Desabilitar JWT, usar claims fake |
| `--user` | JSON com claims customizados |
| `--verbose, -v` | Log detalhado por request |

### Endpoints úteis

- `GET http://localhost:4201/health` — status do servidor
- `GET http://localhost:4201/routes` — lista todas as 167 rotas mapeadas

### Como funciona

1. Parseia `sam/production-lambdas-only.yaml` para extrair rotas automaticamente
2. Cada request `/api/functions/{name}` é roteado pro handler correspondente
3. JWT do Cognito é decodificado (sem validação de assinatura) para extrair claims
4. Claims são passados no `event.requestContext.authorizer` como no API Gateway real
5. Handlers são carregados via `tsx` direto do TypeScript (sem build)
