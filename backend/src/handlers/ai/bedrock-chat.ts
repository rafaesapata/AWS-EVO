/**
 * Bedrock Chat Handler - AI Copilot usando AWS Bedrock
 * Versão Enterprise com contexto completo da plataforma
 */

import { getHttpMethod } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

interface RequestBody {
  message: string;
  history?: Array<{ role: string; content: string }>;
  context?: any;
  accountId?: string;
  organizationId?: string;
}

interface PlatformContext {
  costs: {
    total7Days: number;
    total30Days: number;
    dailyAverage: number;
    topServices: Array<{ service: string; cost: number }>;
    trend: 'increasing' | 'decreasing' | 'stable';
    trendPercentage: number;
  };
  security: {
    criticalFindings: number;
    highFindings: number;
    mediumFindings: number;
    lowFindings: number;
    totalFindings: number;
    recentAlerts: number;
    securityScore: number;
    topVulnerabilities: string[];
  };
  compliance: {
    totalViolations: number;
    openViolations: number;
    frameworks: string[];
    complianceScore: number;
  };
  resources: {
    totalResources: number;
    wasteDetections: number;
    estimatedSavings: number;
    driftDetections: number;
  };
  accounts: {
    total: number;
    active: number;
    names: string[];
  };
  recentActivity: {
    lastScan: string | null;
    lastCostUpdate: string | null;
    pendingJobs: number;
  };
}

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🤖 Bedrock Chat started', { requestId: context.awsRequestId });
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: RequestBody = event.body ? JSON.parse(event.body) : {};
    const { message, history, accountId } = body;
    
    if (!message) {
      return badRequest('Message is required');
    }
    
    const prisma = getPrismaClient();
    
    // Buscar contexto simplificado da plataforma (queries otimizadas)
    const platformContext = await fetchPlatformContextFast(prisma, organizationId, accountId);
    
    logger.info('📊 Platform context fetched', { 
      organizationId,
      costs: platformContext.costs.total7Days,
      findings: platformContext.security.totalFindings
    });

    // Construir prompt compacto COM histórico
    const compactPrompt = buildCompactPrompt(platformContext, user, message, history);

    // Call Bedrock with Amazon Titan Text Express (via VPC Endpoint)
    const bedrockResponse = await bedrockClient.send(new InvokeModelCommand({
      modelId: 'amazon.titan-text-express-v1',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        inputText: compactPrompt,
        textGenerationConfig: {
          maxTokenCount: 512,
          temperature: 0.4,
          topP: 0.9
        }
      })
    }));

    const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
    let aiResponse = responseBody.results?.[0]?.outputText || 'Desculpe, não consegui processar sua solicitação.';
    
    // Limpeza agressiva: cortar qualquer conversa inventada
    // Corta no primeiro sinal de pergunta/resposta inventada
    const cutPatterns = [
      /\n\s*Pergunta[:\s]/i,
      /\n\s*Resposta[:\s]/i,
      /\n\s*User[:\s]/i,
      /\n\s*Human[:\s]/i,
      /\n\s*Usuário[:\s]/i,
      /\n\s*Assistant[:\s]/i,
      /\n\s*Como posso/i,
      /\n\s*O que você/i,
      /\n\s*Você pode me/i
    ];
    
    for (const pattern of cutPatterns) {
      const match = aiResponse.match(pattern);
      if (match && match.index) {
        aiResponse = aiResponse.substring(0, match.index);
      }
    }
    
    aiResponse = aiResponse.trim();

    // Generate contextual suggestions
    const suggestions = generateContextualSuggestions(message, platformContext);

    // Log conversation for audit (async, don't wait)
    prisma.auditLog.create({
      data: {
        organization_id: organizationId,
        user_id: user.sub,
        action: 'AI_CHAT',
        resource_type: 'copilot',
        details: { 
          message: message.substring(0, 200),
          contextSummary: {
            costs: platformContext.costs.total7Days,
            findings: platformContext.security.totalFindings,
            resources: platformContext.resources.totalResources
          }
        }
      }
    });

    logger.info('✅ Bedrock Chat completed', { requestId: context.awsRequestId });
    
    return success({
      response: aiResponse,
      suggestions,
      context: {
        costs: platformContext.costs,
        security: platformContext.security,
        compliance: platformContext.compliance,
        resources: platformContext.resources
      }
    });
    
  } catch (err) {
    logger.error('❌ Bedrock Chat error', err as Error);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

/**
 * Busca contexto completo da plataforma do banco de dados
 */
async function fetchPlatformContext(
  prisma: any, 
  organizationId: string, 
  accountId?: string
): Promise<PlatformContext> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Buscar todas as queries em paralelo para performance
  const [
    costs7Days,
    costs30Days,
    costsPrevious7Days,
    costsByService,
    findings,
    securityAlerts,
    complianceViolations,
    wasteDetections,
    driftDetections,
    resources,
    awsAccounts,
    recentScans,
    pendingJobs,
    securityPosture
  ] = await Promise.all([
    // Custos últimos 7 dias
    prisma.dailyCost.aggregate({
      where: {
        organization_id: organizationId,
        ...(accountId && { aws_account_id: accountId }),
        date: { gte: sevenDaysAgo }
      },
      _sum: { cost: true }
    }),
    
    // Custos últimos 30 dias
    prisma.dailyCost.aggregate({
      where: {
        organization_id: organizationId,
        ...(accountId && { aws_account_id: accountId }),
        date: { gte: thirtyDaysAgo }
      },
      _sum: { cost: true }
    }),
    
    // Custos 7 dias anteriores (para calcular tendência)
    prisma.dailyCost.aggregate({
      where: {
        organization_id: organizationId,
        ...(accountId && { aws_account_id: accountId }),
        date: { gte: fourteenDaysAgo, lt: sevenDaysAgo }
      },
      _sum: { cost: true }
    }),
    
    // Top serviços por custo
    prisma.dailyCost.groupBy({
      by: ['service'],
      where: {
        organization_id: organizationId,
        ...(accountId && { aws_account_id: accountId }),
        date: { gte: sevenDaysAgo },
        service: { not: null }
      },
      _sum: { cost: true },
      orderBy: { _sum: { cost: 'desc' } },
      take: 10
    }),
    
    // Findings de segurança
    prisma.finding.groupBy({
      by: ['severity'],
      where: {
        organization_id: organizationId,
        status: { not: 'resolved' }
      },
      _count: true
    }),
    
    // Alertas de segurança recentes
    prisma.alert.count({
      where: {
        organization_id: organizationId,
        resolved_at: null,
        triggered_at: { gte: sevenDaysAgo }
      }
    }),
    
    // Violações de compliance
    prisma.complianceViolation.groupBy({
      by: ['framework', 'status'],
      where: { organization_id: organizationId },
      _count: true
    }),
    
    // Detecções de desperdício
    prisma.wasteDetection.aggregate({
      where: {
        organization_id: organizationId
      },
      _count: true,
      _sum: { estimated_savings: true }
    }),
    
    // Detecções de drift
    prisma.driftDetection.count({
      where: {
        organization_id: organizationId,
        detected_at: { gte: sevenDaysAgo }
      }
    }),
    
    // Total de recursos
    prisma.resourceInventory.count({
      where: {
        organization_id: organizationId,
        ...(accountId && { aws_account_id: accountId })
      }
    }),
    
    // Contas AWS
    prisma.awsCredential.findMany({
      where: {
        organization_id: organizationId,
        is_active: true
      },
      select: { account_name: true, account_id: true }
    }),
    
    // Scans recentes
    prisma.securityScan.findFirst({
      where: { organization_id: organizationId },
      orderBy: { created_at: 'desc' },
      select: { completed_at: true, status: true }
    }),
    
    // Jobs pendentes
    prisma.backgroundJob.count({
      where: {
        organization_id: organizationId,
        status: { in: ['pending', 'running'] }
      }
    }),
    
    // Security posture mais recente
    prisma.securityPosture.findFirst({
      where: { organization_id: organizationId },
      orderBy: { calculated_at: 'desc' }
    })
  ]);

  // Processar findings por severidade
  const findingsBySeverity = findings.reduce((acc: any, f: any) => {
    acc[f.severity?.toLowerCase() || 'unknown'] = f._count;
    return acc;
  }, {});

  // Calcular tendência de custos
  const current7DayCost = costs7Days._sum?.cost || 0;
  const previous7DayCost = costsPrevious7Days._sum?.cost || 0;
  let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
  let trendPercentage = 0;
  
  if (previous7DayCost > 0) {
    trendPercentage = ((current7DayCost - previous7DayCost) / previous7DayCost) * 100;
    if (trendPercentage > 5) trend = 'increasing';
    else if (trendPercentage < -5) trend = 'decreasing';
  }

  // Processar compliance
  const totalViolations = complianceViolations.reduce((sum: number, v: any) => sum + v._count, 0);
  const openViolations = complianceViolations
    .filter((v: any) => v.status === 'OPEN')
    .reduce((sum: number, v: any) => sum + v._count, 0);
  const frameworks: string[] = Array.from(new Set(complianceViolations.map((v: any) => String(v.framework || ''))));

  // Calcular scores
  const totalFindings = Object.values(findingsBySeverity).reduce((a: number, b: any) => a + (b || 0), 0);
  const securityScore = securityPosture?.overall_score || calculateSecurityScore(findingsBySeverity);
  const complianceScore = totalViolations > 0 
    ? Math.round(((totalViolations - openViolations) / totalViolations) * 100) 
    : 100;

  return {
    costs: {
      total7Days: Number(current7DayCost.toFixed(2)),
      total30Days: Number((costs30Days._sum?.cost || 0).toFixed(2)),
      dailyAverage: Number((current7DayCost / 7).toFixed(2)),
      topServices: costsByService.map((s: any) => ({
        service: s.service || 'Unknown',
        cost: Number((s._sum?.cost || 0).toFixed(2))
      })),
      trend,
      trendPercentage: Number(trendPercentage.toFixed(1))
    },
    security: {
      criticalFindings: findingsBySeverity.critical || 0,
      highFindings: findingsBySeverity.high || 0,
      mediumFindings: findingsBySeverity.medium || 0,
      lowFindings: findingsBySeverity.low || 0,
      totalFindings,
      recentAlerts: securityAlerts,
      securityScore,
      topVulnerabilities: [] // Pode ser expandido
    },
    compliance: {
      totalViolations,
      openViolations,
      frameworks,
      complianceScore
    },
    resources: {
      totalResources: resources,
      wasteDetections: wasteDetections._count || 0,
      estimatedSavings: Number((wasteDetections._sum?.estimated_savings || 0).toFixed(2)),
      driftDetections
    },
    accounts: {
      total: awsAccounts.length,
      active: awsAccounts.length,
      names: awsAccounts.map((a: any) => a.account_name || a.account_id).filter(Boolean)
    },
    recentActivity: {
      lastScan: recentScans?.completed_at?.toISOString() || null,
      lastCostUpdate: null,
      pendingJobs
    }
  };
}

