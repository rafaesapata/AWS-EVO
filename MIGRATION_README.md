# 🚀 Guia de Migração: Supabase → AWS Nativo

Este guia detalha o processo completo de migração do sistema EVO UDS de Supabase para uma arquitetura 100% AWS nativa.

## 📋 Pré-requisitos

### Ferramentas Necessárias
- Node.js 20.x ou superior
- AWS CLI configurado com credenciais
- AWS CDK CLI: `npm install -g aws-cdk`
- PostgreSQL client (para migrações): `psql`
- Git

### Permissões AWS Necessárias
- Permissões de administrador ou políticas específicas para:
  - VPC, EC2, RDS, Lambda, API Gateway
  - Cognito, S3, CloudFront
  - IAM, CloudWatch, Secrets Manager
  - CDK Bootstrap

---

## 🏗️ FASE 1: Preparação da Infraestrutura

### 1.1 Bootstrap AWS CDK

```bash
# Bootstrap CDK na sua conta AWS (apenas primeira vez)
cd infra
npm install
cdk bootstrap aws://ACCOUNT-ID/REGION
```

### 1.2 Deploy da Infraestrutura Base

```bash
# Deploy em ambiente de desenvolvimento
npm run deploy:dev

# Ou deploy em produção
npm run deploy:prod
```

Isso criará:
- ✅ VPC com subnets públicas, privadas e isoladas
- ✅ RDS PostgreSQL com encryption e backups
- ✅ Cognito User Pool configurado
- ✅ API Gateway com rotas
- ✅ Lambdas para todas as funções
- ✅ S3 + CloudFront para frontend
- ✅ CloudWatch dashboards e alarmes

**Tempo estimado**: 15-20 minutos

---

## 🗄️ FASE 2: Migração do Banco de Dados

### 2.1 Exportar Dados do Supabase

```bash
# Conectar ao Supabase e exportar dados
pg_dump -h db.PROJECT_ID.supabase.co \
  -U postgres \
  -d postgres \
  --data-only \
  --inserts \
  -f supabase_data.sql
```

### 2.2 Aplicar Schema no RDS

```bash
cd backend

# Instalar dependências
npm install

# Gerar cliente Prisma
npx prisma generate

# Aplicar migrações
npx prisma migrate deploy

# Ou criar schema do zero
npx prisma db push
```

### 2.3 Importar Dados

```bash
# Obter endpoint do RDS dos outputs do CDK
export DB_HOST=$(aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Database \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' \
  --output text)

# Obter credenciais do Secrets Manager
export DB_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id /dev/evo-uds/database/credentials \
  --query SecretString \
  --output text)

export DB_USER=$(echo $DB_SECRET | jq -r .username)
export DB_PASS=$(echo $DB_SECRET | jq -r .password)

# Importar dados
psql -h $DB_HOST -U $DB_USER -d evouds -f supabase_data.sql
```

### 2.4 Validar Migração

```bash
# Verificar contagem de registros
psql -h $DB_HOST -U $DB_USER -d evouds -c "
  SELECT 
    'organizations' as table, COUNT(*) FROM organizations
  UNION ALL
  SELECT 'aws_credentials', COUNT(*) FROM aws_credentials
  UNION ALL
  SELECT 'findings', COUNT(*) FROM findings
  UNION ALL
  SELECT 'security_scans', COUNT(*) FROM security_scans;
"
```

---

## 🔐 FASE 3: Migração de Autenticação

### 3.1 Exportar Usuários do Supabase

```sql
-- No Supabase SQL Editor
SELECT 
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  raw_user_meta_data
FROM auth.users;
```

Salvar resultado como `users_export.json`

### 3.2 Importar Usuários para Cognito

```bash
# Script de migração de usuários
node scripts/migrate-users-to-cognito.js \
  --user-pool-id us-east-1_XXXXXXXXX \
  --input users_export.json
```

**Nota**: Usuários precisarão redefinir senha na primeira vez (Cognito não aceita hashes do Supabase)

### 3.3 Configurar Atributos Customizados

