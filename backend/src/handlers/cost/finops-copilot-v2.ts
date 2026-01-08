import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { getPrismaClient } from '../../lib/database.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getOrigin } from '../../lib/middleware.js';
import { finopsCopilotSchema } from '../../lib/schemas.js';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { CostExplorerClient, GetCostAndUsageCommand, GetCostForecastCommand } from '@aws-sdk/client-cost-explorer';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });

interface CostData {
  totalCost: number;
  byService: Record<string, number>;
  byRegion: Record<string, number>;
  trend: { date: string; cost: number }[];
  forecast?: { date: string; cost: number }[];
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  let organizationId: string;
  let userId: string;
  
  try {
    const user = getUserFromEvent(event);
    userId = user.sub || user.id || 'unknown';
    organizationId = getOrganizationId(user);
  } catch (authError: any) {
    logger.error('Authentication error', authError);
    return error('Unauthorized', 401, undefined, origin);
  }

  try {
    // Validar input com Zod
    const parseResult = finopsCopilotSchema.safeParse(
      event.body ? JSON.parse(event.body) : {}
    );
    
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      return badRequest(`Validation error: ${errorMessages}`, undefined, origin);
    }
    
    const { question, awsAccountId, context: queryContext = 'general', timeRange } = parseResult.data;

    const prisma = getPrismaClient();
    const stsClient = new STSClient({});

    // Buscar conta AWS - FILTRAR POR ORGANIZATION_ID
    const awsAccount = await prisma.awsAccount.findFirst({
      where: { 
        id: awsAccountId,
        organization_id: organizationId  // CRITICAL: Multi-tenancy filter
      },
      include: { organization: true }
    });

    if (!awsAccount) {
      return error('AWS Account not found', 404, undefined, origin);
    }

    // Assume role na conta do cliente (usando campos corretos do schema)
    // ExternalId é obrigatório para prevenir confused deputy attacks
    // Usar organization_id como ExternalId padrão
    const externalId = awsAccount.organization_id;
    const assumeRoleResponse = await stsClient.send(new AssumeRoleCommand({
      RoleArn: `arn:aws:iam::${awsAccount.account_id}:role/EvoUdsRole`,
      RoleSessionName: 'FinOpsCopilotV2Session',
      ExternalId: externalId,
      DurationSeconds: 3600
    }));

    const credentials = {
      accessKeyId: assumeRoleResponse.Credentials!.AccessKeyId!,
      secretAccessKey: assumeRoleResponse.Credentials!.SecretAccessKey!,
      sessionToken: assumeRoleResponse.Credentials!.SessionToken!
    };

    const ceClient = new CostExplorerClient({ region: 'us-east-1', credentials });

    // Coletar dados de custo
    const costData = await collectCostData(ceClient, timeRange);

    // Buscar histórico de otimizações - FILTRAR POR ORGANIZATION_ID
    const optimizations = await prisma.costOptimization.findMany({
      where: { 
        aws_account_id: awsAccountId,
        organization_id: organizationId  // CRITICAL: Multi-tenancy filter
      },
      orderBy: { created_at: 'desc' },
      take: 10
    });

    // Buscar alertas de custo ativos
    const costAlerts = await prisma.alert.findMany({
      where: {
        organization_id: organizationId,  // Use organizationId from auth
        severity: { in: ['CRITICAL', 'HIGH'] }
      }
    });

    // Preparar contexto para o AI
    const aiContext = buildAIContext(costData, optimizations, costAlerts, awsAccount.account_name);

    // Chamar Bedrock para resposta inteligente
    const aiResponse = await generateAIResponse(question, aiContext, queryContext);

    // Registrar interação
    await prisma.copilotInteraction.create({
      data: {
        organization_id: awsAccount.organization_id,
        user_id: userId,
        query: question,
        response: aiResponse.answer,
        context: { costData, queryContext } as any
      }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        answer: aiResponse.answer,
        insights: aiResponse.insights,
        recommendations: aiResponse.recommendations,
        relatedData: {
          currentCost: costData.totalCost,
          topServices: Object.entries(costData.byService)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5),
          trend: costData.trend,
          forecast: costData.forecast
        },
        sources: aiResponse.sources
      })
    };
  } catch (error) {
    logger.error('FinOps Copilot V2 error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', details: String(error) })
    };
  }
};

