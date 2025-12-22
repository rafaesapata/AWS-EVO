# 🗄️ RDS PostgreSQL - Guia Rápido

## 🚀 Setup em 1 Comando

```bash
npm run rds:setup
```

Isso vai:
1. ✅ Fazer deploy do RDS PostgreSQL na AWS
2. ✅ Configurar VPC, subnets e security groups
3. ✅ Gerar credenciais seguras no Secrets Manager
4. ✅ Atualizar automaticamente seu `.env`
5. ✅ Testar a conexão
6. ✅ Executar migrations (opcional)

**Tempo**: 15-20 minutos
**Custo**: ~$15/mês (development)

## 📋 Comandos Disponíveis

```bash
# Setup completo (recomendado)
npm run rds:setup              # Development
npm run rds:setup:staging      # Staging
npm run rds:setup:prod         # Production

# Deploy manual
npm run deploy:rds:dev         # Apenas deploy
npm run deploy:rds:staging     # Deploy + migrations
npm run deploy:rds:prod        # Deploy + migrations

# Gerenciamento
npm run rds:credentials        # Ver credenciais
npm run rds:test              # Testar conexão
```

## 🔐 Credenciais

Após o setup, seu `.env` terá:

```bash
DATABASE_URL=postgresql://postgres:SENHA@endpoint.rds.amazonaws.com:5432/evouds
AWS_RDS_SECRET_ARN=arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:NAME
```

## 📊 Configurações

| Ambiente | Instância | Storage | Custo/mês |
|----------|-----------|---------|-----------|
| Development | db.t3.micro | 20GB | ~$15 |
| Staging | db.t3.small | 50GB | ~$30 |
| Production | db.t3.medium | 100GB | ~$120 |

## 🔄 Workflow

```bash
# 1. Setup
npm run rds:setup

# 2. Verificar
npm run rds:test

# 3. Migrations
npx prisma migrate deploy

# 4. Usar
npm run dev
```

## 📚 Documentação Completa

- **Resumo Executivo**: [RDS_RESUMO_EXECUTIVO.md](./RDS_RESUMO_EXECUTIVO.md)
- **Setup Completo**: [RDS_SETUP_COMPLETE.md](./RDS_SETUP_COMPLETE.md)
- **Guia Detalhado**: [RDS_DEPLOYMENT_GUIDE.md](./RDS_DEPLOYMENT_GUIDE.md)

## 🚨 Problemas?

```bash
# Não conecta?
npm run rds:test

# Credenciais erradas?
npm run rds:credentials

# Atualizar .env?
./scripts/update-env-with-rds.sh development
```

## ✅ Pronto!

Execute `npm run rds:setup` e em 15 minutos você terá um RDS PostgreSQL configurado e pronto para uso! 🎉
