---
inclusion: manual
---

# Infraestrutura AWS

## Ambientes

| Ambiente | Account | Branch | Prefix | Profile |
|----------|---------|--------|--------|---------|
| Sandbox | `971354623291` | `sandbox` | `evo-uds-v3-sandbox-*` | `EVO_SANDBOX` |
| Production | `523115032346` | `production` | `evo-uds-v3-prod-*` | `EVO_PRODUCTION` |

## Domínios

| Ambiente | Frontend | API |
|----------|----------|-----|
| Sandbox | `evo.sandbox.nuevacore.com` | `api.evo.sandbox.nuevacore.com` |
| Production | `evo.nuevacore.com` | `api.evo.nuevacore.com` |

---

## SANDBOX (971354623291)

### Resource IDs

| Recurso | Valor |
|---------|-------|
| VPC | `vpc-0c55e2a97fd92a5ca` |
| Private Subnet 1 | `subnet-0edbe4968ff3a5a9e` |
| Private Subnet 2 | `subnet-01931c820b0b0e864` |
| Lambda SG | `sg-0f14fd661fc5c41ba` |
| Cognito User Pool | `us-east-1_HPU98xnmT` |
| Cognito Client ID | `6gls4r44u96v6o0mkm1l6sbmgd` |
| CloudFront Distribution | `E93EL7AJZ6QAQ` (`dikd2ie8x3ihv.cloudfront.net`) |
| S3 Frontend | `evo-uds-v3-sandbox-frontend-971354623291` |
| S3 Artifacts | `evo-sam-artifacts-971354623291` |
| API Gateway (HTTP) | `igyifo56v7` / Stage: `prod` / Authorizer: `shn0ze` |
| RDS Endpoint | `evo-uds-v3-sandbox-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com` |
| Lambda Layer | `arn:aws:lambda:us-east-1:971354623291:layer:evo-uds-v3-sandbox-deps:1` |
| Lambda Stack | `evo-uds-v3-sandbox-lambdas` |
| Pipeline Stack | `evo-sam-pipeline-sandbox` |

### DATABASE_URL

```
postgresql://evoadmin:<PASSWORD>@evo-uds-v3-sandbox-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com:5432/evouds?schema=public
```

> **Nota**: A senha real está URL-encoded. Consultar SSM ou credenciais seguras para o valor atual.

### SSM Parameters (`/evo/sandbox/`)

| Parameter | Tipo | Valor |
|-----------|------|-------|
| `/evo/sandbox/token-encryption-key` | SecureString | Exclusivo do sandbox (gerado via `openssl rand -base64 32`) |
| `/evo/sandbox/azure-oauth-client-secret` | SecureString | Secret do Azure OAuth |
| `/evo/sandbox/webauthn-rp-id` | String | `nuevacore.com` |
| `/evo/sandbox/webauthn-rp-name` | String | `EVO Platform (Sandbox)` |

### Variáveis de Ambiente (Lambdas)

| Variável | Valor |
|----------|-------|
| ENVIRONMENT | `sandbox` |
| APP_DOMAIN | `evo.sandbox.nuevacore.com` |
| API_DOMAIN | `api.evo.sandbox.nuevacore.com` |
| AZURE_OAUTH_REDIRECT_URI | `https://evo.sandbox.nuevacore.com/azure/callback` |
| VITE_API_BASE_URL | `https://api.evo.sandbox.nuevacore.com` |
| VITE_CLOUDFRONT_DOMAIN | `evo.sandbox.nuevacore.com` |
| WEBAUTHN_RP_ID | `nuevacore.com` |
| STORAGE_ENCRYPTION_KEY | `evo-uds-v3-sandbox-secure-key-2024` |

### CI/CD

- **Pipeline**: `evo-sam-pipeline-sandbox`
- **Branch**: `sandbox` (main também mapeia para sandbox)
- **Buildspec**: `cicd/buildspec-sam.yml` (compartilhado, com lógica condicional por ENVIRONMENT)
- **SAM Template**: `sam/production-lambdas-only.yaml` (compartilhado, parametrizado)
- **Pipeline Stack Template**: `cicd/cloudformation/sam-pipeline-stack.yaml`
- **Fluxo**: `GitHub Push (branch sandbox) → CodePipeline → CodeBuild (ARM64) → SAM Deploy`

---

## PRODUCTION (523115032346)

### Resource IDs

| Recurso | Valor |
|---------|-------|
| VPC | `vpc-07424c3d1d6fb2dc6` |
| Private Subnet 1 | `subnet-0494b6594914ba898` |
| Private Subnet 2 | `subnet-0f68017cc0b95edda` |
| Lambda SG | `sg-066e845f73d46814d` |
| RDS SG | `sg-098e3163e78182351` |
| Cognito User Pool | `us-east-1_BUJecylbm` |
| Cognito Client ID | `a761ofnfjjo7u5mhpe2r54b7j` |
| CloudFront Distribution | `E2NW0IZ2OX493I` |
| S3 Frontend | `evo-uds-v3-production-frontend-523115032346` |
| S3 Artifacts | `evo-sam-artifacts-523115032346` |
| RDS Endpoint | `evo-uds-v3-prod-postgres.cib8kysoo015.us-east-1.rds.amazonaws.com` |
| Lambda Stack | `evo-uds-v3-prod-lambdas` |
| Pipeline Stack | `evo-sam-pipeline-production` |
| API Domain | `api.evo.nuevacore.com` |
| App Domain | `evo.nuevacore.com` |

