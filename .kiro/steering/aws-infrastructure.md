---
inclusion: always
---

# AWS Infrastructure Reference

## API Gateway

- **REST API ID**: `3l66kn0eaj`
- **Stage**: `prod` (único stage em uso)
- **Custom Domain**: `api-evo.ai.udstec.io`
- **Regional Endpoint**: `d-lh5c9lpit7.execute-api.us-east-1.amazonaws.com`
- **Authorizer ID**: `joelbs` (Cognito User Pools - CognitoAuthorizerV2)
- **Functions Resource ID**: `n9gxy9` (parent de `/api/functions/*`)

### Deploy Commands
```bash
# Deploy API Gateway changes (SEMPRE usar stage 'prod')
aws apigateway create-deployment --rest-api-id 3l66kn0eaj --stage-name prod --region us-east-1

# Flush cache se necessário
aws apigateway flush-stage-cache --rest-api-id 3l66kn0eaj --stage-name prod --region us-east-1
```

## Lambda Layers

### Layer Atual (com AWS SDK + Azure SDK)
- **Prisma + Zod + AWS SDK + Azure SDK Layer**: `arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:64`
  - Contém: 
    - `@prisma/client`, `.prisma/client` (gerado)
    - `zod`
    - AWS SDK: `@aws-sdk/client-lambda`, `@aws-sdk/client-sts`, `@aws-sdk/client-wafv2`, `@aws-sdk/client-bedrock-runtime`, `@aws-sdk/client-sso`, `@aws-sdk/types` + todas dependências transitivas
    - Smithy: `@smithy/*` (80+ pacotes necessários para AWS SDK v3)
    - `@aws/lambda-invoke-store` (necessário para recursion detection)
    - Utilitários: `tslib`, `uuid`, `fast-xml-parser`
  - Binários: `rhel-openssl-1.0.x`, `rhel-openssl-3.0.x` (para Lambda)
  - Tamanho: ~42MB comprimido, ~121MB descomprimido
  - **IMPORTANTE**: Layer criado com script de cópia recursiva de dependências para garantir que TODAS as dependências transitivas sejam incluídas

### Versões do Layer
| Versão | Descrição | Data |
|--------|-----------|------|
| 64 | **ATUAL** - Prisma + Zod + AWS SDK (STS, WAFV2, Bedrock, Lambda, Cognito) + Smithy (completo) | 2026-01-26 |
| 63 | ⚠️ QUEBRADO - Apenas Prisma + Zod (sem AWS SDK) - NÃO USAR | 2026-01-25 |
| 62 | Prisma + Zod with demo_mode fields | 2026-01-25 |
| 61 | Prisma + Zod + AWS SDK (STS, WAFV2, Bedrock, Cognito, Lambda) + Smithy | 2026-01-17 |
| 59 | Prisma + Zod + AWS SDK (Lambda, STS, WAFV2, Bedrock, SSO) + Smithy (completo) + @aws/lambda-invoke-store | 2026-01-17 |

---

## 🚨 REGRAS OBRIGATÓRIAS PARA PUBLICAÇÃO DE LAYERS

### ⛔ NUNCA publique um layer sem seguir estas regras

Após o incidente de 2026-01-26 onde o layer versão 63 foi publicado sem AWS SDK, causando erro 502 em todas as Lambdas que usam `aws-helpers.js`, as seguintes regras são **OBRIGATÓRIAS**:

### 1. Checklist OBRIGATÓRIO antes de publicar novo layer

Antes de executar `aws lambda publish-layer-version`, verificar se o layer contém:

- [ ] `@prisma/client` e `.prisma/client` (gerado com `npm run prisma:generate`)
- [ ] `zod`
- [ ] `@aws-sdk/client-sts` (**OBRIGATÓRIO** - usado por `aws-helpers.js` para assume role)
- [ ] `@aws-sdk/client-wafv2` (para WAF monitoring)
- [ ] `@aws-sdk/client-bedrock-runtime` (para IA/Copilot)
- [ ] `@aws-sdk/client-lambda` (para invocações entre Lambdas)
- [ ] `@aws-sdk/client-cognito-identity-provider` (para auth)
- [ ] Todas as dependências `@smithy/*` (80+ pacotes)
- [ ] `@aws/lambda-invoke-store` (para recursion detection)
- [ ] `tslib`, `uuid`, `fast-xml-parser`

