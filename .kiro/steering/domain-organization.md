---
inclusion: always
---

# Organização por Domínios

## Repositórios

| Repositório | Conteúdo | URL |
|-------------|----------|-----|
| `AWS-EVO` | Backend (lambdas, infra, CI/CD) | github.com/rafaesapata/AWS-EVO |
| `evo-frontend` | Frontend React | github.com/rafaesapata/evo-frontend |

## Domínios do Backend

Os 194 handlers estão organizados em 8 domínios lógicos. O mapa completo está em `backend/src/domains/index.ts`.

| Domínio | Handlers | Diretórios |
|---------|----------|------------|
| **security** | 28 | `handlers/security/` |
| **cloud** | 26 | `handlers/aws/`, `handlers/azure/`, `handlers/cloud/` |
| **cost** | 17 | `handlers/cost/`, `handlers/ml/` |
| **auth** | 12 | `handlers/auth/`, `handlers/profiles/`, `handlers/user/` |
| **monitoring** | 20 | `handlers/monitoring/`, `handlers/dashboard/` |
| **operations** | 43 | `handlers/jobs/`, `handlers/admin/`, `handlers/system/`, `handlers/maintenance/`, `handlers/debug/` |
| **ai** | 20 | `handlers/ai/`, `handlers/kb/`, `handlers/reports/` |
| **integrations** | 25 | `handlers/notifications/`, `handlers/integrations/`, `handlers/data/`, `handlers/storage/`, `handlers/websocket/`, `handlers/organizations/`, `handlers/license/` |

## Regras de Domínio

1. Novos handlers DEVEM ser criados no diretório do domínio correto
2. Libs compartilhadas entre domínios ficam em `lib/` (shared/core)
3. Libs específicas de domínio ficam em subdiretórios de `lib/` (ex: `lib/security-engine/`, `lib/cost/`)
4. O SAM template e CI/CD referenciam handlers pelo path original - NÃO mover arquivos existentes
