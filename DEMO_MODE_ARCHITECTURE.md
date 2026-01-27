# Demo Mode - Arquitetura de Segurança

## Visão Geral

O Demo Mode é uma funcionalidade que permite exibir dados fictícios de demonstração para organizações em modo de apresentação comercial. A arquitetura foi projetada com foco em **segurança** para garantir que dados demo NUNCA sejam misturados com dados reais.

## Princípios de Segurança

### 1. Isolamento no Backend
- A flag `demo_mode` é armazenada na tabela `organizations` no banco de dados
- O frontend NUNCA decide se está em modo demo - apenas exibe o que o backend retorna
- Todas as APIs verificam `organization.demo_mode` antes de retornar dados

### 2. Dados Demo Gerados no Backend
- O serviço `demo-data-service.ts` gera todos os dados fictícios
- Frontend NUNCA gera dados fictícios localmente
- Todos os dados demo são marcados com `_isDemo: true`

### 3. Indicador Visual Inconfundível
- Banner persistente no topo de todas as páginas
- Watermark semi-transparente sobre o conteúdo
- Card explicativo em cada página
- Não pode ser fechado/escondido pelo usuário

### 4. Auditoria Completa
- Todas as ativações/desativações são registradas
- Logs incluem: quem, quando, motivo, IP, user-agent
- Histórico completo de mudanças no modo demo

## 🚨 ARQUITETURA FAIL-SAFE (CRÍTICO)

A arquitetura foi projetada com princípio FAIL-SAFE para garantir que organizações normais NUNCA vejam indicadores de demo, mesmo durante carregamento, erros de rede, ou qualquer outro estado.

### Regras FAIL-SAFE no Frontend

```typescript
// DemoModeContext.tsx - Estado inicial SEMPRE false
const [state, setState] = useState<DemoModeState>({
  isDemoMode: false,      // SEMPRE false até confirmação do backend
  isLoading: true,
  isVerified: false,      // Indica se verificação foi concluída
  // ...
});
```

**Componentes de demo SÓ renderizam quando TODAS as condições são verdadeiras:**
1. `isDemoMode === true` (backend confirmou explicitamente)
2. `isLoading === false` (carregamento completo)
3. `isVerified === true` (verificação bem-sucedida)

```typescript
// DemoBanner.tsx - Exemplo de verificação tripla
if (isLoading || !isVerified) {
  return null;  // Durante carregamento: NADA
}
if (!isDemoMode) {
  return null;  // Se não é demo: NADA
}
// Só aqui renderiza o banner
```

### Regras FAIL-SAFE no Backend

```typescript
// demo-data-service.ts - isOrganizationInDemoMode()
export async function isOrganizationInDemoMode(prisma, organizationId): Promise<boolean> {
  try {
    // ... verificações ...
    if (org.demo_mode !== true) return false;  // Só true se EXPLICITAMENTE true
    // ... verificar expiração ...
    return true;
  } catch (error) {
    // CRÍTICO: Em caso de erro, NUNCA retorna true
    logger.error('Error checking demo mode - defaulting to FALSE', error);
    return false;
  }
}
```

```typescript
// demo-data-service.ts - getDemoOrRealData()
export async function getDemoOrRealData<T>(prisma, organizationId, demoGenerator, realFetcher) {
  try {
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    if (isDemo === true) {
      return { data: demoGenerator(), isDemo: true };
    }
    // Qualquer outro caso = dados reais
    return { data: await realFetcher(), isDemo: false };
  } catch (error) {
    // CRÍTICO: Em caso de erro, SEMPRE retorna dados reais
    logger.error('Error in getDemoOrRealData - returning real data', error);
    return { data: await realFetcher(), isDemo: false };
  }
}
```

### Cenários de Falha e Comportamento

| Cenário | isDemoMode | isLoading | isVerified | Resultado |
|---------|------------|-----------|------------|-----------|
| Carregando | false | true | false | Nenhum indicador demo |
| Erro de rede | false | false | false | Nenhum indicador demo |
| Org normal | false | false | true | Nenhum indicador demo |
| Org demo | true | false | true | Banner + Watermark |
| Demo expirado | false | false | true | Nenhum indicador demo |