### 2. SEMPRE usar o script de cópia recursiva

**NUNCA** copie pacotes AWS SDK manualmente. Use o script `scripts/copy-deps.cjs`:

```bash
node scripts/copy-deps.cjs backend /tmp/lambda-layer-complete \
  @aws-sdk/client-sts \
  @aws-sdk/client-wafv2 \
  @aws-sdk/client-bedrock-runtime \
  @aws-sdk/client-lambda \
  @aws-sdk/client-cognito-identity-provider \
  @aws-sdk/types
```

Este script copia recursivamente TODAS as dependências transitivas, incluindo `@smithy/*` e `@aws-crypto/*`.

### 3. Teste OBRIGATÓRIO pós-publicação

Após publicar um novo layer, **OBRIGATORIAMENTE** testar uma Lambda crítica:

```bash
# 1. Atualizar uma Lambda de teste
aws lambda update-function-configuration \
  --function-name evo-uds-v3-production-waf-dashboard-api \
  --layers "arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:NOVA_VERSAO" \
  --region us-east-1

# 2. Aguardar atualização
aws lambda wait function-updated \
  --function-name evo-uds-v3-production-waf-dashboard-api \
  --region us-east-1

# 3. Testar invocação
aws lambda invoke \
  --function-name evo-uds-v3-production-waf-dashboard-api \
  --payload '{"requestContext":{"http":{"method":"OPTIONS"}}}' \
  --region us-east-1 \
  /tmp/test.json

# 4. Verificar se retornou statusCode 200
cat /tmp/test.json | grep -o '"statusCode":200'

# Se NÃO retornar "statusCode":200, NÃO atualize as outras Lambdas!
```

### 4. Descrição do layer DEVE listar os pacotes incluídos

Ao publicar, use uma descrição clara:

```bash
aws lambda publish-layer-version \
  --layer-name evo-prisma-deps-layer \
  --description "Prisma + Zod + AWS SDK (STS, WAFV2, Bedrock, Lambda, Cognito) + Smithy - YYYY-MM-DD" \
  ...
```

### 5. Se o teste falhar, NÃO atualize as outras Lambdas

Se o teste pós-publicação falhar:
1. **NÃO** execute o script de atualização em massa
2. Verifique os logs: `aws logs tail /aws/lambda/evo-uds-v3-production-waf-dashboard-api --since 5m`
3. Identifique o módulo faltante
4. Recrie o layer com o módulo faltante
5. Repita o teste

### 6. Histórico de Incidentes de Layer

| Data | Versão | Problema | Impacto | Causa |
|------|--------|----------|---------|-------|
| 2026-01-26 | 63 | Sem AWS SDK | Erro 502 em todas Lambdas que usam aws-helpers.js | Layer publicado apenas com Prisma + Zod |

---

### Atualizar Layer (com AWS SDK + Azure SDK)

**⚠️ IMPORTANTE**: Ao adicionar novos pacotes AWS SDK, use o script de cópia recursiva para garantir que TODAS as dependências transitivas sejam incluídas.

