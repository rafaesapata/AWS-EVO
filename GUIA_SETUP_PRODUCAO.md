# 🚀 Guia de Setup do Ambiente de Produção

## Status Atual

- ✅ **Development**: Configurado e funcionando
  - User Pool: `us-east-1_cnesJ48lR`
  - Client: `4p0okvsr983v2f8rrvgpls76d6`
  - Admin: `admin@udstec.io`

- ⏳ **Production**: A ser configurado

## Passos para Criar Ambiente de Produção

### 1. Criar User Pool de Produção

```bash
# Usar o CloudFormation template já pronto
aws cloudformation create-stack \
  --stack-name evo-uds-v3-cognito-production \
  --template-body file://cloudformation/cognito-user-pool.yaml \
  --parameters ParameterKey=Environment,ParameterValue=production \
  --capabilities CAPABILITY_IAM \
  --region us-east-1

# Aguardar criação
aws cloudformation wait stack-create-complete \
  --stack-name evo-uds-v3-cognito-production \
  --region us-east-1

# Obter outputs
aws cloudformation describe-stacks \
  --stack-name evo-uds-v3-cognito-production \
  --query 'Stacks[0].Outputs' \
  --region us-east-1
```

### 2. Criar Usuário Admin de Produção

```bash
# Substituir USER_POOL_ID pelo ID obtido no passo anterior
USER_POOL_ID="us-east-1_XXXXXXXXX"

# 1. Criar usuário
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username admin@udstec.io \
  --user-attributes Name=email,Value=admin@udstec.io Name=email_verified,Value=true \
  --temporary-password TempProdPass123! \
  --message-action SUPPRESS \
  --region us-east-1

# 2. Definir senha permanente
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username admin@udstec.io \
  --password ProdPass123! \
  --permanent \
  --region us-east-1

# 3. Definir atributos customizados
aws cognito-idp admin-update-user-attributes \
  --user-pool-id $USER_POOL_ID \
  --username admin@udstec.io \
  --user-attributes \
    'Name=custom:organization_id,Value=PRODUCTION-ORG-UUID-HERE' \
    'Name=custom:organization_name,Value=UDS Tecnologia' \
    'Name=custom:roles,Value="[\"super_admin\"]"' \
  --region us-east-1
```

### 3. Criar Authorizer no API Gateway

```bash
# Obter ARN do User Pool
USER_POOL_ARN=$(aws cognito-idp describe-user-pool \
  --user-pool-id $USER_POOL_ID \
  --query 'UserPool.Arn' \
  --output text \
  --region us-east-1)

# Criar authorizer
aws apigateway create-authorizer \
  --rest-api-id 3l66kn0eaj \
  --name CognitoAuthorizerProduction \
  --type COGNITO_USER_POOLS \
  --provider-arns $USER_POOL_ARN \
  --identity-source 'method.request.header.Authorization' \
  --region us-east-1

# Anotar o authorizerId retornado
```

### 4. Atualizar Métodos do API Gateway

```bash
# Substituir NEW_AUTHORIZER_ID pelo ID obtido no passo anterior
NEW_AUTHORIZER_ID="XXXXXX"
REST_API_ID="3l66kn0eaj"

# Script para atualizar todos os métodos
RESOURCES=$(aws apigateway get-resources --rest-api-id $REST_API_ID --region us-east-1 --query 'items[*].id' --output text)

for RESOURCE_ID in $RESOURCES; do
  for METHOD in GET POST PUT DELETE PATCH; do
    METHOD_INFO=$(aws apigateway get-method --rest-api-id $REST_API_ID --resource-id $RESOURCE_ID --http-method $METHOD --region us-east-1 2>/dev/null)
    
    if [ $? -eq 0 ]; then
      CURRENT_AUTH=$(echo "$METHOD_INFO" | jq -r '.authorizationType // empty')
      
      if [ "$CURRENT_AUTH" == "COGNITO_USER_POOLS" ]; then
        echo "Atualizando $METHOD em $RESOURCE_ID..."
        aws apigateway update-method \
          --rest-api-id $REST_API_ID \
          --resource-id $RESOURCE_ID \
          --http-method $METHOD \
          --patch-operations op=replace,path=/authorizerId,value=$NEW_AUTHORIZER_ID \
          --region us-east-1
      fi
    fi
  done
done

# Deploy
aws apigateway create-deployment --rest-api-id $REST_API_ID --stage-name prod --region us-east-1
```

### 5. Atualizar .env.production

```bash
# Editar .env.production com os novos valores
VITE_AWS_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_AWS_USER_POOL_CLIENT_ID=YYYYYYYYYYYYYYYYYYYYYYYYYYYY
```

### 6. Build e Deploy do Frontend

```bash
# Build com variáveis de produção
npm run build

# Verificar se pegou o User Pool correto
grep -r "us-east-1_" dist/assets/*.js | grep -o "us-east-1_[a-zA-Z0-9]*" | sort -u

# Deploy para S3
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete --region us-east-1

# Invalidar CloudFront
aws cloudfront create-invalidation --distribution-id E1PY7U3VNT6P1R --paths "/*" --region us-east-1
```

### 7. Atualizar Documentação

Atualizar `.kiro/steering/aws-infrastructure.md` com os novos IDs de produção.

## Checklist de Validação

- [ ] User Pool de produção criado com custom attributes
- [ ] Usuário admin criado e testado
- [ ] Authorizer criado no API Gateway
- [ ] Todos os métodos atualizados para usar novo authorizer
- [ ] Authorizer de development removido (se aplicável)
- [ ] Frontend buildado com variáveis de produção
- [ ] Deploy do frontend realizado
- [ ] CloudFront invalidado
- [ ] Login testado em produção
- [ ] Licença aparecendo corretamente
- [ ] Documentação atualizada

## Rollback (se necessário)

Se algo der errado, você pode voltar para o authorizer de development:

```bash
# Usar o authorizer de development
DEV_AUTHORIZER_ID="joelbs"

# Atualizar métodos de volta
# (usar mesmo script do passo 4, mas com DEV_AUTHORIZER_ID)
```

## Separação de Ambientes

### Development
- **Domínio**: `https://dev.evo.ai.udstec.io` (a ser configurado)
- **User Pool**: `us-east-1_cnesJ48lR`
- **S3 Bucket**: `evo-uds-v3-development-frontend-383234048592` (a ser criado)
- **CloudFront**: Nova distribuição (a ser criada)

### Production
- **Domínio**: `https://evo.ai.udstec.io`
- **User Pool**: A ser criado
- **S3 Bucket**: `evo-uds-v3-production-frontend-383234048592` (atual)
- **CloudFront**: `E1PY7U3VNT6P1R` (atual)

## Notas Importantes

1. **Custom Attributes**: Sempre usar Custom Resource Lambda no CloudFormation
2. **Authorizer**: Criar novo authorizer para cada ambiente
3. **Separação**: Manter User Pools completamente separados entre dev e prod
4. **Backup**: Fazer backup dos IDs antigos antes de qualquer mudança
5. **Teste**: Sempre testar em development antes de aplicar em production
