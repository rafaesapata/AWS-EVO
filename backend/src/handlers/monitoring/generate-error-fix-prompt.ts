/**
 * Generate Error Fix Prompt - AI-Powered
 * 
 * Analisa erros em tempo real e gera prompts de correção automaticamente
 * baseado em padrões conhecidos e contexto do erro
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { logger } from '../../lib/logger.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

const generatePromptSchema = z.object({
  errorType: z.string(),
  errorMessage: z.string(),
  lambdaName: z.string().optional(),
  endpoint: z.string().optional(),
  statusCode: z.number().optional(),
  stackTrace: z.string().optional(),
  requestId: z.string().optional(),
  timestamp: z.string().optional(),
});

interface ErrorPattern {
  pattern: RegExp;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  generatePrompt: (context: any) => string;
}

// Padrões de erros conhecidos com geradores de prompts
const ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /Cannot find module ['"]\.\.\/\.\.\/lib\//i,
    category: 'deployment',
    severity: 'critical',
    generatePrompt: (ctx) => `🔴 ERRO CRÍTICO DETECTADO: Deploy Incorreto

**Lambda Afetada:** ${ctx.lambdaName || 'Desconhecida'}
**Erro:** ${ctx.errorMessage}
**Status:** 502 Bad Gateway
**Request ID:** ${ctx.requestId || 'N/A'}

---

## 🔍 Diagnóstico Automático

O erro "Cannot find module '../../lib/'" indica que a Lambda foi deployada incorretamente:

❌ **Problema Identificado:**
- Apenas o arquivo .js do handler foi copiado
- Diretórios \`lib/\` e \`types/\` estão faltando
- Imports não foram ajustados de \`../../lib/\` para \`./lib/\`

---

## ✅ Solução Automática

Execute este comando para corrigir:

\`\`\`bash
# Corrigir Lambda: ${ctx.lambdaName}
npm run build --prefix backend && \\
rm -rf /tmp/lambda-deploy && mkdir -p /tmp/lambda-deploy && \\
sed 's|require("../../lib/|require("./lib/|g' backend/dist/handlers/${ctx.category || 'unknown'}/${ctx.handlerFile || 'unknown'}.js | \\
sed 's|require("../../types/|require("./types/|g' > /tmp/lambda-deploy/${ctx.handlerFile || 'unknown'}.js && \\
cp -r backend/dist/lib /tmp/lambda-deploy/ && \\
cp -r backend/dist/types /tmp/lambda-deploy/ && \\
cd /tmp/lambda-deploy && zip -r ../lambda.zip . && cd - && \\
aws lambda update-function-code \\
  --function-name ${ctx.lambdaName} \\
  --zip-file fileb:///tmp/lambda.zip \\
  --region us-east-1 && \\
aws lambda update-function-configuration \\
  --function-name ${ctx.lambdaName} \\
  --handler ${ctx.handlerFile || 'unknown'}.handler \\
  --region us-east-1
\`\`\`

---

## 📚 Referência
- Documentação: .kiro/steering/architecture.md
- Processo de deploy correto documentado

## ⏱️ Tempo Estimado
- Execução: ~2 minutos
- Validação: ~1 minuto

## ✅ Validação
Após executar, teste:
\`\`\`bash
aws lambda invoke \\
  --function-name ${ctx.lambdaName} \\
  --payload '{"requestContext":{"http":{"method":"OPTIONS"}}}' \\
  --region us-east-1 \\
  /tmp/test.json && cat /tmp/test.json
\`\`\`

Deve retornar statusCode: 200`
  },

  {
    pattern: /PrismaClientInitializationError|Can't reach database server/i,
    category: 'database',
    severity: 'critical',
    generatePrompt: (ctx) => `🔴 ERRO CRÍTICO DETECTADO: Falha de Conexão com Banco de Dados

**Lambda Afetada:** ${ctx.lambdaName || 'Desconhecida'}
**Erro:** ${ctx.errorMessage}
**Status:** 500 Internal Server Error
**Request ID:** ${ctx.requestId || 'N/A'}

---

## 🔍 Diagnóstico Automático

PrismaClientInitializationError indica problema de conexão com PostgreSQL:

❌ **Possíveis Causas:**
1. DATABASE_URL incorreta (endpoint inexistente)
2. Lambda não está na VPC correta
3. Security Group não permite porta 5432
4. RDS instance parada ou inacessível

---

## ✅ Solução Automática

### Passo 1: Verificar DATABASE_URL

\`\`\`bash
aws lambda get-function-configuration \\
  --function-name ${ctx.lambdaName} \\
  --region us-east-1 \\
  --query 'Environment.Variables.DATABASE_URL' \\
  --output text
\`\`\`

### Passo 2: Atualizar DATABASE_URL (se incorreta)

Consulte o DATABASE_URL correto para o ambiente atual no AWS Secrets Manager ou na configuração do SAM template.

### Passo 3: Verificar VPC e Security Group

\`\`\`bash
# Verificar VPC da Lambda
aws lambda get-function-configuration \\
  --function-name ${ctx.lambdaName} \\
  --region us-east-1 \\
  --query 'VpcConfig'

# Verificar status do RDS (ajuste o identifier para o ambiente correto)
aws rds describe-db-instances \\
  --region us-east-1 \\
  --query 'DBInstances[?starts_with(DBInstanceIdentifier, \`evo-uds-v3\`)].[DBInstanceIdentifier,DBInstanceStatus,Endpoint.Address]'
\`\`\`

---

## 📚 Referência
- Documentação: .kiro/steering/database-configuration.md

## ⏱️ Tempo Estimado
- Diagnóstico: ~1 minuto
- Correção: ~2 minutos
- Validação: ~1 minuto`
  },

  {
    pattern: /Cannot find module ['"]@azure\/|@typespec/i,
    category: 'dependencies',
    severity: 'high',
    generatePrompt: (ctx) => `🟠 ERRO DETECTADO: Azure SDK Não Instalado

**Lambda Afetada:** ${ctx.lambdaName || 'Desconhecida'}
**Erro:** ${ctx.errorMessage}
**Status:** 500 Internal Server Error
**Request ID:** ${ctx.requestId || 'N/A'}

---

## 🔍 Diagnóstico Automático

Erro ao importar módulos do Azure SDK:

❌ **Problema Identificado:**
- Layer da Lambda não inclui Azure SDK
- Falta @typespec/ts-http-runtime (dependência peer)
- Layer desatualizado (versão < 47)

---

## ✅ Solução Automática

### Opção 1: Atualizar para Layer Existente (Rápido)

\`\`\`bash
# Obter última versão do layer
LAYER_ARN=$(aws lambda list-layer-versions \\
  --layer-name evo-prisma-deps-layer \\
  --region us-east-1 \\
  --query 'LayerVersions[0].LayerVersionArn' \\
  --output text)

echo "Layer ARN: $LAYER_ARN"

# Atualizar Lambda
aws lambda update-function-configuration \\
  --function-name ${ctx.lambdaName} \\
  --layers "$LAYER_ARN" \\
  --environment 'Variables={NODE_PATH=/opt/nodejs/node_modules}' \\
  --region us-east-1
\`\`\`

### Opção 2: Criar Novo Layer (Se necessário)

Ver processo completo em: .kiro/steering/azure-lambda-layers.md

---

## 📚 Referência
- Documentação: .kiro/steering/azure-lambda-layers.md
- Layer atual: evo-prisma-deps-layer:47+

## ⏱️ Tempo Estimado
- Opção 1: ~1 minuto
- Opção 2: ~10 minutos`
  },

  {
    pattern: /CORS|Access-Control-Allow-Origin/i,
    category: 'api-gateway',
    severity: 'medium',
    generatePrompt: (ctx) => `🟡 ERRO DETECTADO: CORS Não Configurado

**Endpoint Afetado:** ${ctx.endpoint || 'Desconhecido'}
**Erro:** ${ctx.errorMessage}
**Status:** 403 Forbidden
**Request ID:** ${ctx.requestId || 'N/A'}

---

## 🔍 Diagnóstico Automático

Erro de CORS indica configuração incorreta no API Gateway:

❌ **Possíveis Causas:**
1. Método OPTIONS não configurado
2. Headers CORS faltando
3. Deployment não feito no stage 'prod'
4. X-Impersonate-Organization não incluído

---

## ✅ Solução Automática

### Passo 1: Identificar Resource ID

\`\`\`bash
# Buscar resource ID do endpoint
aws apigateway get-resources \\
  --rest-api-id 3l66kn0eaj \\
  --region us-east-1 \\
  --query 'items[?path==\`${ctx.endpoint}\`].[id,path]' \\
  --output table
\`\`\`

### Passo 2: Configurar CORS (substitua RESOURCE_ID)

\`\`\`bash
RESOURCE_ID="COLE_AQUI"

# Criar método OPTIONS
aws apigateway put-method \\
  --rest-api-id 3l66kn0eaj \\
  --resource-id $RESOURCE_ID \\
  --http-method OPTIONS \\
  --authorization-type NONE \\
  --region us-east-1

# Configurar integration response com CORS
aws apigateway put-integration-response \\
  --rest-api-id 3l66kn0eaj \\
  --resource-id $RESOURCE_ID \\
  --http-method OPTIONS \\
  --status-code 200 \\
  --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token,X-Impersonate-Organization'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' \\
  --region us-east-1

# Deploy no stage prod
aws apigateway create-deployment \\
  --rest-api-id 3l66kn0eaj \\
  --stage-name prod \\
  --region us-east-1
\`\`\`

---

## 📚 Referência
- Documentação: .kiro/steering/api-gateway-endpoints.md

## ⏱️ Tempo Estimado
- Configuração: ~3 minutos
- Validação: ~1 minuto`
  },

  {
    pattern: /Task timed out after|Lambda timeout/i,
    category: 'performance',
    severity: 'high',
    generatePrompt: (ctx) => `🟠 ERRO DETECTADO: Lambda Timeout

**Lambda Afetada:** ${ctx.lambdaName || 'Desconhecida'}
**Erro:** ${ctx.errorMessage}
**Request ID:** ${ctx.requestId || 'N/A'}

---

## 🔍 Diagnóstico Automático

Lambda excedeu o tempo máximo de execução:

❌ **Possíveis Causas:**
1. Timeout configurado muito baixo
2. Operação muito lenta (scan grande, query pesada)
3. Lambda em VPC sem NAT Gateway
4. API externa lenta ou indisponível

---

## ✅ Solução Automática

### Passo 1: Verificar Timeout Atual

\`\`\`bash
aws lambda get-function-configuration \\
  --function-name ${ctx.lambdaName} \\
  --region us-east-1 \\
  --query '{Timeout: Timeout, Memory: MemorySize, VPC: VpcConfig.VpcId}'
\`\`\`

### Passo 2: Aumentar Timeout (máximo 900s = 15min)

\`\`\`bash
aws lambda update-function-configuration \\
  --function-name ${ctx.lambdaName} \\
  --timeout 300 \\
  --region us-east-1
\`\`\`

### Passo 3: Verificar NAT Gateway (se Lambda em VPC)

\`\`\`bash
# Verificar NAT Gateway ativo
aws ec2 describe-nat-gateways \\
  --filter "Name=state,Values=available" \\
  --region us-east-1 \\
  --query 'NatGateways[*].[NatGatewayId,State,SubnetId]' \\
  --output table
\`\`\`

### Passo 4: Considerar Aumentar Memória (melhora CPU)

\`\`\`bash
# Aumentar memória também aumenta CPU proporcionalmente
aws lambda update-function-configuration \\
  --function-name ${ctx.lambdaName} \\
  --memory-size 512 \\
  --region us-east-1
\`\`\`

---

## 📚 Referência
- Documentação: .kiro/steering/aws-infrastructure.md

## ⏱️ Tempo Estimado
- Diagnóstico: ~2 minutos
- Correção: ~1 minuto
- Teste: ~5 minutos`
  },
];

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);

    // Parse and validate body using centralized validation
    const validation = parseAndValidateBody(generatePromptSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const errorData = validation.data;

    logger.info('Generating error fix prompt', {
      organizationId,
      errorType: errorData.errorType,
      lambdaName: errorData.lambdaName,
    });

    // Encontrar padrão correspondente
    let matchedPattern: ErrorPattern | null = null;
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.pattern.test(errorData.errorMessage) || pattern.pattern.test(errorData.errorType)) {
        matchedPattern = pattern;
        break;
      }
    }

    // Se não encontrou padrão, gerar prompt genérico
    if (!matchedPattern) {
      const genericPrompt = generateGenericPrompt(errorData);
      return success({
        prompt: genericPrompt,
        category: 'unknown',
        severity: 'medium',
        matched: false,
      });
    }

    // Gerar contexto para o prompt
    const prefix = process.env.LAMBDA_PREFIX || `evo-uds-v3-${process.env.ENVIRONMENT || 'sandbox'}`;
    const context = {
      ...errorData,
      category: matchedPattern.category,
      handlerFile: errorData.lambdaName?.replace(`${prefix}-`, ''),
    };

    // Gerar prompt específico
    const prompt = matchedPattern.generatePrompt(context);

    return success({
      prompt,
      category: matchedPattern.category,
      severity: matchedPattern.severity,
      matched: true,
      pattern: matchedPattern.pattern.source,
    });

  } catch (err) {
    logger.error('Error generating fix prompt', err as Error);
    return error('Failed to generate fix prompt');
  }
}

function generateGenericPrompt(errorData: z.infer<typeof generatePromptSchema>): string {
  return `⚠️ ERRO DETECTADO: ${errorData.errorType}

**Lambda/Endpoint:** ${errorData.lambdaName || errorData.endpoint || 'Desconhecido'}
**Erro:** ${errorData.errorMessage}
**Status:** ${errorData.statusCode || 'N/A'}
**Request ID:** ${errorData.requestId || 'N/A'}
**Timestamp:** ${errorData.timestamp || new Date().toISOString()}

---

## 🔍 Diagnóstico Manual Necessário

Este erro não corresponde a nenhum padrão conhecido. Análise manual necessária.

### Informações Coletadas:

**Mensagem de Erro:**
\`\`\`
${errorData.errorMessage}
\`\`\`

${errorData.stackTrace ? `**Stack Trace:**
\`\`\`
${errorData.stackTrace}
\`\`\`` : ''}

---

## 🔧 Passos de Investigação

### 1. Verificar Logs da Lambda

\`\`\`bash
aws logs tail /aws/lambda/${errorData.lambdaName} \\
  --since 30m \\
  --region us-east-1 \\
  --filter-pattern "ERROR"
\`\`\`

### 2. Verificar Configuração

\`\`\`bash
aws lambda get-function-configuration \\
  --function-name ${errorData.lambdaName} \\
  --region us-east-1
\`\`\`

### 3. Testar Invocação

\`\`\`bash
aws lambda invoke \\
  --function-name ${errorData.lambdaName} \\
  --payload '{"requestContext":{"http":{"method":"OPTIONS"}}}' \\
  --region us-east-1 \\
  /tmp/test.json && cat /tmp/test.json
\`\`\`

---

## 📚 Documentação Relevante

- .kiro/steering/architecture.md - Processo de deploy
- .kiro/steering/error-monitoring.md - Troubleshooting
- .kiro/steering/lambda-functions-reference.md - Referência de Lambdas

## 💡 Sugestão

Se este erro se tornar recorrente, reporte para adicionar um padrão específico de detecção e correção automática.`;
}
