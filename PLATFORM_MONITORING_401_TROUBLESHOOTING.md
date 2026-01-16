# Platform Monitoring - 401 Unauthorized Troubleshooting

**Data:** 2026-01-15  
**Status:** EM INVESTIGAÇÃO  
**Erro:** 401 Unauthorized ao acessar endpoints de Platform Monitoring

---

## 🚨 Problema

Os endpoints de Platform Monitoring retornam **401 Unauthorized**:
- `POST /api/functions/get-platform-metrics` → 401
- `POST /api/functions/get-recent-errors` → 401
- `POST /api/functions/generate-error-fix-prompt` → 401

### Sintomas
```
Error: Unauthorized
Failed to load resource: the server responded with a status of 401 ()
```

---

## 🔍 Investigação Realizada

### 1. Configuração do API Gateway ✅
- Endpoints existem: Resource ID `goaymq`, `j7obmh`, `658jbt`
- Authorizer configurado: `joelbs` (COGNITO_USER_POOLS)
- Integration type: AWS_PROXY
- Deploy realizado: 2026-01-15 15:01:10

### 2. Permissões Lambda ✅
- Lambda tem permissão para ser invocada pelo API Gateway
- Source ARN correto: `arn:aws:execute-api:us-east-1:383234048592:3l66kn0eaj/*/POST/api/functions/get-platform-metrics`

### 3. Lambda Funciona ✅
- Teste direto da Lambda retorna 200
- Lambda processa corretamente quando invocada diretamente

### 4. CORS ✅
- OPTIONS configurado corretamente
- Headers CORS presentes

### 5. Token
- Token existe no localStorage
- Token tem 43 minutos até expirar
- Usuário autenticado: `andre.almeida@uds.com.br`
- Organization ID: `0f1b33dc-cd5f-49e5-8579-fb4e7b1f5a42`
- Role: `super_admin`

---

## 🤔 Hipóteses

### Hipótese 1: Token Inválido para Novos Endpoints
**Probabilidade:** ALTA  
**Razão:** Outros endpoints funcionam, mas estes novos não

**Possíveis causas:**
- Token foi gerado antes dos endpoints serem criados
- Cognito Authorizer cache está rejeitando o token
- Token não tem os claims necessários para estes endpoints específicos

**Teste:** Fazer logout e login para obter token fresco

### Hipótese 2: Cognito Authorizer Cache
**Probabilidade:** MÉDIA  
**Razão:** Deploy do API Gateway foi feito recentemente

**Possíveis causas:**
- Authorizer está com cache antigo
- Precisa aguardar propagação (até 5 minutos)

**Teste:** Aguardar 5 minutos e testar novamente

### Hipótese 3: Cross-Origin Request Blocking
**Probabilidade:** BAIXA  
**Razão:** CORS está configurado, mas pode ter algum problema específico

**Possíveis causas:**
- Browser bloqueando por alguma política de segurança
- Preflight OPTIONS não retornando headers corretos

**Teste:** Testar com curl direto (sem browser)

---

## ✅ SOLUÇÃO RECOMENDADA

### Passo 1: Fazer Logout e Login

1. **Fazer logout:**
   - Clicar no menu do usuário (canto superior direito)
   - Clicar em "Sair"

2. **Fazer login novamente:**
   - Email: `andre.almeida@uds.com.br`
   - Senha: [sua senha]

3. **Acessar Platform Monitoring:**
   - Menu lateral → "Platform Monitoring"
   - Aguardar carregar

### Passo 2: Limpar Cache do Browser

Se o Passo 1 não funcionar:

1. **Abrir DevTools:** F12
2. **Ir para Application tab**
3. **Limpar Storage:**
   - Local Storage → Limpar tudo
   - Session Storage → Limpar tudo
4. **Hard Refresh:** Ctrl+Shift+R
5. **Fazer login novamente**

### Passo 3: Testar com Curl (Bypass Browser)

Se ainda não funcionar, testar com curl para isolar o problema:

```bash
# 1. Obter token do localStorage (copiar do DevTools)
TOKEN="seu-token-aqui"

# 2. Testar endpoint
curl -X POST https://api-evo.ai.udstec.io/api/functions/get-platform-metrics \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -v

# Se retornar 200: problema é no browser
# Se retornar 401: problema é no token/authorizer
```

---

## 🔧 Soluções Alternativas (Se Nada Funcionar)

### Opção 1: Remover Authorizer Temporariamente

**⚠️ NÃO RECOMENDADO - Apenas para debug**

```bash
# Remover authorizer do método POST
aws apigateway update-method \
  --rest-api-id 3l66kn0eaj \
  --resource-id goaymq \
  --http-method POST \
  --patch-operations op=replace,path=/authorizationType,value=NONE \
  --region us-east-1

# Deploy
aws apigateway create-deployment \
  --rest-api-id 3l66kn0eaj \
  --stage-name prod \
  --region us-east-1

# IMPORTANTE: Adicionar de volta depois!
```

### Opção 2: Criar Novo Authorizer

Se o authorizer `joelbs` estiver com problema:

```bash
# Criar novo authorizer
aws apigateway create-authorizer \
  --rest-api-id 3l66kn0eaj \
  --name CognitoAuthorizerV3 \
  --type COGNITO_USER_POOLS \
  --provider-arns arn:aws:cognito-idp:us-east-1:383234048592:userpool/us-east-1_cnesJ48lR \
  --identity-source method.request.header.Authorization \
  --region us-east-1
```

### Opção 3: Verificar User Pool

Verificar se o User Pool está funcionando:

```bash
aws cognito-idp describe-user-pool \
  --user-pool-id us-east-1_cnesJ48lR \
  --region us-east-1 \
  --query 'UserPool.Status'
```

---

## 📊 Comparação com Endpoints Funcionando

### Endpoint que FUNCIONA: `list-aws-credentials`

```bash
# Verificar configuração
aws apigateway get-method \
  --rest-api-id 3l66kn0eaj \
  --resource-id owc858 \
  --http-method POST \
  --region us-east-1
```

### Endpoint que NÃO FUNCIONA: `get-platform-metrics`

```bash
# Verificar configuração
aws apigateway get-method \
  --rest-api-id 3l66kn0eaj \
  --resource-id goaymq \
  --http-method POST \
  --region us-east-1
```

**Comparar:**
- authorizationType
- authorizerId
- methodIntegration.type
- methodIntegration.uri

---

## 🎯 Próximos Passos

1. **Usuário fazer logout/login** ← COMEÇAR AQUI
2. Se não funcionar: **Limpar cache do browser**
3. Se não funcionar: **Testar com curl**
4. Se não funcionar: **Comparar com endpoint funcionando**
5. Se não funcionar: **Habilitar logs do API Gateway**
6. Se não funcionar: **Criar novo authorizer**

---

## 📝 Logs para Coletar

Se o problema persistir, coletar:

1. **Token JWT decodificado:**
```javascript
// No console do browser
const token = localStorage.getItem('token');
const payload = JSON.parse(atob(token.split('.')[1]));
console.log(payload);
```

2. **Response headers completos:**
```javascript
// No Network tab do DevTools
// Copiar todos os headers da requisição que falhou
```

3. **Logs do CloudWatch da Lambda:**
```bash
aws logs tail /aws/lambda/evo-uds-v3-production-get-platform-metrics \
  --since 10m \
  --region us-east-1
```

---

**Última atualização:** 2026-01-15T20:05:00Z  
**Status:** Aguardando usuário fazer logout/login  
**Próxima ação:** Testar após novo login
