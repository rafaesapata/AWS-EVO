---
inclusion: always
---

# Deploy & Lambda

## ⛔ NUNCA deploy manual. Todo deploy via CI/CD (commit + push).

## Deploy Incremental (CI/CD automático)

| Mudança | Estratégia | Tempo |
|---------|-----------|-------|
| Handler(s) sem `@aws-sdk` e sem `dynamic import()` de `lib/` | INCREMENTAL | ~1-2min |
| Handler(s) com `@aws-sdk` OU `dynamic import()` de `lib/` | FULL_SAM (auto-detectado) | ~10min |
| `backend/src/lib/` ou `types/` | FULL_SAM | ~10min |
| `sam/*.yaml` ou `prisma/schema.prisma` | FULL_SAM | ~10min |
| `src/`, `public/`, `index.html` | FRONTEND_ONLY | ~2min |
| `docs/`, `scripts/`, `cicd/`, `.md` | SKIP | ~1min |

Branches: `main` → Sandbox | `production` → Production

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
    External: ['@prisma/client', '.prisma/client', '@aws-sdk/*']
```

## FULL_SAM vs INCREMENTAL
- `@aws-sdk/*` NÃO está na Lambda Layer — precisa ser bundled pelo esbuild (FULL_SAM)
- INCREMENTAL copia .js sem bundling → `Cannot find module '@aws-sdk/client-*'`
- Diagnóstico: CodeSize ~40KB = incremental (quebrado) | ~1-2MB = SAM (correto)
- Fix: alterar `sam/production-lambdas-only.yaml` (bump Description) para forçar FULL_SAM

### Proteções implementadas (5 camadas)
1. **CI/CD buildspec**: `lib/types` mudanças → FULL_SAM (nunca mais INCREMENTAL_ALL)
2. **CI/CD buildspec**: Handlers com `@aws-sdk/*` → auto-detecta e força FULL_SAM
3. **CI/CD buildspec**: Handlers com `dynamic import()` de `lib/` → auto-detecta e força FULL_SAM
4. **Deploy script**: `deploy-changed-lambdas.sh` bloqueia deploy de handler que importa `@aws-sdk/*`
5. **Deploy script**: `deploy-changed-lambdas.sh` bloqueia deploy de handler com `dynamic import()` de `lib/` ou `require('../../lib/')` não-reescrito no .js compilado

## Azure SDK — Crypto Polyfill (PRIMEIRO import em handlers Azure)
```typescript
import * as crypto from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = crypto.webcrypto || crypto;
}
```

## Lambdas Críticas
- 🔴 Onboarding: `save-aws-credentials`, `validate-aws-credentials`, `save-azure-credentials`, `validate-azure-credentials`
- 🟠 Core: `security-scan`, `compliance-scan`, `mfa-enroll`, `mfa-verify-login`

## Troubleshooting

| Erro | Causa | Solução |
|------|-------|---------|
| `Cannot find module '../../lib/xxx.js'` | Deploy só copiou handler | Refazer deploy com lib/types |
| `Runtime.ImportModuleError` | Handler path incorreto | Verificar handler path |
| `Cannot find module '@aws-sdk/client-*'` | Deploy INCREMENTAL | Forçar FULL_SAM (ver acima) |
| `Azure SDK not installed` | Layer sem Azure SDK | Usar layer 91+ |
| `crypto is not defined` | Sem crypto polyfill | Adicionar polyfill (ver acima) |
| `Cannot find module 'jsonwebtoken'` | Layer incompleta | Usar layer 91+ |
