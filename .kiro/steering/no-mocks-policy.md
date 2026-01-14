---
inclusion: always
---

# 🚨 POLÍTICA DE PROIBIÇÃO DE MOCKS

## Regra Absoluta

**NUNCA usar dados mockados, stubs, ou dados de teste em código de produção.**

## ⛔ PROIBIÇÕES

### 1. Dados Mockados em Handlers/APIs
```typescript
// ❌ PROIBIDO - Dados mockados
const mockData = {
  tenantId: 'test-tenant-id',
  clientId: 'mock-client-id',
  subscriptionId: '00000000-0000-0000-0000-000000000000',
};

// ❌ PROIBIDO - Retornar dados fake
return success({
  valid: true,
  data: mockData, // NUNCA!
});
```

### 2. Mocks em Testes de Integração
```typescript
// ❌ PROIBIDO - Mockar serviços reais em testes
jest.mock('@azure/identity');
jest.mock('aws-sdk');

// ❌ PROIBIDO - Usar stubs
const mockClient = {
  listResourceGroups: jest.fn().mockResolvedValue([]),
};
```

### 3. Dados de Teste Hardcoded
```typescript
// ❌ PROIBIDO - Credenciais de teste hardcoded
const testCredentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};

// ❌ PROIBIDO - IDs de teste
const testOrgId = 'test-org-123';
const testUserId = 'test-user-456';
```

### 4. Fallbacks para Dados Mock
```typescript
// ❌ PROIBIDO - Fallback para mock quando API falha
try {
  const data = await fetchRealData();
  return data;
} catch {
  return mockData; // NUNCA!
}
```

## ✅ O QUE FAZER

### 1. Usar Dados Reais
```typescript
// ✅ CORRETO - Buscar dados reais do banco/API
const credentials = await prisma.azureCredential.findFirst({
  where: { organizationId },
});

if (!credentials) {
  return error('No credentials found', 404);
}
```

### 2. Validar Dados de Entrada
```typescript
// ✅ CORRETO - Validar dados do usuário
const validation = schema.safeParse(body);
if (!validation.success) {
  return error('Invalid input', 400);
}

// Usar dados validados do usuário
const { tenantId, clientId } = validation.data;
```

### 3. Retornar Erros Reais
```typescript
// ✅ CORRETO - Retornar erro real quando algo falha
try {
  const result = await azureProvider.validateCredentials();
  return success(result);
} catch (err) {
  return error(err.message, 500); // Erro real, não mock
}
```

### 4. Testes com Dados Reais
```typescript
// ✅ CORRETO - Testes usam ambiente real ou sandbox
describe('Azure Credentials', () => {
  it('should validate real credentials', async () => {
    // Usar credenciais de ambiente de teste real
    const result = await validateCredentials(process.env.TEST_AZURE_CREDENTIALS);
    expect(result.valid).toBeDefined();
  });
});
```

## Por Que Esta Política?

### 1. Segurança
- Mocks podem esconder vulnerabilidades reais
- Dados de teste podem vazar para produção
- Credenciais mockadas podem ser exploradas

### 2. Confiabilidade
- Mocks não testam o comportamento real do sistema
- Bugs só aparecem em produção
- Integrações reais podem falhar de formas não previstas

### 3. Qualidade
- Código com mocks é mais difícil de manter
- Mocks ficam desatualizados com o tempo
- Testes com mocks dão falsa sensação de segurança

### 4. Debugging
- Mocks dificultam identificar problemas reais
- Logs com dados mockados são inúteis
- Erros reais são mascarados

## Exceções (MUITO RARAS)

### Única exceção permitida: Testes Unitários Isolados

```typescript
// ⚠️ EXCEÇÃO - Apenas para testes unitários de lógica pura
describe('calculateDiscount', () => {
  it('should apply 10% discount', () => {
    // OK para testar lógica matemática pura
    const result = calculateDiscount(100, 0.1);
    expect(result).toBe(90);
  });
});
```

**NUNCA** usar mocks para:
- Testes de integração
- Testes E2E
- Código de produção
- Handlers de API
- Validação de credenciais

## Checklist de Code Review

Antes de aprovar um PR, verificar:

- [ ] Não há dados mockados em handlers
- [ ] Não há `jest.mock()` para serviços externos em testes de integração
- [ ] Não há credenciais de teste hardcoded
- [ ] Não há fallbacks para dados mock
- [ ] Erros são retornados como erros reais, não mascarados
- [ ] Logs contêm dados reais (sanitizados), não mocks

## Consequências de Violação

1. **PR será rejeitado** - Código com mocks não será mergeado
2. **Rollback imediato** - Se descoberto em produção, será revertido
3. **Investigação** - Será investigado como o mock chegou a produção

---

**Última atualização:** 2026-01-12  
**Versão:** 1.0  
**Política:** Obrigatória para todo o código
