# 🔄 Guia de Invalidação do CloudFront - EVO UDS

## 📋 Visão Geral

Este guia explica como invalidar o cache do CloudFront automaticamente a cada deploy do frontend, garantindo que os usuários sempre vejam a versão mais recente da aplicação.

## 🚀 Invalidação Automática

### Durante o Deploy

A invalidação do CloudFront é executada automaticamente durante o deploy:

```bash
# Deploy completo (inclui invalidação automática)
npm run deploy

# Deploy apenas do frontend (inclui invalidação automática)
npm run deploy:frontend

# Deploy para produção
npm run deploy:frontend:prod
```

### Scripts Disponíveis

```bash
# Invalidação manual
npm run invalidate-cloudfront

# Verificar invalidações em progresso
npm run invalidate-cloudfront:check

# Ver histórico de invalidações
npm run invalidate-cloudfront:list

# Script bash completo
./scripts/deploy-frontend.sh --env=production --verbose
```

## 🛠️ Comandos Manuais

### Invalidação Básica

```bash
# Obter Distribution ID
export DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Frontend \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
  --output text)

# Invalidar tudo
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"
```

### Invalidação Específica

```bash
# Invalidar apenas arquivos HTML
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/index.html" "/404.html"

# Invalidar assets específicos
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/assets/index-*.js" "/assets/index-*.css"

# Invalidar API routes
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/api/*"
```

### Monitoramento

```bash
# Listar invalidações recentes
aws cloudfront list-invalidations \
  --distribution-id $DISTRIBUTION_ID \
  --max-items 10

# Verificar status de uma invalidação específica
aws cloudfront get-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --id INVALIDATION_ID

# Verificar invalidações em progresso
aws cloudfront list-invalidations \
  --distribution-id $DISTRIBUTION_ID \
  --query "InvalidationList.Items[?Status=='InProgress']"
```

## ⚙️ Configuração Avançada

### Cache Headers Otimizados

O deploy automático configura headers de cache otimizados:

```bash
# Assets com cache longo (JS, CSS, imagens)
aws s3 sync dist/ s3://bucket-name \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "*.html" \
  --exclude "*.json"

# HTML e JSON com cache curto
aws s3 sync dist/ s3://bucket-name \
  --cache-control "public, max-age=0, must-revalidate" \
  --include "*.html" \
  --include "*.json"
```

### Invalidação Inteligente

O script detecta automaticamente:

- ✅ Distribution ID do CloudFront
- ✅ Bucket S3 do frontend
- ✅ Invalidações em progresso
- ✅ Status das invalidações

### Configuração de Ambiente

```bash
# Development
./scripts/deploy-frontend.sh --env=development

# Staging  
./scripts/deploy-frontend.sh --env=staging

# Production
./scripts/deploy-frontend.sh --env=production --verbose
```

## 🔍 Troubleshooting

### Erro: Distribution ID não encontrado

```bash
# Listar todas as distribuições
aws cloudfront list-distributions \
  --query "DistributionList.Items[].{Id:Id,Comment:Comment,DomainName:DomainName}"

# Verificar outputs do CloudFormation
aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Frontend \
  --query "Stacks[0].Outputs"
```

### Erro: Invalidação em progresso

```bash
# Aguardar conclusão
aws cloudfront get-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --id INVALIDATION_ID

# Forçar nova invalidação (não recomendado)
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*" \
  --caller-reference "force-$(date +%s)"
```

### Erro: Permissões AWS

Certifique-se de ter as permissões:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateInvalidation",
        "cloudfront:GetInvalidation",
        "cloudfront:ListInvalidations",
        "cloudfront:GetDistribution",
        "cloudfront:ListDistributions"
      ],
      "Resource": "*"
    }
  ]
}
```

## 📊 Métricas e Monitoramento

### CloudWatch Metrics

```bash
# Requests por minuto
aws cloudwatch get-metric-statistics \
  --namespace AWS/CloudFront \
  --metric-name Requests \
  --dimensions Name=DistributionId,Value=$DISTRIBUTION_ID \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum

# Cache Hit Rate
aws cloudwatch get-metric-statistics \
  --namespace AWS/CloudFront \
  --metric-name CacheHitRate \
  --dimensions Name=DistributionId,Value=$DISTRIBUTION_ID \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average
```

### Alarmes Recomendados

```bash
# Alta taxa de erro 4xx
aws cloudwatch put-metric-alarm \
  --alarm-name "evo-uds-cloudfront-4xx-errors" \
  --alarm-description "CloudFront 4xx error rate too high" \
  --metric-name 4xxErrorRate \
  --namespace AWS/CloudFront \
  --statistic Average \
  --period 300 \
  --threshold 5.0 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=DistributionId,Value=$DISTRIBUTION_ID \
  --evaluation-periods 2

# Baixa taxa de cache hit
aws cloudwatch put-metric-alarm \
  --alarm-name "evo-uds-cloudfront-low-cache-hit" \
  --alarm-description "CloudFront cache hit rate too low" \
  --metric-name CacheHitRate \
  --namespace AWS/CloudFront \
  --statistic Average \
  --period 300 \
  --threshold 80.0 \
  --comparison-operator LessThanThreshold \
  --dimensions Name=DistributionId,Value=$DISTRIBUTION_ID \
  --evaluation-periods 3
```

## 💰 Custos

### Custos de Invalidação

- **Primeiras 1.000 invalidações/mês**: Gratuitas
- **Invalidações adicionais**: $0.005 cada
- **Recomendação**: Use `/*` em vez de múltiplos paths específicos

### Otimização de Custos

```bash
# ✅ Bom: Uma invalidação para tudo
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"

# ❌ Ruim: Múltiplas invalidações
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/index.html" "/assets/app.js" "/assets/app.css" "/api/*"
```

## 🔄 Workflow Recomendado

### Deploy de Desenvolvimento

```bash
# 1. Build e deploy com invalidação
npm run deploy:frontend

# 2. Verificar se funcionou
curl -I https://d123456789.cloudfront.net/

# 3. Monitorar invalidação
npm run invalidate-cloudfront:check
```

### Deploy de Produção

```bash
# 1. Build para produção
npm run build

# 2. Deploy com validação
npm run deploy:frontend:prod

# 3. Aguardar invalidação completa
npm run invalidate-cloudfront:list

# 4. Testar em múltiplos browsers/dispositivos
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Deploy Frontend
  run: |
    npm run build
    ./scripts/deploy-frontend.sh --env=production
    
- name: Verify Deployment
  run: |
    npm run invalidate-cloudfront:check
    # Aguardar até 5 minutos para invalidação
    timeout 300 bash -c 'until npm run invalidate-cloudfront:check | grep -q "Completed"; do sleep 30; done'
```

## 📚 Referências

- [AWS CloudFront Invalidation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation.html)
- [CloudFront Pricing](https://aws.amazon.com/cloudfront/pricing/)
- [Cache Behaviors](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-web-values-specify.html#DownloadDistValuesCacheBehavior)

---

**Status**: ✅ Implementado e testado  
**Última atualização**: Dezembro 2025  
**Próximos passos**: Integração com CI/CD pipeline