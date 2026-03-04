---
inclusion: always
---

# Deploy & Lambda

## ⛔ NUNCA deploy manual. Todo deploy via CI/CD (tag + push).

## Deploy por Tags (GitHub Actions → CodePipeline)

O deploy é disparado por tags Git. O GitHub Actions workflow (`deploy-by-tag.yml`) detecta a tag e faz push para o branch correto, que dispara o CodePipeline.

```bash
# Deploy para Sandbox
git tag sandbox-v1.2.3
git push origin sandbox-v1.2.3

# Deploy para Production
git tag production-v1.2.3
git push origin production-v1.2.3
```

| Tag Pattern | Ambiente | Branch Target |
|-------------|----------|---------------|
| `sandbox-*` | Sandbox | `sandbox` |
| `production-*` | Production | `production` |

## Estratégia de Deploy (SEMPRE FULL_SAM para backend)

| Mudança | Estratégia | Tempo |
|---------|-----------|-------|
| `backend/` ou `sam/` (qualquer mudança) | FULL_SAM | ~10min |
| `src/`, `public/`, `index.html` | FRONTEND_ONLY | ~2min |
| `docs/`, `scripts/`, `cicd/`, `.md` | SKIP | ~1min |

Branches: `sandbox` → Sandbox | `production` → Production
Tags: `sandbox-*` → Sandbox | `production-*` → Production

**NÃO existe deploy incremental.** Todo backend change passa por `sam build` + `sam deploy` com esbuild bundling completo. Isso garante que `@aws-sdk/*` e todas as dependências são corretamente bundled.

**IMPORTANTE:** O CI/CD usa `sam/production-lambdas-only.yaml` (NÃO `sam/template.yaml`). Novas Lambdas DEVEM ser adicionadas em `production-lambdas-only.yaml`.

## Lambda — ARM64 + esbuild (OBRIGATÓRIO)

```yaml
Globals:
  Function:
    Architectures: [arm64]

# Metadata por função:
Metadata:
  BuildMethod: esbuild
  BuildProperties:
    Minify: true
    Target: es2022
    Sourcemap: false
    EntryPoints: [handler-name.ts]
    External: ['@prisma/client', '.prisma/client']
```

**Nota:** `@aws-sdk/*` NÃO está no External e NÃO está na Lambda Layer — é bundled pelo esbuild em cada Lambda.

## Azure SDK — Crypto Polyfill (PRIMEIRO import em handlers Azure)
```typescript
import * as crypto from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = crypto.webcrypto || crypto;
}
```

## Acesso via AWS SSO

Operações locais (scripts, SAM deploy local, verificações) requerem sessão SSO ativa:

```bash
# Login no sandbox
aws sso login --profile EVO_SANDBOX

# Login na produção
aws sso login --profile EVO_PRODUCTION

# Verificar sessão ativa
aws sts get-caller-identity --profile EVO_SANDBOX
```

- `EVO_SANDBOX` é obrigatório para qualquer operação local no sandbox
- `EVO_PRODUCTION` é obrigatório para operações na produção
- O CI/CD pipeline usa IAM Role própria e **não depende de SSO** para deploy automático
- `sam deploy` local para sandbox: `sam deploy --config-env sandbox --profile EVO_SANDBOX`
- Scripts `scripts/setup-sandbox-*.sh` e `scripts/verify-sandbox.sh` requerem `--profile EVO_SANDBOX` ou `AWS_PROFILE=EVO_SANDBOX`

## Lambdas Críticas
- 🔴 Onboarding: `save-aws-credentials`, `validate-aws-credentials`, `save-azure-credentials`, `validate-azure-credentials`
- 🟠 Core: `security-scan`, `compliance-scan`, `mfa-enroll`, `mfa-verify-login`

## Troubleshooting

| Erro | Causa | Solução |
|------|-------|---------|
| `Cannot find module '../../lib/xxx.js'` | Lib não encontrada | Verificar path relativo e extensão `.js` |
| `Runtime.ImportModuleError` | Handler path incorreto | Verificar handler path no SAM template |
| `Cannot find module '@aws-sdk/client-*'` | esbuild não bundlou | Verificar Metadata.BuildProperties no SAM template |
| `Azure SDK not installed` | Layer sem Azure SDK | Usar layer 91+ |
| `crypto is not defined` | Sem crypto polyfill | Adicionar polyfill (ver acima) |
| `Cannot find module 'jsonwebtoken'` | Layer incompleta | Usar layer 91+ |
| `ExpiredTokenException` | Sessão SSO expirada | Executar `aws sso login --profile EVO_SANDBOX` |
