# 🔍 Relatório de Limpeza do Prisma

## 📋 Status Atual

O sistema foi migrado para DynamoDB, mas ainda existem **muitas referências ao Prisma** que precisam ser tratadas.

## 🚨 Áreas com Prisma

### 1. ✅ Frontend (Root) - LIMPO
- ✅ Scripts de migração atualizados para DynamoDB
- ✅ `scripts/migrate-users-final.ts` - Usa DynamoDB
- ✅ `scripts/setup-dynamodb-tables.ts` - Cria tabelas DynamoDB

### 2. ❌ Backend - PRECISA LIMPEZA COMPLETA

#### Backend Package.json
**Arquivo:** `backend/package.json`
- ❌ Dependência: `@prisma/client": "^5.22.0"`
- ❌ DevDependency: `prisma": "^5.7.0"`
- ❌ Scripts Prisma:
  - `prisma:generate`
  - `prisma:migrate`
  - `prisma:deploy`
  - `prisma:studio`

#### Backend Database Library
**Arquivo:** `backend/src/lib/database.ts`
- ❌ Importa `PrismaClient`
- ❌ Toda a lógica usa Prisma
- ❌ Precisa ser reescrito para DynamoDB

#### Backend Handlers (65+ arquivos)
Todos os handlers Lambda usam Prisma via `getPrismaClient()`:
- `backend/src/handlers/reports/*.ts` (10 arquivos)
- `backend/src/handlers/notifications/*.ts` (5 arquivos)
- `backend/src/handlers/monitoring/*.ts` (8 arquivos)
- `backend/src/handlers/jobs/*.ts` (4 arquivos)
- `backend/src/handlers/profiles/*.ts` (2 arquivos)
- `backend/src/handlers/ml/*.ts` (3 arquivos)
- E muitos outros...

### 3. ❌ Scripts Root - PRECISA LIMPEZA

#### Scripts com Prisma
1. **`scripts/test-organization-validation.ts`**
   - ❌ Usa `PrismaClient`
   - ❌ Precisa ser reescrito para DynamoDB

2. **`scripts/migrate-users-to-organization.ts`** (antigo)
   - ❌ Usa `PrismaClient`
   - ⚠️ Substituído por `migrate-users-final.ts`
   - 🗑️ Pode ser deletado

3. **`scripts/deploy.ts`**
   - ❌ Linha 447: `npx prisma migrate deploy`
   - ❌ Linha 451: `npx prisma generate`
   - ❌ Precisa remover essas linhas

### 4. ❌ Testes - PRECISA LIMPEZA

#### Testes de Integração
**Arquivo:** `tests/integration/database/tenant-isolation.test.ts`
- ❌ Importa `getPrismaClient`
- ❌ Usa Prisma para testes

#### Testes Unitários
**Arquivo:** `tests/unit/handlers/security-scan.test.ts`
- ❌ Importa `getPrismaClient`
- ❌ Mock do Prisma

### 5. ❌ Pasta Backend/Prisma

**Diretório:** `backend/prisma/`
- ❌ Contém `schema.prisma`
- ❌ Contém migrações SQL
- 🗑️ Toda a pasta pode ser deletada

### 6. ❌ Documentação - PRECISA ATUALIZAÇÃO

Arquivos de documentação com referências ao Prisma:
- `MIGRATION_STATUS.md`
- `MILITARY_GRADE_CORRECTIONS_PHASE_1_COMPLETE.md`
- `IMPLEMENTATION_COMPLETE.md`
- `QUICK_COMMANDS.md`
- `QUICK_REFERENCE.md`
- `SESSION_PROGRESS_UPDATE.md`
- `FINAL_MIGRATION_STATUS_COMPLETE.md`
- `SISTEMA_ANALISE_COMPLETA_MELHORIAS.md`
- `CONTINUATION_2_SUMMARY.md`
- `CONTINUATION_5_SUMMARY.md`
- `IMPLEMENTACAO_COMPLETA_RESUMO.md`

## 🎯 Plano de Ação

### Fase 1: Limpeza Imediata (Arquivos Obsoletos)
1. ✅ Deletar `scripts/migrate-users-to-organization.ts` (substituído)
2. ✅ Deletar `scripts/migrate-users-to-organization-dynamodb.ts` (substituído)
3. ✅ Deletar `scripts/migrate-users-to-organization-dynamodb-v2.ts` (substituído)
4. ✅ Deletar pasta `backend/prisma/` completa
5. ✅ Remover dependências Prisma do `backend/package.json`

### Fase 2: Reescrever Backend (CRÍTICO)
1. ❌ Reescrever `backend/src/lib/database.ts` para DynamoDB
2. ❌ Atualizar todos os 65+ handlers Lambda
3. ❌ Criar helpers DynamoDB equivalentes

### Fase 3: Atualizar Scripts
1. ✅ Atualizar `scripts/deploy.ts` (remover comandos Prisma)
2. ✅ Atualizar `scripts/test-organization-validation.ts` para DynamoDB

### Fase 4: Atualizar Testes
1. ❌ Reescrever testes de integração
2. ❌ Reescrever testes unitários

### Fase 5: Atualizar Documentação
1. ❌ Atualizar todos os arquivos .md
2. ❌ Criar nova documentação DynamoDB

## ⚠️ DECISÃO CRÍTICA NECESSÁRIA

**O backend inteiro está construído em cima do Prisma!**

Você tem 2 opções:

### Opção A: Manter Prisma no Backend (RECOMENDADO)
- ✅ Backend continua usando PostgreSQL/RDS via Prisma
- ✅ Frontend usa DynamoDB para Organizations e Profiles
- ✅ Menos trabalho (apenas 2 tabelas no DynamoDB)
- ✅ Backend já está funcionando
- ⚠️ Dois bancos de dados diferentes

### Opção B: Migrar Backend Completo para DynamoDB
- ❌ Reescrever 65+ Lambda handlers
- ❌ Reescrever toda a camada de dados
- ❌ Criar 30+ tabelas no DynamoDB
- ❌ Reescrever todos os testes
- ❌ Semanas de trabalho
- ✅ Apenas DynamoDB

## 💡 Recomendação

**OPÇÃO A - Arquitetura Híbrida:**

1. **DynamoDB** - Para dados simples de autenticação:
   - Organizations
   - Profiles
   - Sessions (se necessário)

2. **PostgreSQL/RDS + Prisma** - Para dados complexos do backend:
   - Security Scans
   - Findings
   - Compliance
   - Costs
   - Todos os outros 30+ modelos

**Vantagens:**
- ✅ Melhor performance para autenticação (DynamoDB)
- ✅ Queries complexas no PostgreSQL (melhor para relatórios)
- ✅ Backend já está pronto e funcionando
- ✅ Menos risco de bugs

## 📊 Estatísticas

- **Arquivos com Prisma:** 80+
- **Handlers Lambda:** 65+
- **Modelos Prisma:** 32+
- **Linhas de código:** 20.000+
- **Tempo estimado migração completa:** 3-4 semanas

## ✅ O que já está feito

1. ✅ DynamoDB configurado
2. ✅ Tabelas Organizations e Profiles criadas
3. ✅ Script de migração de usuários funcionando
4. ✅ Frontend pode usar DynamoDB para auth

## ❌ O que falta (se migrar tudo)

1. ❌ Reescrever 65+ Lambda handlers
2. ❌ Criar 30+ tabelas DynamoDB
3. ❌ Reescrever camada de dados
4. ❌ Reescrever testes
5. ❌ Atualizar documentação