```bash
# 1. Instalar dependências e gerar Prisma Client
npm install --prefix backend
npm run prisma:generate --prefix backend

# 2. Criar estrutura do layer
rm -rf /tmp/lambda-layer-complete && mkdir -p /tmp/lambda-layer-complete/nodejs/node_modules/@aws-sdk && mkdir -p /tmp/lambda-layer-complete/nodejs/node_modules/@smithy

# 3. Copiar Prisma e Zod
cp -r backend/node_modules/@prisma /tmp/lambda-layer-complete/nodejs/node_modules/
cp -r backend/node_modules/.prisma /tmp/lambda-layer-complete/nodejs/node_modules/
cp -r backend/node_modules/zod /tmp/lambda-layer-complete/nodejs/node_modules/

# 4. Criar script de cópia recursiva de dependências AWS SDK
cat > /tmp/copy-deps.js << 'EOFSCRIPT'
const fs = require('fs');
const path = require('path');

const sourceDir = process.argv[2];
const targetDir = process.argv[3];
const packages = process.argv.slice(4);

const copied = new Set();

function copyPackageWithDeps(pkgName) {
  if (copied.has(pkgName)) return;
  copied.add(pkgName);
  
  const sourcePath = path.join(sourceDir, 'node_modules', pkgName);
  const targetPath = path.join(targetDir, 'nodejs/node_modules', pkgName);
  
  if (!fs.existsSync(sourcePath)) {
    console.log(`⚠️  Package not found: ${pkgName}`);
    return;
  }
  
  // Copy package
  fs.cpSync(sourcePath, targetPath, { recursive: true });
  console.log(`✅ ${pkgName}`);
  
  // Read package.json and copy dependencies
  const pkgJsonPath = path.join(sourcePath, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const deps = Object.keys(pkgJson.dependencies || {});
    
    for (const dep of deps) {
      if (dep.startsWith('@aws-sdk/') || dep.startsWith('@smithy/') || dep.startsWith('@aws-crypto/') || dep.startsWith('@aws/')) {
        copyPackageWithDeps(dep);
      }
    }
  }
}

// Copy initial packages
for (const pkg of packages) {
  copyPackageWithDeps(pkg);
}

console.log(`\n📦 Total packages copied: ${copied.size}`);
EOFSCRIPT

# 5. Executar script para copiar AWS SDK com dependências transitivas
# Adicione aqui os pacotes AWS SDK que você precisa
node /tmp/copy-deps.js backend /tmp/lambda-layer-complete @aws-sdk/client-sts @aws-sdk/client-wafv2 @aws-sdk/client-bedrock-runtime

# 6. Copiar utilitários necessários
for pkg in tslib uuid fast-xml-parser; do
  [ -d "backend/node_modules/$pkg" ] && cp -r "backend/node_modules/$pkg" /tmp/lambda-layer-complete/nodejs/node_modules/
done

# 7. Remover arquivos desnecessários para reduzir tamanho
rm -f /tmp/lambda-layer-complete/nodejs/node_modules/.prisma/client/libquery_engine-darwin*.node
rm -rf /tmp/lambda-layer-complete/nodejs/node_modules/.prisma/client/deno
find /tmp/lambda-layer-complete/nodejs/node_modules -name "*.ts" -not -name "*.d.ts" -delete
find /tmp/lambda-layer-complete/nodejs/node_modules -name "*.map" -delete
find /tmp/lambda-layer-complete/nodejs/node_modules -name "*.md" -delete
find /tmp/lambda-layer-complete/nodejs/node_modules -type d -name "test" -exec rm -rf {} + 2>/dev/null
find /tmp/lambda-layer-complete/nodejs/node_modules -type d -name "tests" -exec rm -rf {} + 2>/dev/null
find /tmp/lambda-layer-complete/nodejs/node_modules -type d -name "samples" -exec rm -rf {} + 2>/dev/null
find /tmp/lambda-layer-complete/nodejs/node_modules -type d -name "docs" -exec rm -rf {} + 2>/dev/null
find /tmp/lambda-layer-complete/nodejs/node_modules -type d -name "examples" -exec rm -rf {} + 2>/dev/null
find /tmp/lambda-layer-complete/nodejs/node_modules -name "*.spec.js" -delete
find /tmp/lambda-layer-complete/nodejs/node_modules -name "*.test.js" -delete
find /tmp/lambda-layer-complete/nodejs/node_modules -name "CHANGELOG*" -delete
find /tmp/lambda-layer-complete/nodejs/node_modules -name "README*" -delete
find /tmp/lambda-layer-complete/nodejs/node_modules -name "LICENSE*" -delete

# 8. Criar zip
pushd /tmp/lambda-layer-complete && zip -r /tmp/lambda-layer-complete.zip nodejs && popd

# 9. Verificar tamanho (DEVE ser < 250MB descomprimido)
unzip -l /tmp/lambda-layer-complete.zip | tail -1

# 10. Upload para S3 (necessário para layers > 50MB)
aws s3 cp /tmp/lambda-layer-complete.zip s3://evo-uds-v3-production-frontend-383234048592/layers/lambda-layer-complete.zip --region us-east-1

# 11. Publicar layer
aws lambda publish-layer-version \
  --layer-name evo-prisma-deps-layer \
  --description "Prisma + Zod + AWS SDK (complete with dependencies)" \
  --content S3Bucket=evo-uds-v3-production-frontend-383234048592,S3Key=layers/lambda-layer-complete.zip \
  --compatible-runtimes nodejs18.x nodejs20.x \
  --region us-east-1
```