Os atributos `organization_id`, `tenant_id` e `roles` já estão configurados no User Pool.

Para cada usuário, definir:

```bash
aws cognito-idp admin-update-user-attributes \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username user@example.com \
  --user-attributes \
    Name=custom:organization_id,Value=ORG_UUID \
    Name=custom:tenant_id,Value=TENANT_UUID \
    Name=custom:roles,Value='["admin"]'
```

---

## 🔧 FASE 4: Build e Deploy do Backend

### 4.1 Build das Lambdas

```bash
cd backend
npm install
npm run build
```

Isso gera os handlers otimizados em `backend/dist/`

### 4.2 Deploy das Lambdas

```bash
# O CDK já faz deploy automático, mas para atualizar:
cd ../infra
cdk deploy EvoUds-dev-Api --hotswap  # Mais rápido para dev
```

### 4.3 Testar Endpoints

```bash
# Obter URL da API
export API_URL=$(aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Api \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text)

# Testar health check (se implementado)
curl $API_URL/health

# Testar endpoint autenticado (precisa de token Cognito)
curl -H "Authorization: Bearer $COGNITO_TOKEN" \
  $API_URL/security/findings
```

---

## 🎨 FASE 5: Migração do Frontend

### 5.1 Remover Dependências Supabase

```bash
cd ..  # Voltar para raiz do projeto
npm uninstall @supabase/supabase-js
```

### 5.2 Instalar Dependências AWS

```bash
npm install amazon-cognito-identity-js axios
# Ou usar AWS Amplify
npm install aws-amplify
```

### 5.3 Criar Cliente de Autenticação AWS

Criar `src/integrations/aws/cognitoClient.ts`:

```typescript
import { CognitoUserPool, CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js';

const userPool = new CognitoUserPool({
  UserPoolId: import.meta.env.VITE_USER_POOL_ID,
  ClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
});

export const cognitoAuth = {
  signIn: async (email: string, password: string) => {
    // Implementação
  },
  signOut: async () => {
    // Implementação
  },
  getCurrentUser: () => {
    // Implementação
  },
  // ... outros métodos
};
```

### 5.4 Criar Cliente HTTP para APIs

Criar `src/integrations/aws/apiClient.ts`:

```typescript
import axios from 'axios';
import { cognitoAuth } from './cognitoClient';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// Interceptor para adicionar token
apiClient.interceptors.request.use(async (config) => {
  const session = await cognitoAuth.getSession();
  if (session) {
    config.headers.Authorization = `Bearer ${session.getIdToken().getJwtToken()}`;
  }
  return config;
});

export default apiClient;
```

### 5.5 Atualizar Variáveis de Ambiente

Criar `.env.production`:

```bash
# Obter valores dos outputs do CDK
VITE_API_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev/
VITE_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_AWS_REGION=us-east-1
```

### 5.6 Refatorar Componentes

**Antes (Supabase)**:
```typescript
import { supabase } from '@/integrations/supabase/client';

const { data } = await supabase.from('findings').select('*');
```

**Depois (AWS)**:
```typescript
import apiClient from '@/integrations/aws/apiClient';

const { data } = await apiClient.get('/security/findings');
```

### 5.7 Build e Deploy do Frontend

```bash
# Build
npm run build

# Deploy para S3
aws s3 sync dist/ s3://evo-uds-dev-frontend-ACCOUNT_ID/ --delete

# Invalidar cache do CloudFront
aws cloudfront create-invalidation \
  --distribution-id DISTRIBUTION_ID \
  --paths "/*"
```

---

## ✅ FASE 6: Testes e Validação

### 6.1 Checklist de Funcionalidades

- [ ] Login/Logout funciona
- [ ] MFA funciona (se habilitado)
- [ ] Troca de organização funciona
- [ ] Security scan executa e retorna resultados
- [ ] Compliance scan funciona
- [ ] GuardDuty scan funciona
- [ ] Dashboards carregam dados
- [ ] Relatórios PDF/Excel são gerados
- [ ] Jobs agendados executam
- [ ] Multi-tenant isolation está funcionando
- [ ] Permissões de usuário são respeitadas

