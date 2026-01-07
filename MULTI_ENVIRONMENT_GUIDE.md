# Multi-Environment Setup Guide

## Visão Geral

O projeto está configurado para usar **duas contas AWS separadas**:

| Ambiente | AWS Profile | Conta AWS | Domínio |
|----------|-------------|-----------|---------|
| Development | `default` | 383234048592 | dev-evo.ai.udstec.io |
| Production | `EVO_PRODUCTION` | (a configurar) | evo.ai.udstec.io |

## Configuração Inicial

### 1. Configurar o perfil AWS de produção

```bash
aws configure --profile EVO_PRODUCTION
```

Preencha:
- AWS Access Key ID: (da conta de produção)
- AWS Secret Access Key: (da conta de produção)
- Default region: us-east-1
- Default output format: json

### 2. Atualizar o ID da conta de produção

Edite `infra/lib/config/environments.ts` e substitua:
```typescript
account: 'PRODUCTION_ACCOUNT_ID', // Substitua pelo ID real
```

### 3. Bootstrap do CDK na conta de produção

```bash
cd infra
npm run bootstrap:prod
```

## Comandos de Deploy

### Desenvolvimento

```bash
# Deploy completo (infra + frontend)
npm run deploy:dev

# Apenas infraestrutura CDK
npm run cdk:dev

# Ver diferenças antes de aplicar
npm run cdk:diff:dev
```

### Produção

```bash
# Deploy completo (infra + frontend) - pede confirmação
npm run deploy:prod

# Apenas infraestrutura CDK
npm run cdk:prod

# Ver diferenças antes de aplicar
npm run cdk:diff:prod
```

## Estrutura de Arquivos

```
├── .env.development      # Variáveis para ambiente dev
├── .env.production       # Variáveis para ambiente prod
├── infra/
│   ├── lib/config/
│   │   └── environments.ts  # Configuração centralizada
│   └── package.json         # Scripts por ambiente
├── scripts/
│   ├── deploy-dev.sh        # Script completo de deploy dev
│   └── deploy-prod.sh       # Script completo de deploy prod
```

## Fluxo de Trabalho Recomendado

1. **Desenvolva localmente** usando `npm run dev`
2. **Teste em dev** com `npm run deploy:dev`
3. **Valide as mudanças** em dev-evo.ai.udstec.io
4. **Verifique diferenças** com `npm run cdk:diff:prod`
5. **Deploy em prod** com `npm run deploy:prod`

## Recursos por Ambiente

| Recurso | Development | Production |
|---------|-------------|------------|
| RDS Instance | db.t3.micro | db.t3.medium |
| RDS Storage | 20 GB | 100 GB |
| Multi-AZ | ❌ | ✅ |
| WAF | ❌ | ✅ |
| CloudTrail | ❌ | ✅ |
| Backups | ❌ | ✅ |

## Troubleshooting

### Erro: "Profile not found"
```bash
aws configure list-profiles  # Verificar perfis disponíveis
```

### Erro: "Account mismatch"
Verifique se está usando o perfil correto:
```bash
aws sts get-caller-identity --profile EVO_PRODUCTION
```

### Erro: "CDK not bootstrapped"
```bash
cd infra && npm run bootstrap:prod
```
