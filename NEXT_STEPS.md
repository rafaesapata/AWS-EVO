# 🚀 Próximos Passos - Guia Prático

## 📊 Status Atual

✅ **5 Lambdas implementadas** (7.7% do total):
- security-scan
- compliance-scan
- guardduty-scan
- get-findings
- finops-copilot

✅ **Infraestrutura completa** pronta para deploy

---

## 🎯 Opção 1: Fazer Deploy Agora (Recomendado)

### Por que fazer deploy agora?
- Validar infraestrutura real na AWS
- Testar as 5 Lambdas já implementadas
- Identificar problemas cedo
- Ganhar confiança no processo

### Passos:

#### 1. Preparar Ambiente

```bash
# Instalar dependências
cd backend && npm install
cd ../infra && npm install
cd ../scripts && npm install
```

#### 2. Configurar AWS CLI

```bash
# Verificar configuração
aws configure list

# Se necessário, configurar
aws configure
# AWS Access Key ID: [sua key]
# AWS Secret Access Key: [seu secret]
# Default region: us-east-1
# Default output format: json
```

#### 3. Bootstrap CDK (primeira vez apenas)

```bash
cd infra
cdk bootstrap
```

#### 4. Build do Backend

```bash
cd ../backend
npm run build
```

#### 5. Deploy da Infraestrutura

```bash
cd ../infra

# Ver o que será criado
cdk diff

# Deploy (ambiente dev)
npm run deploy:dev

# Ou deploy stack por stack
cdk deploy EvoUds-dev-Network
cdk deploy EvoUds-dev-Database
cdk deploy EvoUds-dev-Auth
cdk deploy EvoUds-dev-Api
cdk deploy EvoUds-dev-Frontend
cdk deploy EvoUds-dev-Monitoring
```

**Tempo estimado**: 15-20 minutos

#### 6. Aplicar Migrações do Banco

```bash
cd ../backend

# Obter endpoint do RDS
export DB_HOST=$(aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Database \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' \
  --output text)

# Obter credenciais
export DB_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id /dev/evo-uds/database/credentials \
  --query SecretString \
  --output text)

export DB_USER=$(echo $DB_SECRET | jq -r .username)
export DB_PASS=$(echo $DB_SECRET | jq -r .password)

# Configurar DATABASE_URL
export DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:5432/evouds"

# Aplicar migrações
npx prisma migrate deploy
```

#### 7. Testar Endpoints

```bash
# Obter URL da API
export API_URL=$(aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Api \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text)

echo "API URL: $API_URL"

# Criar usuário de teste no Cognito
export USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Auth \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text)

aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username test@example.com \
  --user-attributes \
    Name=email,Value=test@example.com \
    Name=email_verified,Value=true \
  --temporary-password TempPass123!

# Definir senha permanente
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username test@example.com \
  --password TestPass123! \
  --permanent

# Obter token (usar Postman ou script)
# Testar endpoint
curl -H "Authorization: Bearer $TOKEN" \
  "${API_URL}security/findings"
```

#### 8. Monitorar

```bash
# Ver logs da Lambda
aws logs tail /aws/lambda/evo-uds-dev-SecurityScan --follow

# Ver dashboard
# https://console.aws.amazon.com/cloudwatch/home#dashboards:name=evo-uds-dev
```

---

## 🎯 Opção 2: Continuar Implementando Lambdas

### Próximas Lambdas Prioritárias

#### Lote 1 - Segurança (falta 1)
- [ ] drift-detection

#### Lote 2 - FinOps (faltam 3)
- [ ] cost-optimization
- [ ] budget-forecast
- [ ] ml-waste-detection

#### Lote 3 - Gestão (3 funções)
- [ ] create-organization-account
- [ ] sync-organization-accounts
- [ ] admin-manage-user

### Template para Nova Lambda

```typescript
/**
 * Lambda handler para [NOME]
 * Migrado de: supabase/functions/[nome]/index.ts
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';

interface [Nome]Request {
  accountId?: string;
  // outros parâmetros
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  console.log('🚀 [Nome] started');
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: [Nome]Request = event.body ? JSON.parse(event.body) : {};
    const { accountId } = body;
    
    const prisma = getPrismaClient();
    
    // Sua lógica aqui
    
    return success({ message: 'Success' });
    
  } catch (err) {
    console.error('❌ [Nome] error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
```

### Adicionar Rota no CDK

```typescript
// Em infra/lib/api-stack.ts

const [nome]Lambda = createLambda('[Nome]', 'handlers/[categoria]/[nome].handler');
[categoria]Resource.addResource('[rota]').addMethod('POST',
  new apigateway.LambdaIntegration([nome]Lambda),
  { authorizer }
);
```

