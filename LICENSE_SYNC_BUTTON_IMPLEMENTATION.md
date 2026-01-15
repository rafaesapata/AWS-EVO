# Implementação do Botão "Atualizar Status" com Sync Automático

## 📋 Resumo

Implementado sync automático de licenças no botão "Atualizar Status" da página de gerenciamento de licenças.

## 🎯 Problema Resolvido

**Situação anterior:**
- O botão "Atualizar Status" apenas refazia o fetch dos dados do banco de dados local
- Se a API externa tivesse novas licenças (como uma licença EVO adicionada), elas não apareciam
- Era necessário intervenção manual via Lambda para sincronizar

**Exemplo do problema:**
- Customer ID `895b480d-e938-4cac-b850-8898cff599b6` tinha 2 licenças na API externa (pilotone + EVO)
- Apenas a licença "pilotone" estava no banco de dados
- A licença "EVO" não aparecia para o usuário

## ✅ Solução Implementada

### 1. Nova Mutation de Sync

Adicionada mutation `syncLicenseMutation` que:
- Chama a Lambda `sync-license` 
- Busca licenças da API externa
- Sincroniza com o banco de dados PostgreSQL
- Atualiza a UI automaticamente

```typescript
const syncLicenseMutation = useMutation({
  mutationFn: async () => {
    const user = await cognitoAuth.getCurrentUser();
    if (!user) throw new Error("Não autenticado");

    const result = await apiClient.invoke("sync-license", { 
      body: {}
    });

    if (result.error) throw result.error;
    return result.data;
  },
  onSuccess: (data: any) => {
    const syncResult = data?.sync_result;
    if (syncResult?.success) {
      toast({
        title: "Licenças sincronizadas com sucesso",
        description: `${syncResult.licenses_synced || 0} licença(s) sincronizada(s) da API externa`,
      });
    }
    refetchLicense();
  },
  onError: (error: Error) => {
    toast({
      title: "Erro ao sincronizar licenças",
      description: error.message,
      variant: "destructive",
    });
  },
});
```

### 2. Botão Atualizado

O botão "Atualizar Status" agora:
- Chama `syncLicenseMutation.mutate()` em vez de apenas `refetchLicense()`
- Mostra "Sincronizando..." durante o processo
- Exibe toast com resultado do sync (quantas licenças foram sincronizadas)

```typescript
const handleRefreshLicense = () => {
  // Trigger sync from external API instead of just refetching
  syncLicenseMutation.mutate();
};
```

### 3. Feedback Visual

- **Durante sync:** Botão mostra "Sincronizando..." com spinner
- **Sucesso:** Toast verde com "X licença(s) sincronizada(s)"
- **Erro:** Toast vermelho com mensagem de erro

## 🔄 Fluxo Completo

```
1. Usuário clica em "Atualizar Status"
   ↓
2. Frontend chama Lambda sync-license
   ↓
3. Lambda busca licenças da API externa
   ↓
4. Lambda sincroniza com PostgreSQL (upsert)
   ↓
5. Lambda retorna resultado do sync
   ↓
6. Frontend mostra toast com resultado
   ↓
7. Frontend refaz fetch dos dados atualizados
   ↓
8. UI atualiza com novas licenças
```

## 📊 Exemplo de Uso

### Cenário: Nova licença EVO adicionada

1. **Antes do sync:**
   - Banco de dados: 1 licença (pilotone)
   - UI mostra: "Sem licença EVO válida"

2. **Usuário clica "Atualizar Status":**
   - Botão mostra: "Sincronizando..."
   - Lambda busca da API externa: 2 licenças (pilotone + EVO)
   - Lambda sincroniza ambas no banco

3. **Após sync:**
   - Toast: "2 licença(s) sincronizada(s) da API externa"
   - UI atualiza automaticamente
   - Mostra licença EVO com 1 seat disponível

## 🔧 Arquivos Modificados

### Frontend
- `src/pages/LicenseManagement.tsx`
  - Adicionada mutation `syncLicenseMutation`
  - Modificado `handleRefreshLicense()` para usar sync
  - Atualizado botão para mostrar estado de sync

### Backend (já existente)
- `backend/src/handlers/license/sync-license.ts` - Lambda de sync
- `backend/src/lib/license-service.ts` - Serviço de sync

## 🚀 Deploy

```bash
# Build frontend
npm run build

# Deploy para S3
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete --region us-east-1

# Invalidar cache CloudFront
aws cloudfront create-invalidation --distribution-id E1PY7U3VNT6P1R --paths "/*" --region us-east-1
```

## ✅ Benefícios

1. **Autoatendimento:** Usuários podem resolver problemas de licença sozinhos
2. **Tempo real:** Novas licenças aparecem imediatamente após sync
3. **Transparência:** Feedback claro sobre quantas licenças foram sincronizadas
4. **Confiabilidade:** Sempre busca dados da fonte oficial (API externa)

## 🔍 Troubleshooting

### Botão não funciona
- Verificar se Lambda `sync-license` está deployada
- Verificar permissões do usuário (deve ser admin)
- Verificar logs do CloudWatch

### Sync retorna erro
- Verificar se `LICENSE_API_URL` e `LICENSE_API_KEY` estão configurados
- Verificar se customer_id está correto
- Verificar conectividade com API externa

### Licenças não aparecem após sync
- Verificar se `product_type` é "EVO" (case insensitive)
- Verificar se licença não está expirada
- Verificar logs da Lambda para erros de upsert

---

**Data:** 2026-01-15  
**Versão:** 1.0  
**Status:** ✅ Implementado e Deployado
