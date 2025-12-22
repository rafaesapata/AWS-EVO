# 🎯 RDS PostgreSQL - Setup Completo

## ✅ O que foi criado?

### 📁 Scripts

1. **`scripts/deploy-rds.ts`** - Deploy automatizado do RDS
2. **`scripts/get-rds-credentials.ts`** - Obter credenciais do RDS
3. **`scripts/update-env-with-rds.sh`** - Atualizar variáveis de ambiente
4. **`scripts/test-rds-connection.ts`** - Testar conexão com o RDS

### 📝 Documentação

1. **`RDS_DEPLOYMENT_GUIDE.md`** - Guia completo de deploy
2. **`QUICK_RDS_SETUP.md`** - Setup rápido em 3 comandos

### 🔧 Comandos NPM

```json
{
  "deploy:rds": "Deploy RDS (development)",
  "deploy:rds:dev": "Deploy RDS development",
  "deploy:rds:staging": "Deploy RDS staging + migrations",
  "deploy:rds:prod": "Deploy RDS production + migrations",
  "rds:credentials": "Ver credenciais do RDS",
  "rds:credentials:json": "Credenciais em JSON",
  "rds:test": "Testar conexão com RDS"
}
```

## 🚀 Como Usar

### 1️⃣ Deploy do RDS

```bash
# Desenvolvimento (recomendado para começar)
npm run deploy:rds:dev
```

**O que acontece:**
- ✅ Cria VPC e subnets (se necessário)
- ✅ Cria RDS PostgreSQL 15.4 (db.t3.micro, 20GB)
- ✅ Gera credenciais seguras no AWS Secrets Manager
- ✅ Atualiza `.env`, `.env.local`, `.env.production.local`
- ✅ Salva backup em `.rds-credentials-development.json`

**Tempo estimado:** 10-15 minutos

### 2️⃣ Verificar Credenciais

```bash
# Ver no terminal
npm run rds:credentials

# Saída:
# ✅ Credenciais obtidas com sucesso!
# 
# 📋 Informações do RDS:
#    Endpoint: evo-uds-dev.xxxxx.us-east-1.rds.amazonaws.com
#    Database: evouds
#    Username: postgres
#    Port: 5432
# 
# 🔗 DATABASE_URL:
#    postgresql://postgres:SENHA@endpoint:5432/evouds
```

### 3️⃣ Testar Conexão

```bash
npm run rds:test
```

**Saída esperada:**
```
🧪 Teste de Conexão RDS PostgreSQL

🔍 Testando conexão com o RDS...
📡 URL: postgresql://postgres:****@endpoint:5432/evouds
✅ Conexão estabelecida!
✅ PostgreSQL Version: PostgreSQL 15.4
✅ Database: evouds
✅ User: postgres

📊 Tabelas encontradas: 0
   (Nenhuma tabela encontrada - execute as migrations)

📈 Estatísticas:
   - Tamanho: 8249 kB
   - Conexões ativas: 1

✅ Teste concluído com sucesso!
```

### 4️⃣ Executar Migrations

```bash
# Executar migrations do Prisma
npx prisma migrate deploy

# Ou criar nova migration
npx prisma migrate dev --name init
```

### 5️⃣ Seed Inicial (Opcional)

```bash
npx prisma db seed
```

## 📊 Ambientes e Configurações

| Ambiente | Instância | Storage | Multi-AZ | Custo/mês | Comando |
|----------|-----------|---------|----------|-----------|---------|
| **Development** | db.t3.micro | 20GB | Não | ~$15 | `npm run deploy:rds:dev` |
| **Staging** | db.t3.small | 50GB | Não | ~$30 | `npm run deploy:rds:staging` |
| **Production** | db.t3.medium | 100GB | Sim | ~$120 | `npm run deploy:rds:prod` |

## 🔐 Segurança

### Credenciais

- ✅ Armazenadas no **AWS Secrets Manager**
- ✅ Criptografadas com **KMS**
- ✅ Rotação automática (configurável)
- ✅ Acesso via **IAM roles**

### Rede

- ✅ RDS em **subnet privada**
- ✅ Sem acesso público
- ✅ **Security Groups** restritivos
- ✅ Conexões apenas da VPC

### Arquivos Locais

```bash
# Arquivos no .gitignore (NÃO serão commitados)
.env
.env.local
.env.production.local
.rds-credentials-*.json
*.backup
```

## 🔄 Workflows Comuns

### Atualizar Credenciais

```bash
# Se as credenciais mudaram no AWS
./scripts/update-env-with-rds.sh development
```

### Conectar via psql

```bash
# Obter credenciais
npm run rds:credentials:json > creds.json

# Extrair e conectar
ENDPOINT=$(jq -r '.endpoint' creds.json)
USERNAME=$(jq -r '.username' creds.json)
PASSWORD=$(jq -r '.password' creds.json)

PGPASSWORD=$PASSWORD psql -h $ENDPOINT -U $USERNAME -d evouds
```