**Notas Importantes**:
- O script `copy-deps.js` copia recursivamente TODAS as dependências transitivas dos pacotes AWS SDK
- Isso é necessário porque AWS SDK v3 tem muitas dependências `@smithy/*` e `@aws-crypto/*` que não são óbvias
- Se você tentar copiar apenas os pacotes principais, vai faltar dependências e a Lambda vai dar erro 502
- O limite de tamanho descomprimido é 250MB - se ultrapassar, remova pacotes AWS SDK desnecessários

## Lambda Functions (Prefixo: `evo-uds-v3-production-`)

Todas as Lambdas usam o layer `evo-prisma-deps-layer:40`.

### Principais Lambdas AWS
- `security-scan` - Scan de segurança AWS
- `well-architected-scan` - Análise Well-Architected
- `compliance-scan` - Verificação de compliance
- `list-aws-credentials` - Listar credenciais AWS
- `query-table` - Consultas genéricas ao banco
- `fetch-daily-costs` - Custos diários
- `webauthn-register` - Registro WebAuthn/Passkey
- `webauthn-authenticate` - Autenticação WebAuthn

### Lambdas Azure (Multi-Cloud)
- `validate-azure-credentials` - Validar credenciais Azure
- `save-azure-credentials` - Salvar credenciais Azure
- `list-azure-credentials` - Listar credenciais Azure
- `delete-azure-credentials` - Remover credenciais Azure
- `azure-security-scan` - Scan de segurança Azure
- `start-azure-security-scan` - Iniciar scan Azure (async)
- `azure-defender-scan` - Microsoft Defender for Cloud
- `azure-compliance-scan` - Compliance CIS/Azure Benchmark
- `azure-well-architected-scan` - Azure Well-Architected Framework
- `azure-cost-optimization` - Azure Advisor cost recommendations
- `azure-reservations-analyzer` - Azure Reserved Instances analysis
- `azure-fetch-costs` - Buscar custos Azure
- `azure-resource-inventory` - Inventário de recursos Azure
- `azure-activity-logs` - Logs de atividade Azure
- `list-cloud-credentials` - Listar credenciais unificadas (AWS + Azure)

### Atualizar Layer em Todas as Lambdas

**⚠️ ATENÇÃO**: Só execute este comando APÓS testar o layer em uma Lambda (ver seção "REGRAS OBRIGATÓRIAS PARA PUBLICAÇÃO DE LAYERS")

```bash
LAYER_ARN="arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:64"

# Listar todas as Lambdas e atualizar
aws lambda list-functions --region us-east-1 \
  --query 'Functions[?starts_with(FunctionName, `evo-uds-v3-production`)].FunctionName' \
  --output text | tr '\t' '\n' > /tmp/lambdas.txt

while read func; do
  if [ -n "$func" ]; then
    echo "Updating $func..."
    aws lambda update-function-configuration \
      --function-name "$func" \
      --layers "$LAYER_ARN" \
      --region us-east-1 \
      --no-cli-pager > /dev/null 2>&1
  fi
done < /tmp/lambdas.txt

echo "✅ All Lambdas updated"
```

## Cognito

