# Guia Rápido - Validação de Organização no Login

## 🎯 O que foi implementado?

Sistema automático que garante que todos os usuários estejam vinculados a uma organização antes de acessar o sistema. Usuários sem vínculo são automaticamente associados à organização "UDS".

## 🚀 Como usar

### 1. Compilar o Backend

```bash
cd backend
npm install
npm run build
```

### 2. Gerar Cliente Prisma

```bash
cd backend
npm run prisma:generate
```

### 3. Executar Migração de Usuários Existentes

```bash
# Na raiz do projeto
npm run migrate:users-to-org
```

Este comando irá:
- ✅ Criar a organização "UDS" se não existir
- ✅ Listar todos os usuários do AWS Cognito
- ✅ Criar profiles para usuários sem vínculo
- ✅ Vincular todos à organização UDS

### 4. Deploy da Infraestrutura

```bash
cd infra
npm install
npm run build
cdk deploy EvoUdsDevelopmentApiStack
```

### 5. Testar o Login

1. Acesse a aplicação
2. Faça login com suas credenciais
3. O sistema automaticamente:
   - Verifica se você tem organização
   - Cria vínculo com UDS se necessário
   - Permite acesso ao sistema

## 🔍 Verificar se está funcionando

### Logs no Console do Navegador

Ao fazer login, você verá:
```
✅ Usuário vinculado à organização UDS
```

### Verificar no Banco de Dados

```sql
-- Ver organização UDS
SELECT * FROM organizations WHERE slug = 'uds';

-- Ver usuários vinculados
SELECT 
  p.id,
  p.user_id,
  p.full_name,
  o.name as organization_name
FROM profiles p
JOIN organizations o ON p.organization_id = o.id
WHERE o.slug = 'uds';
```

## 🛠️ Troubleshooting

### Erro: "Acesso negado: usuário sem vínculo de organização"

**Solução:**
1. Verificar se os endpoints estão deployados
2. Verificar logs do Lambda no CloudWatch
3. Executar migração manual: `npm run migrate:users-to-org`

### Erro: "USER_POOL_ID não configurado"

**Solução:**
Adicionar variável de ambiente:
```bash
export VITE_AWS_USER_POOL_ID=us-east-1_XXXXXXXXX
# ou
export USER_POOL_ID=us-east-1_XXXXXXXXX
```

### Erro: "DATABASE_URL não configurado"

**Solução:**
Adicionar no arquivo `.env`:
```
DATABASE_URL=postgresql://user:password@host:5432/evouds
```

## 📊 Monitoramento

### CloudWatch Logs

Verificar logs dos Lambdas:
```bash
# Check Organization Function
aws logs tail /aws/lambda/CheckOrganizationFunction --follow

# Create With Org Function
aws logs tail /aws/lambda/CreateWithOrgFunction --follow
```

### Métricas

- Total de usuários: Verificar tabela `profiles`
- Usuários na organização UDS: Filtrar por `organization_id`
- Erros de validação: CloudWatch Logs

## 🔐 Segurança

- ✅ Todos os endpoints requerem autenticação JWT
- ✅ Validação de usuário antes de qualquer operação
- ✅ Isolamento de dados por organização
- ✅ Logs de auditoria para todas as operações

## 📝 Próximos Passos

1. **Testar com usuários reais**
   - Criar novo usuário no Cognito
   - Fazer login
   - Verificar criação automática de profile

2. **Monitorar logs**
   - Acompanhar CloudWatch por 24h
   - Verificar erros ou comportamentos inesperados

3. **Documentar para equipe**
   - Compartilhar este guia
   - Treinar equipe sobre novo fluxo

## 🆘 Suporte

Em caso de problemas:
1. Verificar logs no CloudWatch
2. Executar script de migração novamente
3. Verificar configuração de variáveis de ambiente
4. Consultar documentação completa em `VALIDACAO_ORGANIZACAO_LOGIN.md`

## ✅ Checklist de Validação

- [ ] Backend compilado
- [ ] Prisma Client gerado
- [ ] Migração executada com sucesso
- [ ] Infraestrutura deployada
- [ ] Endpoints testados manualmente
- [ ] Login testado com usuário existente
- [ ] Login testado com novo usuário
- [ ] Logs verificados no CloudWatch
- [ ] Banco de dados verificado
