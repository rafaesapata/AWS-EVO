---
inclusion: always
---

# Deploy & Lambda

## ⛔ NUNCA deploy manual. Todo deploy via CI/CD (commit + push).

## Deploy Incremental (CI/CD automático)

| Mudança | Estratégia | Tempo |
|---------|-----------|-------|
| Handler(s) em `backend/src/handlers/` | INCREMENTAL | ~1-2min |
| `backend/src/lib/` ou `types/` | INCREMENTAL_ALL | ~5min |
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
- `@aws-sdk/*` no External funciona APENAS com FULL_SAM (esbuild pelo SAM)
- INCREMENTAL copia .js sem bundling → `Cannot find module '@aws-sdk/client-*'`
- Diagnóstico: CodeSize ~40KB = incremental (quebrado) | ~1-2MB = SAM (correto)
- Fix: alterar `sam/production-lambdas-only.yaml` (bump Description) para forçar FULL_SAM

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