### Production Environment (ÚNICO User Pool em uso)
- **User Pool ID**: `us-east-1_cnesJ48lR`
- **User Pool Name**: `evo-uds-v3-production-final`
- **User Pool Client ID**: `4p0okvsr983v2f8rrvgpls76d6`
- **Region**: `us-east-1`
- **Custom Attributes**: `organization_id`, `organization_name`, `roles`, `tenant_id`
- **Admin User**: `admin@udstec.io` / `AdminPass123!`
- **MFA**: Optional (usuários podem configurar se desejarem)
- **Total de Usuários**: 21+

### ⚠️ IMPORTANTE: User Pool Único
Em 2026-01-27, foi identificado que existiam dois User Pools:
- `us-east-1_cnesJ48lR` (21 usuários) - **CORRETO** - Usado pelo frontend
- `us-east-1_qGmGkvmpL` (4 usuários) - **DELETADO** - Estava configurado incorretamente nas Lambdas

Todas as 149 Lambdas foram atualizadas para usar `us-east-1_cnesJ48lR` e o pool errado foi deletado.

### Criar Usuário com Atributos Customizados
```bash
# 1. Criar usuário
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_cnesJ48lR \
  --username user@example.com \
  --user-attributes Name=email,Value=user@example.com Name=email_verified,Value=true \
  --temporary-password TempPass123! \
  --message-action SUPPRESS

# 2. Definir senha permanente
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_cnesJ48lR \
  --username user@example.com \
  --password UserPass123! \
  --permanent

# 3. Definir atributos customizados
aws cognito-idp admin-update-user-attributes \
  --user-pool-id us-east-1_cnesJ48lR \
  --username user@example.com \
  --user-attributes \
    'Name=custom:organization_id,Value=ORG-UUID-HERE' \
    'Name=custom:organization_name,Value=Organization Name' \
    'Name=custom:roles,Value="[\"org_admin\"]"'
```

## CloudFront

- **Frontend Distribution ID**: `E1PY7U3VNT6P1R`
- **Frontend Domain**: `evo.ai.udstec.io`
- **S3 Bucket**: `evo-uds-v3-production-frontend-383234048592`

### Deploy Frontend
```bash
npm run build
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete
aws cloudfront create-invalidation --distribution-id E1PY7U3VNT6P1R --paths "/*"
```

## VPC & Networking

- **VPC ID**: `vpc-09773244a2156129c`
- **VPC CIDR**: `10.0.0.0/16`
- **Region**: `us-east-1`

### Subnets
| Tipo | Subnet ID | CIDR | AZ |
|------|-----------|------|-----|
| Public | `subnet-0c7857d8ca2b5a4e0` | 10.0.1.0/24 | us-east-1a |
| Private | `subnet-0dbb444e4ef54d211` | 10.0.3.0/24 | us-east-1a |
| Private | `subnet-05383447666913b7b` | 10.0.4.0/24 | us-east-1b |

### NAT Gateway (para Lambda acessar internet)
- **NAT Gateway ID**: `nat-071801f85e8109355`
- **Elastic IP**: `eipalloc-0f905bf31aaa39ca1` (54.165.51.84)
- **Subnet**: Public Subnet 1 (`subnet-0c7857d8ca2b5a4e0`)

### Route Tables
- **Public RT**: `rtb-00c15edb16b14d53b` → Internet Gateway
- **Private RT**: `rtb-060d53b4730d4507c` → NAT Gateway

### Internet Gateway
- **IGW ID**: `igw-0d7006c2a96e4ef47`

### VPC Endpoints (Gateway - sem custo)
- S3: `com.amazonaws.us-east-1.s3`
- DynamoDB: `com.amazonaws.us-east-1.dynamodb`

## RDS PostgreSQL

- **Engine**: PostgreSQL 15.10
- **Stack**: `evo-uds-v3-nodejs-infra`
- **ORM**: Prisma
- **Schema**: `backend/prisma/schema.prisma`

## Criar Novo Endpoint no API Gateway

