# Platform Monitoring - 502 Error Fixed ✅

## Data: 2026-01-15

## Problema Resolvido

**Lambda:** `evo-uds-v3-production-get-recent-errors`  
**Erro:** 502 Bad Gateway - "Cannot find module 'zod'" e "@aws-sdk/client-cloudwatch-logs"

## Causa Raiz

O Lambda `get-recent-errors` foi deployado sem as dependências necessárias:
1. `zod` - Para validação de request body
2. `@aws-sdk/client-cloudwatch-logs` - Para buscar logs do CloudWatch
3. Dependências transitivas do AWS SDK: `@smithy/*`, `@aws-crypto/*`, `@aws/lambda-invoke-store`, `fast-xml-parser`, `uuid`, `bowser`, `tslib`

**Problema adicional:** O Prisma layer (47) contém Prisma + Zod + Azure SDK, mas quando combinado com o código da Lambda (58MB), excedia o limite de 250MB do AWS Lambda.

## Solução Aplicada

### 1. Remover Layer e Incluir Dependências no ZIP

```bash
# Remover layer para evitar exceder limite de 250MB
aws lambda update-function-configuration \
  --function-name evo-uds-v3-production-get-recent-errors \
  --layers '[]' \
  --region us-east-1

# Criar ZIP com TODAS as dependências necessárias
rm -rf /tmp/lambda-deploy-recent-errors
mkdir -p /tmp/lambda-deploy-recent-errors/node_modules/@aws-sdk
mkdir -p /tmp/lambda-deploy-recent-errors/node_modules/@aws

# Copiar handler com imports ajustados
sed 's|require("../../lib/|require("./lib/|g' backend/dist/handlers/monitoring/get-recent-errors.js | \
sed 's|require("../../types/|require("./types/|g' > /tmp/lambda-deploy-recent-errors/get-recent-errors.js

# Copiar lib/ e types/
cp -r backend/dist/lib /tmp/lambda-deploy-recent-errors/
cp -r backend/dist/types /tmp/lambda-deploy-recent-errors/

# Copiar AWS SDK
cp -r backend/node_modules/@aws-sdk/client-cloudwatch-logs /tmp/lambda-deploy-recent-errors/node_modules/@aws-sdk/
cp -r backend/node_modules/@smithy /tmp/lambda-deploy-recent-errors/node_modules/
cp -r backend/node_modules/@aws-crypto /tmp/lambda-deploy-recent-errors/node_modules/
cp -r backend/node_modules/@aws/lambda-invoke-store /tmp/lambda-deploy-recent-errors/node_modules/@aws/

# Copiar dependências adicionais
for pkg in fast-xml-parser uuid bowser tslib zod; do
  cp -r backend/node_modules/$pkg /tmp/lambda-deploy-recent-errors/node_modules/
done

# Criar ZIP
cd /tmp/lambda-deploy-recent-errors
zip -r ../lambda-recent-errors-v4.zip .
cd -

# Upload para S3 (ZIP > 50MB)
aws s3 cp /tmp/lambda-recent-errors-v4.zip \
  s3://evo-uds-v3-production-frontend-383234048592/lambda-code/get-recent-errors-v4.zip \
  --region us-east-1

# Deploy
aws lambda update-function-code \
  --function-name evo-uds-v3-production-get-recent-errors \
  --s3-bucket evo-uds-v3-production-frontend-383234048592 \
  --s3-key lambda-code/get-recent-errors-v4.zip \
  --region us-east-1
```

### 2. Teste de Invocação

```bash
aws lambda invoke \
  --function-name evo-uds-v3-production-get-recent-errors \
  --cli-binary-format raw-in-base64-out \
  --payload '{"requestContext":{"http":{"method":"OPTIONS"}}}' \
  --region us-east-1 \
  /tmp/test.json

# Resultado: ✅ StatusCode 200
# CORS headers corretos
# Sem erros de módulos faltando
```

## Status Final

✅ **Lambda `get-recent-errors` funcionando**
- StatusCode: 200
- CORS: Configurado corretamente
- Dependências: Todas incluídas no ZIP
- Tamanho: 59MB (dentro do limite de 250MB sem layer)

## Próximos Passos

1. ✅ Testar endpoint no frontend (Platform Monitoring dashboard)
2. ⏳ Verificar se `get-platform-metrics` também precisa de fix similar
3. ⏳ Documentar processo de deploy para Lambdas com AWS SDK

## Lições Aprendidas

### Problema: Lambda + Layer > 250MB

Quando uma Lambda usa muitas dependências (especialmente AWS SDK), o código + layer pode exceder o limite de 250MB.

**Soluções:**
1. **Remover layer** e incluir apenas dependências necessárias no ZIP
2. **Otimizar layer** removendo pacotes não utilizados
3. **Split em múltiplas Lambdas** se a funcionalidade for muito grande

### Dependências do AWS SDK v3

O AWS SDK v3 tem MUITAS dependências transitivas:
- `@smithy/*` - Cliente HTTP, serialização, etc
- `@aws-crypto/*` - Criptografia
- `@aws/lambda-invoke-store` - Detecção de recursão
- `fast-xml-parser` - Parser XML
- `uuid`, `bowser`, `tslib` - Utilitários

**Recomendação:** Sempre incluir `@smithy/*` e `@aws-crypto/*` quando usar qualquer cliente AWS SDK v3.

### Deploy de Lambdas com AWS SDK

```bash
# Template para deploy de Lambda com AWS SDK
rm -rf /tmp/lambda-deploy
mkdir -p /tmp/lambda-deploy/node_modules/@aws-sdk
mkdir -p /tmp/lambda-deploy/node_modules/@aws

# Handler com imports ajustados
sed 's|require("../../lib/|require("./lib/|g' backend/dist/handlers/{categoria}/{handler}.js | \
sed 's|require("../../types/|require("./types/|g' > /tmp/lambda-deploy/{handler}.js

# Copiar lib/ e types/
cp -r backend/dist/lib /tmp/lambda-deploy/
cp -r backend/dist/types /tmp/lambda-deploy/

# Copiar AWS SDK client específico
cp -r backend/node_modules/@aws-sdk/client-{service} /tmp/lambda-deploy/node_modules/@aws-sdk/

# Copiar dependências essenciais do AWS SDK
cp -r backend/node_modules/@smithy /tmp/lambda-deploy/node_modules/
cp -r backend/node_modules/@aws-crypto /tmp/lambda-deploy/node_modules/
cp -r backend/node_modules/@aws/lambda-invoke-store /tmp/lambda-deploy/node_modules/@aws/

# Copiar dependências adicionais
for pkg in fast-xml-parser uuid bowser tslib; do
  cp -r backend/node_modules/$pkg /tmp/lambda-deploy/node_modules/
done

# Criar ZIP
cd /tmp/lambda-deploy && zip -r ../lambda.zip . && cd -

# Upload para S3 se > 50MB
aws s3 cp /tmp/lambda.zip s3://BUCKET/lambda-code/{handler}.zip

# Deploy
aws lambda update-function-code \
  --function-name FUNCTION_NAME \
  --s3-bucket BUCKET \
  --s3-key lambda-code/{handler}.zip \
  --region us-east-1
```

---

**Última atualização:** 2026-01-15 15:25 UTC  
**Status:** ✅ RESOLVIDO  
**Impacto:** Platform Monitoring dashboard agora pode buscar erros recentes em tempo real
