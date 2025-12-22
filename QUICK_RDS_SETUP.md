# ⚡ Setup Rápido do RDS

## 🚀 Deploy em 3 Comandos

```bash
# 1. Deploy do RDS (desenvolvimento)
npm run deploy:rds:dev

# 2. Executar migrations
npx prisma migrate deploy

# 3. Testar conexão
npm run rds:credentials
```

## 📋 O que acontece automaticamente?

✅ Cria VPC e subnets (se não existir)
✅ Cria RDS PostgreSQL 15.4
✅ Gera credenciais seguras no Secrets Manager
✅ Atualiza `.env`, `.env.local`, `.env.production.local`
✅ Salva backup das credenciais em `.rds-credentials-development.json`

## 🔐 Variáveis Atualizadas

```bash
DATABASE_URL=postgresql://postgres:SENHA_GERADA@endpoint.rds.amazonaws.com:5432/evouds
AWS_RDS_SECRET_ARN=arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:NAME
```

## 🎯 Ambientes Disponíveis

```bash
# Desenvolvimento (db.t3.micro, 20GB)
npm run deploy:rds:dev

# Staging (db.t3.small, 50GB, com migrations)
npm run deploy:rds:staging

# Produção (db.t3.medium, 100GB, Multi-AZ, com migrations)
npm run deploy:rds:prod
```

## 🔍 Ver Credenciais

```bash
# No terminal
npm run rds:credentials

# Em JSON
npm run rds:credentials:json
```

## ⚠️ Importante

- As credenciais são salvas em `.rds-credentials-*.json`
- Estes arquivos estão no `.gitignore`
- **NUNCA commite credenciais!**

## 🛠️ Troubleshooting

### RDS não conecta?
```bash
# Verificar status
aws rds describe-db-instances --db-instance-identifier evo-uds-dev

# Aguardar 5-10 minutos após deploy
```

### Atualizar credenciais?
```bash
./scripts/update-env-with-rds.sh development
```

## 💰 Custos

- **Development**: ~$15/mês
- **Staging**: ~$30/mês
- **Production**: ~$120/mês

## 📚 Documentação Completa

Ver: [RDS_DEPLOYMENT_GUIDE.md](./RDS_DEPLOYMENT_GUIDE.md)
