# Problema: Sandbox DB Schema Desatualizado

## Diagnóstico

O erro `save-aws-credentials` no Sandbox está falhando com:

```
The column `organizations.cost_overhead_percentage` does not exist in the current database.
```

## Causa Raiz

O banco de dados do Sandbox está com schema desatualizado. Faltam migrations recentes, incluindo:
- `20260222_add_cost_overhead_percentage` - Adiciona coluna `cost_overhead_percentage` na tabela `organizations`

## Problema de Conectividade

O RDS do Sandbox (`evo-uds-v3-sandbox-postgres.csno4kowwmc9.us-east-1.rds.amazonaws.com`) não está acessível publicamente:
- Timeout ao tentar conectar diretamente
- Não há bastion/jump server configurado para Sandbox (apenas Production tem)
- Security Group provavelmente bloqueando acesso externo

## Soluções Possíveis

### Opção 1: Habilitar Acesso Público Temporário (RECOMENDADO)
1. No AWS Console, ir para RDS → `evo-uds-v3-sandbox-postgres`
2. Modify → Connectivity → Publicly accessible: Yes
3. Modify Security Group para permitir seu IP na porta 5432
4. Aplicar migrations: `cd backend && DATABASE_URL="postgresql://evoadmin:SandboxEvo2026Safe@evo-uds-v3-sandbox-postgres.csno4kowwmc9.us-east-1.rds.amazonaws.com:5432/evouds" npx prisma migrate deploy`
5. Reverter para Publicly accessible: No

### Opção 2: Lambda de Migrations
Criar uma Lambda temporária dentro da VPC do Sandbox que roda `prisma migrate deploy`

### Opção 3: Bastion/Jump Server
Configurar um bastion server no Sandbox (similar ao Production)

### Opção 4: Via CI/CD
Fazer um deploy completo no Sandbox via tag, que automaticamente roda as migrations

## Migrations Pendentes

```sql
-- 20260222_add_cost_overhead_percentage
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cost_overhead_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0.00;

-- Constraint de validação
ALTER TABLE organizations
ADD CONSTRAINT chk_overhead_percentage
CHECK (cost_overhead_percentage >= 0.00 AND cost_overhead_percentage <= 100.00);
```

## Ação Imediata

**OPÇÃO MAIS RÁPIDA:** Rodar migrations via CI/CD

```bash
# 1. Commit qualquer mudança pendente
git add -A
git commit -m "fix: update sandbox db schema"

# 2. Criar tag para deploy no Sandbox
git tag sandbox-v1.0.0-db-fix
git push origin sandbox-v1.0.0-db-fix
```

O pipeline automaticamente:
1. Detecta mudanças no backend
2. Roda `cicd/scripts/run-migrations.sh` (que tem acesso ao RDS via VPC)
3. Faz deploy das Lambdas com Prisma Client atualizado

## Verificação Pós-Deploy

```bash
# Verificar logs do CloudWatch após deploy
aws logs tail /aws/lambda/evo-uds-v3-sandbox-save-aws-credentials --since 5m --region us-east-1 --profile EVO_SANDBOX
```

## Prevenção Futura

1. Sempre rodar migrations no Sandbox antes de Production
2. Adicionar health check que valida schema do banco
3. Considerar habilitar acesso público permanente no Sandbox (com IP whitelist) para facilitar desenvolvimento
4. Ou configurar bastion server no Sandbox
