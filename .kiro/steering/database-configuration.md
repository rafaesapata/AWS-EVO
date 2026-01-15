# 🚨 DATABASE CONFIGURATION - LEIA ANTES DE QUALQUER ALTERAÇÃO

## Configuração do Banco de Dados de Produção

### RDS PostgreSQL - PRODUÇÃO

| Propriedade | Valor |
|-------------|-------|
| **Instance Identifier** | `evo-uds-v3-production-postgres` |
| **Endpoint** | `evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com` |
| **Port** | `5432` |
| **Database Name** | `evouds` |
| **Schema** | `public` |
| **Username** | `evoadmin` |
| **Engine** | PostgreSQL 15.10 |
| **Status** | `available` |
| **Region** | `us-east-1` |

### DATABASE_URL Correta (URL-encoded)

```
postgresql://evoadmin:%29V7%3F9ygLec%3FAMSqn%29.UIU4%24vOfRl%2C%24%5EL@evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com:5432/evouds?schema=public
```

### ⛔ ENDPOINTS INCORRETOS - NUNCA USAR

Os seguintes endpoints são INVÁLIDOS e NÃO EXISTEM:

```
❌ evo-uds-v3-nodejs-infra-rdsinstance-1ixbvtqhqhqhq.c8ywqzqzqzqz.us-east-1.rds.amazonaws.com
❌ Qualquer endpoint com "nodejs-infra-rdsinstance" no nome
```

### RDS PostgreSQL - DESENVOLVIMENTO (se necessário)

| Propriedade | Valor |
|-------------|-------|
| **Instance Identifier** | `evoudsdevelopmentdatabasestack-databaseb269d8bb-s65qhkkd7pjt` |
| **Endpoint** | `evoudsdevelopmentdatabasestack-databaseb269d8bb-s65qhkkd7pjt.c070y4ceohf7.us-east-1.rds.amazonaws.com` |

---

## Configuração das Lambdas

### Variáveis de Ambiente Obrigatórias

Todas as Lambdas que acessam o banco de dados DEVEM ter:

```bash
DATABASE_URL="postgresql://evoadmin:%29V7%3F9ygLec%3FAMSqn%29.UIU4%24vOfRl%2C%24%5EL@evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com:5432/evouds?schema=public"
NODE_PATH="/opt/nodejs/node_modules"
```

### Comando para Atualizar DATABASE_URL de uma Lambda

```bash
aws lambda update-function-configuration \
  --function-name NOME_DA_LAMBDA \
  --environment 'Variables={DATABASE_URL="postgresql://evoadmin:%29V7%3F9ygLec%3FAMSqn%29.UIU4%24vOfRl%2C%24%5EL@evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com:5432/evouds?schema=public",NODE_PATH="/opt/nodejs/node_modules"}' \
  --region us-east-1
```

### Verificar DATABASE_URL de uma Lambda

```bash
aws lambda get-function-configuration \
  --function-name NOME_DA_LAMBDA \
  --region us-east-1 \
  --query 'Environment.Variables.DATABASE_URL' \
  --output text
```

### Listar Todas as Instâncias RDS Disponíveis

```bash
aws rds describe-db-instances \
  --region us-east-1 \
  --query 'DBInstances[*].[DBInstanceIdentifier,DBInstanceStatus,Endpoint.Address]' \
  --output table
```

---

## VPC Configuration para Lambdas

As Lambdas que acessam o RDS DEVEM estar na VPC correta:

| Propriedade | Valor |
|-------------|-------|
| **VPC ID** | `vpc-09773244a2156129c` |
| **Private Subnets** | `subnet-0dbb444e4ef54d211`, `subnet-05383447666913b7b` |
| **Security Group** | `sg-04eb71f681cc651ae` |

---

## Troubleshooting

### Erro: "Can't reach database server"

**Causas possíveis:**
1. DATABASE_URL incorreta (endpoint errado)
2. Lambda não está na VPC correta
3. Security Group não permite conexão na porta 5432
4. RDS instance está parada

**Diagnóstico:**

```bash
# 1. Verificar DATABASE_URL da Lambda
aws lambda get-function-configuration \
  --function-name NOME_DA_LAMBDA \
  --region us-east-1 \
  --query 'Environment.Variables.DATABASE_URL'

# 2. Verificar VPC da Lambda
aws lambda get-function-configuration \
  --function-name NOME_DA_LAMBDA \
  --region us-east-1 \
  --query 'VpcConfig'

# 3. Verificar status do RDS
aws rds describe-db-instances \
  --region us-east-1 \
  --query 'DBInstances[?DBInstanceIdentifier==`evo-uds-v3-production-postgres`].[DBInstanceStatus]'
```

**Solução:**

Se a DATABASE_URL estiver incorreta, atualize com o comando na seção acima.

### Erro: "PrismaClientInitializationError"

Geralmente causado por:
1. DATABASE_URL incorreta
2. Prisma Client não gerado corretamente no layer
3. Credenciais do banco incorretas

---

## Histórico de Incidentes

### 2026-01-14 - Lambda list-background-jobs com DATABASE_URL incorreta

**Problema:** Lambda `evo-uds-v3-production-list-background-jobs` estava com DATABASE_URL apontando para endpoint inexistente `evo-uds-v3-nodejs-infra-rdsinstance-1ixbvtqhqhqhq.c8ywqzqzqzqz.us-east-1.rds.amazonaws.com`

**Sintoma:** Erro 500 "Can't reach database server"

**Solução:** Atualizada DATABASE_URL para o endpoint correto `evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com`

**Lição:** SEMPRE verificar se a DATABASE_URL aponta para o endpoint correto antes de debugar outros problemas.

---

## Checklist para Novas Lambdas

- [ ] DATABASE_URL configurada com endpoint correto (`evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com`)
- [ ] NODE_PATH configurado (`/opt/nodejs/node_modules`)
- [ ] Lambda na VPC correta (`vpc-09773244a2156129c`)
- [ ] Lambda nas subnets privadas corretas
- [ ] Security Group permite conexão ao RDS

---

**Última atualização:** 2026-01-14
**Versão:** 1.0
