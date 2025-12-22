# 🚀 Guia de Deploy do RDS PostgreSQL

## 📋 Visão Geral

Este guia explica como fazer o deploy do RDS PostgreSQL na AWS e configurar automaticamente as variáveis de ambiente.

## 🎯 Pré-requisitos

1. **AWS CLI configurado** com credenciais válidas
2. **AWS CDK instalado** (`npm install -g aws-cdk`)
3. **Permissões AWS** necessárias:
   - CloudFormation
   - RDS
   - EC2 (VPC, Subnets, Security Groups)
   - Secrets Manager
   - IAM

## 🚀 Deploy Rápido

### Opção 1: Script TypeScript (Recomendado)

```bash
# Deploy para desenvolvimento
npm run deploy:rds:dev

# Deploy para staging (com migrations)
npm run deploy:rds:staging

# Deploy para produção (com migrations)
npm run deploy:rds:prod
```

### Opção 2: Script Shell

```bash
# Deploy do RDS
cd infra
npx cdk deploy EvoUdsDevelopmentDatabaseStack --require-approval never

# Atualizar variáveis de ambiente
./scripts/update-env-with-rds.sh development
```

## 📊 Configurações por Ambiente

### Development
- **Instância**: db.t3.micro
- **Storage**: 20GB
- **Multi-AZ**: Não
- **Deletion Protection**: Não
- **Custo estimado**: ~$15/mês

### Staging
- **Instância**: db.t3.small
- **Storage**: 50GB
- **Multi-AZ**: Não
- **Deletion Protection**: Sim
- **Custo estimado**: ~$30/mês

### Production
- **Instância**: db.t3.medium
- **Storage**: 100GB
- **Multi-AZ**: Sim
- **Deletion Protection**: Sim
- **Custo estimado**: ~$120/mês

## 🔐 Obter Credenciais

### Visualizar credenciais no terminal

```bash
npm run rds:credentials
```

### Obter credenciais em JSON

```bash
npm run rds:credentials:json
```

### Credenciais salvas localmente

Após o deploy, as credenciais são salvas em:
```
.rds-credentials-development.json
.rds-credentials-staging.json
.rds-credentials-production.json
```

⚠️ **IMPORTANTE**: Estes arquivos estão no `.gitignore` e NÃO devem ser commitados!

## 📝 Variáveis de Ambiente Atualizadas

O script atualiza automaticamente os seguintes arquivos:
- `.env`
- `.env.local`
- `.env.production.local`

Variáveis adicionadas/atualizadas:
```bash
DATABASE_URL=postgresql://username:password@endpoint:5432/evouds
AWS_RDS_SECRET_ARN=arn:aws:secretsmanager:region:account:secret:name
```

## 🔄 Executar Migrations

### Após o deploy

```bash
# Configurar DATABASE_URL (já feito automaticamente)
# Executar migrations
npx prisma migrate deploy

# Ou durante o deploy
npm run deploy:rds:staging  # Já inclui --migrate
```

### Criar nova migration

```bash
npx prisma migrate dev --name nome_da_migration
```

## 🔍 Verificar Status do RDS

### Via AWS CLI

```bash
aws rds describe-db-instances \
  --db-instance-identifier evo-uds-dev \
  --query 'DBInstances[0].[DBInstanceStatus,Endpoint.Address,Endpoint.Port]' \
  --output table
```

### Via Console AWS

1. Acesse: https://console.aws.amazon.com/rds
2. Selecione a região: `us-east-1`
3. Procure por: `evo-uds-dev`

## 🛠️ Comandos Úteis

### Conectar ao RDS via psql

```bash
# Obter credenciais
npm run rds:credentials:json > creds.json

# Extrair informações
ENDPOINT=$(jq -r '.endpoint' creds.json)
USERNAME=$(jq -r '.username' creds.json)
PASSWORD=$(jq -r '.password' creds.json)

# Conectar
PGPASSWORD=$PASSWORD psql -h $ENDPOINT -U $USERNAME -d evouds
```

### Backup do banco

```bash
# Criar backup
PGPASSWORD=$PASSWORD pg_dump -h $ENDPOINT -U $USERNAME evouds > backup.sql

# Restaurar backup
PGPASSWORD=$PASSWORD psql -h $ENDPOINT -U $USERNAME evouds < backup.sql
```