```bash
# 1. Criar resource
aws apigateway create-resource --rest-api-id 3l66kn0eaj --parent-id n9gxy9 --path-part NOME-ENDPOINT --region us-east-1

# 2. Criar OPTIONS (CORS)
aws apigateway put-method --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method OPTIONS --authorization-type NONE --region us-east-1

aws apigateway put-integration --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method OPTIONS --type MOCK --request-templates '{"application/json": "{\"statusCode\": 200}"}' --region us-east-1

aws apigateway put-method-response --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method OPTIONS --status-code 200 --response-parameters '{"method.response.header.Access-Control-Allow-Headers":true,"method.response.header.Access-Control-Allow-Methods":true,"method.response.header.Access-Control-Allow-Origin":true}' --region us-east-1

aws apigateway put-integration-response --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method OPTIONS --status-code 200 --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' --region us-east-1

# 3. Criar POST com Cognito
aws apigateway put-method --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method POST --authorization-type COGNITO_USER_POOLS --authorizer-id joelbs --region us-east-1

aws apigateway put-integration --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method POST --type AWS_PROXY --integration-http-method POST --uri "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:383234048592:function:LAMBDA_NAME/invocations" --region us-east-1

# 4. Deploy (IMPORTANTE: usar stage 'prod')
aws apigateway create-deployment --rest-api-id 3l66kn0eaj --stage-name prod --region us-east-1
```

## Troubleshooting

### CORS 403 no OPTIONS
1. Verificar se o deployment foi feito no stage `prod` (não `production`)
2. Verificar se o OPTIONS tem `authorizationType: NONE`
3. Verificar se a integration response tem os headers CORS

### Prisma "did not initialize yet"
1. Rodar `prisma generate` no backend
2. Atualizar o layer com o novo `.prisma/client`
3. Atualizar as Lambdas para usar o novo layer

### Lambda 502 "Cannot find module"
1. Verificar se o layer está anexado à Lambda
2. Verificar se o módulo está no layer
3. Verificar o path do handler (ex: `handlers/security/security-scan.handler`)

**⚠️ ERRO COMUM: Faltam dependências AWS SDK no layer**

Se você receber erro "Cannot find module '@aws-sdk/client-xxx'" ou "Cannot find module '@smithy/xxx'":

1. **Causa**: O layer não inclui o pacote AWS SDK ou suas dependências transitivas
2. **Sintoma**: Lambda retorna 502, logs mostram "Runtime.ImportModuleError"
3. **Solução**: Atualizar layer usando o script de cópia recursiva (ver seção "Atualizar Layer")

**Exemplo de erro**:
```
Runtime.ImportModuleError: Error: Cannot find module '@aws-sdk/client-sts'
Require stack:
- /var/task/lib/aws-helpers.js
- /var/task/waf-dashboard-api.js
```

**Dependências comuns que faltam**:
- `@smithy/*` - 80+ pacotes necessários para AWS SDK v3
- `@aws-crypto/*` - Pacotes de criptografia
- `@aws/lambda-invoke-store` - Necessário para recursion detection middleware

**Como diagnosticar**:
```bash
# Ver logs da Lambda
aws logs tail /aws/lambda/FUNCTION_NAME --since 5m --region us-east-1

# Verificar layer atual
aws lambda get-function-configuration \
  --function-name FUNCTION_NAME \
  --query 'Layers[0].Arn' \
  --region us-east-1

# Testar invocação
aws lambda invoke \
  --function-name FUNCTION_NAME \
  --payload '{"requestContext":{"http":{"method":"OPTIONS"}}}' \
  --region us-east-1 \
  /tmp/test.json && cat /tmp/test.json
```

### Lambda 504 Timeout (VPC)
Lambdas em VPC precisam de NAT Gateway para acessar APIs AWS (STS, EC2, RDS, S3, etc.)

1. Verificar se NAT Gateway está ativo:
```bash
aws ec2 describe-nat-gateways --filter "Name=state,Values=available" --region us-east-1
```

2. Verificar se private subnets têm rota para NAT:
```bash
aws ec2 describe-route-tables --route-table-ids rtb-060d53b4730d4507c --region us-east-1
```

3. Verificar se Lambda está nas private subnets corretas:
```bash
aws lambda get-function-configuration --function-name FUNCTION_NAME --query 'VpcConfig' --region us-east-1
```