/**
 * Calcula score de segurança baseado nos findings
 */
function calculateSecurityScore(findings: any): number {
  const weights = { critical: 25, high: 15, medium: 5, low: 1 };
  const maxScore = 100;
  
  const penalty = 
    (findings.critical || 0) * weights.critical +
    (findings.high || 0) * weights.high +
    (findings.medium || 0) * weights.medium +
    (findings.low || 0) * weights.low;
  
  return Math.max(0, Math.min(100, maxScore - penalty));
}

/**
 * Busca contexto RÁPIDO da plataforma (queries otimizadas e paralelas)
 */
async function fetchPlatformContextFast(
  prisma: any, 
  organizationId: string, 
  accountId?: string
): Promise<PlatformContext> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Apenas queries essenciais em paralelo
  const [costs7Days, findings, wasteDetections, awsAccounts] = await Promise.all([
    prisma.dailyCost.aggregate({
      where: {
        organization_id: organizationId,
        ...(accountId && { aws_account_id: accountId }),
        date: { gte: sevenDaysAgo }
      },
      _sum: { cost: true }
    }),
    prisma.finding.groupBy({
      by: ['severity'],
      where: {
        organization_id: organizationId,
        status: { not: 'resolved' }
      },
      _count: true
    }),
    prisma.wasteDetection.aggregate({
      where: { organization_id: organizationId },
      _count: true,
      _sum: { estimated_savings: true }
    }),
    prisma.awsCredential.count({
      where: { organization_id: organizationId, is_active: true }
    })
  ]);

  const findingsBySeverity = findings.reduce((acc: any, f: any) => {
    acc[f.severity?.toLowerCase() || 'unknown'] = f._count;
    return acc;
  }, {});

  const totalFindings = Object.values(findingsBySeverity).reduce((a: number, b: any) => a + (b || 0), 0);
  const current7DayCost = costs7Days._sum?.cost || 0;

  return {
    costs: {
      total7Days: Number(current7DayCost.toFixed(2)),
      total30Days: 0,
      dailyAverage: Number((current7DayCost / 7).toFixed(2)),
      topServices: [],
      trend: 'stable',
      trendPercentage: 0
    },
    security: {
      criticalFindings: findingsBySeverity.critical || 0,
      highFindings: findingsBySeverity.high || 0,
      mediumFindings: findingsBySeverity.medium || 0,
      lowFindings: findingsBySeverity.low || 0,
      totalFindings,
      recentAlerts: 0,
      securityScore: calculateSecurityScore(findingsBySeverity),
      topVulnerabilities: []
    },
    compliance: { totalViolations: 0, openViolations: 0, frameworks: [], complianceScore: 100 },
    resources: {
      totalResources: 0,
      wasteDetections: wasteDetections._count || 0,
      estimatedSavings: Number((wasteDetections._sum?.estimated_savings || 0).toFixed(2)),
      driftDetections: 0
    },
    accounts: { total: awsAccounts, active: awsAccounts, names: [] },
    recentActivity: { lastScan: null, lastCostUpdate: null, pendingJobs: 0 }
  };
}