### CI/CD

- **Pipeline**: `evo-sam-pipeline-production`
- **Branch**: `production`
- **Fluxo**: `GitHub Push (branch production) → CodePipeline → CodeBuild (ARM64) → SAM Deploy`

---

## Diferenças Sandbox vs Produção

| Configuração | Sandbox | Produção |
|-------------|---------|----------|
| **RDS Instance** | `db.t3.micro` | `db.t3.medium` |
| **RDS MultiAZ** | Desabilitado | Habilitado |
| **RDS PubliclyAccessible** | `true` (acesso direto) | `false` (via bastion/VPC) |
| **NAT Gateways** | 1 | 2 |
| **CloudFront PriceClass** | `PriceClass_100` (NA + EU) | `PriceClass_All` |
| **WAF** | Desabilitado | Habilitado |
| **Performance Insights** | Retenção padrão (7 dias) | Retenção estendida |
| **CloudTrail detalhado** | Desabilitado | Habilitado |
| **RDS Backup Retention** | 7 dias | 7 dias |
| **RDS Storage** | gp3, 20GB (auto-scaling até 100GB) | gp3, 20GB (auto-scaling até 100GB) |

---

## RDS PostgreSQL

| Env | Endpoint | DB | User |
|-----|----------|----|------|
| Sandbox | `evo-uds-v3-sandbox-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com` | `evouds` | `evoadmin` |
| Production | `evo-uds-v3-prod-postgres.cib8kysoo015.us-east-1.rds.amazonaws.com` | `evouds` | `evoadmin` |

---

## Processo de Dump/Restore (Produção → Sandbox)

### Pré-requisitos
- Acesso SSH ao bastion de produção (para tunnel ao RDS de produção)
- `pg_dump` e `pg_restore` instalados localmente
- Credenciais do RDS de produção e sandbox

### Processo
1. Conectar ao RDS de produção via SSH tunnel pelo bastion
2. Executar `pg_dump` com `--no-owner --no-privileges` para compatibilidade
3. Conectar diretamente ao RDS do sandbox (PubliclyAccessible=true)
4. Executar `pg_restore` no sandbox

### Script
```bash
scripts/sandbox-db-restore.sh
```

O script automatiza todo o processo, incluindo:
- Criação do SSH tunnel para o bastion
- Dump do banco de produção
- Restore no sandbox
- Tratamento de erros e logging
- Cleanup automático do tunnel

> **Nota**: O RDS do sandbox é acessível publicamente, então o restore pode ser feito diretamente sem tunnel.

---

## Scripts de Setup do Sandbox

| Script | Função |
|--------|--------|
| `scripts/setup-sandbox-ssm.sh` | Configurar SSM Parameters (`/evo/sandbox/*`) |
| `scripts/setup-sandbox-api-domain.sh` | Configurar custom domain no API Gateway |
| `scripts/setup-sandbox-cloudfront.sh` | Configurar alias no CloudFront + DNS |
| `scripts/setup-sandbox-pipeline.sh` | Deploy do CI/CD Pipeline (CodePipeline + CodeBuild) |
| `scripts/sandbox-db-restore.sh` | Dump/restore do banco de produção para sandbox |
| `scripts/verify-sandbox.sh` | Verificação completa do ambiente |
| `scripts/setup-sandbox-complete.sh` | Orquestrador master (executa todos na ordem correta) |

### Ordem de execução recomendada
1. SSM Parameters → 2. Custom Domains (API + CloudFront) → 3. Pipeline → 4. DB Restore → 5. Verificação

---

## Troubleshooting

| Erro | Causa | Solução |
|------|-------|---------|
| "Can't reach database server" | DATABASE_URL incorreta, VPC config, Lambda fora da VPC | Verificar DATABASE_URL, VPC config, Lambda na VPC |
| "Cannot find module" | Layer incorreta ou handler path errado | Verificar layer ARN e handler path no SAM template |
| Lambda 504 | NAT Gateway ausente ou rotas incorretas | Verificar NAT Gateway e rotas das private subnets |
| `Runtime.ImportModuleError` | Handler path incorreto no SAM template | Verificar handler path no SAM template |
| `Cannot find module '@aws-sdk/client-*'` | esbuild não bundlou | Verificar Metadata.BuildProperties no SAM template |
| `crypto is not defined` | Sem crypto polyfill (handlers Azure) | Adicionar polyfill de crypto (ver development-standards.md) |
| Custom domain não resolve | DNS não propagado ou certificado incorreto | Verificar Route53 records e ACM certificate |
| Pipeline não dispara | Branch incorreta ou connection desautorizada | Verificar GitHub Connection e branch no pipeline |
