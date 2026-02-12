---
inclusion: manual
---

# Operações — Scripts, Versionamento e API Gateway

## Scripts (⛔ Deploy scripts são CI/CD only)

Validação: `npx tsx scripts/validate-lambda-imports.ts`
Utilitários: `node scripts/copy-deps.cjs <src> <tgt> <pkgs>`, `npx tsx scripts/increment-version.ts [patch|minor|major]`

## Versionamento — Source of Truth: `version.json`
```bash
npx tsx scripts/increment-version.ts patch|minor|major|show
```
```typescript
import { VERSION } from '@/lib/version';       // Frontend
import { VERSION } from '../../lib/version.js'; // Backend
```
⛔ NUNCA hardcode versões.

## CloudFormation Template (Quick Connect)
- Arquivo: `public/cloudformation/evo-platform-role.yaml`
- ⛔ NUNCA editar `cloudformation/customer-iam-role-waf.yaml` (deprecated)

## Criar Endpoint API Gateway (REST API `3l66kn0eaj`)

```bash
# 1. Resource
aws apigateway create-resource --rest-api-id 3l66kn0eaj --parent-id n9gxy9 --path-part NOME --region us-east-1

# 2. OPTIONS (CORS) — method NONE + MOCK integration + response headers
aws apigateway put-method --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method OPTIONS --authorization-type NONE --region us-east-1
aws apigateway put-integration --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method OPTIONS --type MOCK --request-templates '{"application/json": "{\"statusCode\": 200}"}' --region us-east-1
# + put-method-response + put-integration-response com CORS headers

# 3. POST com Cognito
aws apigateway put-method --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method POST --authorization-type COGNITO_USER_POOLS --authorizer-id joelbs --region us-east-1
aws apigateway put-integration --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method POST --type AWS_PROXY --integration-http-method POST --uri "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:971354623291:function:LAMBDA_NAME/invocations" --region us-east-1

# 4. Permissão Lambda (CRÍTICO: source-arn com path completo)
aws lambda add-permission --function-name LAMBDA_NAME --statement-id apigateway-NOME --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:us-east-1:971354623291:3l66kn0eaj/*/POST/api/functions/NOME" --region us-east-1

# 5. Deploy
aws apigateway create-deployment --rest-api-id 3l66kn0eaj --stage-name prod --region us-east-1
```

CORS Headers: `Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token,X-Impersonate-Organization`

## Layer Management
```bash
# Atualizar layer em todas as lambdas
LAYER_ARN="arn:aws:lambda:us-east-1:971354623291:layer:evo-prisma-deps-layer:91"
aws lambda list-functions --region us-east-1 --query 'Functions[?starts_with(FunctionName, `evo-uds-v3-sandbox`)].FunctionName' --output text | tr '\t' '\n' | while read func; do
  aws lambda update-function-configuration --function-name "$func" --layers "$LAYER_ARN" --region us-east-1 --no-cli-pager > /dev/null 2>&1
done
```

## Boas Práticas Bash
- `--no-cli-pager` em TODOS os comandos AWS
- Não colar `&&` sem espaço
- JSON para environment variables em Lambda
