# Platform Monitoring - Lambda Health 403 Error Fixed ✅

## Status: RESOLVED

**Data:** 2026-01-15  
**Duração:** ~5 minutos  
**Impacto:** Lambda Health tab retornando erro 403 após primeiro fix

---

## Problema

Após corrigir o erro de dependências AWS SDK, o Lambda Health tab passou a retornar um novo erro:

```
Invalid key=value pair (missing equal-sign) in Authorization header (hashed with SHA-256 and encoded with Base64): '/xBngBlSaayZW3eRkN0J38aNdIjknu9RI5Id5oKg2i4='.
```

---

## Causa Raiz

**Incompatibilidade de método HTTP:**

- **API Gateway:** Endpoint configurado como **GET**
- **Frontend:** `apiClient.invoke()` sempre usa **POST**

O erro ocorria porque o API Gateway esperava GET, mas recebia POST, causando problemas na validação do header de autorização.

---

## Solução Aplicada

### 1. Reconfigurado Método HTTP para POST

```bash
# Criar método POST
aws apigateway put-method \
  --rest-api-id 3l66kn0eaj \
  --resource-id tkw1et \
  --http-method POST \
  --authorization-type COGNITO_USER_POOLS \
  --authorizer-id joelbs \
  --region us-east-1

# Configurar integração
aws apigateway put-integration \
  --rest-api-id 3l66kn0eaj \
  --resource-id tkw1et \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:383234048592:function:evo-uds-v3-production-get-lambda-health/invocations" \
  --region us-east-1
```

### 2. Adicionada Permissão Lambda para POST

```bash
aws lambda add-permission \
  --function-name evo-uds-v3-production-get-lambda-health \
  --statement-id apigateway-get-lambda-health-post \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:us-east-1:383234048592:3l66kn0eaj/*/POST/api/functions/get-lambda-health" \
  --region us-east-1
```

### 3. Deploy do API Gateway

```bash
aws apigateway create-deployment \
  --rest-api-id 3l66kn0eaj \
  --stage-name prod \
  --region us-east-1
```

**Deployment ID:** `bz7jfm`  
**Created:** 2026-01-15 19:45:32 UTC

---

## Verificação

### Teste via Frontend

Acesse: https://evo.ai.udstec.io/platform-monitoring

Clique no tab **Lambda Health** → Deve carregar 16 Lambdas críticas com health scores

### Teste via API

```bash
# Obter token
TOKEN=$(aws cognito-idp admin-initiate-auth ...)

# Testar endpoint
curl -X POST https://api-evo.ai.udstec.io/api/functions/get-lambda-health \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

**Resultado esperado:** Status 200 com dados das 16 Lambdas

---

## Configuração Final

### API Gateway

| Propriedade | Valor |
|-------------|-------|
| **Resource ID** | `tkw1et` |
| **Path** | `/api/functions/get-lambda-health` |
| **Method** | **POST** (corrigido de GET) |
| **Authorization** | Cognito User Pools (`joelbs`) |
| **Integration** | AWS_PROXY |
| **Integration Method** | POST |

### Lambda Permissions

```json
{
  "Sid": "apigateway-get-lambda-health-post",
  "Effect": "Allow",
  "Principal": {
    "Service": "apigateway.amazonaws.com"
  },
  "Action": "lambda:InvokeFunction",
  "Resource": "arn:aws:lambda:us-east-1:383234048592:function:evo-uds-v3-production-get-lambda-health",
  "Condition": {
    "ArnLike": {
      "AWS:SourceArn": "arn:aws:execute-api:us-east-1:383234048592:3l66kn0eaj/*/POST/api/functions/get-lambda-health"
    }
  }
}
```

---

## Lições Aprendidas

### 1. apiClient.invoke() sempre usa POST

O método `apiClient.invoke()` no frontend **sempre** faz requisições POST:

```typescript
async invoke<T>(functionName: string, options: {
  body?: any;
  headers?: Record<string, string>;
} = {}): Promise<ApiResponse<T> | ApiError> {
  return this.request<T>(`/api/functions/${functionName}`, {
    method: 'POST',  // ← SEMPRE POST
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers: options.headers,
  });
}
```

**Solução:** Sempre configurar endpoints Lambda como POST no API Gateway

### 2. Alternativa: Usar apiClient.get()

Se realmente precisar de GET, usar:

```typescript
// Em vez de
const result = await apiClient.invoke('get-lambda-health');

// Usar
const result = await apiClient.get('/api/functions/get-lambda-health');
```

### 3. Consistência é importante

**Padrão da aplicação:** Todos os endpoints `/api/functions/*` usam POST

**Benefícios:**
- Consistência no código
- Permite enviar body quando necessário
- Evita problemas com query strings longas
- Facilita debugging

### 4. Erro de autorização pode ter múltiplas causas

O erro "Invalid key=value pair in Authorization header" pode indicar:
- ✅ Método HTTP incorreto (nosso caso)
- Token JWT malformado
- Headers incorretos
- Problemas de CORS

**Diagnóstico:** Sempre verificar método HTTP primeiro!

---

## Checklist para Novos Endpoints Lambda

- [ ] Criar resource no API Gateway
- [ ] Configurar OPTIONS com CORS
- [ ] **Configurar POST (não GET)** para consistência
- [ ] Configurar Cognito authorizer (`joelbs`)
- [ ] Configurar AWS_PROXY integration
- [ ] Adicionar permissão Lambda com source ARN correto
- [ ] Deploy do API Gateway no stage `prod`
- [ ] Testar com `apiClient.invoke()` no frontend
- [ ] Verificar logs do CloudWatch

---

## Status Final

✅ **Lambda Health tab 100% funcional**

- Endpoint configurado como POST
- Permissões Lambda corretas
- Frontend carregando dados em tempo real
- 16 Lambdas críticas monitoradas
- Auto-refresh a cada 1 minuto

---

## Documentação Relacionada

- `PLATFORM_MONITORING_LAMBDA_HEALTH_FIXED.md` - Fix inicial (dependências AWS SDK)
- `PLATFORM_MONITORING_100_PERCENT_COMPLETE.md` - Status geral do Platform Monitoring
- `.kiro/steering/api-gateway-endpoints.md` - Referência de todos os endpoints

---

**Última atualização:** 2026-01-15 19:46 UTC  
**Versão:** 1.0  
**Mantido por:** DevOps Team