### Por que isso é importante?

1. **Confiança do cliente**: Clientes reais NUNCA devem ver "DEMONSTRAÇÃO" em seus dados
2. **Integridade visual**: Mesmo um flash de 100ms do banner seria inaceitável
3. **Robustez**: Sistema funciona corretamente mesmo com falhas de rede
4. **Auditabilidade**: Comportamento previsível e documentado

## Componentes

### Backend

#### 1. Schema do Banco de Dados
```sql
-- Campos na tabela organizations
demo_mode BOOLEAN DEFAULT FALSE
demo_activated_at TIMESTAMPTZ
demo_expires_at TIMESTAMPTZ
demo_activated_by UUID

-- Tabela de auditoria
demo_mode_audit (
  id, organization_id, action, performed_by,
  previous_state, new_state, reason, ip_address, user_agent, created_at
)
```

#### 2. Demo Data Service (`backend/src/lib/demo-data-service.ts`)
- `isOrganizationInDemoMode()` - Verifica se org está em demo
- `generateDemoSecurityFindings()` - Dados de segurança fictícios
- `generateDemoCostData()` - Dados de custos fictícios
- `generateDemoWafEvents()` - Eventos WAF fictícios
- `generateDemoExecutiveDashboard()` - Dashboard executivo fictício
- `generateDemoComplianceData()` - Dados de compliance fictícios
- `generateDemoRISPAnalysis()` - Análise RI/SP fictícia
- `getDemoOrRealData()` - Wrapper que retorna demo ou real

#### 3. Handler de Gerenciamento (`backend/src/handlers/admin/manage-demo-mode.ts`)
- `activate` - Ativa demo mode (apenas super_admin)
- `deactivate` - Desativa demo mode (apenas super_admin)
- `extend` - Estende período do demo
- `status` - Retorna status atual

#### 4. Handler de Auto-Ativação (`backend/src/handlers/admin/deactivate-demo-mode.ts`)
- Permite que o próprio usuário desative o modo demo da sua organização
- Não requer super_admin - qualquer usuário da organização pode usar
- Requer confirmação explícita (`confirm: true`)
- Registra auditoria com ação `SELF_DEACTIVATED`

### Frontend

#### 1. Context (`src/contexts/DemoModeContext.tsx`)
- Busca status do demo mode do backend
- Fornece `isDemoMode`, `demoExpiresAt`, etc.
- Descrições das páginas para o explainer

#### 2. Componentes (`src/components/demo/`)
- `DemoBanner.tsx` - Banner persistente no topo com botão "Ativar Conta Real"
- `DemoWatermark.tsx` - Marca d'água sobre o conteúdo
- `DemoPageExplainer.tsx` - Card explicativo por página

#### 3. Integração no Layout (`src/components/Layout.tsx`)
- DemoBanner renderizado antes do header
- DemoWatermark envolve todo o conteúdo

## Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Login → Verifica organization.demo_mode                     │
│                                                                  │
│  2. Se demo_mode = true:                                        │
│     - Todas as APIs retornam dados do demo-data-service         │
│     - Dados marcados com _isDemo: true                          │
│                                                                  │
│  3. Se demo_mode = false:                                       │
│     - APIs retornam dados reais do banco                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. DemoModeContext busca status via API                        │
│                                                                  │
│  2. Se isDemoMode = true:                                       │
│     - DemoBanner exibido no topo                                │
│     - DemoWatermark sobre o conteúdo                            │
│     - DemoPageExplainer em cada página                          │
│                                                                  │
│  3. Componentes exibem dados que vieram do backend              │
│     (não sabem/não se importam se são demo ou reais)            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Como Usar

### Ativar Demo Mode (Super Admin)

```bash
curl -X POST https://api-evo.ai.udstec.io/api/functions/manage-demo-mode \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "activate",
    "organizationId": "uuid-da-org",
    "expiresInDays": 30,
    "reason": "Demonstração para cliente XYZ"
  }'
```

### Desativar Demo Mode

```bash
curl -X POST https://api-evo.ai.udstec.io/api/functions/manage-demo-mode \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "deactivate",
    "organizationId": "uuid-da-org",
    "reason": "Cliente converteu para conta real"
  }'
```