async function collectCostData(ceClient: CostExplorerClient, timeRange?: { start: string; end: string }): Promise<CostData> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const start = timeRange?.start || startDate.toISOString().split('T')[0];
  const end = timeRange?.end || endDate.toISOString().split('T')[0];

  // Custo por serviço
  const serviceResponse = await ceClient.send(new GetCostAndUsageCommand({
    TimePeriod: { Start: start, End: end },
    Granularity: 'MONTHLY',
    Metrics: ['UnblendedCost'],
    GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }]
  }));

  const byService: Record<string, number> = {};
  let totalCost = 0;

  for (const result of serviceResponse.ResultsByTime || []) {
    for (const group of result.Groups || []) {
      const service = group.Keys?.[0] || 'Unknown';
      const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
      byService[service] = (byService[service] || 0) + cost;
      totalCost += cost;
    }
  }

  // Custo por região
  const regionResponse = await ceClient.send(new GetCostAndUsageCommand({
    TimePeriod: { Start: start, End: end },
    Granularity: 'MONTHLY',
    Metrics: ['UnblendedCost'],
    GroupBy: [{ Type: 'DIMENSION', Key: 'REGION' }]
  }));

  const byRegion: Record<string, number> = {};
  for (const result of regionResponse.ResultsByTime || []) {
    for (const group of result.Groups || []) {
      const region = group.Keys?.[0] || 'Unknown';
      const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
      byRegion[region] = (byRegion[region] || 0) + cost;
    }
  }

  // Tendência diária
  const trendResponse = await ceClient.send(new GetCostAndUsageCommand({
    TimePeriod: { Start: start, End: end },
    Granularity: 'DAILY',
    Metrics: ['UnblendedCost']
  }));

  const trend = (trendResponse.ResultsByTime || []).map(r => ({
    date: r.TimePeriod?.Start || '',
    cost: parseFloat(r.Total?.UnblendedCost?.Amount || '0')
  }));

  // Forecast
  let forecast: { date: string; cost: number }[] = [];
  try {
    const forecastEnd = new Date();
    forecastEnd.setDate(forecastEnd.getDate() + 30);
    
    const forecastResponse = await ceClient.send(new GetCostForecastCommand({
      TimePeriod: { Start: end, End: forecastEnd.toISOString().split('T')[0] },
      Granularity: 'DAILY',
      Metric: 'UNBLENDED_COST'
    }));

    forecast = (forecastResponse.ForecastResultsByTime || []).map(r => ({
      date: r.TimePeriod?.Start || '',
      cost: parseFloat(r.MeanValue || '0')
    }));
  } catch {
    logger.info('Forecast not available');
  }

  return { totalCost, byService, byRegion, trend, forecast };
}

function buildAIContext(
  costData: CostData,
  optimizations: unknown[],
  alerts: unknown[],
  accountName: string
): string {
  return `
AWS Account: ${accountName}
Current Month Cost: $${costData.totalCost.toFixed(2)}

Top Services by Cost:
${Object.entries(costData.byService)
  .sort(([,a], [,b]) => b - a)
  .slice(0, 10)
  .map(([service, cost]) => `- ${service}: $${cost.toFixed(2)}`)
  .join('\n')}

Cost by Region:
${Object.entries(costData.byRegion)
  .sort(([,a], [,b]) => b - a)
  .map(([region, cost]) => `- ${region}: $${cost.toFixed(2)}`)
  .join('\n')}

Recent Optimizations: ${optimizations.length}
Active Cost Alerts: ${alerts.length}

30-day Forecast: $${costData.forecast?.reduce((sum, f) => sum + f.cost, 0).toFixed(2) || 'N/A'}
  `.trim();
}

async function generateAIResponse(
  question: string,
  context: string,
  queryContext: string
): Promise<{ answer: string; insights: string[]; recommendations: string[]; sources: string[] }> {
  const prompt = `You are a FinOps expert assistant. Answer the following question about AWS costs.

Context:
${context}

Query Type: ${queryContext}
Question: ${question}

Provide a helpful, concise answer with specific insights and actionable recommendations.
Format your response as JSON with: answer, insights (array), recommendations (array), sources (array).`;

  try {
    const response = await bedrockClient.send(new InvokeModelCommand({
      modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    }));

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const content = responseBody.content[0].text;
    
    try {
      return JSON.parse(content);
    } catch {
      return {
        answer: content,
        insights: [],
        recommendations: [],
        sources: ['AWS Cost Explorer', 'Historical Data']
      };
    }
  } catch (error) {
    logger.error('Bedrock error:', error);
    return {
      answer: `Based on your cost data, your current monthly spend is $${context.match(/\$[\d.]+/)?.[0] || 'N/A'}. ${question.toLowerCase().includes('optimize') ? 'Consider reviewing your top services for optimization opportunities.' : 'Please check the cost breakdown for more details.'}`,
      insights: ['AI analysis temporarily unavailable'],
      recommendations: ['Review top spending services', 'Check for unused resources'],
      sources: ['AWS Cost Explorer']
    };
  }
}
