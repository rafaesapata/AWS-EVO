# Audit Logging Guidelines

## 🚨 IMPORTANTE: Todos os handlers devem registrar logs de auditoria

Este documento define o padrão para registro de logs de auditoria no sistema EVO.

## Serviço de Auditoria

O sistema possui um serviço centralizado de auditoria em `backend/src/lib/audit-service.ts`.

### Funções Disponíveis

```typescript
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
```

| Função | Descrição |
|--------|-----------|
| `logAuditAsync()` | Registra log de auditoria (fire-and-forget, nunca quebra o fluxo) |
| `logAudit()` | Versão async que pode ser awaited |
| `getIpFromEvent()` | Extrai IP do evento Lambda |
| `getUserAgentFromEvent()` | Extrai User-Agent do evento Lambda |

## Ações de Auditoria Disponíveis

```typescript
type AuditAction = 
  | 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED'
  | 'MFA_ENABLED' | 'MFA_DISABLED' | 'MFA_VERIFIED'
  | 'PASSWORD_CHANGE'
  | 'USER_CREATE' | 'USER_UPDATE' | 'USER_DELETE' | 'USER_DISABLE' | 'USER_ENABLE'
  | 'CREDENTIAL_CREATE' | 'CREDENTIAL_UPDATE' | 'CREDENTIAL_DELETE'
  | 'SECURITY_SCAN_START' | 'SECURITY_SCAN_COMPLETE'
  | 'COMPLIANCE_SCAN_START' | 'COMPLIANCE_SCAN_COMPLETE'
  | 'COST_ANALYSIS' | 'REPORT_GENERATE' | 'REPORT_EXPORT'
  | 'ALERT_CREATE' | 'ALERT_UPDATE' | 'ALERT_DELETE'
  | 'TICKET_CREATE' | 'TICKET_UPDATE' | 'TICKET_CLOSE'
  | 'AI_CHAT' | 'SETTINGS_UPDATE' | 'ORGANIZATION_UPDATE'
  | 'LICENSE_SYNC' | 'DATA_EXPORT' | 'DATA_DELETE'
  | 'PERMISSION_CHANGE' | 'API_KEY_CREATE' | 'API_KEY_REVOKE'
  | 'CLOUDTRAIL_ANALYSIS' | 'WAF_SETUP' | 'WAF_BLOCK_IP' | 'WAF_UNBLOCK_IP';
```

## Tipos de Recursos

```typescript
type AuditResourceType =
  | 'user' | 'organization' | 'aws_credential' | 'azure_credential'
  | 'security_scan' | 'compliance_scan' | 'cost_report'
  | 'alert' | 'ticket' | 'copilot' | 'settings' | 'license'
  | 'api_key' | 'cloudtrail' | 'waf' | 'report' | 'mfa' | 'session';
```

## ✅ Como Usar

### 1. Adicionar Import

```typescript
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
```

### 2. Chamar após ação bem-sucedida

```typescript
// Após a ação principal ser concluída com sucesso
logger.info('Ação concluída com sucesso', { ... });

// Audit log (fire-and-forget, nunca quebra o fluxo principal)
logAuditAsync({
  organizationId,
  userId: user.sub,
  action: 'SECURITY_SCAN_COMPLETE',
  resourceType: 'security_scan',
  resourceId: scan.id,
  details: {
    duration_ms: duration,
    findings_count: findings.length,
    // outros detalhes relevantes
  },
  ipAddress: getIpFromEvent(event),
  userAgent: getUserAgentFromEvent(event),
});

return success({ ... });
```

## ⚠️ Regras Importantes

### 1. Usar `logAuditAsync` (não `logAudit`)
- `logAuditAsync` é fire-and-forget e NUNCA quebra o fluxo principal
- Mesmo se falhar, o handler continua normalmente

### 2. Chamar APÓS a ação principal
- Primeiro execute a ação (criar, atualizar, deletar)
- Depois registre o log de auditoria
- Isso garante que só logamos ações que realmente aconteceram

### 3. Incluir detalhes relevantes
- Sempre inclua `organizationId` e `userId`
- Inclua `resourceId` quando aplicável
- Adicione detalhes úteis para investigação (mas não dados sensíveis)

### 4. Não incluir dados sensíveis
- ❌ Senhas, tokens, secrets
- ❌ Dados pessoais completos (CPF, cartão)
- ✅ IDs, nomes de recursos, contagens, durações

## Exemplo Completo

```typescript
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    // ... executar ação principal ...
    const result = await prisma.someTable.create({ ... });

    logger.info('Recurso criado com sucesso', { id: result.id });

    // Audit log (fire-and-forget)
    logAuditAsync({
      organizationId,
      userId: user.sub,
      action: 'RESOURCE_CREATE',
      resourceType: 'some_resource',
      resourceId: result.id,
      details: { name: result.name },
      ipAddress: getIpFromEvent(event),
      userAgent: getUserAgentFromEvent(event),
    });

    return success({ id: result.id });

  } catch (err) {
    logger.error('Erro ao criar recurso', err as Error);
    return error('Internal server error');
  }
}
```

## Handlers que JÁ têm Auditoria

- ✅ `security-scan.ts` - SECURITY_SCAN_COMPLETE
- ✅ `save-aws-credentials.ts` - CREDENTIAL_CREATE, CREDENTIAL_UPDATE
- ✅ `mfa-handlers.ts` - MFA_ENABLED
- ✅ `bedrock-chat.ts` - AI_CHAT
- ✅ `admin-manage-user.ts` - USER_UPDATE, USER_DELETE, etc.
- ✅ `disable-cognito-user.ts` - USER_DISABLE
- ✅ `create-user.ts` - USER_CREATE

## Handlers que PRECISAM de Auditoria

Ao criar ou modificar estes handlers, adicione auditoria:

- [ ] `compliance-scan.ts` - COMPLIANCE_SCAN_COMPLETE
- [ ] `well-architected-scan.ts` - Scan complete
- [ ] `delete-aws-credentials.ts` - CREDENTIAL_DELETE
- [ ] `save-azure-credentials.ts` - CREDENTIAL_CREATE
- [ ] `delete-azure-credentials.ts` - CREDENTIAL_DELETE
- [ ] `alerts.ts` - ALERT_CREATE, ALERT_UPDATE, ALERT_DELETE
- [ ] `generate-pdf-report.ts` - REPORT_GENERATE
- [ ] `waf-setup-monitoring.ts` - WAF_SETUP
- [ ] `waf-dashboard-api.ts` - WAF_BLOCK_IP, WAF_UNBLOCK_IP

## Checklist para Novos Handlers

- [ ] Importar `logAuditAsync`, `getIpFromEvent`, `getUserAgentFromEvent`
- [ ] Identificar ação apropriada (ou criar nova se necessário)
- [ ] Chamar `logAuditAsync` após ação bem-sucedida
- [ ] Incluir `organizationId`, `userId`, `action`, `resourceType`
- [ ] Incluir `resourceId` e `details` quando relevante
- [ ] Incluir `ipAddress` e `userAgent`
- [ ] Testar que o handler funciona mesmo se auditoria falhar

---

**Última atualização:** 2026-01-15
**Versão:** 1.0
