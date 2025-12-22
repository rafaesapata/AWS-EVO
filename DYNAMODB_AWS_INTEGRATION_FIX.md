# 🔧 Fix: Integração AWS com DynamoDB

## 🐛 Problema Identificado

Ao tentar vincular uma conta AWS na plataforma, o erro "organização não encontrada" ocorria porque:

1. **Frontend** busca `organizationId` do Cognito ou cria um baseado no email
2. **Backend** tentava salvar credenciais AWS no PostgreSQL com esse `organizationId`
3. **PostgreSQL** validava se a organização existe, mas ela só existia no **DynamoDB**!

## ✅ Solução Implementada

### 1. Novo Handler Lambda: `save-aws-credentials`

**Arquivo:** `backend/src/handlers/aws/save-aws-credentials.ts`

**Funcionalidade:**
- Recebe dados de credenciais AWS do frontend
- Busca a organização no **DynamoDB** (não no PostgreSQL)
- Valida se a organização existe
- Salva as credenciais no **PostgreSQL** com o `organization_id` correto do DynamoDB

**Fluxo:**
```
Frontend → save-aws-credentials → DynamoDB (busca org) → PostgreSQL (salva creds)
```

### 2. Atualização do Handler: `check-organization`

**Arquivo:** `backend/src/handlers/profiles/check-organization.ts`

**Mudança:**
- Antes: Buscava profile no PostgreSQL via Prisma
- Agora: Busca profile no **DynamoDB**

**Funcionalidade:**
- Busca profile do usuário no DynamoDB
- Retorna `organizationId` correto
- Usado pelo hook `useOrganization` no frontend

### 3. Atualização do Hook: `useOrganization`

**Arquivo:** `src/hooks/useOrganization.ts`

**Mudança:**
- Agora chama `check-organization` para buscar o `organizationId` real do DynamoDB
- Fallback para atributos do Cognito se a API falhar
- Garante que o `organizationId` correto seja usado

### 4. Atualização do Componente: `CloudFormationDeploy`

**Arquivo:** `src/components/dashboard/CloudFormationDeploy.tsx`

**Mudança:**
- Antes: `apiClient.insert('aws_credentials', ...)`
- Agora: `apiClient.invoke('save-aws-credentials', ...)`

**Benefício:**
- Usa o novo endpoint que valida organização no DynamoDB

### 5. Script de Verificação

**Arquivo:** `scripts/check-user-profile.ts`

**Funcionalidade:**
- Lista organizações no DynamoDB
- Lista profiles no DynamoDB
- Lista usuários no Cognito
- Verifica quais usuários têm profile
- Identifica usuários sem profile

**Comando:**
```bash
npm run check:user-profile
```

## 🏗️ Arquitetura Atualizada

```
┌─────────────────────────────────────────────┐
│           FRONTEND (React)                  │
│                                             │
│  useOrganization Hook                       │
│  ├─ check-organization (DynamoDB)          │
│  └─ Fallback: Cognito attributes           │
│                                             │
│  CloudFormationDeploy                       │
│  └─ save-aws-credentials (NEW)             │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│         BACKEND (Lambda Functions)          │
│                                             │
│  check-organization                         │
│  ├─ DynamoDB: evo-uds-profiles             │
│  └─ DynamoDB: evo-uds-organizations        │
│                                             │
│  save-aws-credentials (NEW)                 │
│  ├─ DynamoDB: Valida organização           │
│  └─ PostgreSQL: Salva credenciais          │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│              DATABASES                      │
│                                             │
│  DynamoDB                                   │
│  ├─ evo-uds-organizations                  │
│  └─ evo-uds-profiles                       │
│                                             │
│  PostgreSQL/RDS                             │
│  └─ aws_credentials (32+ outras tabelas)   │
└─────────────────────────────────────────────┘
```

## 📝 Mudanças nos Arquivos

### Novos Arquivos
1. ✅ `backend/src/handlers/aws/save-aws-credentials.ts`
2. ✅ `scripts/check-user-profile.ts`

### Arquivos Modificados
1. ✅ `backend/src/handlers/profiles/check-organization.ts`
2. ✅ `src/hooks/useOrganization.ts`
3. ✅ `src/components/dashboard/CloudFormationDeploy.tsx`
4. ✅ `package.json` (novo script: `check:user-profile`)

## 🚀 Deploy Necessário

### 1. Deploy do Backend
```bash
cd backend
npm run build
# Deploy via CDK ou manual
```

### 2. Deploy do Frontend
```bash
npm run build
# Deploy para S3/CloudFront
```

### 3. Configurar API Gateway
Adicionar novo endpoint:
- **Path:** `/save-aws-credentials`
- **Method:** POST
- **Lambda:** `save-aws-credentials`
- **Auth:** Cognito Authorizer

## ✅ Validação

### 1. Verificar Profiles
```bash
npm run check:user-profile
```

**Saída esperada:**
```
✅ Encontradas 1 organizações:
   - UDS (uds-org-123) - slug: uds

✅ Encontrados 1 profiles:
   - Admin User (user_id: xxx)
     org_id: uds-org-123

✅ Todos os usuários têm profile!
```

### 2. Testar Vinculação de Conta AWS

1. Login na plataforma
2. Ir para Settings → AWS Accounts
3. Clicar em "Connect AWS Account"
4. Seguir o wizard do CloudFormation
5. Validar que a conta é vinculada com sucesso

**Antes:** ❌ Erro "organização não encontrada"
**Depois:** ✅ Conta vinculada com sucesso

## 🔍 Troubleshooting

### Erro: "Organization not found"

**Causa:** Usuário não tem profile no DynamoDB

**Solução:**
```bash
npm run migrate:users-to-org
```

### Erro: "check-organization endpoint not found"

**Causa:** Handler não foi deployado

**Solução:**
1. Verificar se o handler existe em `backend/src/handlers/profiles/check-organization.ts`
2. Fazer rebuild do backend
3. Fazer deploy

### Erro: "save-aws-credentials endpoint not found"

**Causa:** Novo handler não foi deployado

**Solução:**
1. Verificar se o handler existe em `backend/src/handlers/aws/save-aws-credentials.ts`
2. Adicionar rota no API Gateway
3. Fazer deploy

## 📊 Status

- ✅ Código atualizado
- ✅ Scripts de verificação criados
- ✅ Documentação completa
- ⏳ Aguardando deploy
- ⏳ Aguardando testes em produção

## 🎯 Próximos Passos

1. ✅ Fazer deploy do backend
2. ✅ Configurar API Gateway
3. ✅ Fazer deploy do frontend
4. ✅ Testar vinculação de conta AWS
5. ✅ Validar que o erro foi corrigido

---

**Fix implementado e pronto para deploy! 🚀**