### Atualizar senha do RDS

```bash
# Via Secrets Manager
aws secretsmanager update-secret \
  --secret-id $SECRET_ARN \
  --secret-string '{"username":"postgres","password":"nova_senha"}'

# Atualizar no RDS
aws rds modify-db-instance \
  --db-instance-identifier evo-uds-dev \
  --master-user-password nova_senha \
  --apply-immediately
```

## 🔒 Segurança

### Secrets Manager

As credenciais são armazenadas no AWS Secrets Manager:
- **Rotação automática**: Configurável
- **Criptografia**: KMS
- **Acesso**: Via IAM roles

### Security Groups

O RDS está em uma subnet privada e só aceita conexões:
- Da VPC interna
- De Lambda functions autorizadas
- Via VPN/Bastion (se configurado)

### Conexão Segura

```bash
# Sempre use SSL em produção
DATABASE_URL=postgresql://user:pass@endpoint:5432/evouds?sslmode=require
```

## 🚨 Troubleshooting

### Erro: Stack já existe

```bash
# Atualizar stack existente
cd infra
npx cdk deploy EvoUdsDevelopmentDatabaseStack --require-approval never
```

### Erro: Não consegue conectar ao RDS

1. Verificar Security Groups
2. Verificar se está na mesma VPC
3. Verificar se o RDS está disponível

```bash
aws rds describe-db-instances \
  --db-instance-identifier evo-uds-dev \
  --query 'DBInstances[0].DBInstanceStatus'
```

### Erro: Credenciais inválidas

```bash
# Obter credenciais atualizadas
npm run rds:credentials

# Atualizar .env
./scripts/update-env-with-rds.sh development
```

### Erro: Timeout ao conectar

- RDS pode levar 5-10 minutos para ficar disponível após o deploy
- Verificar se o endpoint está correto
- Verificar regras de Security Group

## 📊 Monitoramento

### CloudWatch Metrics

```bash
# CPU Utilization
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=evo-uds-dev \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average
```

### Performance Insights

Acesse: https://console.aws.amazon.com/rds/home?region=us-east-1#performance-insights:

## 💰 Custos

### Estimativa mensal

| Ambiente | Instância | Storage | Multi-AZ | Custo/mês |
|----------|-----------|---------|----------|-----------|
| Dev | t3.micro | 20GB | Não | ~$15 |
| Staging | t3.small | 50GB | Não | ~$30 |
| Prod | t3.medium | 100GB | Sim | ~$120 |

### Otimização de custos

1. **Parar instâncias de dev** quando não estiver usando
2. **Usar Reserved Instances** para produção (até 60% de desconto)
3. **Configurar auto-scaling** de storage
4. **Revisar backups** antigos

## 🔄 Atualização do RDS

### Atualizar versão do PostgreSQL

```bash
# Editar infra/lib/database-stack.ts
# Alterar: rds.PostgresEngineVersion.VER_15_4
# Para: rds.PostgresEngineVersion.VER_16_1

# Deploy
cd infra
npx cdk deploy EvoUdsDevelopmentDatabaseStack
```

### Aumentar storage

```bash
aws rds modify-db-instance \
  --db-instance-identifier evo-uds-dev \
  --allocated-storage 50 \
  --apply-immediately
```

## 📚 Recursos Adicionais

- [AWS RDS Documentation](https://docs.aws.amazon.com/rds/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)

## ✅ Checklist de Deploy

- [ ] AWS CLI configurado
- [ ] Credenciais AWS válidas
- [ ] VPC criada (Network Stack)
- [ ] Deploy do Database Stack
- [ ] Variáveis de ambiente atualizadas
- [ ] Migrations executadas
- [ ] Conexão testada
- [ ] Backup configurado
- [ ] Monitoramento ativo

## 🎉 Próximos Passos

Após o deploy do RDS:

1. **Executar migrations**: `npx prisma migrate deploy`
2. **Seed inicial**: `npx prisma db seed`
3. **Testar conexão**: `npm run test:db`
4. **Configurar backups**: Revisar retention period
5. **Configurar alertas**: CloudWatch Alarms
6. **Documentar**: Adicionar informações ao README

---

**Criado em**: 2024-12-16
**Versão**: 1.0.0
**Autor**: EVO UDS Team
