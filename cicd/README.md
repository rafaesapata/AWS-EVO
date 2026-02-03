# EVO CI/CD Pipeline

Sistema de CI/CD usando AWS SAM (Serverless Application Model) para deploy automático da plataforma EVO.

## Arquitetura

```
GitHub Push → CodePipeline → CodeBuild → SAM Deploy
     │              │             │
     │              │             ├── Build TypeScript
     │              │             ├── Generate SAM Template
     │              │             ├── Build Lambda Layer
     │              │             ├── SAM Build & Deploy
     │              │             └── Run Prisma Migrations
     │              │
     │              └── Monitora branch específica
     │                  main → Sandbox
     │                  production → Production
     │
     └── Webhook automático via CodeStar Connection
```

## Ambientes

| Ambiente | Branch | AWS Account | Stack Name |
|----------|--------|-------------|------------|
| Sandbox | `main` | 971354623291 | `evo-uds-v3-sandbox` |
| Production | `production` | 523115032346 | `evo-uds-v3-prod` |

## Recursos Criados pelo SAM

O template SAM (`sam/template.yaml`) cria automaticamente:

- **203 Lambda Functions** - Todos os handlers da aplicação
- **API Gateway** - REST API com Cognito Authorizer
- **VPC** - Rede isolada com subnets públicas e privadas
- **NAT Gateway** - Para acesso à internet das Lambdas
- **RDS PostgreSQL** - Banco de dados
- **Cognito User Pool** - Autenticação
- **Lambda Layer** - Dependências compartilhadas (Prisma, AWS SDK, etc.)
- **Secrets Manager** - DATABASE_URL seguro

## Estrutura de Arquivos

```
cicd/
├── README.md                              # Este arquivo
├── buildspec-sam.yml                      # CodeBuild para SAM
├── cloudformation/
│   ├── codepipeline-stack.yaml           # Pipeline legado
│   └── sam-pipeline-stack.yaml           # Pipeline SAM (recomendado)
└── scripts/
    ├── deploy-changed-lambdas.sh         # Deploy incremental (legado)
    └── setup-pipeline.sh                 # Setup do pipeline

sam/
├── template.yaml                          # Template SAM gerado
└── samconfig.toml                        # Configuração SAM

scripts/
└── generate-sam-template.ts              # Gerador do template SAM
```

## Deploy do Pipeline SAM

### Pré-requisitos

1. **Conexão CodeStar com GitHub**
   - Acesse: https://console.aws.amazon.com/codesuite/settings/connections
   - Crie uma conexão com o GitHub
   - Autorize o acesso ao repositório
   - Copie o ARN da conexão

2. **Secrets no Parameter Store**
   ```bash
   # Sandbox
   aws ssm put-parameter \
     --name "/evo/sandbox/database-password" \
     --value "SUA_SENHA_SEGURA" \
     --type SecureString \
     --region us-east-1

   # Production
   aws ssm put-parameter \
     --name "/evo/production/database-password" \
     --value "SUA_SENHA_SEGURA" \
     --type SecureString \
     --region us-east-1
   ```

### Deploy do Pipeline

```bash
# Sandbox
aws cloudformation deploy \
  --template-file cicd/cloudformation/sam-pipeline-stack.yaml \
  --stack-name evo-sam-pipeline-sandbox \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    Environment=sandbox \
    GitHubOwner=SEU_USUARIO \
    GitHubRepo=AWS-EVO \
    GitHubBranch=main \
    GitHubConnectionArn=arn:aws:codestar-connections:us-east-1:971354623291:connection/XXXXX \
  --region us-east-1

# Production
aws cloudformation deploy \
  --template-file cicd/cloudformation/sam-pipeline-stack.yaml \
  --stack-name evo-sam-pipeline-prod \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    Environment=production \
    GitHubOwner=SEU_USUARIO \
    GitHubRepo=AWS-EVO \
    GitHubBranch=production \
    GitHubConnectionArn=arn:aws:codestar-connections:us-east-1:523115032346:connection/XXXXX \
  --region us-east-1
```

## Fluxo de Trabalho

### Desenvolvimento (Sandbox)

```bash
# 1. Fazer alterações no código
vim backend/src/handlers/auth/mfa-handlers.ts

# 2. Commit e push para main
git add .
git commit -m "fix: corrigir validação MFA"
git push origin main

# 3. Pipeline executa automaticamente:
#    - Build do TypeScript
#    - Geração do template SAM
#    - Build do Lambda Layer
#    - SAM build & deploy
#    - Prisma migrations
#    - Deploy do frontend
```

### Produção

```bash
# 1. Criar PR de main para production
# 2. Revisar e aprovar
# 3. Merge para production
# 4. Pipeline de produção executa automaticamente
```

## Comandos SAM Locais

```bash
# Validar template
sam validate --template sam/template.yaml

# Build local
sam build --template sam/template.yaml

# Deploy manual (NÃO RECOMENDADO - use CI/CD)
sam deploy --config-env sandbox
```

## Regenerar Template SAM

Se adicionar novos handlers, regenere o template:

```bash
npx tsx scripts/generate-sam-template.ts
```

O script lê todos os handlers em `backend/src/handlers/` e gera o template SAM completo.

## Monitoramento

### Ver status do Pipeline

```bash
aws codepipeline get-pipeline-state \
  --name evo-sam-pipeline-sandbox \
  --region us-east-1
```

### Ver logs do CodeBuild

```bash
aws logs tail /aws/codebuild/evo-sam-sandbox --follow --region us-east-1
```

### Ver stack SAM

```bash
aws cloudformation describe-stacks \
  --stack-name evo-uds-v3-sandbox \
  --region us-east-1
```

## Troubleshooting

### Pipeline falhou no SAM Build

- Verificar se o template é válido: `sam validate`
- Verificar logs do CodeBuild
- Verificar se todas as dependências estão no layer

### Lambda não encontra módulo

- Verificar se o módulo está no layer
- Verificar se o `NODE_PATH` está configurado: `/opt/nodejs/node_modules`

### Erro de conexão com banco

- Verificar se a Lambda está na VPC correta
- Verificar Security Groups
- Verificar se o DATABASE_URL está correto no Secrets Manager

### Stack excede limite de recursos

O SAM template atual tem ~203 funções. Se precisar de mais:
- Considere usar nested stacks
- Ou divida em múltiplos stacks SAM

## Custos Estimados

| Serviço | Custo Estimado |
|---------|----------------|
| CodePipeline | $1/mês por pipeline |
| CodeBuild | ~$0.005/minuto |
| Lambda | Pay per use |
| RDS (db.t3.micro) | ~$15/mês |
| NAT Gateway | ~$32/mês |
| **Total** | ~$50-100/mês por ambiente |

---

**Última atualização:** 2026-02-03
**Versão:** 2.0 (SAM)
