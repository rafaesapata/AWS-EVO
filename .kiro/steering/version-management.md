# Version Management

## 🚨 REGRA OBRIGATÓRIA: Versão Centralizada

A versão do sistema é gerenciada de forma centralizada. **NUNCA** hardcode versões em arquivos individuais.

## Source of Truth

| Arquivo | Função |
|---------|--------|
| `version.json` | **ÚNICO local para editar versão** |
| `src/lib/version.ts` | Runtime frontend (auto-gerado) |
| `backend/src/lib/version.ts` | Runtime backend (auto-gerado) |
| `package.json` | Atualizado automaticamente |
| `backend/package.json` | Atualizado automaticamente |
| `cli/package.json` | Atualizado automaticamente |

## Como Atualizar a Versão

### Usando o Script (RECOMENDADO)

```bash
# Incrementar patch: 3.0.0 -> 3.0.1
npx tsx scripts/increment-version.ts patch

# Incrementar minor: 3.0.0 -> 3.1.0
npx tsx scripts/increment-version.ts minor

# Incrementar major: 3.0.0 -> 4.0.0
npx tsx scripts/increment-version.ts major

# Ver versão atual
npx tsx scripts/increment-version.ts show
```

O script atualiza automaticamente:
- `version.json`
- `package.json`
- `backend/package.json`
- `cli/package.json`
- `src/lib/version.ts`

### Após Atualizar

```bash
# 1. Build frontend
npm run build

# 2. Build backend
npm run build --prefix backend

# 3. Deploy frontend
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete
aws cloudfront create-invalidation --distribution-id E1PY7U3VNT6P1R --paths "/*"

# 4. Deploy Lambdas (se necessário)
./scripts/deploy-all-lambdas.sh
```

## Usando a Versão no Código

### Frontend (React/TypeScript)

```typescript
import { VERSION, APP_VERSION, getVersionString } from '@/lib/version';

// Usar a versão
console.log(VERSION);           // "3.0.0"
console.log(getVersionString()); // "v3.0.0"
console.log(APP_VERSION.codename); // "Multi-Cloud"
```

### Backend (Node.js/TypeScript)

```typescript
import { VERSION, getVersionString } from '../../lib/version.js';

// Usar a versão
console.log(VERSION);           // "3.0.0"
console.log(getVersionString()); // "v3.0.0"
```

## Estrutura do version.json

```json
{
  "version": "3.0.0",
  "major": 3,
  "minor": 0,
  "patch": 0,
  "releaseDate": "2026-01-30",
  "codename": "Multi-Cloud"
}
```

## ⛔ O QUE NÃO FAZER

```typescript
// ❌ ERRADO - Versão hardcoded
const version = "3.0.0";
.version('3.0.0');
info: { version: '3.0.0' }

// ✅ CORRETO - Importar do módulo centralizado
import { VERSION } from '@/lib/version';
const version = VERSION;
.version(VERSION);
info: { version: VERSION }
```

## Checklist para Novas Features

- [ ] Não adicionar versões hardcoded em nenhum arquivo
- [ ] Usar `import { VERSION } from '@/lib/version'` no frontend
- [ ] Usar `import { VERSION } from '../../lib/version.js'` no backend
- [ ] Após release significativo, rodar `npx tsx scripts/increment-version.ts`

---

**Última atualização:** 2026-01-30
**Versão:** 1.0