### Azure SDK "not installed" Error
Se receber erro "Azure SDK not installed", significa que o layer da Lambda não inclui os pacotes Azure.

**Solução:**
1. Verificar versão do layer na Lambda:
```bash
aws lambda get-function-configuration --function-name FUNCTION_NAME --query 'Layers[0].Arn' --output text --region us-east-1
```

2. Atualizar para layer versão 46 (com Azure SDK + @typespec + internal exports fix):
```bash
aws lambda update-function-configuration \
  --function-name FUNCTION_NAME \
  --layers "arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:46" \
  --region us-east-1
```

3. Se precisar atualizar todas as Lambdas Azure:
```bash
LAYER_ARN="arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:46"
for func in validate-azure-credentials save-azure-credentials list-azure-credentials delete-azure-credentials azure-security-scan start-azure-security-scan azure-defender-scan azure-compliance-scan azure-well-architected-scan azure-cost-optimization azure-reservations-analyzer azure-fetch-costs azure-resource-inventory azure-activity-logs list-cloud-credentials; do
  aws lambda update-function-configuration --function-name "evo-uds-v3-production-$func" --layers "$LAYER_ARN" --region us-east-1
done
```

### Security Scan Falha com "sts:AssumeRole not authorized"

**Sintoma:** Scan de segurança falha imediatamente com erro:
```
User: arn:aws:sts::383234048592:assumed-role/evo-uds-v3-production-lambda-nodejs-role/evo-uds-v3-production-security-scan 
is not authorized to perform: sts:AssumeRole on resource: arn:aws:iam::ACCOUNT_ID:role/ROLE_NAME
```

**Causa mais comum:** Inconsistência entre `access_key_id` e `role_arn` na tabela `aws_credentials`.

A função `resolveAwsCredentials` em `backend/src/lib/aws-helpers.ts` prioriza `role_arn` quando disponível. Se o `access_key_id` contém um role ARN desatualizado (com prefixo `ROLE:`), mas o `role_arn` está correto, o sistema usará o `role_arn`.

**Diagnóstico:**
```bash
# 1. Verificar logs do security-scan
aws logs filter-log-events \
  --log-group-name "/aws/lambda/evo-uds-v3-production-security-scan" \
  --start-time $(date -v-1H +%s000) \
  --filter-pattern "Assuming role" \
  --region us-east-1 \
  --query 'events[*].message' \
  --output text

# 2. Verificar credenciais no banco
# Use run-sql para verificar os campos access_key_id e role_arn
# Se access_key_id começa com "ROLE:" e role_arn é diferente, há inconsistência
```

**Solução:**
1. A função `resolveAwsCredentials` já prioriza `role_arn` sobre `access_key_id` com prefixo `ROLE:`
2. Se o problema persistir, verifique se a role existe na conta do cliente
3. Verifique se a trust policy da role permite a Lambda assumir

**Ordem de prioridade em `resolveAwsCredentials`:**
1. `role_arn` + `external_id` (mais confiável, atualizado pelo Quick Connect)
2. `access_key_id` com prefixo `ROLE:` (legado, pode estar desatualizado)
3. `access_key_id` + `secret_access_key` (credenciais diretas)

**⚠️ IMPORTANTE:** Nunca edite manualmente o campo `access_key_id` com prefixo `ROLE:`. Use o Quick Connect para atualizar as credenciais, que atualiza corretamente o campo `role_arn`.

---

### API Gateway 500 "Cannot read properties of undefined (reading 'authorizer')"
A Lambda não está recebendo o contexto de autorização do Cognito.

**Causas:**
1. Método POST não tem `authorizationType: COGNITO_USER_POOLS`
2. `authorizerId` incorreto (deve ser `joelbs`)
3. Permissão Lambda com path incorreto

