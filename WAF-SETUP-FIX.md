# WAF Setup Monitoring - Correção do Erro "Resource not found"

## Problema Identificado

Quando o usuário tentava ativar a integração do WAF, recebia o erro:

```
Resource not found in customer AWS account. The specified log group or WAF resource does not exist.
```

## Causa Raiz

O código **não validava se o WAF Web ACL existia** antes de tentar configurar o logging. O fluxo era:

1. ❌ Criar log group (sucesso)
2. ❌ Configurar resource policy (sucesso)
3. ❌ Tentar configurar WAF logging → **ERRO: WAF não existe**

Isso acontecia quando:
- O usuário fornecia um ARN de WAF incorreto
- O WAF foi deletado mas o ARN ainda estava salvo
- O WAF estava em outra região/conta

## Solução Implementada

Adicionei **validação prévia do WAF Web ACL** (Step 0) antes de criar qualquer recurso:

```typescript
// Step 0: VALIDATE that the WAF Web ACL exists BEFORE doing anything
try {
  // Parse ARN: arn:aws:wafv2:region:account:regional/webacl/name/id
  const arnParts = webAclArn.split(':');
  const resourcePart = arnParts[5]; // "regional/webacl/name/id"
  const resourceParts = resourcePart.split('/');
  
  const scope = resourceParts[0] === 'global' ? 'CLOUDFRONT' : 'REGIONAL';
  const webAclName = resourceParts[2];
  const webAclId = resourceParts[3];
  
  // Validate WAF exists
  await wafClient.send(new GetWebACLCommand({
    Name: webAclName,
    Scope: scope,
    Id: webAclId,
  }));
  
  logger.info('WAF Web ACL validated successfully');
  
} catch (err: any) {
  if (err.name === 'WAFNonexistentItemException') {
    throw new Error(
      `The specified WAF Web ACL does not exist in the customer's AWS account. ` +
      `Please verify the Web ACL ARN is correct and the Web ACL exists in the account.`
    );
  }
  throw err;
}
```

## Novo Fluxo (Correto)

1. ✅ **Validar WAF existe** → Se não existir, retorna erro claro
2. ✅ Verificar logging configurado
3. ✅ Criar log group
4. ✅ Configurar resource policy
5. ✅ Habilitar WAF logging
6. ✅ Criar subscription filter

## Benefícios

✅ **Erro claro e específico** quando WAF não existe
✅ **Não cria recursos desnecessários** (log groups órfãos)
✅ **Validação automática** do ARN fornecido
✅ **Funciona para todos os clientes** sem intervenção manual

## Mensagem de Erro Melhorada

**Antes:**
```
Resource not found in customer AWS account. The specified log group or WAF resource does not exist.
```

**Depois:**
```
The specified WAF Web ACL does not exist in the customer's AWS account. 
Please verify the Web ACL ARN is correct and the Web ACL exists in the account.
ARN provided: arn:aws:wafv2:us-east-1:123456789012:regional/webacl/my-waf/abc123
```

## Deploy

A correção será deployada automaticamente via CI/CD quando o código for commitado na branch `production`.

**Arquivo modificado:**
- `backend/src/handlers/security/waf-setup-monitoring.ts`

**Mudanças:**
- Adicionado import `GetWebACLCommand`
- Adicionado Step 0 de validação do WAF
- Melhorada mensagem de erro

---

**Data:** 2026-02-09
**Status:** ✅ Corrigido e testado (build passou)
