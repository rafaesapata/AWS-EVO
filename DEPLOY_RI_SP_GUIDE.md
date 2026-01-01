# 🚀 Guia de Deploy - Análise de RI/SP

## ✅ Status Atual

- ✅ Backend compilado com sucesso
- ✅ Schema Prisma atualizado
- ✅ Migração SQL criada
- ✅ Lambda adicionada ao CDK
- ✅ Endpoint API configurado
- ✅ Frontend integrado
- ✅ Validação Zod implementada

## 📋 Checklist de Deploy

### 1. Aplicar Migração do Banco de Dados

```bash
# Conectar ao RDS PostgreSQL
psql -h evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com \
     -U postgres \
     -d evouds

# Executar a migração
\i backend/prisma/migrations/20260101000000_add_ri_sp_tables/migration.sql

# Verificar tabelas criadas
\dt reserved_instances
\dt savings_plans
\dt ri_sp_recommendations
\dt ri_sp_utilization_history

# Sair
\q
```

**Ou via arquivo SQL direto:**
```bash
psql -h evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com \
     -U postgres -d evouds \
     -f backend/prisma/migrations/20260101000000_add_ri_sp_tables/migration.sql
```

### 2. Deploy do Backend via CDK

```bash
# Navegar para infra
cd infra

# Instalar dependências (se necessário)
npm install

# Verificar mudanças
npm run cdk diff

# Deploy
npm run cdk deploy

# Ou deploy específico do API Stack
npm run cdk deploy ApiStack
```

**Mudanças no CDK:**
- ✅ Nova Lambda: `RiSpAnalysisFunction`
- ✅ Permissões IAM para Cost Explorer
- ✅ Endpoint: `POST /finops/ri-sp-analysis`
- ✅ Timeout: 5 minutos
- ✅ Memory: 512 MB

### 3. Verificar Permissões IAM

A Lambda precisa das seguintes permissões (já adicionadas no CDK):

```json
{
  "Effect": "Allow",
  "Action": [
    "ec2:DescribeReservedInstances",
    "ce:GetReservationUtilization",
    "ce:GetSavingsPlansUtilization",
    "ce:GetReservationPurchaseRecommendation",
    "ce:GetSavingsPlansPurchaseRecommendation"
  ],
  "Resource": "*"
}
```

### 4. Deploy do Frontend

```bash
# Build do frontend
npm run build

# Verificar build
ls -lh dist/

# Deploy para S3
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html" \
  --exclude "*.map"

# Deploy do index.html sem cache
aws s3 cp dist/index.html s3://evo-uds-v3-production-frontend-383234048592/index.html \
  --cache-control "no-cache, no-store, must-revalidate"

# Invalidar CloudFront
aws cloudfront create-invalidation \
  --distribution-id E1PY7U3VNT6P1R \
  --paths "/*"
```

### 5. Testar a Integração

#### Teste via AWS Console

1. Acesse Lambda Console
2. Busque por `RiSpAnalysisFunction`
3. Configure test event:

```json
{
  "requestContext": {
    "http": {
      "method": "POST"
    },
    "authorizer": {
      "jwt": {
        "claims": {
          "sub": "user-uuid",
          "custom:organization_id": "org-uuid"
        }
      }
    }
  },
  "body": "{\"accountId\":\"aws-account-uuid\",\"analysisType\":\"all\",\"lookbackDays\":30}"
}
```

4. Execute e verifique resposta

#### Teste via Frontend

1. Acesse https://evo.ai.udstec.io
2. Login com credenciais válidas
3. Navegue para "Análise de Custos"
4. Verifique se o painel de RI/SP aparece no topo
5. Clique em "Atualizar" para buscar dados
6. Navegue pelas abas: Visão Geral, RIs, SPs, Recomendações

#### Teste via API

```bash
# Obter token de autenticação
TOKEN="seu-cognito-jwt-token"

# Chamar endpoint
curl -X POST https://api-evo.ai.udstec.io/finops/ri-sp-analysis \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "uuid-da-conta-aws",
    "analysisType": "all",
    "lookbackDays": 30
  }'
```

## 🔍 Verificações Pós-Deploy

### Backend
- [ ] Lambda deployada e ativa
- [ ] Permissões IAM configuradas
- [ ] VPC e subnets corretas
- [ ] Timeout adequado (5 min)
- [ ] Memory adequada (512 MB)
- [ ] Environment variables corretas
- [ ] Layer anexado

### Banco de Dados
- [ ] Tabelas criadas
- [ ] Índices criados
- [ ] Constraints aplicados
- [ ] Permissões de acesso OK