### Verificar Status

```bash
curl -X POST https://api-evo.ai.udstec.io/api/functions/manage-demo-mode \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "status",
    "organizationId": "uuid-da-org"
  }'
```

### Auto-Ativação pelo Usuário (Desativar Demo)

O próprio usuário pode desativar o modo demo da sua organização sem precisar de super_admin:

```bash
curl -X POST https://api-evo.ai.udstec.io/api/functions/deactivate-demo-mode \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "confirm": true
  }'
```

**Resposta de sucesso:**
```json
{
  "message": "Account activated successfully! Demo mode has been deactivated.",
  "demo_mode": false,
  "organization_name": "Nome da Organização"
}
```

## Integração em Handlers Existentes

Para integrar o demo mode em um handler existente:

```typescript
import { getDemoOrRealData, generateDemoSecurityFindings } from '../../lib/demo-data-service.js';

export async function handler(event, context) {
  const organizationId = getOrganizationId(user);
  const prisma = getPrismaClient();

  // Usar wrapper que retorna demo ou real automaticamente
  const { data, isDemo } = await getDemoOrRealData(
    prisma,
    organizationId,
    // Função que gera dados demo
    () => generateDemoSecurityFindings(),
    // Função que busca dados reais
    async () => {
      return await prisma.finding.findMany({
        where: { organization_id: organizationId }
      });
    }
  );

  return success({
    findings: data,
    _isDemo: isDemo
  });
}
```

## Checklist de Segurança

- [x] Flag demo_mode armazenada no banco (não no frontend)
- [x] Apenas super_admin pode ativar/desativar
- [x] Todas as mudanças são auditadas
- [x] Dados demo marcados com `_isDemo: true`
- [x] Banner não pode ser fechado pelo usuário
- [x] Watermark visível em screenshots
- [x] Demo mode expira automaticamente
- [x] Logs incluem IP e user-agent

## Arquivos Criados/Modificados

### Novos Arquivos
- `backend/src/lib/demo-data-service.ts` - Serviço de dados demo
- `backend/src/handlers/admin/manage-demo-mode.ts` - Handler de gerenciamento
- `backend/prisma/migrations/20260122_add_demo_mode/migration.sql` - Migração
- `src/contexts/DemoModeContext.tsx` - Context do frontend
- `src/components/demo/DemoBanner.tsx` - Banner de demo
- `src/components/demo/DemoWatermark.tsx` - Watermark
- `src/components/demo/DemoPageExplainer.tsx` - Explicador de página
- `src/components/demo/index.ts` - Exports

### Arquivos Modificados
- `backend/prisma/schema.prisma` - Adicionados campos demo_mode
- `src/components/Layout.tsx` - Integração do DemoBanner e DemoWatermark
- `src/main.tsx` - Adicionado DemoModeProvider
- `src/i18n/locales/pt.json` - Traduções PT
- `src/i18n/locales/en.json` - Traduções EN

### Handlers com Demo Mode Integrado ✅

| Handler | Arquivo | Status |
|---------|---------|--------|
| Executive Dashboard | `backend/src/handlers/dashboard/get-executive-dashboard.ts` | ✅ Integrado |
| Fetch Daily Costs | `backend/src/handlers/cost/fetch-daily-costs.ts` | ✅ Integrado |
| Security Scan | `backend/src/handlers/security/security-scan.ts` | ✅ Integrado |
| WAF Dashboard API | `backend/src/handlers/security/waf-dashboard-api.ts` | ✅ Integrado |
| Compliance Scan | `backend/src/handlers/security/compliance-scan.ts` | ✅ Integrado |
| RI/SP Analyzer | `backend/src/handlers/cost/ri-sp-analyzer.ts` | ✅ Integrado |
| Get Findings | `backend/src/handlers/security/get-findings.ts` | ✅ Integrado |
| Get Security Posture | `backend/src/handlers/security/get-security-posture.ts` | ✅ Integrado |
| Cost Optimization | `backend/src/handlers/cost/cost-optimization.ts` | ✅ Integrado |
| Well-Architected Scan | `backend/src/handlers/security/well-architected-scan.ts` | ✅ Integrado |
| Budget Forecast | `backend/src/handlers/cost/budget-forecast.ts` | ✅ Integrado |

