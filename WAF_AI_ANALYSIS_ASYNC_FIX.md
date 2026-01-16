# WAF AI Analysis - Correção Definitiva do Timeout 504

## 🎯 Problema Real Identificado

**Erro:** 504 Gateway Timeout no endpoint `waf-dashboard-api`

**Causa Raiz REAL:**
- A ação `ai-analysis` demora **32+ segundos** para completar
- Faz 10+ queries ao banco de dados para coletar dados
- Chama AWS Bedrock (Claude 3.5) que demora 20+ segundos
- API Gateway tem timeout de 30s → Erro 504

**Logs comprovam:**
```
Duration: 32213.35 ms (32 segundos!)
Action: ai-analysis
Queries: 10+ COUNT(*) e GROUP BY
Bedrock call: ~20 segundos
```

## ✅ Solução: Tornar AI Analysis Assíncrono

### Arquitetura Proposta

```
Frontend                    Lambda                      Bedrock
   |                          |                            |
   |--POST /ai-analysis------>|                            |
   |<-----job_id-------------|                            |
   |                          |                            |
   |                          |--Invoke Bedrock---------->|
   |                          |                            |
   |--GET /ai-status?id----->|                            |
   |<-----"processing"-------|                            |
   |                          |                            |
   |                          |<-----AI Response----------|
   |                          |                            |
   |--GET /ai-status?id----->|                            |
   |<-----"complete"+data----|                            |
```

### Implementação

#### 1. Modificar handleAiAnalysis para ser assíncrono

```typescript
/**
 * POST /waf-ai-analysis - Inicia análise AI (assíncrono)
 * Retorna job_id imediatamente
 */
async function handleAiAnalysis(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  logger.info('Starting async WAF AI analysis', { organizationId });
  
  // Criar job em background
  const job = await prisma.backgroundJob.create({
    data: {
      organization_id: organizationId,
      job_type: 'waf_ai_analysis',
      status: 'pending',
      created_at: new Date(),
    },
  });
  
  // Invocar Lambda assíncrona para processar
  const lambdaClient = new LambdaClient({ region: 'us-east-1' });
  await lambdaClient.send(new InvokeCommand({
    FunctionName: 'evo-uds-v3-production-waf-ai-analysis-worker',
    InvocationType: 'Event', // Assíncrono!
    Payload: JSON.stringify({
      jobId: job.id,
      organizationId,
    }),
  }));
  
  return success({
    jobId: job.id,
    status: 'processing',
    message: 'AI analysis started. Use GET /waf-ai-analysis-status?jobId=xxx to check progress.',
  });
}

/**
 * GET /waf-ai-analysis-status - Verifica status da análise
 */
async function handleGetAiAnalysisStatus(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  const params = event.queryStringParameters || {};
  const jobId = params.jobId;
  
  if (!jobId) {
    return error('jobId is required', 400);
  }
  
  const job = await prisma.backgroundJob.findFirst({
    where: {
      id: jobId,
      organization_id: organizationId,
    },
  });
  
  if (!job) {
    return error('Job not found', 404);
  }
  
  if (job.status === 'completed') {
    // Buscar análise completa
    const analysis = await prisma.wafAiAnalysis.findFirst({
      where: {
        organization_id: organizationId,
      },
      orderBy: { created_at: 'desc' },
    });
    
    return success({
      status: 'completed',
      analysis: analysis?.analysis,
      context: analysis?.context,
      riskLevel: analysis?.risk_level,
      completedAt: job.completed_at,
    });
  }
  
  if (job.status === 'failed') {
    return success({
      status: 'failed',
      error: job.error_message,
      failedAt: job.completed_at,
    });
  }
  
  return success({
    status: job.status,
    progress: job.progress || 0,
  });
}
```

#### 2. Criar Lambda Worker para processar AI Analysis

