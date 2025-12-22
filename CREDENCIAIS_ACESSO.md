# 🔐 Credenciais de Acesso - EVO UDS

## 🌐 URLs da Aplicação

### Frontend (Interface Web)
```
https://del4pu28krnxt.cloudfront.net
```

### API (Backend)
```
https://z3z39jk585.execute-api.us-east-1.amazonaws.com/dev/
```

---

## 👤 Credenciais de Login

### Usuário Admin Principal

```
Username: admin-user
Password: AdminPass123!
Email: admin@evouds.com
Role: Admin
```

### Usuário Admin Alternativo

```
Username: admin@evo-uds.com
Password: TempPass123!
Role: Admin
```

---

## 🚀 Como Fazer Login

### Passo a Passo

1. **Acesse o Frontend**
   ```
   https://del4pu28krnxt.cloudfront.net
   ```

2. **Clique em "Login" ou "Sign In"**

3. **Digite as credenciais**
   - **Username**: `admin-user`
   - **Password**: `AdminPass123!`

4. **Clique em "Entrar"**

5. **Pronto!** Você terá acesso ao dashboard

---

## 🔍 Verificar Status do Usuário

### Via AWS CLI

```bash
# Verificar se o usuário existe e está ativo
aws cognito-idp admin-get-user \
  --user-pool-id us-east-1_bg66HUp7J \
  --username admin-user
```

### Listar Todos os Usuários

```bash
aws cognito-idp list-users \
  --user-pool-id us-east-1_bg66HUp7J \
  --max-items 10
```

### Testar Autenticação

```bash
aws cognito-idp admin-initiate-auth \
  --user-pool-id us-east-1_bg66HUp7J \
  --client-id 4j936epfb5defcvg20acuf4mh4 \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters USERNAME=admin-user,PASSWORD=AdminPass123!
```

---

## 🔧 Configurações AWS Cognito

### User Pool
```
User Pool ID: us-east-1_bg66HUp7J
User Pool Client ID: 4j936epfb5defcvg20acuf4mh4
Region: us-east-1
```

### Variáveis de Ambiente (.env)
```bash
VITE_AWS_USER_POOL_ID=us-east-1_bg66HUp7J
VITE_AWS_USER_POOL_CLIENT_ID=4j936epfb5defcvg20acuf4mh4
VITE_AWS_REGION=us-east-1
```

---

## 🗄️ Credenciais do Banco de Dados (RDS)

### ⚠️ IMPORTANTE: Apenas para uso interno/backend

O banco de dados RDS está em uma **subnet privada** e **não é acessível diretamente** da internet. Ele é usado automaticamente pelas Lambda functions.

### Credenciais (já configuradas no .env)

```bash
# Obtidas automaticamente do Secrets Manager
DATABASE_URL=postgresql://postgres:Dw_L7z%3FjiT%23G-0zI%23BgLc%3FeF.%23_X)DW)@evoudsdevelopmentdatabasestack-databaseb269d8bb-tllhq0eiqlij.cuzc8ieiytgn.us-east-1.rds.amazonaws.com:5432/evouds

AWS_RDS_SECRET_ARN=arn:aws:secretsmanager:us-east-1:418272799411:secret:DatabaseSecret86DBB7B3-jbY26nf3cSgG-HAJPo6
```

### Ver Credenciais do RDS

```bash
npm run rds:credentials
```

---

## 🧪 Testar a Aplicação

### 1. Health Check da API

```bash
curl "https://z3z39jk585.execute-api.us-east-1.amazonaws.com/dev/health"
```

**Resposta esperada**:
```json
{
  "status": "healthy",
  "timestamp": "2024-12-16T..."
}
```

### 2. Login via Frontend

1. Acesse: https://del4pu28krnxt.cloudfront.net
2. Use: `admin-user` / `AdminPass123!`
3. Verifique o dashboard

### 3. Testar API com Token