### Dados Demo Disponíveis

| Função | Descrição |
|--------|-----------|
| `generateDemoExecutiveDashboard()` | Dashboard executivo completo com summary, financial, security, operations, insights, trends |
| `generateDemoCostData(days)` | Custos diários por serviço para N dias |
| `generateDemoSecurityFindings()` | 6 findings de segurança (S3, EC2, RDS, CloudTrail, IAM) |
| `generateDemoWafEvents(count)` | Eventos WAF com ações, regras, IPs, países |
| `generateDemoComplianceData()` | Frameworks (CIS, LGPD, PCI-DSS, SOC2) com scores e violações |
| `generateDemoRISPAnalysis()` | Análise de Reserved Instances e Savings Plans |
| `generateDemoCostOptimizations()` | 12 recomendações de otimização de custos (EC2, EBS, RDS, Lambda, EIP) |
| `generateDemoWellArchitectedData()` | Análise dos 6 pilares do Well-Architected Framework |
| `generateDemoBudgetForecast()` | Previsão de orçamento com histórico e forecast |

## Próximos Passos para Deploy

### ⚠️ IMPORTANTE: Ordem de Execução

Os passos abaixo DEVEM ser executados na ordem correta. O TypeScript mostrará erros até que o Prisma Client seja regenerado com os novos campos.

### 1. Executar migração do banco de dados

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
cd ..
```

**Nota:** Após executar `prisma generate`, os erros de TypeScript nos handlers serão resolvidos automaticamente.

### 2. Atualizar o Prisma Layer (necessário para novos campos)

```bash
# Gerar Prisma Client
cd backend && npm run prisma:generate && cd ..

# Criar layer atualizado
rm -rf /tmp/lambda-layer-prisma && mkdir -p /tmp/lambda-layer-prisma/nodejs/node_modules
cp -r backend/node_modules/@prisma /tmp/lambda-layer-prisma/nodejs/node_modules/
cp -r backend/node_modules/.prisma /tmp/lambda-layer-prisma/nodejs/node_modules/
cp -r backend/node_modules/zod /tmp/lambda-layer-prisma/nodejs/node_modules/

# Limpar arquivos desnecessários
rm -f /tmp/lambda-layer-prisma/nodejs/node_modules/.prisma/client/libquery_engine-darwin*.node
rm -rf /tmp/lambda-layer-prisma/nodejs/node_modules/.prisma/client/deno

# Criar ZIP e publicar
cd /tmp/lambda-layer-prisma && zip -r ../prisma-layer.zip nodejs && cd -
aws s3 cp /tmp/prisma-layer.zip s3://evo-uds-v3-production-frontend-383234048592/layers/prisma-layer.zip --region us-east-1
aws lambda publish-layer-version \
  --layer-name evo-prisma-deps-layer \
  --description "Prisma + Zod + Demo Mode fields" \
  --content S3Bucket=evo-uds-v3-production-frontend-383234048592,S3Key=layers/prisma-layer.zip \
  --compatible-runtimes nodejs18.x nodejs20.x \
  --region us-east-1
```

### 3. Deploy do handler manage-demo-mode

```bash
# Compilar backend
npm run build --prefix backend

# Preparar deploy
rm -rf /tmp/lambda-deploy-demo && mkdir -p /tmp/lambda-deploy-demo
sed 's|require("../../lib/|require("./lib/|g' backend/dist/handlers/admin/manage-demo-mode.js | \
sed 's|require("../../types/|require("./types/|g' > /tmp/lambda-deploy-demo/manage-demo-mode.js
cp -r backend/dist/lib /tmp/lambda-deploy-demo/
cp -r backend/dist/types /tmp/lambda-deploy-demo/

# Criar ZIP
cd /tmp/lambda-deploy-demo && zip -r ../manage-demo-mode.zip . && cd -

