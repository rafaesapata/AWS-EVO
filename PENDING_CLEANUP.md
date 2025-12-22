# Pendências de Limpeza AWS

## Stacks com DELETE_FAILED (aguardando deleção do RDS)

As seguintes stacks falharam na deleção porque dependem do RDS que ainda está sendo deletado:

- `evo-uds-production-database` - DELETE_FAILED
- `evo-uds-production-network` - DELETE_FAILED

## RDS em Deleção

- **Instance**: `evo-uds-production-db`
- **Status**: deleting (iniciado em 22/12/2025)

## Comandos para Limpar Após RDS Deletar

```bash
# Verificar se RDS foi deletado
aws rds describe-db-instances --db-instance-identifier evo-uds-production-db

# Deletar stacks pendentes
aws cloudformation delete-stack --stack-name evo-uds-production-database
aws cloudformation delete-stack --stack-name evo-uds-production-network

# Verificar VPC antiga (se ainda existir)
aws ec2 describe-vpcs --vpc-ids vpc-09773244a2156129c

# Deletar VPC manualmente se necessário
aws ec2 delete-vpc --vpc-id vpc-09773244a2156129c
```

## Nova Stack

A nova stack `evo-uds-v2` foi criada independentemente e não depende desses recursos antigos.
