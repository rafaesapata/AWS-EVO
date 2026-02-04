---
inclusion: always
---

# Padrões de Desenvolvimento

## Stack Tecnológica

| Camada | Tecnologia |
|--------|------------|
| **Backend** | Node.js 18.x (Lambda), TypeScript (CommonJS), Prisma, PostgreSQL |
| **Frontend** | React 18 + Vite, TypeScript, shadcn/ui + Tailwind CSS |
| **Infra** | AWS CDK (TypeScript) |

## ⛔ PROIBIÇÕES ABSOLUTAS

1. **NÃO criar Lambdas em Python** - Todo backend DEVE ser Node.js/TypeScript
2. **NÃO usar DynamoDB** - Banco de dados é PostgreSQL via Prisma
3. **NÃO usar mocks em testes** - Testes DEVEM usar dados e serviços reais
4. **NÃO mudar arquitetura** sem aprovação explícita

---

## Padrão de Handler Lambda

```typescript
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationId(user);
  const prisma = getPrismaClient();
  
  // Implementação...
}
```

---

## Audit Logging

### Usar em TODOS os handlers que modificam dados

```typescript
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';

// Após ação bem-sucedida
logAuditAsync({
  organizationId,
  userId: user.sub,
  action: 'SECURITY_SCAN_COMPLETE',
  resourceType: 'security_scan',
  resourceId: scan.id,
  details: { duration_ms: duration, findings_count: findings.length },
  ipAddress: getIpFromEvent(event),
  userAgent: getUserAgentFromEvent(event),
});
```

### Ações Disponíveis
`LOGIN`, `LOGOUT`, `LOGIN_FAILED`, `MFA_ENABLED`, `MFA_DISABLED`, `MFA_VERIFIED`, `PASSWORD_CHANGE`, `USER_CREATE`, `USER_UPDATE`, `USER_DELETE`, `USER_DISABLE`, `USER_ENABLE`, `CREDENTIAL_CREATE`, `CREDENTIAL_UPDATE`, `CREDENTIAL_DELETE`, `SECURITY_SCAN_START`, `SECURITY_SCAN_COMPLETE`, `COMPLIANCE_SCAN_START`, `COMPLIANCE_SCAN_COMPLETE`, `COST_ANALYSIS`, `REPORT_GENERATE`, `REPORT_EXPORT`, `ALERT_CREATE`, `ALERT_UPDATE`, `ALERT_DELETE`, `TICKET_CREATE`, `TICKET_UPDATE`, `TICKET_CLOSE`, `AI_CHAT`, `SETTINGS_UPDATE`, `ORGANIZATION_UPDATE`, `LICENSE_SYNC`, `DATA_EXPORT`, `DATA_DELETE`, `PERMISSION_CHANGE`, `API_KEY_CREATE`, `API_KEY_REVOKE`, `CLOUDTRAIL_ANALYSIS`, `WAF_SETUP`, `WAF_BLOCK_IP`, `WAF_UNBLOCK_IP`

---

## MFA Implementation

### 🚨 NÃO usar Cognito para MFA

MFA é implementado localmente, não via Cognito.

### Fluxo
1. Backend gera secret TOTP com `crypto.randomBytes(20)`
2. Secret salvo na tabela `mfa_factors` (PostgreSQL)
3. Verificação local com função `verifyTOTP()`

### Lambdas MFA
| Lambda | Função |
|--------|--------|
| `mfa-enroll` | Cadastrar novo fator |
| `mfa-check` | Verificar se usuário tem MFA |
| `mfa-challenge-verify` | Verificar código durante enrollment |
| `mfa-verify-login` | Verificar código durante login |
| `mfa-list-factors` | Listar fatores do usuário |
| `mfa-unenroll` | Remover fator |

---

## Multi-tenancy

- **TODAS** as queries DEVEM filtrar por `organization_id`
- Usar `getOrganizationId(user)` ou `getOrganizationIdWithImpersonation(event, user)`
- **NUNCA** expor dados de outras organizações

---

## Política Anti-Mocks

### ⛔ PROIBIDO
```typescript
// ❌ Dados mockados
const mockData = { tenantId: 'test-tenant-id' };
return success({ data: mockData });

// ❌ Mocks em testes
jest.mock('@azure/identity');

// ❌ Fallback para mock
catch { return mockData; }
```

### ✅ CORRETO
```typescript
// ✅ Dados reais do banco
const credentials = await prisma.azureCredential.findFirst({ where: { organizationId } });
if (!credentials) return error('No credentials found', 404);

// ✅ Erros reais
catch (err) { return error(err.message, 500); }
```

---

## Build Commands

```bash
# Frontend
npm run build

# Backend
npm run build --prefix backend

# TypeScript check
npx tsc --noEmit -p backend/tsconfig.json
```

---

## Estrutura de Diretórios

```
├── backend/
│   ├── src/handlers/    # Lambda handlers por categoria
│   ├── src/lib/         # Bibliotecas compartilhadas
│   ├── src/types/       # Tipos TypeScript
│   └── prisma/schema.prisma
├── src/                 # Frontend React
├── infra/               # AWS CDK
└── .kiro/steering/      # Instruções para IA
```

---

**Última atualização:** 2026-02-03