```bash
# 1. Fazer login e obter token
TOKEN=$(aws cognito-idp admin-initiate-auth \
  --user-pool-id us-east-1_bg66HUp7J \
  --client-id 4j936epfb5defcvg20acuf4mh4 \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters USERNAME=admin-user,PASSWORD=AdminPass123! \
  --query 'AuthenticationResult.IdToken' \
  --output text)

# 2. Usar token para acessar API protegida
curl -H "Authorization: Bearer $TOKEN" \
  "https://z3z39jk585.execute-api.us-east-1.amazonaws.com/dev/profile"
```

---

## 🔑 Criar Novos Usuários

### Via AWS CLI

```bash
# Criar usuário
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_bg66HUp7J \
  --username novo-usuario@example.com \
  --user-attributes \
    Name=email,Value=novo-usuario@example.com \
    Name=email_verified,Value=true \
    Name=name,Value="Novo Usuário" \
  --temporary-password TempPass123!

# Definir senha permanente
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_bg66HUp7J \
  --username novo-usuario@example.com \
  --password SenhaDefinitiva123! \
  --permanent
```

### Via Interface (Recomendado)

1. Faça login como admin
2. Vá para "Usuários" ou "Gerenciar Usuários"
3. Clique em "Criar Novo Usuário"
4. Preencha os dados e envie

---

## 🔒 Resetar Senha

### Se Esqueceu a Senha

```bash
# Via AWS CLI
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_bg66HUp7J \
  --username admin-user \
  --password NovaSenha123! \
  --permanent
```

### Via Interface

1. Na tela de login, clique em "Esqueci minha senha"
2. Digite seu email
3. Siga as instruções enviadas por email

---

## 📊 Resumo Rápido

| Item | Valor |
|------|-------|
| **URL Frontend** | https://del4pu28krnxt.cloudfront.net |
| **Username** | admin-user |
| **Password** | AdminPass123! |
| **Email** | admin@evouds.com |
| **Role** | Admin |
| **Status** | ✅ Ativo e Confirmado |

---

## ⚠️ Notas Importantes

### Segurança

1. **Não compartilhe** estas credenciais publicamente
2. **Mude a senha** após o primeiro login
3. **Habilite MFA** (Multi-Factor Authentication) se disponível
4. **Use senhas fortes** para novos usuários

### Banco de Dados

- O RDS está em **subnet privada**
- **Não é acessível** diretamente da internet
- Usado automaticamente pelas **Lambda functions**
- Credenciais gerenciadas pelo **Secrets Manager**

### Ambientes

- **Development**: Credenciais acima
- **Staging**: Criar usuários específicos
- **Production**: Criar usuários específicos e habilitar MFA

---

## 🆘 Problemas Comuns

### Não Consigo Fazer Login

1. **Verifique as credenciais**
   ```
   Username: admin-user (não admin@evouds.com)
   Password: AdminPass123! (com maiúsculas e símbolo)
   ```

2. **Verifique o status do usuário**
   ```bash
   aws cognito-idp admin-get-user \
     --user-pool-id us-east-1_bg66HUp7J \
     --username admin-user
   ```

3. **Resetar senha se necessário**
   ```bash
   aws cognito-idp admin-set-user-password \
     --user-pool-id us-east-1_bg66HUp7J \
     --username admin-user \
     --password AdminPass123! \
     --permanent
   ```

### Erro "User not found"

- Verifique se está usando `admin-user` (não o email)
- Confirme que o User Pool ID está correto

### Erro "Invalid password"

- Senha deve ter: maiúsculas, minúsculas, números e símbolos
- Mínimo 8 caracteres
- Use exatamente: `AdminPass123!`

---

## 📞 Suporte

Se continuar com problemas:

1. Verifique os logs do CloudWatch
2. Consulte a documentação em `LOGIN_INFO.md`
3. Execute os comandos de diagnóstico acima
4. Entre em contato com o time DevOps

---

**Última Atualização**: 2024-12-16  
**Status**: ✅ Credenciais Ativas e Validadas  
**Ambiente**: Development