/**
 * Constrói prompt COMPACTO mas INTELIGENTE com histórico de conversa
 */
function buildCompactPrompt(ctx: PlatformContext, user: any, message: string, history?: Array<{ role: string; content: string }>): string {
  // Construir histórico de conversa se existir
  let conversationHistory = '';
  if (history && history.length > 0) {
    conversationHistory = '\nHistórico da conversa:\n' + 
      history.slice(-4).map(h => `${h.role === 'user' ? 'Usuário' : 'Assistente'}: ${h.content.substring(0, 150)}`).join('\n') +
      '\n';
  }

  return `Contexto AWS do usuário:
Custos 7d: $${ctx.costs.total7Days.toFixed(2)} | Média/dia: $${ctx.costs.dailyAverage.toFixed(2)}
Segurança: ${ctx.security.criticalFindings} críticos, ${ctx.security.highFindings} altos (${ctx.security.totalFindings} total) | Score: ${ctx.security.securityScore}/100
Economia potencial: $${ctx.resources.estimatedSavings.toFixed(2)} | Contas: ${ctx.accounts.total}
${conversationHistory}
Tarefa: Responda APENAS a pergunta abaixo em português. Use o histórico para entender o contexto. NÃO invente perguntas. Dê UMA resposta direta e útil baseada nos dados reais.

Pergunta atual: ${message}

Resposta:`;
}