# Criar Lambda (se não existir)
aws lambda create-function \
  --function-name evo-uds-v3-production-manage-demo-mode \
  --runtime nodejs18.x \
  --handler manage-demo-mode.handler \
  --role arn:aws:iam::383234048592:role/evo-uds-v3-production-lambda-role \
  --zip-file fileb:///tmp/manage-demo-mode.zip \
  --timeout 30 \
  --memory-size 256 \
  --layers "arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:VERSAO" \
  --vpc-config SubnetIds=subnet-0dbb444e4ef54d211,subnet-05383447666913b7b,SecurityGroupIds=sg-04eb71f681cc651ae \
  --environment "Variables={DATABASE_URL=postgresql://evoadmin:%29V7%3F9ygLec%3FAMSqn%29.UIU4%24vOfRl%2C%24%5EL@evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com:5432/evouds?schema=public,NODE_PATH=/opt/nodejs/node_modules}" \
  --region us-east-1

# Ou atualizar se já existir
aws lambda update-function-code \
  --function-name evo-uds-v3-production-manage-demo-mode \
  --zip-file fileb:///tmp/manage-demo-mode.zip \
  --region us-east-1
```

### 4. Criar endpoint no API Gateway

```bash
# Criar resource
aws apigateway create-resource \
  --rest-api-id 3l66kn0eaj \
  --parent-id n9gxy9 \
  --path-part manage-demo-mode \
  --region us-east-1

# Criar OPTIONS (CORS)
RESOURCE_ID="<ID_RETORNADO>"
aws apigateway put-method --rest-api-id 3l66kn0eaj --resource-id $RESOURCE_ID --http-method OPTIONS --authorization-type NONE --region us-east-1
aws apigateway put-integration --rest-api-id 3l66kn0eaj --resource-id $RESOURCE_ID --http-method OPTIONS --type MOCK --request-templates '{"application/json": "{\"statusCode\": 200}"}' --region us-east-1
aws apigateway put-method-response --rest-api-id 3l66kn0eaj --resource-id $RESOURCE_ID --http-method OPTIONS --status-code 200 --response-parameters '{"method.response.header.Access-Control-Allow-Headers":true,"method.response.header.Access-Control-Allow-Methods":true,"method.response.header.Access-Control-Allow-Origin":true}' --region us-east-1
aws apigateway put-integration-response --rest-api-id 3l66kn0eaj --resource-id $RESOURCE_ID --http-method OPTIONS --status-code 200 --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token,X-Impersonate-Organization'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' --region us-east-1

# Criar POST com Cognito
aws apigateway put-method --rest-api-id 3l66kn0eaj --resource-id $RESOURCE_ID --http-method POST --authorization-type COGNITO_USER_POOLS --authorizer-id joelbs --region us-east-1
aws apigateway put-integration --rest-api-id 3l66kn0eaj --resource-id $RESOURCE_ID --http-method POST --type AWS_PROXY --integration-http-method POST --uri "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:383234048592:function:evo-uds-v3-production-manage-demo-mode/invocations" --region us-east-1

# Adicionar permissão Lambda
aws lambda add-permission \
  --function-name evo-uds-v3-production-manage-demo-mode \
  --statement-id apigateway-manage-demo-mode \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:us-east-1:383234048592:3l66kn0eaj/*/POST/api/functions/manage-demo-mode" \
  --region us-east-1

# Deploy
aws apigateway create-deployment --rest-api-id 3l66kn0eaj --stage-name prod --region us-east-1
```

### 5. Build e deploy do frontend

```bash
npm run build
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete
aws cloudfront create-invalidation --distribution-id E1PY7U3VNT6P1R --paths "/*"
```

### 6. Testar o fluxo completo

```bash
# 1. Verificar status (deve retornar demo_mode: false)
curl -X POST https://api-evo.ai.udstec.io/api/functions/get-user-organization \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# 2. Ativar demo mode (apenas super_admin)
curl -X POST https://api-evo.ai.udstec.io/api/functions/manage-demo-mode \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "activate", "organizationId": "UUID", "expiresInDays": 30, "reason": "Teste"}'

# 3. Verificar no frontend - deve aparecer banner e watermark

# 4. Desativar demo mode
curl -X POST https://api-evo.ai.udstec.io/api/functions/manage-demo-mode \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "deactivate", "organizationId": "UUID", "reason": "Fim do teste"}'
```

---

**Última atualização:** 2026-01-23
**Versão:** 1.3 - Demo mode integrado em 11 handlers principais
