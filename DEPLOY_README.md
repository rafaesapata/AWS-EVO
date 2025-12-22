# 🚀 Deploy Autônomo EVO UDS System

Este sistema de deploy é **100% autônomo** e vai criar toda a infraestrutura necessária na AWS, fazer o build completo da aplicação e fornecer as URLs de acesso ao final.

## ⚡ Deploy Rápido (1 Comando)

```bash
npm run deploy:dev
```

Este comando vai:
1. ✅ Verificar todos os pré-requisitos
2. 🏗️ Configurar a infraestrutura CDK
3. 📦 Instalar todas as dependências
4. 🔨 Fazer build do frontend e backend
5. 🧪 Executar testes automatizados
6. 🔒 Executar scan de segurança
7. ☁️ Criar toda a infraestrutura AWS
8. 🗄️ Configurar banco de dados
9. ⚡ Fazer deploy das funções Lambda
10. 🌐 Fazer deploy do frontend
11. 📊 Configurar monitoramento
12. 🏥 Verificar saúde do sistema
13. 🎉 **Fornecer URLs de acesso**

## 🎯 Ambientes Disponíveis

### Desenvolvimento
```bash
npm run deploy:dev
```
- Ambiente: `development`
- Região: `us-east-1`
- Logs detalhados habilitados
- Testes e segurança incluídos

### Staging
```bash
npm run deploy:staging
```
- Ambiente: `staging`
- Região: `us-east-1`
- Configuração próxima à produção
- Todos os checks habilitados

### Produção
```bash
npm run deploy:prod
```
- Ambiente: `production`
- Configuração otimizada
- Máxima segurança
- Monitoramento completo

## 🔧 Opções Avançadas

### Deploy com Domínio Customizado
```bash
npm run deploy:prod -- --domain=app.evo-uds.com
```

### Deploy Rápido (Pula Testes)
```bash
npm run deploy:quick
```

### Deploy em Região Específica
```bash
npm run deploy:dev -- --region=us-west-2
```

### Deploy com Profile AWS Específico
```bash
npm run deploy:prod -- --profile=production
```

## 📋 Pré-requisitos

O sistema verifica automaticamente, mas você precisa ter:

### Obrigatórios ✅
- **Node.js 18+** - [Instalar](https://nodejs.org/)
- **AWS CLI** - [Instalar](https://aws.amazon.com/cli/)
- **AWS CDK** - `npm install -g aws-cdk`
- **TSX** - `npm install -g tsx`
- **Credenciais AWS** - `aws configure`

### Opcionais 📦
- **Git** - Para controle de versão
- **Docker** - Para desenvolvimento local

### Verificação Automática
```bash
npm run check-prerequisites
```

### Correção Automática
```bash
npm run check-prerequisites -- --fix
```

## 🏗️ Infraestrutura Criada

O deploy cria automaticamente:

### Rede
- **VPC** com subnets públicas e privadas
- **NAT Gateways** para acesso à internet
- **Security Groups** configurados
- **VPC Endpoints** para serviços AWS

### Banco de Dados
- **RDS PostgreSQL** com backups automáticos
- **Secrets Manager** para credenciais
- **Subnet Groups** isolados
- **Performance Insights** habilitado

### Autenticação
- **Cognito User Pool** configurado
- **User Pool Client** para web
- **Domínio customizado** para auth
- **Políticas de senha** seguras

### API
- **API Gateway** com CORS
- **Funções Lambda** para todos os endpoints
- **Authorizers** Cognito integrados
- **Rate limiting** configurado

### Frontend
- **S3 Bucket** para assets estáticos
- **CloudFront** para CDN global
- **Origin Access Identity** para segurança
- **Error pages** configuradas

### Monitoramento
- **CloudWatch Dashboards** personalizados
- **Alarms** para métricas críticas
- **SNS Topics** para alertas
- **Log Groups** organizados

## 📊 Acompanhamento em Tempo Real

Durante o deploy, você verá:

```
🚀 Iniciando Deploy Autônomo EVO UDS System
📋 Deployment ID: deploy_1703123456789_abc123
🌍 Environment: development
📍 Region: us-east-1

🔍 Executando verificações pré-deploy...
✅ AWS CLI encontrado
✅ AWS CDK encontrado
✅ Credenciais AWS válidas (Account: 123456789012)

📦 [1/13] Configuração do ambiente e validação de pré-requisitos (7%)
⏱️  Tempo estimado: 30s
✅ Configuração do ambiente e validação de pré-requisitos concluído em 25s

📦 [2/13] Instalação de dependências (15%)
⏱️  Tempo estimado: 60s
📦 Instalando dependências do frontend...
📦 Instalando dependências do backend...
📦 Instalando dependências da infraestrutura...
✅ Instalação de dependências concluído em 45s

...

🎉 DEPLOY CONCLUÍDO COM SUCESSO! 🎉
═══════════════════════════════════════════════════════════
⏱️  Tempo total: 12m 34s
🆔 Deployment ID: deploy_1703123456789_abc123
🌍 Environment: development
📍 Region: us-east-1
═══════════════════════════════════════════════════════════

🔗 URLs DE ACESSO:
🌐 Frontend: https://d1234567890123.cloudfront.net
⚡ API: https://api-deploy123.execute-api.us-east-1.amazonaws.com

🚀 Sistema EVO UDS está online e pronto para uso!
```

## 🔗 URLs de Acesso

Após o deploy, você receberá:

### Frontend (React App)
- **URL CloudFront**: `https://d[ID].cloudfront.net`
- **Domínio customizado**: `https://seu-dominio.com` (se configurado)

### API (Backend)
- **URL API Gateway**: `https://api-[ID].execute-api.[region].amazonaws.com`
- **Health Check**: `[API_URL]/health`
- **Documentação**: `[API_URL]/docs`

### Monitoramento
- **CloudWatch Dashboard**: Link direto no output
- **Logs**: CloudWatch Log Groups
- **Métricas**: CloudWatch Metrics

## 🔄 Rollback e Recuperação

### Rollback Automático
- Falhas durante deploy fazem rollback automático
- Infraestrutura é limpa em caso de erro
- Logs detalhados para debugging

### Rollback Manual
```bash
cd infra
cdk destroy --all --force
```

### Recuperação de Estado
```bash
# Ver status atual
cd infra
cdk list

# Ver diferenças
cdk diff

# Recriar se necessário
npm run deploy:dev
```

## 🛠️ Troubleshooting

### Problemas Comuns

#### 1. Credenciais AWS
```bash
aws configure
# ou
export AWS_PROFILE=seu-profile
```

#### 2. Região não suportada
```bash
npm run deploy:dev -- --region=us-east-1
```

#### 3. Limites de conta AWS
- Verifique limites de VPC, RDS, etc.
- Solicite aumento se necessário

#### 4. Conflitos de nomes
- O sistema usa IDs únicos automaticamente
- Raramente ocorre conflito

### Logs Detalhados
```bash
npm run deploy:dev -- --verbose
```

### Verificar Status
```bash
# Status da infraestrutura
cd infra
cdk list

# Status dos recursos
aws cloudformation list-stacks --region us-east-1
```

## 🔒 Segurança

### Práticas Implementadas
- ✅ **Secrets Manager** para credenciais
- ✅ **VPC isolada** com subnets privadas
- ✅ **Security Groups** restritivos
- ✅ **IAM Roles** com menor privilégio
- ✅ **Encryption at rest** habilitada
- ✅ **HTTPS** obrigatório
- ✅ **WAF** configurado (produção)

### Scan de Segurança
```bash
# Incluído automaticamente no deploy
npm audit
```

## 💰 Custos Estimados

### Desenvolvimento
- **~$20-30/mês** para recursos básicos
- RDS t3.micro, Lambda free tier, S3 mínimo

### Staging
- **~$50-80/mês** com mais recursos
- RDS t3.small, mais Lambda executions

### Produção
- **~$100-200/mês** com alta disponibilidade
- RDS Multi-AZ, NAT Gateways, CloudFront

### Otimização de Custos
- Recursos são dimensionados por ambiente
- Auto-scaling configurado
- Backups otimizados por retenção

## 📞 Suporte

### Documentação
- [AWS CDK Docs](https://docs.aws.amazon.com/cdk/)
- [API Gateway Docs](https://docs.aws.amazon.com/apigateway/)
- [Lambda Docs](https://docs.aws.amazon.com/lambda/)

### Logs e Debugging
```bash
# Logs do deploy
tail -f /tmp/deploy-*.log

# Logs da aplicação
aws logs tail /aws/lambda/evo-uds --follow
```

### Contato
- **Issues**: GitHub Issues
- **Email**: suporte@evo-uds.com
- **Slack**: #evo-uds-deploy

---

## 🎯 Resumo dos Comandos

```bash
# Deploy completo desenvolvimento
npm run deploy:dev

# Deploy completo staging  
npm run deploy:staging

# Deploy completo produção
npm run deploy:prod

# Deploy rápido (sem testes)
npm run deploy:quick

# Verificar pré-requisitos
npm run check-prerequisites

# Ajuda
npm run deploy:help
```

**🚀 O sistema está pronto para deploy com um único comando!**