**Solução:**
```bash
# Verificar permissões da Lambda
aws lambda get-policy --function-name LAMBDA_NAME --region us-east-1

# O source-arn DEVE incluir o path completo:
# arn:aws:execute-api:us-east-1:383234048592:3l66kn0eaj/*/POST/api/functions/ENDPOINT-NAME
# NÃO: arn:aws:execute-api:us-east-1:383234048592:3l66kn0eaj/*/POST/ENDPOINT-NAME

# Adicionar permissão correta se necessário:
aws lambda add-permission \
  --function-name LAMBDA_NAME \
  --statement-id apigateway-ENDPOINT-NAME-fix \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:us-east-1:383234048592:3l66kn0eaj/*/POST/api/functions/ENDPOINT-NAME" \
  --region us-east-1
```


---

## 📜 Histórico de Incidentes de Infraestrutura

### 2026-01-26 - Security Scan falhando com erro sts:AssumeRole

**Duração:** ~2 horas (16:45 - 18:41 UTC)

**Impacto:** ALTO - Scans de segurança falhando para organização específica

**Sintoma:** 
- Scans completavam em menos de 1 segundo com status `failed`
- Erro nos logs: `sts:AssumeRole not authorized on resource: arn:aws:iam::081337268589:role/EVO-Platform-Role-evo-platform`

**Causa raiz:**
Inconsistência nos dados da tabela `aws_credentials`:
- `access_key_id`: `ROLE:arn:aws:iam::081337268589:role/EVO-Platform-Role-evo-platform` (nome genérico/antigo)
- `role_arn`: `arn:aws:iam::081337268589:role/EVO-Platform-Role-EVO-Platform-mkve2ulb` (nome real com sufixo)

A função `resolveAwsCredentials` priorizava `access_key_id` com prefixo `ROLE:` sobre `role_arn`, usando o role ARN desatualizado.

**Correção aplicada:**
Alterada a lógica em `backend/src/lib/aws-helpers.ts` para priorizar `role_arn` quando disponível:

```typescript
// ANTES (problemático):
if (credential.access_key_id?.startsWith('ROLE:')) {
  // Usava access_key_id primeiro
}
if (credential.role_arn && credential.external_id) {
  // role_arn era segunda opção
}

// DEPOIS (corrigido):
if (credential.role_arn && credential.external_id) {
  // role_arn é prioridade (mais confiável)
}
if (credential.access_key_id?.startsWith('ROLE:')) {
  // ROLE: prefix é fallback
}
```

**Lambdas afetadas:**
- `evo-uds-v3-production-security-scan`

**Lição aprendida:**
- O campo `role_arn` é mais confiável pois é atualizado pelo Quick Connect
- O campo `access_key_id` com prefixo `ROLE:` é legado e pode ficar desatualizado
- Sempre priorizar dados mais recentes/confiáveis na lógica de resolução de credenciais

**Prevenção futura:**
- Documentado em steering para evitar regressão
- Considerar migração para usar apenas `role_arn` e deprecar o padrão `ROLE:` prefix

### 2026-01-27 - Cognito User Pool Duplicado

**Duração:** Desconhecida (problema existia há semanas)

**Impacto:** MÉDIO - Usuários não conseguiam ver dados de demo corretamente

**Sintoma:**
- Usuário `comercial+evo@uds.com.br` não via dados de demo
- Lambdas estavam configuradas com User Pool diferente do frontend

**Causa raiz:**
Existiam dois User Pools:
- `us-east-1_cnesJ48lR` (21 usuários) - Usado pelo frontend
- `us-east-1_qGmGkvmpL` (4 usuários) - Configurado nas Lambdas (ERRADO)

As Lambdas não conseguiam validar os tokens JWT dos usuários do frontend porque estavam apontando para o pool errado.

**Correção aplicada:**
1. Atualizadas todas as 149 Lambdas para usar `COGNITO_USER_POOL_ID=us-east-1_cnesJ48lR`
2. Deletado o User Pool errado `us-east-1_qGmGkvmpL`

**Lambdas afetadas:**
- Todas as 149 Lambdas `evo-uds-v3-production-*`

**Lição aprendida:**
- Manter apenas UM User Pool para evitar confusão
- Verificar se frontend e backend usam o mesmo User Pool
- Documentar claramente qual User Pool está em uso

---

**Última atualização:** 2026-01-27
**Versão:** 1.6
