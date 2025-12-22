# 🔐 Informações de Login - EVO UDS

## 🌐 URLs de Acesso

- **Frontend**: https://del4pu28krnxt.cloudfront.net
- **API**: https://z3z39jk585.execute-api.us-east-1.amazonaws.com/dev/

## 👤 Usuário Admin

- **Username**: `admin-user`
- **Email**: `admin@evouds.com`
- **Password**: `AdminPass123!`
- **Role**: Admin

## 🔧 Configurações AWS

- **User Pool ID**: `us-east-1_bg66HUp7J`
- **User Pool Client ID**: `4j936epfb5defcvg20acuf4mh4`
- **Region**: `us-east-1`

## 🧪 Teste de Login

### Via Frontend
1. Acesse: https://del4pu28krnxt.cloudfront.net
2. Clique em "Login" ou "Sign In"
3. Use as credenciais:
   - **Username**: `admin-user`
   - **Password**: `AdminPass123!`

### Via API (Health Check)
```bash
curl "https://z3z39jk585.execute-api.us-east-1.amazonaws.com/dev/health"
```

## 🔍 Verificações

### Status do Usuário
```bash
aws cognito-idp admin-get-user \
  --user-pool-id us-east-1_bg66HUp7J \
  --username admin-user
```

### Listar Usuários
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

## 🚀 Deploy Status

- ✅ Infraestrutura deployada
- ✅ Frontend atualizado e cache invalidado
- ✅ API funcionando (health check OK)
- ✅ Usuário admin criado e senha definida
- ⏳ Banco de dados (acessível apenas via Lambda)

## 📋 Próximos Passos

1. **Testar Login**: Acesse o frontend e faça login
2. **Verificar Permissões**: Confirme acesso às funcionalidades admin
3. **Configurar Organização**: Se necessário, criar organização via interface
4. **Testar Funcionalidades**: Verificar dashboards e recursos

---

**Data**: 12 de Dezembro de 2025  
**Status**: ✅ Pronto para teste de login