/**
 * Constrói o system prompt com contexto completo (versão legada)
 */
function buildSystemPrompt(ctx: PlatformContext, user: any): string {
  const userName = user.name || user.email?.split('@')[0] || 'usuário';
  
  return `Você é o EVO Copilot AI, um assistente especializado em AWS, FinOps e Segurança Cloud de nível enterprise.

## SOBRE VOCÊ
- Você é um especialista certificado em AWS (Solutions Architect, Security, DevOps)
- Especialista em FinOps e otimização de custos cloud
- Analista de segurança com conhecimento em compliance (SOC2, ISO27001, CIS, NIST)
- Sempre responde em português brasileiro de forma clara, objetiva e profissional

## CONTEXTO ATUAL DA ORGANIZAÇÃO DO USUÁRIO "${userName}"

### 💰 CUSTOS AWS
- Total últimos 7 dias: $${ctx.costs.total7Days.toLocaleString('en-US', { minimumFractionDigits: 2 })}
- Total últimos 30 dias: $${ctx.costs.total30Days.toLocaleString('en-US', { minimumFractionDigits: 2 })}
- Média diária: $${ctx.costs.dailyAverage.toLocaleString('en-US', { minimumFractionDigits: 2 })}
- Tendência: ${ctx.costs.trend === 'increasing' ? '📈 Aumentando' : ctx.costs.trend === 'decreasing' ? '📉 Diminuindo' : '➡️ Estável'} (${ctx.costs.trendPercentage > 0 ? '+' : ''}${ctx.costs.trendPercentage}%)
${ctx.costs.topServices.length > 0 ? `- Top serviços por custo:\n${ctx.costs.topServices.slice(0, 5).map((s, i) => `  ${i + 1}. ${s.service}: $${s.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`).join('\n')}` : '- Sem dados de serviços disponíveis'}

### 🛡️ SEGURANÇA
- Score de Segurança: ${ctx.security.securityScore}/100
- Findings Críticos: ${ctx.security.criticalFindings}
- Findings Altos: ${ctx.security.highFindings}
- Findings Médios: ${ctx.security.mediumFindings}
- Findings Baixos: ${ctx.security.lowFindings}
- Total de Findings Abertos: ${ctx.security.totalFindings}
- Alertas Recentes (7 dias): ${ctx.security.recentAlerts}

### ✅ COMPLIANCE
- Score de Compliance: ${ctx.compliance.complianceScore}%
- Violações Abertas: ${ctx.compliance.openViolations} de ${ctx.compliance.totalViolations} total
${ctx.compliance.frameworks.length > 0 ? `- Frameworks monitorados: ${ctx.compliance.frameworks.join(', ')}` : ''}

### 📦 RECURSOS & OTIMIZAÇÃO
- Total de Recursos Monitorados: ${ctx.resources.totalResources}
- Desperdícios Detectados: ${ctx.resources.wasteDetections}
- Economia Potencial Estimada: $${ctx.resources.estimatedSavings.toLocaleString('en-US', { minimumFractionDigits: 2 })}
- Drifts de Configuração: ${ctx.resources.driftDetections}

### 🏢 CONTAS AWS
- Total de Contas: ${ctx.accounts.total}
${ctx.accounts.names.length > 0 ? `- Contas: ${ctx.accounts.names.slice(0, 5).join(', ')}${ctx.accounts.names.length > 5 ? ` e mais ${ctx.accounts.names.length - 5}` : ''}` : ''}

### 📊 ATIVIDADE RECENTE
- Jobs Pendentes: ${ctx.recentActivity.pendingJobs}
${ctx.recentActivity.lastScan ? `- Último Scan: ${new Date(ctx.recentActivity.lastScan).toLocaleString('pt-BR')}` : ''}

## INSTRUÇÕES
1. Use os dados acima para fornecer análises precisas e contextualizadas
2. Quando o usuário perguntar sobre custos, use os valores reais fornecidos
3. Para segurança, baseie-se nos findings e scores reais
4. Sempre forneça recomendações acionáveis e específicas
5. Se não houver dados suficientes, informe e sugira ações para coletar mais dados
6. Priorize sempre: Segurança > Compliance > Custos > Performance
7. Use emojis moderadamente para melhorar a legibilidade
8. Formate respostas com markdown quando apropriado (listas, negrito, etc.)

## FORMATO DE RESPOSTA
- Seja direto e objetivo
- Use bullet points para listas
- Destaque números importantes
- Inclua recomendações práticas
- Sugira próximos passos quando relevante`;
}

