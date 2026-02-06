---
inclusion: always
---

# Operações - Scripts, Bash e Deploy

## Scripts Disponíveis

### Deploy (⛔ Apenas via CI/CD - NUNCA executar localmente)
| Script | Uso | Contexto |
|--------|-----|----------|
| `deploy-lambda.sh` | Deploy de uma Lambda | Usado APENAS pelo CI/CD |
| `deploy-all-lambdas.sh` | Deploy de TODAS as Lambdas | Usado APENAS pelo CI/CD |
| `deploy-all-aws-lambdas.sh` | Deploy de Lambdas AWS | Usado APENAS pelo CI/CD |
| `deploy-azure-lambdas.sh` | Deploy de Lambdas Azure | Usado APENAS pelo CI/CD |
| `deploy-frontend.sh` | Build e deploy do frontend | Usado APENAS pelo CI/CD |

⛔ **NUNCA executar estes scripts localmente.** O pipeline CI/CD (`cicd/buildspec-sam.yml`) gerencia todo o deploy automaticamente via `cicd/scripts/deploy-changed-lambdas.sh`.

### Validação
| Script | Uso |
|--------|-----|
| `check-critical-lambdas-health.sh` | Verifica saúde das Lambdas críticas |
| `validate-lambda-deployment.sh` | Valida deploy de Lambda |
| `check-circular-imports.ts` | `npx tsx scripts/check-circular-imports.ts` |

### Utilitários
| Script | Uso |
|--------|-----|
| `copy-deps.cjs` | `node scripts/copy-deps.cjs <source> <target> <packages...>` |
| `increment-version.ts` | `npx tsx scripts/increment-version.ts [patch|minor|major]` |
| `invalidate-cloudfront.ts` | `npx tsx scripts/invalidate-cloudfront.ts` |

---

## Versionamento

### Source of Truth: `version.json`

```bash
# Incrementar versão
npx tsx scripts/increment-version.ts patch  # 3.0.0 -> 3.0.1
npx tsx scripts/increment-version.ts minor  # 3.0.0 -> 3.1.0
npx tsx scripts/increment-version.ts major  # 3.0.0 -> 4.0.0
npx tsx scripts/increment-version.ts show   # Ver versão atual
```

### Usar no Código
```typescript
import { VERSION, getVersionString } from '@/lib/version';  // Frontend
import { VERSION } from '../../lib/version.js';              // Backend
```

### ⛔ NUNCA hardcode versões
```typescript
❌ const version = "3.0.0";
✅ import { VERSION } from '@/lib/version';
```

---

## CloudFormation Template

### Template Único (Quick Connect)
- **Arquivo:** `public/cloudformation/evo-platform-role.yaml`
- **URL:** `https://evo.ai.udstec.io/cloudformation/evo-platform-role.yaml`

### Processo de Atualização
```bash
# 1. Editar template
vim public/cloudformation/evo-platform-role.yaml

# 2. Validar
aws cloudformation validate-template --template-body file://public/cloudformation/evo-platform-role.yaml

# 3. Build e deploy
npm run build
AWS_PROFILE=EVO_SANDBOX aws s3 sync dist/ s3://evo-uds-v3-production-frontend-971354623291 --delete

# 4. Invalidar cache
aws cloudfront create-invalidation --distribution-id E1PY7U3VNT6P1R --paths "/cloudformation/*"

# 5. Verificar
curl -s https://evo.ai.udstec.io/cloudformation/evo-platform-role.yaml | head -20
```

### ⛔ NUNCA editar
```
❌ cloudformation/customer-iam-role-waf.yaml (deprecated)
```

---

## Boas Práticas Bash

### ⛔ Erros Comuns
```bash
# ❌ Aspas não fechadas
aws lambda wait ... &&echo "Ready!"

# ❌ && colado
command1&&command2

# ❌ Espaço após \
aws lambda update-function-code \ 
  --function-name my-function

# ✅ CORRETO
aws lambda wait function-updated --function-name xxx --region us-east-1
echo "Ready!"
```

### Environment Variables em Lambda
```bash
# ❌ ERRADO - Variáveis vazias ou com caracteres especiais
--environment "Variables={DATABASE_URL=,API_KEY=}"

# ✅ CORRETO - Apenas layers quando vars já configuradas
aws lambda update-function-configuration \
  --function-name my-function \
  --layers "arn:aws:lambda:..." \
  --region us-east-1

# ✅ CORRETO - JSON para múltiplas variáveis
aws lambda update-function-configuration \
  --function-name my-function \
  --environment '{"Variables":{"NODE_PATH":"/opt/nodejs/node_modules"}}' \
  --region us-east-1
```

### Evitar Desconexão de Terminal
```bash
# ✅ Redirecionar output
./deploy-all-lambdas.sh > /tmp/deploy.log 2>&1

# ✅ Usar --no-cli-pager em TODOS os comandos AWS
aws lambda list-functions --no-cli-pager
aws s3 ls --no-cli-pager
```

---

## Criar Novo Endpoint API Gateway

```bash
# 1. Criar resource
aws apigateway create-resource --rest-api-id 3l66kn0eaj --parent-id n9gxy9 --path-part NOME-ENDPOINT --region us-east-1

# 2. OPTIONS (CORS)
aws apigateway put-method --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method OPTIONS --authorization-type NONE --region us-east-1
aws apigateway put-integration --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method OPTIONS --type MOCK --request-templates '{"application/json": "{\"statusCode\": 200}"}' --region us-east-1
aws apigateway put-method-response --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method OPTIONS --status-code 200 --response-parameters '{"method.response.header.Access-Control-Allow-Headers":true,"method.response.header.Access-Control-Allow-Methods":true,"method.response.header.Access-Control-Allow-Origin":true}' --region us-east-1
aws apigateway put-integration-response --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method OPTIONS --status-code 200 --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token,X-Impersonate-Organization'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' --region us-east-1

# 3. POST com Cognito
aws apigateway put-method --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method POST --authorization-type COGNITO_USER_POOLS --authorizer-id joelbs --region us-east-1
aws apigateway put-integration --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method POST --type AWS_PROXY --integration-http-method POST --uri "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:971354623291:function:LAMBDA_NAME/invocations" --region us-east-1

# 4. Permissão Lambda (CRÍTICO: path completo)
aws lambda add-permission --function-name LAMBDA_NAME --statement-id apigateway-NOME-ENDPOINT --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:us-east-1:971354623291:3l66kn0eaj/*/POST/api/functions/NOME-ENDPOINT" --region us-east-1

# 5. Deploy
aws apigateway create-deployment --rest-api-id 3l66kn0eaj --stage-name prod --region us-east-1
```

### CORS Headers Padrão
```
Access-Control-Allow-Headers: Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token,X-Impersonate-Organization
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
Access-Control-Allow-Origin: *
```

---

## Checklist Novo Script

- [ ] Verificar se existe script similar em `scripts/`
- [ ] Script existente NÃO pode ser evoluído
- [ ] Documentar neste arquivo
- [ ] Nome segue padrão: `verbo-objeto.sh` ou `verbo-objeto.ts`

---

**Última atualização:** 2026-02-03
