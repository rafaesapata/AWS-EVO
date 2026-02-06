---
inclusion: always
---

# Regras de Deploy

## ⛔ PROIBIÇÃO ABSOLUTA

**NUNCA fazer deploy manual de código ou infraestrutura.**

Todo deploy DEVE ser feito via CI/CD (CodePipeline/CodeBuild).

### O que é PROIBIDO:
- `aws lambda update-function-code` manual
- `aws s3 sync` para frontend manual
- `aws cloudformation create-stack` manual
- `./scripts/deploy-*.sh` executado localmente
- `./scripts/deploy-all-lambdas.sh` executado localmente
- Qualquer comando que faça deploy direto na AWS
- Sugerir ao usuário que faça deploy manual

### O que é PERMITIDO:
- Criar/modificar templates CloudFormation
- Criar/modificar scripts de CI/CD
- Fazer commit e push para o repositório
- Configurar pipelines no CodePipeline
- Verificar status de stacks e recursos (read-only)

---

## Estratégia de Deploy Incremental (CI/CD)

O pipeline detecta automaticamente o que mudou via `git diff` e escolhe a estratégia mínima:

| Mudança | Estratégia | Tempo | O que faz |
|---------|-----------|-------|-----------|
| Apenas handler(s) em `backend/src/handlers/` | INCREMENTAL | ~1-2min | Deploy SOMENTE das lambdas alteradas via CLI |
| Shared `backend/src/lib/` ou `backend/src/types/` | INCREMENTAL_ALL | ~5min | Deploy de TODAS as lambdas via CLI (sem CloudFormation) |
| `sam/template.yaml` ou `sam/production-lambdas-only.yaml` | FULL_SAM | ~10min | Rebuild completo via SAM + CloudFormation |
| `backend/prisma/schema.prisma` | FULL_SAM | ~10min | Rebuild completo (Prisma client muda) |
| Apenas `src/`, `public/`, `index.html` | FRONTEND_ONLY | ~2min | Sync S3 + invalidação CloudFront |
| Apenas `docs/`, `scripts/`, `cicd/`, `.md` | SKIP | ~1min | Sem build, sem deploy |

### ⛔ O que NÃO dispara FULL_SAM (antes disparava):
- Mudanças em `cicd/` (buildspec, scripts de CI)
- Mudanças em `sam/samconfig.toml`
- Mudanças em `scripts/`
- Mudanças em qualquer `.md`

### Arquivo principal: `cicd/buildspec-sam.yml`
- Usado pelo CodeBuild (configurado em `cicd/cloudformation/sam-pipeline-stack.yaml`)
- Delega deploy incremental para `cicd/scripts/deploy-changed-lambdas.sh`
- O script tem mapeamento completo handler→lambda (194 lambdas)

---

## Fluxo de Deploy Correto

```
1. Desenvolver código localmente
2. Testar localmente (npm run build --prefix backend && npm run build)
3. Commit e push para branch
4. CI/CD detecta mudança e executa:
   - Analisa git diff para determinar estratégia
   - Build do código
   - Deploy SOMENTE do que mudou
```

## Ambientes e Branches

| Branch | Ambiente | Deploy Automático |
|--------|----------|-------------------|
| `main` | Sandbox (971354623291) | Sim |
| `production` | Production (523115032346) | Sim |

---

**Última atualização:** 2026-02-05