### 6.2 Testes de Carga

```bash
# Usar ferramenta como Artillery ou k6
npm install -g artillery

# Criar cenário de teste
artillery quick --count 10 --num 100 $API_URL/security/findings
```

### 6.3 Validação de Segurança

```bash
# Verificar que RDS não é público
aws rds describe-db-instances \
  --query 'DBInstances[*].[DBInstanceIdentifier,PubliclyAccessible]'

# Verificar encryption
aws rds describe-db-instances \
  --query 'DBInstances[*].[DBInstanceIdentifier,StorageEncrypted]'

# Verificar S3 buckets não são públicos
aws s3api get-public-access-block --bucket evo-uds-dev-frontend-ACCOUNT_ID
```

---

## 🔄 FASE 7: Cutover para Produção

### 7.1 Preparação

1. Comunicar janela de manutenção aos usuários
2. Fazer backup completo do Supabase
3. Testar rollback plan

### 7.2 Execução

```bash
# 1. Colocar sistema em manutenção (opcional)
# 2. Última sincronização de dados
# 3. Deploy produção
cd infra
npm run deploy:prod

# 4. Migrar dados finais
# 5. Atualizar DNS (se aplicável)
# 6. Validar sistema
# 7. Remover modo manutenção
```

### 7.3 Monitoramento Pós-Deploy

```bash
# Acompanhar logs em tempo real
aws logs tail /aws/lambda/evo-uds-prod-SecurityScan --follow

# Verificar métricas no CloudWatch
# Dashboard: https://console.aws.amazon.com/cloudwatch/home#dashboards:name=evo-uds-prod
```

---

## 🧹 FASE 8: Limpeza

### 8.1 Desativar Supabase (após validação)

1. Exportar backup final
2. Desabilitar projeto no Supabase
3. Cancelar assinatura (se aplicável)

### 8.2 Remover Código Legado

```bash
# Remover diretório supabase
rm -rf supabase/

# Remover imports antigos
# Buscar e remover referências a @supabase/supabase-js
```

---

## 📊 Custos Estimados AWS

### Ambiente de Desenvolvimento
- RDS t3.micro: ~$15/mês
- Lambda (1M requests): ~$5/mês
- API Gateway: ~$3.50/mês
- S3 + CloudFront: ~$5/mês
- **Total**: ~$30-50/mês

### Ambiente de Produção
- RDS t3.medium Multi-AZ: ~$120/mês
- Lambda (10M requests): ~$20/mês
- API Gateway: ~$35/mês
- S3 + CloudFront: ~$20/mês
- CloudWatch: ~$10/mês
- **Total**: ~$200-250/mês

---

## 🆘 Troubleshooting

### Problema: Lambda timeout
**Solução**: Aumentar timeout e memory no CDK

### Problema: RDS connection pool esgotado
**Solução**: Implementar RDS Proxy ou aumentar max_connections

### Problema: Cognito não aceita usuários migrados
**Solução**: Usar Lambda trigger para migração de senha

### Problema: CORS errors no frontend
**Solução**: Verificar configuração de CORS no API Gateway

---

## 📚 Recursos Adicionais

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Amazon Cognito Developer Guide](https://docs.aws.amazon.com/cognito/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [Prisma Documentation](https://www.prisma.io/docs)

---

## 🎯 Próximos Passos

Após a migração completa:

1. ✅ Implementar CI/CD com GitHub Actions ou AWS CodePipeline
2. ✅ Configurar backups automáticos adicionais
3. ✅ Implementar disaster recovery plan
4. ✅ Otimizar custos (Reserved Instances, Savings Plans)
5. ✅ Implementar observabilidade avançada (X-Ray, CloudWatch Insights)
6. ✅ Documentar runbooks operacionais

---

**Status da Migração**: 🚧 Infraestrutura base criada, backend parcialmente implementado

**Última atualização**: 2025-12-11
