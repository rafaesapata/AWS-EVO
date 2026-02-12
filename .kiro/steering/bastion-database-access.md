---
inclusion: manual
---

# Bastion Host — Acesso RDS Production

RDS em subnets privadas. Acesso SOMENTE via Bastion.

## Bastion
- Instance: `i-00d8aa3ee551d4215` | IP: `44.213.112.31` | Key: `~/.ssh/evo-production-bastion.pem`
- VPC: `vpc-07424c3d1d6fb2dc6` | SG: `sg-0dec194e59bf06ec3`

## RDS
- Endpoint: `evo-uds-v3-production-postgres.cib8kysoo015.us-east-1.rds.amazonaws.com:5432`
- DB: `evouds` | User: `evoadmin` | Pass: `xJB8g6z84PzUYRhWMM8QkkQb`

## Conexão direta
```bash
ssh -i ~/.ssh/evo-production-bastion.pem ec2-user@44.213.112.31
psql -h evo-uds-v3-production-postgres.cib8kysoo015.us-east-1.rds.amazonaws.com -U evoadmin -d evouds
```

## SSH Tunnel (acesso local)
```bash
ssh -i ~/.ssh/evo-production-bastion.pem -L 5433:evo-uds-v3-production-postgres.cib8kysoo015.us-east-1.rds.amazonaws.com:5432 -N ec2-user@44.213.112.31
# Depois: psql -h localhost -p 5433 -U evoadmin -d evouds
```

## Gerenciar Bastion
```bash
AWS_PROFILE=EVO_PRODUCTION aws ec2 start-instances --instance-ids i-00d8aa3ee551d4215 --region us-east-1
AWS_PROFILE=EVO_PRODUCTION aws ec2 stop-instances --instance-ids i-00d8aa3ee551d4215 --region us-east-1
```
IP público muda ao reiniciar — sempre verificar antes de conectar.

## Troubleshooting
- "Permission denied" → `chmod 400 ~/.ssh/evo-production-bastion.pem`
- "Connection timed out" → Bastion parado ou SG sem porta 22
- "could not connect to server" → Verificar SG do RDS permite Bastion
