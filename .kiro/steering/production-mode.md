---
inclusion: manual
---

# Modo Production — EVO Platform

Quando este steering estiver ativo, TODAS as operações devem ser direcionadas ao ambiente de **Production**.

## ⛔ Regras Obrigatórias

1. **NUNCA** modificar dados de sandbox — todo acesso é production
2. **NUNCA** usar credenciais/endpoints de sandbox
3. **SEMPRE** confirmar que o SSH tunnel está ativo antes de queries no banco
4. **SEMPRE** usar `AWS_PROFILE=EVO_PRODUCTION` para qualquer comando AWS CLI
5. **SEMPRE** fazer backup/snapshot antes de operações destrutivas no banco
6. **CUIDADO EXTREMO** com DELETE, UPDATE, DROP — production é irreversível

## Credenciais Production (AWS Account: 523115032346)

| Recurso | Valor |
|---------|-------|
| RDS Endpoint | `evo-uds-v3-production-postgres.cib8kysoo015.us-east-1.rds.amazonaws.com:5432` |
| RDS User | `evoadmin` |
| RDS Database | `evouds` |
| RDS Acesso | **Privado** — somente via Bastion Host |
| Cognito Pool | `us-east-1_cnesJ48lR` |
| API Gateway | `https://api.evo.nuevacore.com` |
| Frontend | `https://evo.nuevacore.com` |
| AWS Profile | `EVO_PRODUCTION` |

## Bastion Host

| Recurso | Valor |
|---------|-------|
| Instance ID | `i-00d8aa3ee551d4215` |
| IP Público | `44.213.112.31` (muda ao reiniciar) |
| Key | `~/.ssh/evo-production-bastion.pem` |
| VPC | `vpc-07424c3d1d6fb2dc6` |
| Security Group | `sg-0dec194e59bf06ec3` |

### Ligar/Desligar Bastion

```bash
# Ligar
AWS_PROFILE=EVO_PRODUCTION aws ec2 start-instances --instance-ids i-00d8aa3ee551d4215 --region us-east-1

# Desligar
AWS_PROFILE=EVO_PRODUCTION aws ec2 stop-instances --instance-ids i-00d8aa3ee551d4215 --region us-east-1

# Verificar IP atual
AWS_PROFILE=EVO_PRODUCTION aws ec2 describe-instances --instance-ids i-00d8aa3ee551d4215 --region us-east-1 --query 'Reservations[0].Instances[0].PublicIpAddress' --output text
```

### SSH Tunnel para RDS Production

```bash
# Abrir tunnel (porta local 5433 → RDS production)
ssh -i ~/.ssh/evo-production-bastion.pem -L 5433:evo-uds-v3-production-postgres.cib8kysoo015.us-east-1.rds.amazonaws.com:5432 -N ec2-user@44.213.112.31

# Conectar via psql (em outro terminal)
psql -h localhost -p 5433 -U evoadmin -d evouds
```

### Conexão direta no Bastion

```bash
ssh -i ~/.ssh/evo-production-bastion.pem ec2-user@44.213.112.31
psql -h evo-uds-v3-production-postgres.cib8kysoo015.us-east-1.rds.amazonaws.com -U evoadmin -d evouds
```

## MCP PostgreSQL Server

O MCP server `@modelcontextprotocol/server-postgres` está configurado no workspace (`.kiro/settings/mcp.json`) para conectar via tunnel na porta 5433. **O tunnel SSH deve estar ativo antes de usar.**

## backend/.env para Production (via tunnel)

Quando trabalhando em production localmente, o `backend/.env` deve apontar para o tunnel:

```env
DATABASE_URL="postgresql://evoadmin:xJB8g6z84PzUYRhWMM8QkkQb@localhost:5433/evouds?schema=public"
NODE_ENV=production
ENVIRONMENT=production
COGNITO_USER_POOL_ID=us-east-1_cnesJ48lR
APP_DOMAIN=evo.nuevacore.com
API_DOMAIN=api.evo.nuevacore.com
WEBAUTHN_RP_ID=nuevacore.com
WEBAUTHN_RP_NAME=EVO Platform
```

## Deploy Production

```bash
# Tag e push — NUNCA push direto no branch production
git tag production-v<versão>
git push origin production-v<versão>
```

## Checklist antes de operar em Production

- [ ] `aws sts get-caller-identity --profile EVO_PRODUCTION` retorna account 523115032346
- [ ] Bastion está ligado
- [ ] SSH tunnel ativo na porta 5433
- [ ] `psql -h localhost -p 5433 -U evoadmin -d evouds` conecta com sucesso

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Tunnel não conecta | Verificar se bastion está ligado e IP atualizado |
| Permission denied (key) | `chmod 400 ~/.ssh/evo-production-bastion.pem` |
| Connection refused porta 5433 | Tunnel SSH não está ativo |
| ExpiredTokenException | `aws sso login --profile EVO_PRODUCTION` |
| IP do bastion mudou | Verificar novo IP com `describe-instances` |