```typescript
/**
 * Lambda Worker: evo-uds-v3-production-waf-ai-analysis-worker
 * Processa análise AI em background (sem timeout do API Gateway)
 */
export async function handler(event: any) {
  const { jobId, organizationId } = event;
  const prisma = getPrismaClient();
  
  try {
    // Atualizar status para processing
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: { status: 'processing', started_at: new Date() },
    });
    
    // Executar análise AI (pode demorar 30+ segundos, sem problema!)
    const result = await performAiAnalysis(prisma, organizationId);
    
    // Salvar resultado
    await prisma.wafAiAnalysis.create({
      data: {
        organization_id: organizationId,
        analysis: result.analysis,
        context: result.context,
        risk_level: result.riskLevel,
        ai_model: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        is_fallback: false,
      },
    });
    
    // Marcar job como completo
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        completed_at: new Date(),
        progress: 100,
      },
    });
    
    return { success: true };
    
  } catch (error) {
    // Marcar job como failed
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        completed_at: new Date(),
        error_message: error.message,
      },
    });
    
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}
```

#### 3. Atualizar Frontend para polling

```typescript
// Frontend: src/hooks/useWafAiAnalysis.ts
export function useWafAiAnalysis() {
  const [status, setStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [analysis, setAnalysis] = useState<any>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  
  // Iniciar análise
  const startAnalysis = async () => {
    setStatus('processing');
    
    const response = await apiClient.invoke('waf-dashboard-api', {
      action: 'ai-analysis',
    });
    
    setJobId(response.jobId);
    
    // Iniciar polling
    pollStatus(response.jobId);
  };
  
  // Polling de status
  const pollStatus = async (jobId: string) => {
    const interval = setInterval(async () => {
      const response = await apiClient.invoke('waf-dashboard-api', {
        action: 'ai-analysis-status',
        jobId,
      });
      
      if (response.status === 'completed') {
        clearInterval(interval);
        setStatus('completed');
        setAnalysis(response.analysis);
      } else if (response.status === 'failed') {
        clearInterval(interval);
        setStatus('failed');
      }
    }, 2000); // Poll a cada 2 segundos
  };
  
  return { status, analysis, startAnalysis };
}
```

## 📊 Benefícios

### Antes (Síncrono)
- ❌ Demora 32+ segundos
- ❌ Erro 504 Gateway Timeout
- ❌ Frontend travado esperando
- ❌ Usuário não sabe o que está acontecendo

### Depois (Assíncrono)
- ✅ Resposta imediata (<100ms)
- ✅ Sem erro 504
- ✅ Frontend mostra progresso
- ✅ Melhor UX com feedback visual

## 🚀 Implementação Rápida (Alternativa Simples)

Se não quiser criar Lambda Worker separada, pode usar a mesma Lambda com timeout maior:

```typescript
// Aumentar timeout da Lambda para 5 minutos
aws lambda update-function-configuration \
  --function-name evo-uds-v3-production-waf-dashboard-api \
  --timeout 300 \
  --region us-east-1

// Invocar de forma assíncrona
const lambdaClient = new LambdaClient({ region: 'us-east-1' });
await lambdaClient.send(new InvokeCommand({
  FunctionName: 'evo-uds-v3-production-waf-dashboard-api',
  InvocationType: 'Event', // Assíncrono!
  Payload: JSON.stringify({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({ action: 'ai-analysis-worker', organizationId }),
  }),
}));
```

## ✅ Solução Imediata (Sem Código)

**Opção 1:** Desabilitar AI Analysis temporariamente no frontend

**Opção 2:** Aumentar timeout e usar cache:
```typescript
// Cache de 5 minutos para AI Analysis
const cacheKey = `waf:ai-analysis:${organizationId}`;
let cached = await redis.get(cacheKey);
if (cached) return success(JSON.parse(cached));

// Executar análise
const result = await performAiAnalysis();

// Cachear por 5 minutos
await redis.setex(cacheKey, 300, JSON.stringify(result));
```

## 📝 Status

- ✅ Problema identificado: AI Analysis demora 32+ segundos
- ✅ Causa raiz: 10+ queries + Bedrock call
- ⏳ Solução proposta: Tornar assíncrono
- ⏳ Implementação: Pendente

---

**Data:** 2026-01-15  
**Versão:** 1.0  
**Prioridade:** ALTA - Bloqueia uso do WAF Dashboard