---

## 🎯 Opção 3: Começar Frontend

### Criar Cliente Cognito

```typescript
// src/integrations/aws/cognitoClient.ts

import { 
  CognitoUserPool, 
  CognitoUser, 
  AuthenticationDetails,
  CognitoUserSession 
} from 'amazon-cognito-identity-js';

const userPool = new CognitoUserPool({
  UserPoolId: import.meta.env.VITE_USER_POOL_ID,
  ClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
});

export const cognitoAuth = {
  signIn: async (email: string, password: string): Promise<CognitoUserSession> => {
    return new Promise((resolve, reject) => {
      const user = new CognitoUser({
        Username: email,
        Pool: userPool,
      });
      
      const authDetails = new AuthenticationDetails({
        Username: email,
        Password: password,
      });
      
      user.authenticateUser(authDetails, {
        onSuccess: (session) => resolve(session),
        onFailure: (err) => reject(err),
      });
    });
  },
  
  signOut: () => {
    const user = userPool.getCurrentUser();
    if (user) {
      user.signOut();
    }
  },
  
  getCurrentUser: (): CognitoUser | null => {
    return userPool.getCurrentUser();
  },
  
  getSession: async (): Promise<CognitoUserSession | null> => {
    const user = userPool.getCurrentUser();
    if (!user) return null;
    
    return new Promise((resolve, reject) => {
      user.getSession((err: any, session: CognitoUserSession | null) => {
        if (err) reject(err);
        else resolve(session);
      });
    });
  },
};
```

### Criar Cliente HTTP

```typescript
// src/integrations/aws/apiClient.ts

import axios from 'axios';
import { cognitoAuth } from './cognitoClient';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 30000,
});

apiClient.interceptors.request.use(async (config) => {
  const session = await cognitoAuth.getSession();
  if (session) {
    config.headers.Authorization = `Bearer ${session.getIdToken().getJwtToken()}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expirado, fazer logout
      cognitoAuth.signOut();
      window.location.href = '/auth';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

---

## 📋 Checklist de Validação Pós-Deploy

### Infraestrutura
- [ ] Todas as stacks criadas sem erros
- [ ] VPC e subnets criadas
- [ ] RDS acessível das Lambdas
- [ ] Cognito User Pool criado
- [ ] API Gateway respondendo
- [ ] CloudWatch Dashboard visível

### Banco de Dados
- [ ] Conexão funciona
- [ ] Migrações aplicadas
- [ ] Tabelas criadas
- [ ] Prisma Studio funciona

### Lambdas
- [ ] Todas as 5 Lambdas deployadas
- [ ] Logs aparecem no CloudWatch
- [ ] Não há erros de cold start
- [ ] Timeout adequado

### API Gateway
- [ ] Rotas criadas
- [ ] Authorizer funciona
- [ ] CORS configurado
- [ ] Endpoints respondem

### Testes
- [ ] Criar usuário no Cognito funciona
- [ ] Login retorna token
- [ ] Token é aceito pela API
- [ ] GET /security/findings funciona
- [ ] POST /security/scan funciona

---

## 🐛 Troubleshooting Comum

### Erro: "Unable to connect to database"
```bash
# Verificar security group
aws ec2 describe-security-groups \
  --group-ids sg-xxxxx

# Verificar se Lambda está na VPC correta
aws lambda get-function-configuration \
  --function-name evo-uds-dev-SecurityScan
```

### Erro: "Cognito token invalid"
```bash
# Verificar configuração do authorizer
aws apigateway get-authorizers \
  --rest-api-id xxxxx
```

### Erro: "Lambda timeout"
```bash
# Aumentar timeout
aws lambda update-function-configuration \
  --function-name evo-uds-dev-SecurityScan \
  --timeout 60
```

---

## 💡 Recomendação Final

**Faça o deploy agora (Opção 1)!**

Razões:
1. ✅ Validar que tudo funciona na AWS real
2. ✅ Identificar problemas cedo
3. ✅ Ganhar momentum e confiança
4. ✅ Ter algo tangível funcionando
5. ✅ Facilitar testes das próximas Lambdas

Depois do deploy bem-sucedido, você pode:
- Continuar implementando Lambdas (Opção 2)
- Começar a migrar o frontend (Opção 3)
- Ou fazer ambos em paralelo

---

**Tempo total estimado para Opção 1**: 1-2 horas  
**Próxima atualização**: Após primeiro deploy
