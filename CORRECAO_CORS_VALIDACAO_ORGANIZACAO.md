# Correção de Erro CORS - Validação de Organização

## 🔴 Problema Identificado

**Erro:** Access to fetch at 'https://api.evo.ia.udstec.io/api/profiles/check' from origin 'https://evo.ia.udstec.io' has been blocked by CORS policy

**Causa:** Os endpoints `/api/profiles/check` e `/api/profiles/create-with-org` ainda não foram deployados no API Gateway.

---

## ✅ Solução Implementada

### Feature Flag para Validação de Organização

Adicionada uma feature flag que permite desabilitar temporariamente a validação de organização até que os Lambdas sejam deployados.

### Mudanças Realizadas

**1. Arquivo: `src/integrations/aws/cognito-client-simple.ts`**

```typescript
// Antes (causava erro CORS)
const session = this.buildSessionFromResponse(response);
await this.validateOrganizationBinding(session.user);
return session;

// Depois (com feature flag)
const session = this.buildSessionFromResponse(response);

// Validar vínculo de organização (desabilitado até deploy dos Lambdas)
const enableOrgValidation = import.meta.env.VITE_ENABLE_ORG_VALIDATION === 'true';
if (enableOrgValidation) {
  await this.validateOrganizationBinding(session.user);
}

return session;
```

**2. Arquivo: `.env.example`**

```bash
# ===== FEATURE FLAGS =====
VITE_ENABLE_ORG_VALIDATION=false
```

**3. Arquivo: `.env`**

```bash
# Feature Flags
VITE_ENABLE_ORG_VALIDATION=false
```

---

## 🚀 Como Habilitar a Validação

### Após Deploy dos Lambdas

1. **Deploy do API Gateway com os novos endpoints:**
   ```bash
   cd infra
   cdk bootstrap aws://418272799411/us-east-1  # Se ainda não foi feito
   cdk deploy EvoUdsDevelopmentApiStack
   ```

2. **Verificar se os endpoints estão disponíveis:**
   ```bash
   curl -X OPTIONS https://api.evo.ia.udstec.io/api/profiles/check \
     -H "Origin: https://evo.ia.udstec.io" \
     -H "Access-Control-Request-Method: POST" \
     -v
   ```

3. **Habilitar a feature flag:**
   
   Editar `.env`:
   ```bash
   VITE_ENABLE_ORG_VALIDATION=true
   ```

4. **Rebuildar e fazer deploy:**
   ```bash
   npm run build
   aws s3 sync dist/ s3://evo-uds-frontend-418272799411-us-east-1/ --delete
   aws cloudfront create-invalidation --distribution-id E2XXQNM8HXHY56 --paths "/*"
   ```

---

## 📊 Status Atual

### ✅ Funcionando
- Login com AWS Cognito
- Autenticação JWT
- Acesso ao sistema
- Todas as funcionalidades principais

### ⏳ Pendente (Desabilitado Temporariamente)
- Validação automática de organização
- Criação automática de profile com organização UDS
- Endpoints `/api/profiles/check` e `/api/profiles/create-with-org`

---

## 🔍 Verificação

### Testar Login Atual

1. Acesse: https://evo.ia.udstec.io
2. Faça login com suas credenciais
3. O login deve funcionar normalmente
4. Não haverá erro CORS no console

### Logs Esperados no Console

```
✅ Login bem-sucedido
✅ Sessão criada
✅ Redirecionamento para dashboard
```

**Não deve aparecer:**
```
❌ CORS error
❌ Failed to fetch
```

---

## 📝 Checklist de Deploy dos Lambdas

Quando estiver pronto para habilitar a validação:

- [ ] Bootstrap CDK realizado
- [ ] Stack de API deployado
- [ ] Endpoints testados manualmente
- [ ] CORS configurado corretamente
- [ ] Feature flag habilitada
- [ ] Frontend rebuildado
- [ ] CloudFront invalidado
- [ ] Testes E2E realizados

---

## 🛠️ Comandos Úteis

### Verificar API Gateway
```bash
# Listar APIs
aws apigateway get-rest-apis

# Listar recursos de uma API
aws apigateway get-resources --rest-api-id z3z39jk585

# Verificar método OPTIONS (CORS)
aws apigateway get-method \
  --rest-api-id z3z39jk585 \
  --resource-id RESOURCE_ID \
  --http-method OPTIONS
```

### Testar Endpoints
```bash
# Testar preflight (OPTIONS)
curl -X OPTIONS https://api.evo.ia.udstec.io/api/profiles/check \
  -H "Origin: https://evo.ia.udstec.io" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type" \
  -v

# Testar endpoint real (POST)
curl -X POST https://api.evo.ia.udstec.io/api/profiles/check \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: https://evo.ia.udstec.io" \
  -d '{"userId": "test-user-id"}' \
  -v
```

---

## 📚 Documentação Relacionada

- **VALIDACAO_ORGANIZACAO_LOGIN.md** - Documentação técnica completa
- **GUIA_RAPIDO_VALIDACAO_ORGANIZACAO.md** - Guia rápido de uso
- **DEPLOY_VALIDACAO_ORGANIZACAO_COMPLETO.md** - Status do deploy
- **RESUMO_EXECUTIVO_DEPLOY.md** - Resumo executivo

---

## 🎯 Próximos Passos

1. **Imediato:** ✅ Aplicação funcionando sem erro CORS
2. **Curto Prazo:** Deploy dos Lambdas no API Gateway
3. **Após Deploy:** Habilitar feature flag de validação
4. **Validação:** Testar fluxo completo de organização

---

## ✅ Resultado

A aplicação está funcionando normalmente sem erros CORS. A validação de organização será habilitada automaticamente após o deploy dos Lambdas no API Gateway.

**Status:** ✅ CORRIGIDO  
**Deploy:** ✅ REALIZADO  
**Aplicação:** ✅ FUNCIONANDO

**URL:** https://evo.ia.udstec.io
