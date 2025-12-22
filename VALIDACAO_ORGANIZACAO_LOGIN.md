# Validação de Organização no Login

## Resumo das Implementações

Foi implementado um sistema de validação de vínculo organizacional no processo de login, garantindo que todos os usuários estejam associados a uma organização antes de acessar o sistema.

## Mudanças Realizadas

### 1. Frontend - Validação no Login

**Arquivo:** `src/integrations/aws/cognito-client-simple.ts`

- Adicionado método `validateOrganizationBinding()` que é chamado automaticamente após autenticação bem-sucedida
- O método verifica se o usuário possui vínculo com uma organização
- Se não houver vínculo, cria automaticamente associação com a organização "UDS"
- Em caso de falha na validação, bloqueia o acesso com mensagem clara

**Fluxo de Login:**
```
1. Usuário faz login com credenciais
2. AWS Cognito valida credenciais
3. Sistema verifica vínculo de organização
4. Se não existir vínculo:
   - Cria organização "UDS" (se não existir)
   - Cria profile do usuário vinculado à organização
5. Login é concluído com sucesso
```

### 2. Backend - Novos Endpoints

#### Endpoint: `POST /api/profiles/check`

**Arquivo:** `backend/src/handlers/profiles/check-organization.ts`

**Função:** Verifica se um usuário possui vínculo com organização

**Request:**
```json
{
  "userId": "uuid-do-usuario"
}
```

**Response:**
```json
{
  "hasOrganization": true,
  "organizationId": "uuid-da-organizacao",
  "organizationName": "UDS"
}
```

#### Endpoint: `POST /api/profiles/create-with-org`

**Arquivo:** `backend/src/handlers/profiles/create-with-organization.ts`

**Função:** Cria profile de usuário vinculado a uma organização

**Request:**
```json
{
  "userId": "uuid-do-usuario",
  "email": "usuario@exemplo.com",
  "fullName": "Nome do Usuário",
  "organizationName": "UDS"
}
```

**Response:**
```json
{
  "message": "Profile criado com sucesso",
  "profileId": "uuid-do-profile",
  "organizationId": "uuid-da-organizacao",
  "organizationName": "UDS"
}
```

**Características:**
- Cria organização automaticamente se não existir
- Gera slug único baseado no nome da organização
- Vincula usuário à organização através da tabela `profiles`
- Retorna erro se profile já existir

### 3. Infraestrutura - API Gateway

**Arquivo:** `infra/lib/api-stack.ts`

Adicionados novos recursos Lambda e rotas no API Gateway:

- Lambda `CheckOrganizationFunction` para verificação de vínculo
- Lambda `CreateWithOrgFunction` para criação de profile com organização
- Rotas protegidas com autenticação Cognito
- Configuração de VPC e acesso ao banco de dados RDS

## Estrutura de Dados

### Tabela: `organizations`
```sql
- id: UUID (PK)
- name: String
- slug: String (unique)
- created_at: Timestamp
- updated_at: Timestamp
```

### Tabela: `profiles`
```sql
- id: UUID (PK)
- user_id: UUID
- organization_id: UUID (FK -> organizations.id)
- full_name: String
- avatar_url: String
- role: String (default: 'user')
- created_at: Timestamp
- updated_at: Timestamp
- UNIQUE(user_id, organization_id)
```

## Segurança

1. **Autenticação:** Todos os endpoints requerem token JWT válido do AWS Cognito
2. **Autorização:** Validação de usuário autenticado antes de qualquer operação
3. **Isolamento:** Cada organização tem seus dados isolados
4. **Auditoria:** Logs detalhados de todas as operações

## Tratamento de Erros

### Frontend
- Erro de autenticação: Mensagem clara ao usuário
- Erro de validação: "Acesso negado: usuário sem vínculo de organização"
- Erro de rede: Tratamento com retry automático

### Backend
- Validação de parâmetros obrigatórios
- Tratamento de duplicatas (profile já existe)
- Logs estruturados para debugging
- Respostas HTTP apropriadas (200, 400, 500)

## Organização Padrão: UDS

A organização "UDS" é criada automaticamente para usuários sem vínculo:

- **Nome:** UDS
- **Slug:** uds
- **Criação:** Automática no primeiro login sem organização
- **Reutilização:** Mesma organização para todos os usuários sem vínculo

## Próximos Passos

1. **Deploy:** Executar deploy da infraestrutura CDK
2. **Migração:** Executar script para vincular usuários existentes à organização UDS
3. **Testes:** Validar fluxo completo de login com novos usuários
4. **Monitoramento:** Acompanhar logs de validação de organização

## Comandos para Deploy

```bash
# Backend - Compilar handlers
cd backend
npm run build

# Infraestrutura - Deploy CDK
cd ../infra
npm run build
cdk deploy EvoUdsDevelopmentApiStack

# Verificar endpoints
aws apigateway get-rest-apis --query "items[?name=='EVO UDS API'].id" --output text
```

## Testes Manuais

### 1. Testar Verificação de Organização
```bash
curl -X POST https://api.exemplo.com/profiles/check \
  -H "Authorization: Bearer TOKEN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"userId": "uuid-do-usuario"}'
```

### 2. Testar Criação de Profile
```bash
curl -X POST https://api.exemplo.com/profiles/create-with-org \
  -H "Authorization: Bearer TOKEN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "uuid-do-usuario",
    "email": "teste@exemplo.com",
    "fullName": "Usuário Teste",
    "organizationName": "UDS"
  }'
```

## Logs e Monitoramento

Os logs incluem:
- ✅ Usuário vinculado à organização UDS
- ❌ Erro na validação de organização
- 📊 Organização criada automaticamente
- 🔍 Profile já existe para usuário

## Considerações de Performance

- Validação assíncrona não bloqueia UI
- Cache de sessão para evitar validações repetidas
- Timeout de 30 segundos para operações de profile
- Retry automático em caso de falha temporária
