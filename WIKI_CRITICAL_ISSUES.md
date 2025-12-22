# Revisão Crítica do Sistema de Wiki/Knowledge Base

## ❌ PROBLEMAS CRÍTICOS ENCONTRADOS

### 1. **RLS Policies Duplicadas e Conflitantes**
A tabela `knowledge_base_articles` tem **8 políticas RLS**, sendo várias conflitantes:

```sql
-- Políticas CONFLITANTES:
1. "Users can view their org's knowledge base" 
   → Permite: organization_id = get_user_organization() OR is_public = true
   
2. "Users can view articles in their organization only"
   → Requer: organization_id = get_user_organization() AND 
            (approval_status = 'approved' OR author_id = auth.uid() OR is_admin)

3. "Authors can update their articles"
   → Permite: author_id = auth.uid()

4. "Authors and admins can update articles"
   → Permite: organization_id = get_user_organization() AND 
            (author_id = auth.uid() OR is_org_admin OR is_super_admin)
```

**RESULTADO**: As queries falham porque o Postgres não consegue decidir qual política aplicar.

### 2. **Tabela `knowledge_base_favorites` NÃO EXISTE**
O código frontend tenta fazer join com `knowledge_base_favorites`:
```typescript
.select('*, favorites:knowledge_base_favorites(user_id)')
```

**Mas a tabela NÃO FOI CRIADA!** ❌

### 3. **Tentativa de JOIN com `profiles` Inválida**
```typescript
.select('*, profiles:author_id(email)')
```

**ERRO**: Não existe foreign key entre `knowledge_base_articles.author_id` e `profiles`!

### 4. **Tabelas Incompletas**

#### ✅ Tabelas que EXISTEM:
- ✅ `knowledge_base_articles`
- ✅ `knowledge_base_comments`
- ✅ `knowledge_base_coauthors`
- ✅ `knowledge_base_attachments`
- ✅ `knowledge_base_analytics`
- ✅ `knowledge_base_categories`
- ✅ `knowledge_base_versions`
- ✅ `knowledge_base_relationships`
- ✅ `knowledge_base_templates`
- ✅ `knowledge_base_access_permissions`

#### ❌ Tabelas FALTANDO:
- ❌ `knowledge_base_favorites` - **CRÍTICO!**
- ❌ `knowledge_base_bookmarks`
- ❌ `knowledge_base_highlights`

### 5. **Funções do Banco com `search_path` Mutável**
As seguintes funções têm vulnerabilidade de segurança:
- `calculate_endpoint_stats`
- `update_wizard_progress_updated_at`
- `calculate_waste_priority_score` (duplicado)
- `user_belongs_to_org`

**RISCO**: Privilege escalation attack

### 6. **organization_id NULL em knowledge_base_articles**
A coluna `organization_id` é **nullable**, mas deveria ser **NOT NULL** para garantir isolamento de dados!

## 🔧 CORREÇÕES NECESSÁRIAS

### Prioridade CRÍTICA:

1. **Criar tabela `knowledge_base_favorites`**
2. **Simplificar RLS policies** (remover duplicatas e conflitos)
3. **Tornar organization_id NOT NULL** em knowledge_base_articles
4. **Adicionar foreign keys corretas**
5. **Corrigir funções com search_path mutável**

### Prioridade ALTA:

6. **Remover joins inválidos no frontend**
7. **Implementar queries corretas**
8. **Adicionar índices de performance**
9. **Habilitar RLS em todas as tabelas do knowledge base**

### Prioridade MÉDIA:

10. **Criar tabelas faltantes** (bookmarks, highlights)
11. **Adicionar audit trail completo**
12. **Implementar soft delete**

## 📊 IMPACTO NO SISTEMA

**Funcionalidades QUEBRADAS**:
- ✅ Criar artigos - **FUNCIONA** (com organization_id manual)
- ❌ Listar artigos - **FALHA** (conflito de RLS policies)
- ❌ Favoritar artigos - **FALHA** (tabela não existe)
- ❌ Visualizar autor - **FALHA** (foreign key inválida)
- ❌ Filtrar por favoritos - **FALHA** (join inválido)

**Status Atual**: 🔴 **SISTEMA 40% FUNCIONAL**