### Backup Manual

```bash
# Criar backup
PGPASSWORD=$PASSWORD pg_dump -h $ENDPOINT -U $USERNAME evouds > backup-$(date +%Y%m%d).sql

# Restaurar backup
PGPASSWORD=$PASSWORD psql -h $ENDPOINT -U $USERNAME evouds < backup-20241216.sql
```

### Monitorar Performance

```bash
# Via AWS CLI
aws rds describe-db-instances \
  --db-instance-identifier evo-uds-dev \
  --query 'DBInstances[0].[DBInstanceStatus,AllocatedStorage,DBInstanceClass]'

# Via Console
# https://console.aws.amazon.com/rds/home?region=us-east-1#performance-insights:
```

## 🚨 Troubleshooting

### ❌ Erro: "Cannot connect to RDS"

**Possíveis causas:**
1. RDS ainda está iniciando (aguarde 5-10 minutos)
2. Credenciais incorretas
3. Security Group bloqueando

**Solução:**
```bash
# 1. Verificar status
aws rds describe-db-instances --db-instance-identifier evo-uds-dev

# 2. Atualizar credenciais
npm run rds:credentials

# 3. Testar conexão
npm run rds:test
```

### ❌ Erro: "Stack already exists"

**Solução:**
```bash
# Atualizar stack existente
cd infra
npx cdk deploy EvoUdsDevelopmentDatabaseStack --require-approval never
```

### ❌ Erro: "DATABASE_URL not found"

**Solução:**
```bash
# Atualizar .env
./scripts/update-env-with-rds.sh development

# Verificar
cat .env | grep DATABASE_URL
```

### ❌ Erro: "Timeout connecting"

**Possíveis causas:**
1. RDS em subnet sem rota para internet
2. Security Group bloqueando porta 5432
3. Network ACLs bloqueando tráfego

**Solução:**
```bash
# Verificar Security Groups
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=*database*" \
  --query 'SecurityGroups[*].[GroupId,GroupName,IpPermissions]'
```

## 📈 Próximos Passos

Após o setup do RDS:

1. ✅ **Migrations**: `npx prisma migrate deploy`
2. ✅ **Seed**: `npx prisma db seed`
3. ✅ **Teste**: `npm run rds:test`
4. ✅ **Backup**: Configurar automated backups
5. ✅ **Monitoring**: Configurar CloudWatch Alarms
6. ✅ **Scaling**: Configurar auto-scaling de storage

## 🔗 Variáveis de Ambiente

Após o deploy, estas variáveis estarão configuradas:

```bash
# .env, .env.local, .env.production.local

# RDS PostgreSQL
DATABASE_URL=postgresql://postgres:SENHA@endpoint.rds.amazonaws.com:5432/evouds

# AWS Secrets Manager
AWS_RDS_SECRET_ARN=arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:NAME

# AWS Region
AWS_REGION=us-east-1
```

## 📚 Documentação Adicional

- **Guia Completo**: [RDS_DEPLOYMENT_GUIDE.md](./RDS_DEPLOYMENT_GUIDE.md)
- **Setup Rápido**: [QUICK_RDS_SETUP.md](./QUICK_RDS_SETUP.md)
- **AWS RDS Docs**: https://docs.aws.amazon.com/rds/
- **Prisma Docs**: https://www.prisma.io/docs/

## 💡 Dicas

### Performance

```bash
# Habilitar query logging (desenvolvimento)
aws rds modify-db-parameter-group \
  --db-parameter-group-name default.postgres15 \
  --parameters "ParameterName=log_statement,ParameterValue=all,ApplyMethod=immediate"
```

### Custos

```bash
# Parar RDS quando não estiver usando (development)
aws rds stop-db-instance --db-instance-identifier evo-uds-dev

# Iniciar novamente
aws rds start-db-instance --db-instance-identifier evo-uds-dev
```

### Segurança

```bash
# Rotacionar senha
aws secretsmanager rotate-secret \
  --secret-id $SECRET_ARN \
  --rotation-lambda-arn $LAMBDA_ARN
```

## ✅ Checklist Final

- [ ] RDS deployado com sucesso
- [ ] Credenciais obtidas e salvas
- [ ] `.env` atualizado com DATABASE_URL
- [ ] Conexão testada (`npm run rds:test`)
- [ ] Migrations executadas
- [ ] Seed inicial (se necessário)
- [ ] Backup configurado
- [ ] Monitoring ativo
- [ ] Documentação revisada

## 🎉 Pronto!

Seu RDS PostgreSQL está configurado e pronto para uso!

**Comandos principais:**
```bash
npm run deploy:rds:dev      # Deploy
npm run rds:credentials     # Ver credenciais
npm run rds:test           # Testar conexão
npx prisma migrate deploy  # Migrations
```

---

**Criado em**: 2024-12-16  
**Versão**: 1.0.0  
**Autor**: EVO UDS Team
