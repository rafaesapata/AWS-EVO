# Scripts Usage Guidelines

## 🚨 REGRA OBRIGATÓRIA: Reutilizar Scripts Existentes

**NUNCA crie novos scripts sem antes verificar se já existe um script que pode ser evoluído.**

O projeto passou por sanitização e possui scripts consolidados. Criar scripts duplicados causa:
- Confusão sobre qual script usar
- Manutenção duplicada
- Inconsistências entre scripts similares

## Scripts Disponíveis

### 🚀 Deploy

| Script | Uso | Descrição |
|--------|-----|-----------|
| `deploy-lambda.sh` | `./scripts/deploy-lambda.sh <handler-path> <lambda-name>` | Deploy de UMA Lambda específica |
| `deploy-all-lambdas.sh` | `./scripts/deploy-all-lambdas.sh` | Deploy de TODAS as Lambdas |
| `deploy-all-aws-lambdas.sh` | `./scripts/deploy-all-aws-lambdas.sh` | Deploy de Lambdas AWS (não Azure) |
| `deploy-azure-lambdas.sh` | `./scripts/deploy-azure-lambdas.sh` | Deploy de Lambdas Azure |
| `deploy-batch.sh` | `./scripts/deploy-batch.sh` | Deploy em lote com paralelismo |
| `deploy-critical.sh` | `./scripts/deploy-critical.sh` | Deploy apenas de Lambdas críticas |
| `deploy-frontend.sh` | `./scripts/deploy-frontend.sh` | Build e deploy do frontend |
| `deploy-dev.sh` | `./scripts/deploy-dev.sh` | Deploy para ambiente dev |
| `deploy-prod.sh` | `./scripts/deploy-prod.sh` | Deploy para produção |

### 🔧 Utilitários

| Script | Uso | Descrição |
|--------|-----|-----------|
| `copy-deps.cjs` | `node scripts/copy-deps.cjs <source> <target> <packages...>` | Copia dependências recursivamente para layers |
| `create-lambda-zip.sh` | `./scripts/create-lambda-zip.sh` | Cria ZIP para deploy de Lambda |
| `fix-lambda-imports-v2.sh` | `./scripts/fix-lambda-imports-v2.sh` | Corrige imports de Lambdas |
| `invalidate-cloudfront.ts` | `npx tsx scripts/invalidate-cloudfront.ts` | Invalida cache do CloudFront |
| `increment-version.ts` | `npx tsx scripts/increment-version.ts` | Incrementa versão do projeto |

### ✅ Validação

| Script | Uso | Descrição |
|--------|-----|-----------|
| `check-critical-lambdas-health.sh` | `./scripts/check-critical-lambdas-health.sh` | Verifica saúde das Lambdas críticas |
| `validate-lambda-deployment.sh` | `./scripts/validate-lambda-deployment.sh` | Valida deploy de Lambda |
| `validate-production-build.ts` | `npx tsx scripts/validate-production-build.ts` | Valida build de produção |
| `validate-waf-monitoring.sh` | `./scripts/validate-waf-monitoring.sh` | Valida configuração WAF |
| `check-circular-imports.ts` | `npx tsx scripts/check-circular-imports.ts` | Detecta imports circulares |
| `check-prerequisites.ts` | `npx tsx scripts/check-prerequisites.ts` | Verifica pré-requisitos |

### 🔐 Infraestrutura

| Script | Uso | Descrição |
|--------|-----|-----------|
| `setup-admin-user.cjs` | `node scripts/setup-admin-user.cjs` | Configura usuário admin |
| `setup-infrastructure.ts` | `npx tsx scripts/setup-infrastructure.ts` | Setup inicial de infra |
| `deploy-rds.ts` | `npx tsx scripts/deploy-rds.ts` | Deploy de RDS |
| `deploy-secrets.ts` | `npx tsx scripts/deploy-secrets.ts` | Deploy de secrets |
| `get-rds-credentials.ts` | `npx tsx scripts/get-rds-credentials.ts` | Obtém credenciais RDS |
| `create-azure-service-principal.sh` | `./scripts/create-azure-service-principal.sh` | Cria Service Principal Azure |

### 🧪 Testes

| Script | Uso | Descrição |
|--------|-----|-----------|
| `test-rds-connection.ts` | `npx tsx scripts/test-rds-connection.ts` | Testa conexão RDS |
| `run-advanced-tests.ts` | `npx tsx scripts/run-advanced-tests.ts` | Executa testes avançados |
| `security-audit.ts` | `npx tsx scripts/security-audit.ts` | Auditoria de segurança |

### 🖥️ Desenvolvimento Local

| Script | Uso | Descrição |
|--------|-----|-----------|
| `start-production-local.sh` | `./scripts/start-production-local.sh` | Inicia ambiente local |
| `run-production-local.ts` | `npx tsx scripts/run-production-local.ts` | Executa em modo produção local |
| `restore-development.ts` | `npx tsx scripts/restore-development.ts` | Restaura ambiente dev |

## ✅ Como Evoluir Scripts Existentes

### 1. Adicionar Nova Funcionalidade

```bash
# ❌ ERRADO - Criar novo script
# scripts/deploy-my-new-feature.sh

# ✅ CORRETO - Adicionar ao script existente
# Editar scripts/deploy-lambda.sh para suportar novo caso
```

### 2. Adicionar Novo Tipo de Deploy

Se precisar de deploy para novo tipo de Lambda:

```bash
# ❌ ERRADO
touch scripts/deploy-new-category-lambdas.sh

# ✅ CORRETO
# Adicionar categoria ao deploy-all-lambdas.sh ou deploy-batch.sh
```

### 3. Adicionar Nova Validação

```bash
# ❌ ERRADO
touch scripts/validate-my-new-thing.sh

# ✅ CORRETO
# Adicionar ao check-critical-lambdas-health.sh ou validate-lambda-deployment.sh
```

## ⛔ Quando É Permitido Criar Novo Script

Criar novo script APENAS quando:

1. **Funcionalidade completamente nova** que não se encaixa em nenhum script existente
2. **Aprovação explícita** do usuário
3. **Documentar** o novo script neste arquivo

## Exemplos de Uso

### Deploy de Uma Lambda

```bash
# Build primeiro
npm run build --prefix backend

# Deploy
./scripts/deploy-lambda.sh cost/fetch-daily-costs fetch-daily-costs
```

### Deploy de Todas as Lambdas

```bash
npm run build --prefix backend
./scripts/deploy-all-lambdas.sh
```

### Deploy do Frontend

```bash
npm run build
./scripts/deploy-frontend.sh
```

### Verificar Saúde das Lambdas

```bash
./scripts/check-critical-lambdas-health.sh
```

### Criar Layer com Dependências

```bash
node scripts/copy-deps.cjs backend /tmp/layer @aws-sdk/client-sts @aws-sdk/client-lambda
```

## Checklist Antes de Criar Script

- [ ] Verifiquei se existe script similar em `scripts/`
- [ ] O script existente NÃO pode ser evoluído para meu caso
- [ ] A funcionalidade é completamente nova
- [ ] Documentei o novo script neste arquivo
- [ ] O nome segue o padrão: `verbo-objeto.sh` ou `verbo-objeto.ts`

---

**Última atualização:** 2026-01-29
**Versão:** 1.0