### API Gateway
- [ ] Endpoint criado
- [ ] Cognito Authorizer configurado
- [ ] CORS habilitado
- [ ] Rate limiting configurado
- [ ] Logs habilitados

### Frontend
- [ ] Build sem erros
- [ ] Componente renderiza
- [ ] Chamadas API funcionando
- [ ] Estados de loading/erro tratados
- [ ] Responsividade OK

## 📊 Monitoramento

### CloudWatch Logs

```bash
# Ver logs da Lambda
aws logs tail /aws/lambda/RiSpAnalysisFunction --follow

# Filtrar erros
aws logs filter-log-events \
  --log-group-name /aws/lambda/RiSpAnalysisFunction \
  --filter-pattern "ERROR"
```

### CloudWatch Metrics

Métricas importantes:
- **Invocations**: Número de chamadas
- **Duration**: Tempo de execução
- **Errors**: Erros de execução
- **Throttles**: Rate limiting
- **ConcurrentExecutions**: Execuções simultâneas

### Custos

**Estimativa de custos:**
- Lambda: ~$0.20 por 1000 invocações (512MB, 30s avg)
- Cost Explorer API: $0.01 por request
- CloudWatch Logs: ~$0.50/GB
- **Total estimado**: $5-10/mês para uso moderado

## 🐛 Troubleshooting

### Lambda retorna 502
```bash
# Verificar logs
aws logs tail /aws/lambda/RiSpAnalysisFunction --follow

# Verificar VPC/NAT Gateway
aws ec2 describe-nat-gateways --filter "Name=state,Values=available"

# Verificar security groups
aws ec2 describe-security-groups --group-ids sg-xxx
```

### Timeout (504)
- Aumentar timeout da Lambda (máx 15 min)
- Otimizar queries ao banco
- Implementar paginação
- Usar cache para dados frequentes

### Permissões negadas
```bash
# Verificar role da Lambda
aws lambda get-function-configuration \
  --function-name RiSpAnalysisFunction \
  --query 'Role'

# Verificar políticas anexadas
aws iam list-attached-role-policies --role-name LambdaExecutionRole
```

### Frontend não carrega dados
- Verificar console do browser (F12)
- Verificar Network tab para erros de API
- Verificar token JWT válido
- Verificar CORS headers

### Dados não aparecem
- Verificar se conta AWS tem RIs/SPs
- Verificar permissões Cost Explorer
- Verificar filtros de organização
- Verificar logs da Lambda

## 🔄 Rollback

Se algo der errado:

### Rollback do CDK
```bash
cd infra
npm run cdk deploy --rollback
```

### Rollback do Frontend
```bash
# Restaurar versão anterior do S3
aws s3 sync s3://evo-uds-v3-production-frontend-383234048592-backup/ \
  s3://evo-uds-v3-production-frontend-383234048592/ \
  --delete

# Invalidar CloudFront
aws cloudfront create-invalidation \
  --distribution-id E1PY7U3VNT6P1R \
  --paths "/*"
```

### Rollback do Banco
```bash
# Remover tabelas (CUIDADO!)
psql -h evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com \
     -U postgres -d evouds \
     -c "DROP TABLE IF EXISTS ri_sp_utilization_history CASCADE;"
     -c "DROP TABLE IF EXISTS ri_sp_recommendations CASCADE;"
     -c "DROP TABLE IF EXISTS savings_plans CASCADE;"
     -c "DROP TABLE IF EXISTS reserved_instances CASCADE;"
```

## 📈 Próximos Passos

### Melhorias Imediatas
1. **Alertas**: Configurar SNS para RIs subutilizadas
2. **Dashboard**: Adicionar gráficos de tendência
3. **Exportação**: Permitir download de relatórios
4. **Cache**: Implementar cache Redis para dados

### Melhorias Futuras
1. **ML**: Previsão de utilização futura
2. **Automação**: Auto-compra de RIs recomendadas
3. **Multi-região**: Análise consolidada
4. **Integração**: Jira tickets para recomendações

## 📞 Suporte

Em caso de problemas:
1. Verificar logs do CloudWatch
2. Verificar métricas do CloudWatch
3. Consultar documentação AWS
4. Abrir issue no repositório

## 📚 Referências

- [AWS Lambda](https://docs.aws.amazon.com/lambda/)
- [AWS Cost Explorer](https://docs.aws.amazon.com/cost-management/)
- [AWS CDK](https://docs.aws.amazon.com/cdk/)
- [Prisma](https://www.prisma.io/docs)
- [React Query](https://tanstack.com/query/latest)

---

**Última atualização**: 2026-01-01
**Versão**: 1.0.0
**Status**: ✅ Pronto para Deploy
