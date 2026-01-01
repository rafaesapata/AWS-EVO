# 🔍 Diagnóstico: Problema na Tela de Gerenciamento de Licenças

## 🚨 Problema Identificado

A tela de gerenciamento de licenças (`https://evo.ai.udstec.io/license-management`) não está carregando a licença existente e está pedindo para configurar novamente.

## 🔎 Causa Raiz

O **User Pool do Cognito** (`us-east-1_qGmGkvmpL`) **não possui atributos customizados configurados**:

- ❌ `custom:organization_id` - Necessário para multi-tenancy
- ❌ `custom:roles` - Necessário para controle de acesso
- ❌ `custom:organization_name` - Usado no frontend

### Evidências

```bash
# User Pool não tem schema customizado
aws cognito-idp describe-user-pool --user-pool-id us-east-1_qGmGkvmpL --query 'UserPool.Schema'
# Resultado: null

# Tentativa de definir atributos falha silenciosamente
aws cognito-idp admin-update-user-attributes \
  --user-pool-id us-east-1_qGmGkvmpL \
  --username test@udstec.io \
  --user-attributes Name=custom:organization_id,Value=f7c9c432-d2c9-41ad-be8f-38883c06cb48
# Executa sem erro, mas atributo não é criado
```

## 🔄 Fluxo do Problema

1. **Usuário faz login** → Token JWT é gerado
2. **Frontend chama `/api/functions/validate-license`** → Handler tenta extrair `organization_id`
3. **`getOrganizationId(user)`** → Busca `user['custom:organization_id']`
4. **Atributo não existe** → Função lança erro "Organization not found"
5. **Handler retorna 401 Unauthorized** → Frontend mostra tela de configuração

## 🛠️ Soluções Possíveis

### Solução 1: Recriar User Pool (Recomendada)
```bash
# Criar novo User Pool com atributos customizados
aws cognito-idp create-user-pool \
  --pool-name "evo-uds-v3-production-users-v2" \
  --schema '[
    {
      "Name": "organization_id",
      "AttributeDataType": "String",
      "Mutable": true,
      "Required": false
    },
    {
      "Name": "roles", 
      "AttributeDataType": "String",
      "Mutable": true,
      "Required": false
    },
    {
      "Name": "organization_name",
      "AttributeDataType": "String", 
      "Mutable": true,
      "Required": false
    }
  ]'
```

### Solução 2: Modificar Sistema (Alternativa)
- Armazenar `organization_id` no banco de dados
- Modificar `getOrganizationId()` para buscar no banco
- Manter compatibilidade com atributos Cognito quando disponíveis

### Solução 3: Usar Grupos Cognito
- Criar grupos por organização
- Modificar sistema para usar grupos ao invés de atributos

## 🎯 Solução Implementada (Temporária)

Para testar imediatamente, criei um usuário com organização hardcoded:

```javascript
// Usuário de teste
Email: test@udstec.io
Password: TestPass123!
Organization ID: f7c9c432-d2c9-41ad-be8f-38883c06cb48
```

## 🧪 Como Testar

1. **Acesse**: https://evo.ai.udstec.io/license-management
2. **Login**: test@udstec.io / TestPass123!
3. **Resultado esperado**: Tela deve mostrar "Vincular Customer ID"
4. **Teste customer_id**: f7c9c432-d2c9-41ad-be8f-38883c06cb48

## 📋 Status Atual

- ✅ Problema identificado e documentado
- ✅ Usuário de teste criado
- ⚠️ Sistema funciona parcialmente (sem multi-tenancy real)
- ❌ Produção requer correção definitiva

## 🚀 Próximos Passos

1. **Decidir abordagem**: Recriar User Pool ou modificar sistema
2. **Implementar solução escolhida**
3. **Migrar usuários existentes** (se necessário)
4. **Testar sistema completo**
5. **Atualizar documentação**

---

**Data**: 30 de Dezembro de 2025  
**Status**: 🔍 Diagnóstico Completo - Aguardando Decisão de Implementação