/**
 * Gera sugestões contextuais baseadas na mensagem e contexto
 */
function generateContextualSuggestions(message: string, ctx: PlatformContext): string[] {
  const lowerMessage = message.toLowerCase();
  const suggestions: string[] = [];
  
  // Sugestões baseadas em custos
  if (lowerMessage.includes('custo') || lowerMessage.includes('gasto') || lowerMessage.includes('economia')) {
    if (ctx.costs.trend === 'increasing') {
      suggestions.push('Por que meus custos estão aumentando?');
    }
    if (ctx.resources.estimatedSavings > 0) {
      suggestions.push(`Como economizar os $${ctx.resources.estimatedSavings.toFixed(2)} identificados?`);
    }
    suggestions.push('Analise oportunidades de Reserved Instances');
    suggestions.push('Quais serviços posso otimizar?');
  }
  
  // Sugestões baseadas em segurança
  else if (lowerMessage.includes('segurança') || lowerMessage.includes('security') || lowerMessage.includes('vulnerabilidade')) {
    if (ctx.security.criticalFindings > 0) {
      suggestions.push(`Detalhe os ${ctx.security.criticalFindings} findings críticos`);
    }
    if (ctx.security.highFindings > 0) {
      suggestions.push('Como remediar os findings de alta severidade?');
    }
    suggestions.push('Analise as permissões IAM');
    suggestions.push('Verifique configurações de rede');
  }
  
  // Sugestões baseadas em compliance
  else if (lowerMessage.includes('compliance') || lowerMessage.includes('conformidade') || lowerMessage.includes('auditoria')) {
    if (ctx.compliance.openViolations > 0) {
      suggestions.push(`Como resolver as ${ctx.compliance.openViolations} violações abertas?`);
    }
    suggestions.push('Gere relatório de compliance');
    suggestions.push('Verifique CIS Benchmarks');
  }
  
  // Sugestões baseadas em recursos
  else if (lowerMessage.includes('recurso') || lowerMessage.includes('otimiz') || lowerMessage.includes('performance')) {
    if (ctx.resources.wasteDetections > 0) {
      suggestions.push(`Analise os ${ctx.resources.wasteDetections} desperdícios detectados`);
    }
    if (ctx.resources.driftDetections > 0) {
      suggestions.push(`Verifique os ${ctx.resources.driftDetections} drifts de configuração`);
    }
    suggestions.push('Quais recursos estão subutilizados?');
  }
  
  // Sugestões padrão
  else {
    if (ctx.security.criticalFindings > 0) {
      suggestions.push(`Analise os ${ctx.security.criticalFindings} findings críticos de segurança`);
    }
    if (ctx.costs.total7Days > 0) {
      suggestions.push('Analise meus custos da última semana');
    }
    if (ctx.resources.estimatedSavings > 0) {
      suggestions.push(`Como economizar $${ctx.resources.estimatedSavings.toFixed(2)}?`);
    }
    suggestions.push('Qual é minha postura de segurança atual?');
  }
  
  return suggestions.slice(0, 4);
}
