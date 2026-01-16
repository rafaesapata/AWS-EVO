# Error Monitoring Dashboard - Status Completo

## ✅ O Que Foi Implementado

### 1. Lambda de Geração Dinâmica de Prompts
- **Lambda:** `evo-uds-v3-production-generate-error-fix-prompt`
- **Status:** ✅ DEPLOYED
- **Arquivo:** `backend/src/handlers/monitoring/generate-error-fix-prompt.ts`
- **Funcionalidade:** Analisa erros em tempo real e gera prompts de correção automaticamente

### 2. API Gateway Endpoint
- **Endpoint:** `POST /api/functions/generate-error-fix-prompt`
- **Resource ID:** `658jbt`
- **Status:** ✅ DEPLOYED
- **Autenticação:** Cognito (super admin)
- **CORS:** ✅ Configurado

### 3. Padrões de Erros Detectados
A Lambda detecta e gera prompts para 5 padrões de erros:

1. **Cannot find module '../../lib/'** (Deploy incorreto)
   - Categoria: deployment
   - Severidade: critical
   - Gera comando completo de fix

2. **PrismaClientInitializationError** (Banco de dados)
   - Categoria: database
   - Severidade: critical
   - Verifica DATABASE_URL e VPC

3. **Azure SDK not installed** (Dependências)
   - Categoria: dependencies
   - Severidade: high
   - Atualiza layer para versão 47+

4. **CORS Error 403** (API Gateway)
   - Categoria: api-gateway
   - Severidade: medium
   - Configura OPTIONS com CORS

5. **Task timed out after** (Performance)
   - Categoria: performance
   - Severidade: high
   - Aumenta timeout e verifica NAT Gateway

## ⚠️ Problema Atual

### Frontend ErrorMonitoring.tsx
- **Status:** ❌ BUILD FAILED
- **Erro:** "Unterminated regular expression" na linha 1312
- **Causa:** Template literals complexos com regex patterns nos prompts embutidos
- **Tamanho:** 1378 linhas, 56KB

### Tentativas de Fix
1. ✅ Removidos prompts embutidos dos MOCK_ERROR_PATTERNS
2. ✅ Adicionada função `generatePromptForError()` para chamar Lambda
3. ✅ Atualizado botão "Gerar Prompt de Correção"
4. ❌ Build ainda falha - arquivo muito complexo

## 🎯 Solução Recomendada

### Opção 1: Criar Versão Simplificada (RECOMENDADO)

Criar novo arquivo `src/pages/ErrorMonitoring.tsx` com:

1. **Estrutura Básica:**
   - 5 tabs: Overview, Errors, Patterns, Performance, Alarms
   - Dados mock simples (sem template literals)
   - 100% coverage indicators

2. **Funcionalidade de Prompts:**
   - Botão "Gerar Prompt" em cada padrão de erro
   - Chama `/api/functions/generate-error-fix-prompt`
   - Exibe prompt em Dialog
   - Botões Copy/Download

3. **Sem Complexidade:**
   - Sem regex patterns embutidos
   - Sem template literals complexos
   - Foco em fazer o build funcionar

### Opção 2: Fix Manual do Arquivo Atual

1. Remover TODOS os template literals com regex
2. Simplificar MOCK_ERROR_PATTERNS
3. Mover prompts para arquivo JSON externo
4. Rebuild

## 📋 Checklist para Deploy

### Backend (✅ Completo)
- [x] Lambda `generate-error-fix-prompt` criada
- [x] Endpoint API Gateway configurado
- [x] CORS habilitado
- [x] Permissões Lambda adicionadas
- [x] Deploy no stage `prod`

### Frontend (⏳ Pendente)
- [ ] Arquivo ErrorMonitoring.tsx funcional
- [ ] Build sem erros
- [ ] Deploy para S3
- [ ] Invalidar CloudFront
- [ ] Testar acesso com super admin

## 🚀 Próximos Passos

### Passo 1: Criar Versão Simplificada
```bash
# Cole este prompt para eu criar:
Crie uma versão SIMPLIFICADA do ErrorMonitoring.tsx que:
1. Mantenha as 5 tabs (Overview, Errors, Patterns, Performance, Alarms)
2. Use dados mock SIMPLES (sem template literals complexos)
3. Tenha botão "Gerar Prompt" que chama /api/functions/generate-error-fix-prompt
4. Exiba prompt gerado em Dialog com Copy/Download
5. Mantenha 100% coverage indicators
6. GARANTA que o build funcione

Arquivo: src/pages/ErrorMonitoring.tsx
```

### Passo 2: Build e Deploy
```bash
npm run build
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete
aws cloudfront create-invalidation --distribution-id E1PY7U3VNT6P1R --paths "/*"
```

### Passo 3: Testar
1. Acessar https://evo.ai.udstec.io/error-monitoring
2. Login como super admin
3. Clicar em "Gerar Prompt" em um padrão de erro
4. Verificar se prompt é gerado corretamente
5. Testar Copy/Download

## 📊 Cobertura do Sistema

### Backend
- ✅ 114/114 Lambdas monitoradas (100%)
- ✅ CloudWatch Logs configurados
- ✅ Metric Filters ativos
- ✅ Alarms configurados

### API Gateway
- ✅ 111/111 Endpoints monitorados (100%)
- ✅ 5XX errors tracked
- ✅ 4XX errors tracked

### Frontend
- ✅ ErrorBoundary implementado
- ✅ Error reporter library criada
- ✅ Lambda log-frontend-error deployada
- ⏳ Dashboard UI pendente

## 🎬 Comando Rápido

Para continuar, cole este prompt:

```
Crie uma versão SIMPLIFICADA e FUNCIONAL do ErrorMonitoring.tsx seguindo estas regras:

1. Manter estrutura completa (5 tabs)
2. Usar dados mock SIMPLES (sem template literals complexos)
3. Botão "Gerar Prompt" que chama /api/functions/generate-error-fix-prompt
4. Dialog para exibir prompt com Copy/Download
5. Garantir que o build funcione
6. Manter 100% coverage indicators

Depois de criar, faça o build e deploy automaticamente.
```

---

**Criado por:** Kiro AI Assistant  
**Data:** 2026-01-15  
**Status:** 🟡 Backend completo, Frontend pendente  
**Próxima Ação:** Criar versão simplificada do frontend
