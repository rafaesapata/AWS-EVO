---
inclusion: always
---

# Padrões de Desenvolvimento

## Stack
- Backend: Node.js 18.x (Lambda), TypeScript (CommonJS), Prisma, PostgreSQL
- Frontend: React 18 + Vite, TypeScript, shadcn/ui + Tailwind CSS

## ⛔ PROIBIÇÕES
1. NÃO criar Lambdas em Python — só Node.js/TypeScript
2. NÃO usar DynamoDB — só PostgreSQL via Prisma
3. NÃO usar mocks/dados sintéticos — dados e serviços reais sempre
4. NÃO mudar arquitetura sem aprovação

## Handler Lambda (template)

```typescript
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

export async function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === 'OPTIONS') return corsOptions();
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationId(user);
  const prisma = getPrismaClient();
  // Implementação...
}
```

## Audit Logging (OBRIGATÓRIO em handlers que modificam dados)

```typescript
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
logAuditAsync({ organizationId, userId: user.sub, action: 'ACTION_NAME', resourceType: 'type', resourceId: id, details: {}, ipAddress: getIpFromEvent(event), userAgent: getUserAgentFromEvent(event) });
```

## Multi-tenancy
- TODAS queries DEVEM filtrar por `organization_id`
- Usar `getOrganizationId(user)` ou `getOrganizationIdWithImpersonation(event, user)`

## MFA — implementação LOCAL (NÃO Cognito)
Secret TOTP via `crypto.randomBytes(20)`, salvo em `mfa_factors` (PostgreSQL).

## Build (SEMPRE testar antes de push)
```bash
npm run build --prefix backend  # Backend
npm run build                    # Frontend
```

## Estrutura
```
backend/src/handlers/  — Lambda handlers por categoria
backend/src/lib/       — Bibliotecas compartilhadas
backend/src/types/     — Tipos TypeScript
backend/prisma/        — Schema Prisma
src/                   — Frontend React
```
