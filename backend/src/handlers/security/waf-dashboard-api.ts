/**
 * WAF Dashboard API Lambda Handler
 * 
 * Provides REST API endpoints for the WAF monitoring dashboard:
 * - GET /waf-events - List events with filters
 * - GET /waf-metrics - Aggregated metrics
 * - GET /waf-top-attackers - Top attacking IPs
 * - GET /waf-attack-types - Distribution by attack type
 * - GET /waf-geo-distribution - Geographic distribution
 * - POST /waf-block-ip - Manually block an IP
 * - DELETE /waf-unblock-ip - Unblock an IP
 * 
 * DEMO MODE: Suporta modo demonstração para organizações com demo_mode=true
 */

import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logging.js';
import { WAFV2Client } from '@aws-sdk/client-wafv2';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { blockIp, unblockIp, DEFAULT_AUTO_BLOCK_CONFIG } from '../../lib/waf/auto-blocker.js';
import { isOrganizationInDemoMode, generateDemoWafEvents } from '../../lib/demo-data-service.js';

// Bedrock client for AI analysis
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Query parameters for events endpoint
interface EventsQueryParams {
  startDate?: string;
  endDate?: string;
  severity?: string;
  threatType?: string;
  sourceIp?: string;
  action?: string;
  page?: string;
  limit?: string;
}

// Metrics response
interface WafMetrics {
  totalRequests: number;
  blockedRequests: number;
  allowedRequests: number;
  countedRequests: number;
  uniqueIps: number;
  uniqueCountries: number;
  criticalThreats: number;
  highThreats: number;
  mediumThreats: number;
  lowThreats: number;
  activeCampaigns: number;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const method = getHttpMethod(event);
  const path = getHttpPath(event);
  
  if (method === 'OPTIONS') {
    return corsOptions();
  }
  
  const prisma = getPrismaClient();
  
  try {
    // Parse body for action-based routing (used by frontend apiClient.invoke)
    let body: any = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch {
        // Body is not JSON, ignore
      }
    }
    
    // Special handling for background worker (no auth required)
    // Background Lambda invocations don't have auth claims
    if (body.action === 'ai-analysis-background') {
      const bgOrgId = body.organizationId;
      if (!bgOrgId) {
        return error('organizationId is required for background analysis', 400);
      }
      logger.info('Background AI analysis worker invoked (no auth)', { organizationId: bgOrgId });
      return await handleAiAnalysisBackground(event, prisma, bgOrgId);
    }
    
    // All other actions require authentication
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    logger.info('WAF Dashboard API request', { 
      organizationId,
      method,
      path,
      requestId: context.awsRequestId 
    });
    
    // Check for Demo Mode (FAIL-SAFE: returns false on any error)
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    
    if (isDemo === true) {
      // Return demo data for organizations in demo mode
      logger.info('Returning demo WAF data', {
        organizationId,
        action: body.action,
        isDemo: true
      });
      
      return handleDemoWafRequest(body.action || 'events');
    }
    
    // Action-based routing from body (preferred for frontend)
    if (body.action) {
      switch (body.action) {
        case 'events':
          return await handleGetEvents(event, prisma, organizationId);
        case 'metrics':
          return await handleGetMetrics(event, prisma, organizationId);
        case 'timeline':
          return await handleGetTimeline(event, prisma, organizationId);
        case 'top-attackers':
          return await handleGetTopAttackers(event, prisma, organizationId);
        case 'attack-types':
          return await handleGetAttackTypes(event, prisma, organizationId);
        case 'geo-distribution':
          return await handleGetGeoDistribution(event, prisma, organizationId);
        case 'block-ip':
          return await handleBlockIp(event, prisma, organizationId);
        case 'unblock-ip':
          return await handleUnblockIp(event, prisma, organizationId);
        case 'blocked-ips':
          return await handleGetBlockedIps(event, prisma, organizationId);
        case 'campaigns':
          return await handleGetCampaigns(event, prisma, organizationId);
        case 'config':
          return await handleGetConfig(prisma, organizationId);
        case 'update-config':
          return await handleUpdateConfig(event, prisma, organizationId);
        case 'get-monitoring-configs':
        case 'get-configs': // Alias for backwards compatibility
          return await handleGetMonitoringConfigs(event, prisma, organizationId);
        case 'diagnose':
          return await handleDiagnose(event, prisma, organizationId);
        case 'fix-subscription':
          return await handleFixSubscription(event, prisma, organizationId);
        case 'ai-analysis':
          return await handleAiAnalysis(event, prisma, organizationId);
        case 'get-latest-analysis':
          return await handleGetLatestAnalysis(event, prisma, organizationId);
        case 'get-analysis-history':
          return await handleGetAnalysisHistory(event, prisma, organizationId);
        case 'threat-stats':
          return await handleGetThreatStats(event, prisma, organizationId);
        case 'get-alert-config':
          return await handleGetAlertConfig(event, prisma, organizationId);
        case 'save-alert-config':
          return await handleSaveAlertConfig(event, prisma, organizationId);
        case 'evaluate-rules':
          return await handleEvaluateRules(event, prisma, organizationId);
        case 'init-ai-analysis-table':
          return await handleInitAiAnalysisTable(prisma);
        case 'list-wafs':
        case 'setup':
        case 'disable':
          return await proxyToWafSetupMonitoring(event);
        default:
          return error(`Unknown action: ${body.action}`, 400);
      }
    }
    
    // Path-based routing (fallback for direct API Gateway calls)
    if (path.includes('waf-events')) {
      return await handleGetEvents(event, prisma, organizationId);
    }
    
    if (path.includes('waf-metrics')) {
      return await handleGetMetrics(event, prisma, organizationId);
    }
    
    if (path.includes('waf-top-attackers')) {
      return await handleGetTopAttackers(event, prisma, organizationId);
    }
    
    if (path.includes('waf-attack-types')) {
      return await handleGetAttackTypes(event, prisma, organizationId);
    }
    
    if (path.includes('waf-geo-distribution')) {
      return await handleGetGeoDistribution(event, prisma, organizationId);
    }
    
    if (path.includes('waf-block-ip') && method === 'POST') {
      return await handleBlockIp(event, prisma, organizationId);
    }
    
    if (path.includes('waf-unblock-ip') && method === 'DELETE') {
      return await handleUnblockIp(event, prisma, organizationId);
    }
    
    if (path.includes('waf-blocked-ips')) {
      return await handleGetBlockedIps(event, prisma, organizationId);
    }
    
    if (path.includes('waf-campaigns')) {
      return await handleGetCampaigns(event, prisma, organizationId);
    }
    
    if (path.includes('waf-config')) {
      if (method === 'GET') {
        return await handleGetConfig(prisma, organizationId);
      }
      if (method === 'POST' || method === 'PUT') {
        return await handleUpdateConfig(event, prisma, organizationId);
      }
    }
    
    return error('Unknown endpoint', 404);
    
  } catch (err) {
    logger.error('WAF Dashboard API error', err as Error, { 
      path,
      requestId: context.awsRequestId 
    });
    return error('An unexpected error occurred. Please try again.', 500);
  }
}

/**
 * Handle demo WAF requests - returns realistic demo data
 */
function handleDemoWafRequest(action: string): APIGatewayProxyResultV2 {
  const demoEvents = generateDemoWafEvents(50);
  
  switch (action) {
    case 'events':
      return success({
        _isDemo: true,
        events: demoEvents,
        pagination: {
          page: 1,
          limit: 50,
          total: demoEvents.length,
          totalPages: 1,
        },
      });
      
    case 'metrics':
      const blocked = demoEvents.filter(e => e.action === 'BLOCK').length;
      const allowed = demoEvents.filter(e => e.action === 'ALLOW').length;
      const counted = demoEvents.filter(e => e.action === 'COUNT').length;
      const uniqueIps = new Set(demoEvents.map(e => e.source_ip)).size;
      const uniqueCountries = new Set(demoEvents.map(e => e.country)).size;
      
      return success({
        _isDemo: true,
        metrics: {
          totalRequests: demoEvents.length,
          blockedRequests: blocked,
          allowedRequests: allowed,
          countedRequests: counted,
          uniqueIps,
          uniqueCountries,
          criticalThreats: demoEvents.filter(e => e.severity === 'critical').length,
          highThreats: demoEvents.filter(e => e.severity === 'high').length,
          mediumThreats: demoEvents.filter(e => e.severity === 'medium').length,
          lowThreats: demoEvents.filter(e => e.severity === 'low').length,
          activeCampaigns: 2,
        },
        previousPeriod: {
          totalRequests: Math.floor(demoEvents.length * 0.85),
          blockedRequests: Math.floor(blocked * 0.7),
          allowedRequests: Math.floor(allowed * 0.9),
          countedRequests: Math.floor(counted * 0.8),
          uniqueIps: Math.floor(uniqueIps * 0.6),
          uniqueCountries: Math.floor(uniqueCountries * 0.8),
          criticalThreats: 2,
          highThreats: 5,
          mediumThreats: 12,
          lowThreats: 20,
        },
        period: '24h',
      });
      
    case 'timeline':
      // Generate hourly timeline for last 24 hours
      const timeline = [];
      const now = Date.now();
      for (let i = 23; i >= 0; i--) {
        const hour = new Date(now - i * 60 * 60 * 1000);
        timeline.push({
          hour: hour.toISOString(),
          blocked: Math.floor(Math.random() * 20) + 5,
          allowed: Math.floor(Math.random() * 100) + 50,
        });
      }
      return success({ _isDemo: true, timeline, period: '24h' });
      
    case 'top-attackers':
      const attackerCounts: Record<string, number> = {};
      demoEvents.filter(e => e.action === 'BLOCK').forEach(e => {
        attackerCounts[e.source_ip] = (attackerCounts[e.source_ip] || 0) + 1;
      });
      const topAttackers = Object.entries(attackerCounts)
        .map(([ip, count]) => ({ sourceIp: ip, blockedRequests: count, country: demoEvents.find(e => e.source_ip === ip)?.country || 'XX' }))
        .sort((a, b) => b.blockedRequests - a.blockedRequests)
        .slice(0, 10);
      return success({ _isDemo: true, topAttackers, period: '24h' });
      
    case 'attack-types':
      const ruleCounts: Record<string, number> = {};
      demoEvents.filter(e => e.action === 'BLOCK').forEach(e => {
        const threatType = e.threat_type || e.rule_id || 'unknown';
        ruleCounts[threatType] = (ruleCounts[threatType] || 0) + 1;
      });
      const attackTypes = Object.entries(ruleCounts)
        .map(([type, count]) => ({ type, count }));
      return success({ _isDemo: true, attackTypes, period: '24h' });
      
    case 'geo-distribution':
      const countryCounts: Record<string, number> = {};
      demoEvents.filter(e => e.action === 'BLOCK').forEach(e => {
        countryCounts[e.country] = (countryCounts[e.country] || 0) + 1;
      });
      const geoDistribution = Object.entries(countryCounts)
        .map(([country, blockedRequests]) => ({ country, blockedRequests }))
        .sort((a, b) => b.blockedRequests - a.blockedRequests);
      return success({ _isDemo: true, geoDistribution, period: '24h' });
      
    case 'blocked-ips':
      return success({
        _isDemo: true,
        blockedIps: [
          { ip: '192.168.1.100', reason: 'SQLi Attack', blockedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), expiresAt: new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString() },
          { ip: '10.0.0.50', reason: 'XSS Attack', blockedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), expiresAt: new Date(Date.now() + 19 * 60 * 60 * 1000).toISOString() },
          { ip: '172.16.0.25', reason: 'Rate Limit Exceeded', blockedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), expiresAt: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString() }
        ]
      });
      
    case 'campaigns':
      return success({
        _isDemo: true,
        campaigns: [
          { id: 'demo-campaign-1', name: 'SQLi Campaign', status: 'active', startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), attackCount: 156, uniqueIps: 12 },
          { id: 'demo-campaign-2', name: 'Bot Network', status: 'active', startedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), attackCount: 89, uniqueIps: 45 }
        ]
      });
      
    case 'config':
      return success({
        _isDemo: true,
        config: {
          snsEnabled: false,
          slackEnabled: false,
          inAppEnabled: true,
          campaignThreshold: 10,
          campaignWindowMins: 5,
          autoBlockEnabled: false,
          autoBlockThreshold: 50,
          blockDurationHours: 24,
        },
      });
    case 'get-configs':
    case 'get-monitoring-configs':
      return success({
        _isDemo: true,
        configs: [{
          id: 'demo-config',
          webAclArn: 'arn:aws:wafv2:us-east-1:123456789012:regional/webacl/demo-waf/demo-id',
          webAclName: 'Demo WAF',
          filterMode: 'block_only',
          isActive: true,
          lastEventAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          eventsToday: 250,
          blockedToday: 180,
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        }],
        hasActiveConfig: true,
      });
      
    case 'get-latest-analysis':
      return success({
        _isDemo: true,
        analysis: {
          id: 'demo-analysis-1',
          createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          summary: 'Análise de demonstração: Detectadas 3 ameaças críticas e 8 de alta severidade nas últimas 24 horas. Recomenda-se revisar as regras de bloqueio para IPs suspeitos.',
          threats: [
            { type: 'SQLi', count: 45, severity: 'critical' },
            { type: 'XSS', count: 32, severity: 'high' },
            { type: 'Bot', count: 78, severity: 'medium' }
          ],
          recommendations: [
            'Habilitar bloqueio automático para IPs com mais de 10 tentativas de SQLi',
            'Revisar regras de rate limiting para endpoints de autenticação',
            'Considerar geo-blocking para países com alto volume de ataques'
          ]
        }
      });
      
    case 'threat-stats':
      return success({
        _isDemo: true,
        stats: {
          last24h: { total: 250, blocked: 180, critical: 3, high: 8 },
          last7d: { total: 1580, blocked: 1200, critical: 15, high: 45 },
          last30d: { total: 6200, blocked: 4800, critical: 52, high: 180 }
        }
      });
      
    case 'block-ip':
    case 'unblock-ip':
    case 'setup':
    case 'disable':
      return success({
        _isDemo: true,
        message: 'Operação não disponível em modo demonstração',
        success: false
      });
      
    case 'list-wafs':
      return success({
        _isDemo: true,
        webAcls: [
          { Name: 'Demo-WAF', ARN: 'arn:aws:wafv2:us-east-1:123456789012:regional/webacl/demo-waf/demo-id', Scope: 'REGIONAL', Region: 'us-east-1', isMonitored: true },
        ],
        regionsScanned: ['us-east-1'],
      });
      
    default:
      return success({
        _isDemo: true,
        message: 'Dados de demonstração',
        events: demoEvents.slice(0, 10)
      });
  }
}

/**
 * Proxy actions (list-wafs, setup, disable) to the waf-setup-monitoring Lambda.
 * This allows the frontend to route all WAF operations through waf-dashboard-api,
 * avoiding route mismatch issues between sandbox and production API Gateway configs.
 */
async function proxyToWafSetupMonitoring(
  event: AuthorizedEvent
): Promise<APIGatewayProxyResultV2> {
  const env = process.env.ENVIRONMENT || process.env.STAGE || 'sandbox';
  const projectName = process.env.PROJECT_NAME || 'evo-uds-v3';
  const functionName = `${projectName}-${env}-waf-setup-monitoring`;
  
  logger.info('Proxying to waf-setup-monitoring', { functionName });
  
  try {
    // Dynamic import to avoid breaking the Lambda if @aws-sdk/client-lambda is not bundled
    const { LambdaClient, InvokeCommand } = await import('@aws-sdk/client-lambda');
    const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
    
    const response = await lambdaClient.send(new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(event)),
    }));
    
    if (response.FunctionError) {
      const errorPayload = response.Payload ? JSON.parse(new TextDecoder().decode(response.Payload)) : {};
      logger.error('waf-setup-monitoring invocation error', { functionError: response.FunctionError, errorPayload });
      return error('WAF setup operation failed. Please try again.', 500);
    }
    
    if (response.Payload) {
      const result = JSON.parse(new TextDecoder().decode(response.Payload));
      return result;
    }
    
    return error('No response from WAF setup', 500);
  } catch (err: any) {
    logger.error('Failed to invoke waf-setup-monitoring', err as Error);
    return error('WAF setup service unavailable. Please try again.', 503);
  }
}

/**
 * GET /waf-events - List WAF events with filters
 */
async function handleGetEvents(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  const params = (event.queryStringParameters || {}) as EventsQueryParams;
  
  // Also check body for parameters (used by frontend apiClient.invoke)
  let bodyParams: any = {};
  if (event.body) {
    try {
      bodyParams = JSON.parse(event.body);
    } catch {
      // Ignore parse errors
    }
  }
  
  const page = parseInt(params.page || bodyParams.page || '1', 10);
  const limit = Math.min(parseInt(params.limit || bodyParams.limit || '50', 10), 10000); // Increased from 1000 to 10000 to capture historical blocked events
  const skip = (page - 1) * limit;
  
  // Build where clause
  const where: any = { organization_id: organizationId };
  
  // Filter by AWS account if provided
  const accountId = bodyParams.accountId;
  if (accountId) {
    where.aws_account_id = accountId;
  }
  
  const startDate = params.startDate || bodyParams.startDate;
  const endDate = params.endDate || bodyParams.endDate;
  const severity = params.severity || bodyParams.severity;
  const threatType = params.threatType || bodyParams.threatType;
  const sourceIp = params.sourceIp || bodyParams.sourceIp;
  // Support both 'action' and 'filterAction' for filtering (filterAction avoids conflict with API action)
  const action = params.action || bodyParams.filterAction || bodyParams.actionFilter;
  
  if (startDate) {
    where.timestamp = { ...where.timestamp, gte: new Date(startDate) };
  }
  if (endDate) {
    where.timestamp = { ...where.timestamp, lte: new Date(endDate) };
  }
  if (severity) {
    where.severity = severity;
  }
  if (threatType) {
    where.threat_type = threatType;
  }
  if (sourceIp) {
    where.source_ip = sourceIp;
  }
  if (action) {
    where.action = action;
  }
  
  const [events, total] = await Promise.all([
    prisma.wafEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        timestamp: true,
        action: true,
        source_ip: true,
        country: true,
        user_agent: true,
        uri: true,
        http_method: true,
        rule_matched: true,
        threat_type: true,
        severity: true,
        is_campaign: true,
      },
    }),
    prisma.wafEvent.count({ where }),
  ]);
  
  return success({
    events,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

/**
 * GET /waf-metrics - Aggregated metrics
 * OPTIMIZED: Uses raw SQL for better performance and reduced connection pool usage
 */
async function handleGetMetrics(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  // Parse body for accountId filter
  let accountId: string | undefined;
  if (event.body) {
    try {
      const body = JSON.parse(event.body);
      accountId = body.accountId;
    } catch {
      // Ignore parse errors
    }
  }
  
  // Get metrics for last 24 hours (current period)
  const since = new Date();
  since.setHours(since.getHours() - 24);
  
  // Get metrics for 24-48 hours ago (previous period for trend calculation)
  const previousSince = new Date();
  previousSince.setHours(previousSince.getHours() - 48);
  const previousUntil = new Date();
  previousUntil.setHours(previousUntil.getHours() - 24);
  
  try {
    // Build SQL with optional accountId filter
    let metricsResult;
    let previousMetricsResult;
    
    if (accountId) {
      // Use a single optimized raw SQL query to get current period metrics with accountId filter
      metricsResult = await prisma.$queryRaw<Array<{
        total_requests: bigint;
        blocked_requests: bigint;
        allowed_requests: bigint;
        counted_requests: bigint;
        unique_attackers: bigint;
        unique_countries: bigint;
        critical_threats: bigint;
        high_threats: bigint;
        medium_threats: bigint;
        low_threats: bigint;
      }>>`
        SELECT 
          COUNT(*) as total_requests,
          COUNT(*) FILTER (WHERE action = 'BLOCK') as blocked_requests,
          COUNT(*) FILTER (WHERE action = 'ALLOW') as allowed_requests,
          COUNT(*) FILTER (WHERE action = 'COUNT') as counted_requests,
          COUNT(DISTINCT CASE WHEN action = 'BLOCK' THEN source_ip END) as unique_attackers,
          COUNT(DISTINCT CASE WHEN action = 'BLOCK' THEN country END) as unique_countries,
          COUNT(*) FILTER (WHERE severity = 'critical') as critical_threats,
          COUNT(*) FILTER (WHERE severity = 'high') as high_threats,
          COUNT(*) FILTER (WHERE severity = 'medium') as medium_threats,
          COUNT(*) FILTER (WHERE severity = 'low') as low_threats
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid
          AND aws_account_id = ${accountId}::uuid
          AND timestamp >= ${since}
      `;
      
      // Get previous period metrics for trend calculation with accountId filter
      previousMetricsResult = await prisma.$queryRaw<Array<{
        total_requests: bigint;
        blocked_requests: bigint;
        allowed_requests: bigint;
        counted_requests: bigint;
        unique_attackers: bigint;
        unique_countries: bigint;
        critical_threats: bigint;
        high_threats: bigint;
        medium_threats: bigint;
        low_threats: bigint;
      }>>`
        SELECT 
          COUNT(*) as total_requests,
          COUNT(*) FILTER (WHERE action = 'BLOCK') as blocked_requests,
          COUNT(*) FILTER (WHERE action = 'ALLOW') as allowed_requests,
          COUNT(*) FILTER (WHERE action = 'COUNT') as counted_requests,
          COUNT(DISTINCT CASE WHEN action = 'BLOCK' THEN source_ip END) as unique_attackers,
          COUNT(DISTINCT CASE WHEN action = 'BLOCK' THEN country END) as unique_countries,
          COUNT(*) FILTER (WHERE severity = 'critical') as critical_threats,
          COUNT(*) FILTER (WHERE severity = 'high') as high_threats,
          COUNT(*) FILTER (WHERE severity = 'medium') as medium_threats,
          COUNT(*) FILTER (WHERE severity = 'low') as low_threats
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid
          AND aws_account_id = ${accountId}::uuid
          AND timestamp >= ${previousSince}
          AND timestamp < ${previousUntil}
      `;
    } else {
      // Use a single optimized raw SQL query to get current period metrics (all accounts)
      metricsResult = await prisma.$queryRaw<Array<{
        total_requests: bigint;
        blocked_requests: bigint;
        allowed_requests: bigint;
        counted_requests: bigint;
        unique_attackers: bigint;
        unique_countries: bigint;
        critical_threats: bigint;
        high_threats: bigint;
        medium_threats: bigint;
        low_threats: bigint;
      }>>`
        SELECT 
          COUNT(*) as total_requests,
          COUNT(*) FILTER (WHERE action = 'BLOCK') as blocked_requests,
          COUNT(*) FILTER (WHERE action = 'ALLOW') as allowed_requests,
          COUNT(*) FILTER (WHERE action = 'COUNT') as counted_requests,
          COUNT(DISTINCT CASE WHEN action = 'BLOCK' THEN source_ip END) as unique_attackers,
          COUNT(DISTINCT CASE WHEN action = 'BLOCK' THEN country END) as unique_countries,
          COUNT(*) FILTER (WHERE severity = 'critical') as critical_threats,
          COUNT(*) FILTER (WHERE severity = 'high') as high_threats,
          COUNT(*) FILTER (WHERE severity = 'medium') as medium_threats,
          COUNT(*) FILTER (WHERE severity = 'low') as low_threats
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid
          AND timestamp >= ${since}
      `;
      
      // Get previous period metrics for trend calculation (all accounts)
      previousMetricsResult = await prisma.$queryRaw<Array<{
        total_requests: bigint;
        blocked_requests: bigint;
        allowed_requests: bigint;
        counted_requests: bigint;
        unique_attackers: bigint;
        unique_countries: bigint;
        critical_threats: bigint;
        high_threats: bigint;
        medium_threats: bigint;
        low_threats: bigint;
      }>>`
        SELECT 
          COUNT(*) as total_requests,
          COUNT(*) FILTER (WHERE action = 'BLOCK') as blocked_requests,
          COUNT(*) FILTER (WHERE action = 'ALLOW') as allowed_requests,
          COUNT(*) FILTER (WHERE action = 'COUNT') as counted_requests,
          COUNT(DISTINCT CASE WHEN action = 'BLOCK' THEN source_ip END) as unique_attackers,
          COUNT(DISTINCT CASE WHEN action = 'BLOCK' THEN country END) as unique_countries,
          COUNT(*) FILTER (WHERE severity = 'critical') as critical_threats,
          COUNT(*) FILTER (WHERE severity = 'high') as high_threats,
          COUNT(*) FILTER (WHERE severity = 'medium') as medium_threats,
          COUNT(*) FILTER (WHERE severity = 'low') as low_threats
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid
          AND timestamp >= ${previousSince}
          AND timestamp < ${previousUntil}
      `;
    }
    
    // Get active campaigns count separately (different table)
    // Note: WafAttackCampaign does NOT have aws_account_id field
    // Campaigns are per-organization, not per-account
    const activeCampaigns = await prisma.wafAttackCampaign.count({
      where: {
        organization_id: organizationId,
        status: 'active',
      },
    });
    
    const row = metricsResult[0] || {
      total_requests: BigInt(0),
      blocked_requests: BigInt(0),
      allowed_requests: BigInt(0),
      counted_requests: BigInt(0),
      unique_attackers: BigInt(0),
      unique_countries: BigInt(0),
      critical_threats: BigInt(0),
      high_threats: BigInt(0),
      medium_threats: BigInt(0),
      low_threats: BigInt(0),
    };
    
    const previousRow = previousMetricsResult[0] || {
      total_requests: BigInt(0),
      blocked_requests: BigInt(0),
      allowed_requests: BigInt(0),
      counted_requests: BigInt(0),
      unique_attackers: BigInt(0),
      unique_countries: BigInt(0),
      critical_threats: BigInt(0),
      high_threats: BigInt(0),
      medium_threats: BigInt(0),
      low_threats: BigInt(0),
    };
    
    const metrics: WafMetrics = {
      totalRequests: Number(row.total_requests),
      blockedRequests: Number(row.blocked_requests),
      allowedRequests: Number(row.allowed_requests),
      countedRequests: Number(row.counted_requests),
      uniqueIps: Number(row.unique_attackers),
      uniqueCountries: Number(row.unique_countries),
      criticalThreats: Number(row.critical_threats),
      highThreats: Number(row.high_threats),
      mediumThreats: Number(row.medium_threats),
      lowThreats: Number(row.low_threats),
      activeCampaigns,
    };
    
    const previousPeriod = {
      totalRequests: Number(previousRow.total_requests),
      blockedRequests: Number(previousRow.blocked_requests),
      allowedRequests: Number(previousRow.allowed_requests),
      countedRequests: Number(previousRow.counted_requests),
      uniqueIps: Number(previousRow.unique_attackers),
      uniqueCountries: Number(previousRow.unique_countries),
      criticalThreats: Number(previousRow.critical_threats),
      highThreats: Number(previousRow.high_threats),
      mediumThreats: Number(previousRow.medium_threats),
      lowThreats: Number(previousRow.low_threats),
    };
    
    // Debug logging to track metrics vs events discrepancy
    logger.info('WAF Metrics calculated', {
      organizationId,
      since: since.toISOString(),
      metrics: {
        totalRequests: metrics.totalRequests,
        blockedRequests: metrics.blockedRequests,
        allowedRequests: metrics.allowedRequests,
        uniqueIps: metrics.uniqueIps,
      }
    });
    
    return success({ metrics, previousPeriod, period: '24h' });
  } catch (err) {
    logger.error('Failed to get WAF metrics', err as Error, { organizationId });
    
    // Return empty metrics on error instead of failing
    const emptyMetrics: WafMetrics = {
      totalRequests: 0,
      blockedRequests: 0,
      allowedRequests: 0,
      countedRequests: 0,
      uniqueIps: 0,
      uniqueCountries: 0,
      criticalThreats: 0,
      highThreats: 0,
      mediumThreats: 0,
      lowThreats: 0,
      activeCampaigns: 0,
    };
    
    return success({ metrics: emptyMetrics, period: '24h', error: 'Failed to load metrics' });
  }
}

/**
 * GET /waf-top-attackers - Top attacking IPs
 * OPTIMIZED: Uses raw SQL with LIMIT for better performance
 */
async function handleGetTopAttackers(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  const params = event.queryStringParameters || {};
  let bodyParams: any = {};
  if (event.body) {
    try {
      bodyParams = JSON.parse(event.body);
    } catch {
      // Ignore parse errors
    }
  }
  const limit = Math.min(parseInt(params.limit || bodyParams.limit || '10', 10), 100);
  const accountId = bodyParams.accountId;
  
  const since = new Date();
  since.setHours(since.getHours() - 24);
  
  try {
    // Use raw SQL for better performance with optional accountId filter
    let topAttackers;
    
    if (accountId) {
      topAttackers = await prisma.$queryRaw<Array<{
        source_ip: string;
        country: string | null;
        blocked_count: bigint;
      }>>`
        SELECT 
          source_ip,
          country,
          COUNT(*) as blocked_count
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid
          AND aws_account_id = ${accountId}::uuid
          AND timestamp >= ${since}
          AND action = 'BLOCK'
        GROUP BY source_ip, country
        ORDER BY blocked_count DESC
        LIMIT ${limit}
      `;
    } else {
      topAttackers = await prisma.$queryRaw<Array<{
        source_ip: string;
        country: string | null;
        blocked_count: bigint;
      }>>`
        SELECT 
          source_ip,
          country,
          COUNT(*) as blocked_count
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid
          AND timestamp >= ${since}
          AND action = 'BLOCK'
        GROUP BY source_ip, country
        ORDER BY blocked_count DESC
        LIMIT ${limit}
      `;
    }
    
    return success({
      topAttackers: topAttackers.map(item => ({
        sourceIp: item.source_ip,
        country: item.country,
        blockedRequests: Number(item.blocked_count),
      })),
      period: '24h',
    });
  } catch (err) {
    logger.error('Failed to get top attackers', err as Error, { organizationId });
    return success({ topAttackers: [], period: '24h', error: 'Failed to load data' });
  }
}

/**
 * GET /waf-attack-types - Distribution by attack type
 * OPTIMIZED: Uses raw SQL for better performance
 */
async function handleGetAttackTypes(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  // Parse body for accountId filter
  let accountId: string | undefined;
  if (event.body) {
    try {
      const body = JSON.parse(event.body);
      accountId = body.accountId;
    } catch {
      // Ignore parse errors
    }
  }
  
  const since = new Date();
  since.setHours(since.getHours() - 24);
  
  try {
    let attackTypes;
    
    if (accountId) {
      attackTypes = await prisma.$queryRaw<Array<{
        threat_type: string;
        count: bigint;
      }>>`
        SELECT 
          threat_type,
          COUNT(*) as count
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid
          AND aws_account_id = ${accountId}::uuid
          AND timestamp >= ${since}
          AND threat_type IS NOT NULL
        GROUP BY threat_type
        ORDER BY count DESC
      `;
    } else {
      attackTypes = await prisma.$queryRaw<Array<{
        threat_type: string;
        count: bigint;
      }>>`
        SELECT 
          threat_type,
          COUNT(*) as count
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid
          AND timestamp >= ${since}
          AND threat_type IS NOT NULL
        GROUP BY threat_type
        ORDER BY count DESC
      `;
    }
    
    return success({
      attackTypes: attackTypes.map(item => ({
        type: item.threat_type,
        count: Number(item.count),
      })),
      period: '24h',
    });
  } catch (err) {
    logger.error('Failed to get attack types', err as Error, { organizationId });
    return success({ attackTypes: [], period: '24h', error: 'Failed to load data' });
  }
}

/**
 * GET /waf-geo-distribution - Geographic distribution
 * OPTIMIZED: Uses raw SQL for better performance
 */
async function handleGetGeoDistribution(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  // Parse body for accountId filter
  let accountId: string | undefined;
  if (event.body) {
    try {
      const body = JSON.parse(event.body);
      accountId = body.accountId;
    } catch {
      // Ignore parse errors
    }
  }
  
  const since = new Date();
  since.setHours(since.getHours() - 24);
  
  try {
    let geoDistribution;
    
    if (accountId) {
      geoDistribution = await prisma.$queryRaw<Array<{
        country: string;
        blocked_count: bigint;
      }>>`
        SELECT 
          country,
          COUNT(*) as blocked_count
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid
          AND aws_account_id = ${accountId}::uuid
          AND timestamp >= ${since}
          AND action = 'BLOCK'
          AND country IS NOT NULL
        GROUP BY country
        ORDER BY blocked_count DESC
      `;
    } else {
      geoDistribution = await prisma.$queryRaw<Array<{
        country: string;
        blocked_count: bigint;
      }>>`
        SELECT 
          country,
          COUNT(*) as blocked_count
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid
          AND timestamp >= ${since}
          AND action = 'BLOCK'
          AND country IS NOT NULL
        GROUP BY country
        ORDER BY blocked_count DESC
      `;
    }
    
    return success({
      geoDistribution: geoDistribution.map(item => ({
        country: item.country,
        blockedRequests: Number(item.blocked_count),
      })),
      period: '24h',
    });
  } catch (err) {
    logger.error('Failed to get geo distribution', err as Error, { organizationId });
    return success({ geoDistribution: [], period: '24h', error: 'Failed to load data' });
  }
}

/**
 * POST /waf-block-ip - Manually block an IP
 */
async function handleBlockIp(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  const body = event.body ? JSON.parse(event.body) : {};
  const { ipAddress, reason, accountId } = body;
  
  if (!ipAddress) {
    return error('Missing required parameter: ipAddress');
  }
  
  // Get AWS credentials for WAF access
  const account = await prisma.awsCredential.findFirst({
    where: { 
      id: accountId,
      organization_id: organizationId, 
      is_active: true 
    },
  });
  
  if (!account) {
    return error('AWS account not found');
  }
  
  const resolvedCreds = await resolveAwsCredentials(account, 'us-east-1');
  const wafClient = new WAFV2Client({
    region: 'us-east-1',
    credentials: toAwsCredentials(resolvedCreds),
  });
  
  const result = await blockIp(
    prisma,
    wafClient,
    organizationId,
    ipAddress,
    reason || 'Manual block',
    'manual',
    DEFAULT_AUTO_BLOCK_CONFIG
  );
  
  if (!result.success) {
    return error(result.message);
  }
  
  return success(result);
}

/**
 * DELETE /waf-unblock-ip - Unblock an IP
 */
async function handleUnblockIp(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  // Support both query params (DELETE) and body (POST via action routing)
  const params = event.queryStringParameters || {};
  let bodyParams: any = {};
  if (event.body) {
    try {
      bodyParams = JSON.parse(event.body);
    } catch {
      // Ignore parse errors
    }
  }
  const ipAddress = params.ipAddress || bodyParams.ipAddress;
  const accountId = params.accountId || bodyParams.accountId;
  
  if (!ipAddress) {
    return error('Missing required parameter: ipAddress');
  }
  
  // Get AWS credentials for WAF access
  const account = await prisma.awsCredential.findFirst({
    where: { 
      id: accountId,
      organization_id: organizationId, 
      is_active: true 
    },
  });
  
  if (!account) {
    return error('AWS account not found');
  }
  
  const resolvedCreds = await resolveAwsCredentials(account, 'us-east-1');
  const wafClient = new WAFV2Client({
    region: 'us-east-1',
    credentials: toAwsCredentials(resolvedCreds),
  });
  
  const result = await unblockIp(
    prisma,
    wafClient,
    organizationId,
    ipAddress,
    DEFAULT_AUTO_BLOCK_CONFIG
  );
  
  if (!result.success) {
    return error(result.message);
  }
  
  return success(result);
}

/**
 * GET /waf-blocked-ips - List blocked IPs
 * Note: WafBlockedIp does NOT have aws_account_id field
 * Blocked IPs are per-organization, not per-account
 */
async function handleGetBlockedIps(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  // Note: accountId is not used because WafBlockedIp doesn't have aws_account_id field
  
  const blockedIps = await prisma.wafBlockedIp.findMany({
    where: {
      organization_id: organizationId,
      is_active: true,
    },
    orderBy: { blocked_at: 'desc' },
  });
  
  return success({
    blockedIps: blockedIps.map(ip => ({
      ipAddress: ip.ip_address,
      reason: ip.reason,
      blockedBy: ip.blocked_by,
      blockedAt: ip.blocked_at,
      expiresAt: ip.expires_at,
    })),
  });
}

/**
 * GET /waf-campaigns - List attack campaigns
 */
async function handleGetCampaigns(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  const params = event.queryStringParameters || {};
  const status = params.status || 'active';
  
  const campaigns = await prisma.wafAttackCampaign.findMany({
    where: {
      organization_id: organizationId,
      status,
    },
    orderBy: { start_time: 'desc' },
    take: 50,
  });
  
  return success({
    campaigns: campaigns.map(c => ({
      id: c.id,
      sourceIp: c.source_ip,
      startTime: c.start_time,
      endTime: c.end_time,
      eventCount: c.event_count,
      attackTypes: c.attack_types,
      severity: c.severity,
      status: c.status,
      autoBlocked: c.auto_blocked,
    })),
  });
}

/**
 * GET /waf-config - Get alert configuration
 */
async function handleGetConfig(
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  const config = await prisma.wafAlertConfig.findUnique({
    where: { organization_id: organizationId },
  });
  
  if (!config) {
    return success({
      config: {
        snsEnabled: false,
        slackEnabled: false,
        inAppEnabled: true,
        campaignThreshold: 10,
        campaignWindowMins: 5,
        autoBlockEnabled: false,
        autoBlockThreshold: 50,
        blockDurationHours: 24,
      },
    });
  }
  
  return success({
    config: {
      snsEnabled: config.sns_enabled,
      snsTopicArn: config.sns_topic_arn,
      slackEnabled: config.slack_enabled,
      slackWebhookUrl: config.slack_webhook_url ? '***' : null, // Mask webhook URL
      inAppEnabled: config.in_app_enabled,
      campaignThreshold: config.campaign_threshold,
      campaignWindowMins: config.campaign_window_mins,
      autoBlockEnabled: config.auto_block_enabled,
      autoBlockThreshold: config.auto_block_threshold,
      blockDurationHours: config.block_duration_hours,
    },
  });
}

/**
 * POST/PUT /waf-config - Update alert configuration
 */
async function handleUpdateConfig(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  const body = event.body ? JSON.parse(event.body) : {};
  
  const config = await prisma.wafAlertConfig.upsert({
    where: { organization_id: organizationId },
    create: {
      organization_id: organizationId,
      sns_enabled: body.snsEnabled ?? false,
      sns_topic_arn: body.snsTopicArn,
      slack_enabled: body.slackEnabled ?? false,
      slack_webhook_url: body.slackWebhookUrl === '***' ? undefined : body.slackWebhookUrl,
      in_app_enabled: body.inAppEnabled ?? true,
      campaign_threshold: body.campaignThreshold ?? 10,
      campaign_window_mins: body.campaignWindowMins ?? 5,
      auto_block_enabled: body.autoBlockEnabled ?? false,
      auto_block_threshold: body.autoBlockThreshold ?? 50,
      block_duration_hours: body.blockDurationHours ?? 24,
    },
    update: {
      sns_enabled: body.snsEnabled,
      sns_topic_arn: body.snsTopicArn,
      slack_enabled: body.slackEnabled,
      // Skip update if masked value '***' is sent back — preserve the real URL
      slack_webhook_url: body.slackWebhookUrl === '***' ? undefined : body.slackWebhookUrl,
      in_app_enabled: body.inAppEnabled,
      campaign_threshold: body.campaignThreshold,
      campaign_window_mins: body.campaignWindowMins,
      auto_block_enabled: body.autoBlockEnabled,
      auto_block_threshold: body.autoBlockThreshold,
      block_duration_hours: body.blockDurationHours,
    },
  });
  
  return success({ message: 'Configuration updated', config });
}

/**
 * GET /waf-monitoring-configs - Get WAF monitoring configurations
 */
async function handleGetMonitoringConfigs(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  // Parse body for accountId filter
  let accountId: string | undefined;
  if (event.body) {
    try {
      const body = JSON.parse(event.body);
      accountId = body.accountId;
    } catch {
      // Ignore parse errors
    }
  }
  
  logger.info('Fetching WAF monitoring configs', { organizationId, accountId });
  
  const where: any = { organization_id: organizationId };
  if (accountId) {
    where.aws_account_id = accountId;
  }
  
  const configs = await prisma.wafMonitoringConfig.findMany({
    where,
    orderBy: { created_at: 'desc' },
  });
  
  logger.info('WAF monitoring configs fetched', { 
    organizationId, 
    accountId,
    count: configs.length,
    activeCount: configs.filter(c => c.is_active).length 
  });
  
  return success({
    configs: configs.map((c: any) => ({
      id: c.id,
      webAclArn: c.web_acl_arn,
      webAclName: c.web_acl_name,
      filterMode: c.filter_mode,
      isActive: c.is_active,
      lastEventAt: c.last_event_at,
      eventsToday: c.events_today,
      blockedToday: c.blocked_today,
      createdAt: c.created_at,
    })),
    hasActiveConfig: configs.some((c: any) => c.is_active),
  });
}

/**
 * POST /waf-diagnose - Diagnose WAF monitoring setup
 */
async function handleDiagnose(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body || '{}');
  const { configId } = body;
  
  if (!configId) {
    return error('configId is required', 400);
  }
  
  logger.info('Starting WAF monitoring diagnosis', { organizationId, configId });
  
  // Get the configuration
  const config = await prisma.wafMonitoringConfig.findFirst({
    where: {
      id: configId,
      organization_id: organizationId,
    },
  });
  
  if (!config) {
    return error('Configuration not found', 404);
  }
  
  const diagnosticResults: any = {
    configId: config.id,
    webAclName: config.web_acl_name,
    webAclArn: config.web_acl_arn,
    awsAccountId: config.aws_account_id,
    checks: [] as any[],
    overallStatus: 'unknown' as 'success' | 'warning' | 'error' | 'unknown',
  };
  
  // Extract region from Web ACL ARN (arn:aws:wafv2:REGION:ACCOUNT:regional/webacl/NAME/ID)
  const arnParts = config.web_acl_arn.split(':');
  const region = arnParts[3] || 'us-east-1';
  diagnosticResults.region = region;
  
  try {
    // Get AWS credentials for customer account
    const awsCredential = await prisma.awsCredential.findFirst({
      where: {
        id: config.aws_account_id,
        organization_id: organizationId,
      },
    });
    
    if (!awsCredential) {
      diagnosticResults.checks.push({
        name: 'AWS Credentials',
        status: 'error',
        message: 'AWS credentials not found for this account',
      });
      diagnosticResults.overallStatus = 'error';
      return success(diagnosticResults);
    }
    
    const credentials = await resolveAwsCredentials(awsCredential, region);
    const awsCredentials = toAwsCredentials(credentials);
    
    // Import AWS SDK clients
    const { CloudWatchLogsClient, DescribeLogGroupsCommand, DescribeSubscriptionFiltersCommand, DescribeLogStreamsCommand } = await import('@aws-sdk/client-cloudwatch-logs');
    const { WAFV2Client, GetLoggingConfigurationCommand } = await import('@aws-sdk/client-wafv2');
    
    // Check 1: WAF Logging Configuration
    logger.info('Checking WAF logging configuration', { webAclArn: config.web_acl_arn });
    let actualLogDestination: string | null = null;
    
    try {
      const wafClient = new WAFV2Client({
        region: region,
        credentials: awsCredentials,
      });
      
      const loggingConfig = await wafClient.send(
        new GetLoggingConfigurationCommand({
          ResourceArn: config.web_acl_arn,
        })
      );
      
      if (loggingConfig.LoggingConfiguration) {
        const destinations = loggingConfig.LoggingConfiguration.LogDestinationConfigs || [];
        actualLogDestination = destinations[0] || null;
        
        diagnosticResults.checks.push({
          name: 'WAF Logging',
          status: 'success',
          message: 'WAF logging is enabled',
          details: {
            destinations: destinations,
            actualLogGroup: actualLogDestination,
          },
        });
      } else {
        diagnosticResults.checks.push({
          name: 'WAF Logging',
          status: 'error',
          message: 'WAF logging is not configured',
          recommendation: 'Enable logging in AWS WAF Console → Web ACL → Logging and metrics',
        });
      }
    } catch (err: any) {
      if (err.name === 'WAFNonexistentItemException') {
        diagnosticResults.checks.push({
          name: 'WAF Logging',
          status: 'error',
          message: 'WAF logging is not enabled',
          recommendation: 'Enable logging in AWS WAF Console → Web ACL → Logging and metrics',
        });
      } else {
        throw err;
      }
    }
    
    // Check 2: CloudWatch Log Group
    logger.info('Checking CloudWatch Log Group');
    const cwlClient = new CloudWatchLogsClient({
      region: region,
      credentials: awsCredentials,
    });
    
    // Use the ACTUAL log destination from WAF config, or fall back to config/constructed name
    let logGroupName = config.log_group_name || `aws-waf-logs-${config.web_acl_name}`;
    
    // If we got the actual destination from WAF, extract the log group name from it
    if (actualLogDestination) {
      // Format: arn:aws:logs:region:account:log-group:LOG_GROUP_NAME
      const arnParts = actualLogDestination.split(':');
      if (arnParts.length >= 7) {
        const extractedLogGroup = arnParts.slice(6).join(':');
        if (extractedLogGroup && extractedLogGroup !== logGroupName) {
          logger.info('Using actual log group from WAF config', { 
            configured: logGroupName, 
            actual: extractedLogGroup 
          });
          logGroupName = extractedLogGroup;
        }
      }
    }
    
    const logGroupsResponse = await cwlClient.send(
      new DescribeLogGroupsCommand({
        logGroupNamePrefix: logGroupName,
      })
    );
    
    const logGroup = logGroupsResponse.logGroups?.find(lg => lg.logGroupName === logGroupName);
    
    if (logGroup) {
      diagnosticResults.checks.push({
        name: 'CloudWatch Log Group',
        status: 'success',
        message: `Log group exists: ${logGroupName}`,
        details: {
          storedBytes: logGroup.storedBytes || 0,
          creationTime: logGroup.creationTime,
        },
      });
      
      // Check 3: Recent Log Streams
      logger.info('Checking for recent log streams');
      try {
        const logStreamsResponse = await cwlClient.send(
          new DescribeLogStreamsCommand({
            logGroupName: logGroupName,
            orderBy: 'LastEventTime',
            descending: true,
            limit: 5,
          })
        );
        
        if (logStreamsResponse.logStreams && logStreamsResponse.logStreams.length > 0) {
          diagnosticResults.checks.push({
            name: 'WAF Traffic',
            status: 'success',
            message: `Found ${logStreamsResponse.logStreams.length} recent log stream(s)`,
            details: {
              streams: logStreamsResponse.logStreams.map(s => ({
                name: s.logStreamName,
                lastEventTime: s.lastEventTimestamp,
              })),
            },
          });
        } else {
          diagnosticResults.checks.push({
            name: 'WAF Traffic',
            status: 'warning',
            message: 'No log streams found - WAF has not received traffic yet',
            recommendation: 'Generate traffic to your WAF-protected resources',
          });
        }
      } catch (err) {
        logger.warn('Could not check log streams', err as Error);
      }
      
      // Check 4: Subscription Filters
      logger.info('Checking subscription filters');
      const filtersResponse = await cwlClient.send(
        new DescribeSubscriptionFiltersCommand({
          logGroupName: logGroupName,
        })
      );
      
      const evoDestinationArn = `arn:aws:logs:${region}:${process.env.AWS_ACCOUNT_ID || '523115032346'}:destination:evo-uds-v3-production-waf-logs-destination`;
      
      if (filtersResponse.subscriptionFilters && filtersResponse.subscriptionFilters.length > 0) {
        const evoFilter = filtersResponse.subscriptionFilters.find(
          f => f.destinationArn === evoDestinationArn
        );
        
        if (evoFilter) {
          diagnosticResults.checks.push({
            name: 'Subscription Filter',
            status: 'success',
            message: 'Subscription filter correctly configured',
            details: {
              filterName: evoFilter.filterName,
              destinationArn: evoFilter.destinationArn,
            },
          });
        } else {
          diagnosticResults.checks.push({
            name: 'Subscription Filter',
            status: 'warning',
            message: 'Subscription filter exists but does not point to EVO',
            details: {
              filters: filtersResponse.subscriptionFilters.map(f => ({
                name: f.filterName,
                destination: f.destinationArn,
              })),
            },
            recommendation: 'Update subscription filter to point to EVO destination',
          });
        }
      } else {
        diagnosticResults.checks.push({
          name: 'Subscription Filter',
          status: 'error',
          message: 'No subscription filter found',
          recommendation: 'The subscription filter should be created automatically. Try re-configuring the WAF monitoring.',
        });
      }
    } else {
      diagnosticResults.checks.push({
        name: 'CloudWatch Log Group',
        status: 'error',
        message: `Log group not found: ${logGroupName}`,
        recommendation: 'Enable WAF logging to create the log group',
      });
    }
    
    // Check 5: Database Events
    logger.info('Checking database events');
    const eventCount = await prisma.wafEvent.count({
      where: {
        organization_id: organizationId,
        aws_account_id: config.aws_account_id,
      },
    });
    
    if (eventCount > 0) {
      const recentEvent = await prisma.wafEvent.findFirst({
        where: {
          organization_id: organizationId,
          aws_account_id: config.aws_account_id,
        },
        orderBy: { timestamp: 'desc' },
      });
      
      diagnosticResults.checks.push({
        name: 'Events in Database',
        status: 'success',
        message: `${eventCount} event(s) received`,
        details: {
          totalEvents: eventCount,
          lastEventAt: recentEvent?.timestamp,
        },
      });
    } else {
      diagnosticResults.checks.push({
        name: 'Events in Database',
        status: 'warning',
        message: 'No events received yet',
        recommendation: 'Wait for traffic to flow through the WAF, or check previous steps for issues',
      });
    }
    
    // Determine overall status
    const hasError = diagnosticResults.checks.some((c: any) => c.status === 'error');
    const hasWarning = diagnosticResults.checks.some((c: any) => c.status === 'warning');
    
    if (hasError) {
      diagnosticResults.overallStatus = 'error';
    } else if (hasWarning) {
      diagnosticResults.overallStatus = 'warning';
    } else {
      diagnosticResults.overallStatus = 'success';
    }
    
    logger.info('WAF monitoring diagnosis complete', { 
      organizationId, 
      configId,
      overallStatus: diagnosticResults.overallStatus 
    });
    
    return success(diagnosticResults);
    
  } catch (err) {
    logger.error('WAF monitoring diagnosis failed', err as Error, { organizationId, configId });
    
    diagnosticResults.checks.push({
      name: 'Diagnosis',
      status: 'error',
      message: `Failed to complete diagnosis: ${(err as Error).message}`,
    });
    
    diagnosticResults.overallStatus = 'error';
    
    return success(diagnosticResults);
  }
}


/**
 * POST /waf-fix-subscription - Fix subscription filter to point to EVO
 * Adds EVO subscription filter without removing existing filters
 * 
 * IMPORTANT: This function gets the ACTUAL log group from WAF logging configuration,
 * not from the database, to ensure we're fixing the correct log group.
 */
async function handleFixSubscription(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body || '{}');
  const { configId } = body;
  
  if (!configId) {
    return error('configId is required', 400);
  }
  
  logger.info('Fixing WAF subscription filter', { organizationId, configId });
  
  // Get the configuration
  const config = await prisma.wafMonitoringConfig.findFirst({
    where: {
      id: configId,
      organization_id: organizationId,
    },
  });
  
  if (!config) {
    return error('Configuration not found', 404);
  }
  
  try {
    // Get AWS credentials for customer account
    const awsCredential = await prisma.awsCredential.findFirst({
      where: {
        id: config.aws_account_id,
        organization_id: organizationId,
      },
    });
    
    if (!awsCredential) {
      return error('AWS credentials not found for this account', 404);
    }
    
    // Extract region from Web ACL ARN
    const arnParts = config.web_acl_arn.split(':');
    const region = arnParts[3] || 'us-east-1';
    
    const credentials = await resolveAwsCredentials(awsCredential, region);
    const awsCredentials = toAwsCredentials(credentials);
    
    const { CloudWatchLogsClient, PutSubscriptionFilterCommand, DescribeSubscriptionFiltersCommand } = await import('@aws-sdk/client-cloudwatch-logs');
    const { WAFV2Client, GetLoggingConfigurationCommand } = await import('@aws-sdk/client-wafv2');
    const { IAMClient, GetRoleCommand } = await import('@aws-sdk/client-iam');
    
    const cwlClient = new CloudWatchLogsClient({
      region: region,
      credentials: awsCredentials,
    });
    
    // CRITICAL: Get the ACTUAL log group from WAF logging configuration
    // This ensures we fix the correct log group, not the one stored in database
    let logGroupName = config.log_group_name || `aws-waf-logs-${config.web_acl_name}`;
    
    try {
      const wafClient = new WAFV2Client({
        region: region,
        credentials: awsCredentials,
      });
      
      const loggingConfig = await wafClient.send(
        new GetLoggingConfigurationCommand({
          ResourceArn: config.web_acl_arn,
        })
      );
      
      if (loggingConfig.LoggingConfiguration?.LogDestinationConfigs?.[0]) {
        const actualLogDestination = loggingConfig.LoggingConfiguration.LogDestinationConfigs[0];
        // Format: arn:aws:logs:region:account:log-group:LOG_GROUP_NAME
        const logArnParts = actualLogDestination.split(':');
        if (logArnParts.length >= 7) {
          const extractedLogGroup = logArnParts.slice(6).join(':');
          if (extractedLogGroup) {
            logger.info('Using actual log group from WAF config', { 
              configured: logGroupName, 
              actual: extractedLogGroup 
            });
            logGroupName = extractedLogGroup;
          }
        }
      }
    } catch (err: any) {
      logger.warn('Could not get WAF logging config, using database value', { 
        error: err.message,
        logGroupName 
      });
    }
    
    logger.info('Checking subscription filters on log group', { logGroupName, region });
    
    // Check existing subscription filters
    const existingFilters = await cwlClient.send(new DescribeSubscriptionFiltersCommand({
      logGroupName: logGroupName,
    }));
    
    const evoFilterName = 'evo-waf-monitoring';
    const evoDestinationArn = `arn:aws:logs:${region}:523115032346:destination:evo-uds-v3-production-waf-logs-destination`;
    
    // Check if EVO filter already exists
    const existingEvoFilter = existingFilters.subscriptionFilters?.find(
      f => f.filterName === evoFilterName || f.destinationArn === evoDestinationArn
    );
    
    if (existingEvoFilter) {
      logger.info('EVO subscription filter already exists', {
        logGroupName,
        filterName: existingEvoFilter.filterName,
        destinationArn: existingEvoFilter.destinationArn,
      });
      return success({
        success: true,
        message: 'EVO subscription filter already exists',
        filterName: existingEvoFilter.filterName,
        destinationArn: existingEvoFilter.destinationArn,
        logGroupName: logGroupName,
      });
    }
    
    // Check if we can add another filter (max 2 per log group)
    const filterCount = existingFilters.subscriptionFilters?.length || 0;
    if (filterCount >= 2) {
      return error(
        `Cannot add EVO subscription filter: Log group "${logGroupName}" already has ${filterCount} subscription filters (max 2). ` +
        `Please remove one of the existing filters first: ${existingFilters.subscriptionFilters?.map(f => f.filterName).join(', ')}`,
        400
      );
    }
    
    // Get customer AWS account ID
    const customerAwsAccountId = awsCredential.role_arn?.split(':')[4] || config.web_acl_arn.split(':')[4];
    
    // Check if CloudWatch Logs role exists
    const iamClient = new IAMClient({ region: 'us-east-1', credentials: awsCredentials });
    const roleName = 'EVO-CloudWatch-Logs-Role';
    let roleArn: string;
    
    try {
      await iamClient.send(new GetRoleCommand({ RoleName: roleName }));
      roleArn = `arn:aws:iam::${customerAwsAccountId}:role/${roleName}`;
    } catch (err: any) {
      if (err.name === 'NoSuchEntity') {
        return error(
          `CloudWatch Logs role "${roleName}" not found. ` +
          `Please update your CloudFormation stack to the latest version. ` +
          `Go to AWS Console → CloudFormation → Select your EVO stack → Update → Use current template → Submit.`,
          400
        );
      }
      throw err;
    }
    
    // Create the EVO subscription filter
    const filterPattern = config.filter_mode === 'all_requests' ? '' : '{ $.action = "BLOCK" || $.action = "COUNT" }';
    
    logger.info('Creating EVO subscription filter', {
      logGroupName,
      filterName: evoFilterName,
      destinationArn: evoDestinationArn,
      roleArn,
      filterPattern,
    });
    
    await cwlClient.send(new PutSubscriptionFilterCommand({
      logGroupName: logGroupName,
      filterName: evoFilterName,
      filterPattern: filterPattern,
      destinationArn: evoDestinationArn,
      roleArn: roleArn,
    }));
    
    logger.info('EVO subscription filter created successfully', {
      organizationId,
      configId,
      logGroupName,
      filterName: evoFilterName,
      destinationArn: evoDestinationArn,
    });
    
    // Update config to mark subscription filter as configured AND update log_group_name if different
    await prisma.wafMonitoringConfig.update({
      where: { id: configId },
      data: {
        subscription_filter: evoFilterName,
        log_group_name: logGroupName, // Update to actual log group
        updated_at: new Date(),
      },
    });
    
    return success({
      success: true,
      message: 'EVO subscription filter created successfully',
      filterName: evoFilterName,
      destinationArn: evoDestinationArn,
      logGroupName: logGroupName,
      note: 'WAF events will start flowing to EVO within 1-2 minutes',
    });
    
  } catch (err) {
    logger.error('Failed to fix subscription filter', err as Error, { organizationId, configId });
    return error('Failed to fix subscription filter');
  }
}


/**
 * GET /waf-threat-stats - Get threat type statistics
 * Returns distribution of threat types and events with/without classification
 * OPTIMIZED: Uses single raw SQL query for better performance
 */
async function handleGetThreatStats(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  // Parse body for accountId filter
  let accountId: string | undefined;
  if (event.body) {
    try {
      const body = JSON.parse(event.body);
      accountId = body.accountId;
    } catch {
      // Ignore parse errors
    }
  }
  
  const since = new Date();
  since.setHours(since.getHours() - 24);
  
  try {
    let statsResult;
    let threatTypeDistribution;
    let severityDistribution;
    
    if (accountId) {
      // Get all stats in a single query with accountId filter
      statsResult = await prisma.$queryRaw<Array<{
        total_events: bigint;
        events_with_threat_type: bigint;
        events_without_threat_type: bigint;
        blocked_events: bigint;
      }>>`
        SELECT 
          COUNT(*) as total_events,
          COUNT(*) FILTER (WHERE threat_type IS NOT NULL) as events_with_threat_type,
          COUNT(*) FILTER (WHERE threat_type IS NULL) as events_without_threat_type,
          COUNT(*) FILTER (WHERE action = 'BLOCK') as blocked_events
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid
          AND aws_account_id = ${accountId}::uuid
          AND timestamp >= ${since}
      `;
      
      // Get threat type distribution with accountId filter
      threatTypeDistribution = await prisma.$queryRaw<Array<{
        threat_type: string;
        count: bigint;
      }>>`
        SELECT threat_type, COUNT(*) as count
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid
          AND aws_account_id = ${accountId}::uuid
          AND timestamp >= ${since}
          AND threat_type IS NOT NULL
        GROUP BY threat_type
        ORDER BY count DESC
      `;
      
      // Get severity distribution with accountId filter
      severityDistribution = await prisma.$queryRaw<Array<{
        severity: string | null;
        count: bigint;
      }>>`
        SELECT severity, COUNT(*) as count
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid
          AND aws_account_id = ${accountId}::uuid
          AND timestamp >= ${since}
        GROUP BY severity
      `;
    } else {
      // Get all stats in a single query (all accounts)
      statsResult = await prisma.$queryRaw<Array<{
        total_events: bigint;
        events_with_threat_type: bigint;
        events_without_threat_type: bigint;
        blocked_events: bigint;
      }>>`
        SELECT 
          COUNT(*) as total_events,
          COUNT(*) FILTER (WHERE threat_type IS NOT NULL) as events_with_threat_type,
          COUNT(*) FILTER (WHERE threat_type IS NULL) as events_without_threat_type,
          COUNT(*) FILTER (WHERE action = 'BLOCK') as blocked_events
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid
          AND timestamp >= ${since}
      `;
      
      // Get threat type distribution (all accounts)
      threatTypeDistribution = await prisma.$queryRaw<Array<{
        threat_type: string;
        count: bigint;
      }>>`
        SELECT threat_type, COUNT(*) as count
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid
          AND timestamp >= ${since}
          AND threat_type IS NOT NULL
        GROUP BY threat_type
        ORDER BY count DESC
      `;
      
      // Get severity distribution (all accounts)
      severityDistribution = await prisma.$queryRaw<Array<{
        severity: string | null;
        count: bigint;
      }>>`
        SELECT severity, COUNT(*) as count
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid
          AND timestamp >= ${since}
        GROUP BY severity
      `;
    }
    
    const row = statsResult[0] || {
      total_events: BigInt(0),
      events_with_threat_type: BigInt(0),
      events_without_threat_type: BigInt(0),
      blocked_events: BigInt(0),
    };
    
    const totalEvents = Number(row.total_events);
    const eventsWithThreatType = Number(row.events_with_threat_type);
    
    return success({
      stats: {
        totalEvents,
        eventsWithThreatType,
        eventsWithoutThreatType: Number(row.events_without_threat_type),
        blockedEvents: Number(row.blocked_events),
        classificationRate: totalEvents > 0 
          ? Math.round((eventsWithThreatType / totalEvents) * 100) 
          : 0,
        threatTypes: threatTypeDistribution.map(t => ({
          type: t.threat_type,
          count: Number(t.count),
        })),
        severities: severityDistribution.reduce((acc, s) => {
          acc[s.severity || 'unknown'] = Number(s.count);
          return acc;
        }, {} as Record<string, number>),
      },
      period: '24h',
    });
  } catch (err) {
    logger.error('Failed to get threat stats', err as Error, { organizationId });
    return success({
      stats: {
        totalEvents: 0,
        eventsWithThreatType: 0,
        eventsWithoutThreatType: 0,
        blockedEvents: 0,
        classificationRate: 0,
        threatTypes: [],
        severities: {},
      },
      period: '24h',
      error: 'Failed to load data',
    });
  }
}

/**
 * POST /waf-ai-analysis - AI-powered analysis of WAF traffic
 * OPTIMIZED: Returns cached analysis immediately, triggers background refresh
 * This prevents 504 timeout (analysis takes 30+ seconds)
 */
async function handleAiAnalysis(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  logger.info('WAF AI analysis requested', { organizationId });
  
  // Get language from request body (default to 'pt')
  let language = 'pt';
  if (event.body) {
    try {
      const body = JSON.parse(event.body);
      language = body.language || 'pt';
    } catch {
      // Ignore parse errors, use default
    }
  }
  
  logger.info('Language for AI analysis', { organizationId, language });
  
  // ALWAYS trigger new analysis when user explicitly requests it
  // This ensures fresh data and prevents confusion with stale cached results
  logger.info('Triggering new AI analysis generation', { organizationId });
  
  // Trigger async Lambda invocation (fire-and-forget)
  try {
    const { LambdaClient, InvokeCommand } = await import('@aws-sdk/client-lambda');
    const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
    
    await lambdaClient.send(new InvokeCommand({
      FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'evo-uds-v3-production-waf-dashboard-api',
      InvocationType: 'Event', // Async invocation
      Payload: JSON.stringify({
        requestContext: { http: { method: 'POST' } },
        body: JSON.stringify({ 
          action: 'ai-analysis-background',
          organizationId,
          language, // Pass language to background worker
        }),
      }),
    }));
    
    logger.info('Background AI analysis triggered successfully', { organizationId, language });
  } catch (err) {
    logger.error('Failed to trigger background analysis', err as Error);
    return error('Failed to start AI analysis. Please try again.', 500);
  }
  
  // Return immediate response indicating processing has started
  const since = new Date();
  since.setHours(since.getHours() - 24);
  
  // Quick metrics query (optimized)
  const quickMetrics = await prisma.$queryRaw<Array<{
    total_events: bigint;
    blocked_events: bigint;
    unique_ips: bigint;
  }>>`
    SELECT 
      COUNT(*) as total_events,
      COUNT(*) FILTER (WHERE action = 'BLOCK') as blocked_events,
      COUNT(DISTINCT CASE WHEN action = 'BLOCK' THEN source_ip END) as unique_ips
    FROM waf_events
    WHERE organization_id = ${organizationId}::uuid
      AND timestamp >= ${since}
  `;
  
  const metrics = quickMetrics[0] || { total_events: BigInt(0), blocked_events: BigInt(0), unique_ips: BigInt(0) };
  const blockedCount = Number(metrics.blocked_events);
  
  // Localized processing message
  const processingMessage = language === 'en' 
    ? `## 🔄 Analysis in Progress

**Status:** Generating complete AI analysis...

**Quick Metrics (last 24h):**
- Total requests: ${Number(metrics.total_events).toLocaleString()}
- Blocked requests: ${blockedCount.toLocaleString()}
- Unique blocked IPs: ${Number(metrics.unique_ips).toLocaleString()}

**Preliminary Risk Level:** ${blockedCount > 1000 ? 'High' : blockedCount > 100 ? 'Medium' : 'Low'}

*⏳ The complete AI analysis is being generated. Wait 30-45 seconds and click "Refresh Analysis" to see detailed results.*`
    : `## 🔄 Análise em Processamento

**Status:** Gerando análise completa com IA...

**Métricas Rápidas (últimas 24h):**
- Total de requisições: ${Number(metrics.total_events).toLocaleString()}
- Requisições bloqueadas: ${blockedCount.toLocaleString()}
- IPs únicos bloqueados: ${Number(metrics.unique_ips).toLocaleString()}

**Nível de Risco Preliminar:** ${blockedCount > 1000 ? 'Alto' : blockedCount > 100 ? 'Médio' : 'Baixo'}

*⏳ A análise completa com IA está sendo gerada. Aguarde 30-45 segundos e clique em "Atualizar Análise" para ver os resultados detalhados.*`;

  const riskLevel = blockedCount > 1000 ? 'médio' : 'baixo';
  
  return success({
    analysis: processingMessage,
    riskLevel,
    generatedAt: new Date().toISOString(),
    processing: true,
    message: 'AI analysis started. Check back in 30-45 seconds for complete results.',
  });
}

/**
 * Background AI Analysis Worker
 * Called asynchronously to generate full AI analysis without blocking the API
 * OPTIMIZED: Uses sequential queries to avoid connection pool exhaustion
 */
async function handleAiAnalysisBackground(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  // Get language from request body (default to 'pt')
  let language = 'pt';
  if (event.body) {
    try {
      const body = JSON.parse(event.body);
      language = body.language || 'pt';
    } catch {
      // Ignore parse errors, use default
    }
  }
  
  logger.info('Starting background WAF AI analysis', { organizationId, language });
  
  const since = new Date();
  since.setHours(since.getHours() - 24);
  
  try {
    // OPTIMIZED: Use a single comprehensive SQL query for metrics
    // This reduces connection pool usage from 10 queries to 3
    const metricsResult = await prisma.$queryRaw<Array<{
      total_events: bigint;
      blocked_events: bigint;
      unique_attackers: bigint;
    }>>`
      SELECT 
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE action = 'BLOCK') as blocked_events,
        COUNT(DISTINCT CASE WHEN action = 'BLOCK' THEN source_ip END) as unique_attackers
      FROM waf_events
      WHERE organization_id = ${organizationId}::uuid
        AND timestamp >= ${since}
    `;
    
    const metrics = metricsResult[0] || { total_events: BigInt(0), blocked_events: BigInt(0), unique_attackers: BigInt(0) };
    const totalEvents = Number(metrics.total_events);
    const blockedEvents = Number(metrics.blocked_events);
    const uniqueAttackersCount = Number(metrics.unique_attackers);
    
    // Get aggregated data in a single query
    const aggregatedData = await prisma.$queryRaw<Array<{
      data_type: string;
      key1: string | null;
      key2: string | null;
      count: bigint;
    }>>`
      WITH threat_types AS (
        SELECT 'threat_type' as data_type, threat_type as key1, NULL as key2, COUNT(*) as count
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid AND timestamp >= ${since} AND threat_type IS NOT NULL
        GROUP BY threat_type
        ORDER BY count DESC LIMIT 10
      ),
      top_attackers AS (
        SELECT 'top_attacker' as data_type, source_ip as key1, country as key2, COUNT(*) as count
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid AND timestamp >= ${since} AND action = 'BLOCK'
        GROUP BY source_ip, country
        ORDER BY count DESC LIMIT 10
      ),
      geo_dist AS (
        SELECT 'geo' as data_type, country as key1, NULL as key2, COUNT(*) as count
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid AND timestamp >= ${since} AND action = 'BLOCK' AND country IS NOT NULL
        GROUP BY country
        ORDER BY count DESC LIMIT 10
      ),
      hourly AS (
        SELECT 'hourly' as data_type, EXTRACT(HOUR FROM timestamp)::text as key1, NULL as key2, COUNT(*) as count
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid AND timestamp >= ${since} AND action = 'BLOCK'
        GROUP BY EXTRACT(HOUR FROM timestamp)
      ),
      uris AS (
        SELECT 'uri' as data_type, LEFT(uri, 100) as key1, NULL as key2, COUNT(*) as count
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid AND timestamp >= ${since} AND action = 'BLOCK'
        GROUP BY LEFT(uri, 100)
        ORDER BY count DESC LIMIT 10
      ),
      user_agents AS (
        SELECT 'user_agent' as data_type, LEFT(user_agent, 80) as key1, NULL as key2, COUNT(*) as count
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid AND timestamp >= ${since} AND action = 'BLOCK'
        GROUP BY LEFT(user_agent, 80)
        ORDER BY count DESC LIMIT 10
      )
      SELECT * FROM threat_types
      UNION ALL SELECT * FROM top_attackers
      UNION ALL SELECT * FROM geo_dist
      UNION ALL SELECT * FROM hourly
      UNION ALL SELECT * FROM uris
      UNION ALL SELECT * FROM user_agents
    `;
    
    // Parse aggregated data
    const threatTypes = aggregatedData.filter(d => d.data_type === 'threat_type').map(d => ({
      threat_type: d.key1,
      _count: Number(d.count),
    }));
    
    const topAttackers = aggregatedData.filter(d => d.data_type === 'top_attacker').map(d => ({
      source_ip: d.key1 || '',
      country: d.key2,
      _count: Number(d.count),
    }));
    
    const geoDistribution = aggregatedData.filter(d => d.data_type === 'geo').map(d => ({
      country: d.key1,
      _count: Number(d.count),
    }));
    
    const hourlyDistribution = aggregatedData.filter(d => d.data_type === 'hourly').map(d => ({
      hour: parseInt(d.key1 || '0', 10),
      count: d.count,
    }));
    
    const targetedUris = aggregatedData.filter(d => d.data_type === 'uri').map(d => ({
      uri: d.key1,
      _count: Number(d.count),
    }));
    
    const userAgentAnalysis = aggregatedData.filter(d => d.data_type === 'user_agent').map(d => ({
      user_agent: d.key1,
      _count: Number(d.count),
    }));
    
    // Get sample blocked requests (single query)
    const blockedSamples = await prisma.wafEvent.findMany({
      where: { organization_id: organizationId, timestamp: { gte: since }, action: 'BLOCK' },
      orderBy: { timestamp: 'desc' },
      take: 50,
      select: {
        timestamp: true,
        source_ip: true,
        country: true,
        uri: true,
        http_method: true,
        user_agent: true,
        rule_matched: true,
        threat_type: true,
        severity: true,
      },
    });
    
    // Create uniqueAttackers array for compatibility
    const uniqueAttackers = topAttackers.map(a => ({ source_ip: a.source_ip, _count: a._count }));
  
    // Build context for AI
    const analysisContext = {
      period: '24 hours',
      metrics: {
        totalRequests: totalEvents,
        blockedRequests: blockedEvents,
        blockRate: totalEvents > 0 ? ((blockedEvents / totalEvents) * 100).toFixed(2) + '%' : '0%',
        uniqueAttackers: uniqueAttackersCount,
      },
      threatTypes: threatTypes.map(t => ({
        type: t.threat_type || 'unknown',
        count: t._count,
        percentage: blockedEvents > 0 ? ((t._count / blockedEvents) * 100).toFixed(1) + '%' : '0%',
      })),
      topAttackers: topAttackers.slice(0, 5).map(a => ({
        ip: a.source_ip,
        country: a.country || 'Unknown',
        blockedRequests: a._count,
      })),
      geoDistribution: geoDistribution.slice(0, 5).map(g => ({
        country: g.country || 'Unknown',
        blockedRequests: g._count,
      })),
      hourlyPattern: hourlyDistribution.map(h => ({
        hour: Number(h.hour),
        count: Number(h.count),
      })),
      targetedEndpoints: targetedUris.slice(0, 5).map(u => ({
        uri: u.uri?.substring(0, 100) || 'Unknown',
        attacks: u._count,
      })),
      suspiciousUserAgents: userAgentAnalysis.slice(0, 5).map(ua => ({
        userAgent: ua.user_agent?.substring(0, 80) || 'Empty',
        count: ua._count,
      })),
      sampleAttacks: blockedSamples.slice(0, 10).map(s => ({
        time: s.timestamp.toISOString(),
        ip: s.source_ip,
        country: s.country || 'Unknown',
        method: s.http_method,
        uri: s.uri?.substring(0, 80) || '/',
        userAgent: s.user_agent?.substring(0, 50) || 'Unknown',
        rule: s.rule_matched || 'Unknown',
        threatType: s.threat_type || 'unclassified',
        severity: s.severity || 'low',
      })),
    };
    
    // Build AI prompt with language support
    const prompt = buildWafAnalysisPrompt(analysisContext, language);
    
    try {
      // Call Bedrock with Claude 3.5 Sonnet
      const bedrockResponse = await bedrockClient.send(new InvokeModelCommand({
        modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 2048,
          temperature: 0.3,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      }));
      
      const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
      const aiAnalysis = responseBody.content?.[0]?.text || 'Unable to generate analysis.';
      
      logger.info('WAF AI analysis completed', { organizationId });
      
      // Extract risk level from analysis
      const riskLevelMatch = aiAnalysis.match(/Nível de Risco.*?(Baixo|Médio|Alto|Crítico)/i);
      const riskLevel = riskLevelMatch ? riskLevelMatch[1].toLowerCase() : null;
      
      // Save analysis to database
      const savedAnalysis = await prisma.wafAiAnalysis.create({
        data: {
          organization_id: organizationId,
          analysis: aiAnalysis,
          context: analysisContext as any,
          risk_level: riskLevel,
          ai_model: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
          is_fallback: false,
        },
      });
      
      return success({
        id: savedAnalysis.id,
        analysis: aiAnalysis,
        context: analysisContext,
        riskLevel,
        generatedAt: savedAnalysis.created_at.toISOString(),
      });
      
    } catch (bedrockErr) {
      logger.error('Bedrock AI analysis failed', bedrockErr as Error, { organizationId });
      
      // Generate fallback analysis
      const fallbackAnalysis = generateFallbackAnalysis(analysisContext, language);
      const riskLevel = analysisContext.metrics.blockedRequests > 1000 ? 'médio' : 'baixo';
      
      // Save fallback analysis to database
      const savedAnalysis = await prisma.wafAiAnalysis.create({
        data: {
          organization_id: organizationId,
          analysis: fallbackAnalysis,
          context: analysisContext as any,
          risk_level: riskLevel,
          ai_model: null,
          is_fallback: true,
        },
      });
      
      return success({
        id: savedAnalysis.id,
        analysis: fallbackAnalysis,
        context: analysisContext,
        riskLevel,
        generatedAt: savedAnalysis.created_at.toISOString(),
        aiError: 'AI analysis temporarily unavailable, showing automated summary',
      });
    }
    
  } catch (dbErr) {
    // Database connection error - return error response
    logger.error('Database error in WAF AI analysis', dbErr as Error, { organizationId });
    return error('Database connection error. Please try again later.', 503);
  }
}
async function handleGetLatestAnalysis(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  // Note: WafAiAnalysis model does NOT have aws_account_id field
  // Analysis is per-organization, not per-account
  // accountId is parsed but not used for filtering this model
  
  const latestAnalysis = await prisma.wafAiAnalysis.findFirst({
    where: { organization_id: organizationId },
    orderBy: { created_at: 'desc' },
  });
  
  if (!latestAnalysis) {
    return success({
      hasAnalysis: false,
      message: 'No analysis found. Run an AI analysis to get started.',
    });
  }
  
  return success({
    hasAnalysis: true,
    id: latestAnalysis.id,
    analysis: latestAnalysis.analysis,
    context: latestAnalysis.context,
    riskLevel: latestAnalysis.risk_level,
    isFallback: latestAnalysis.is_fallback,
    generatedAt: latestAnalysis.created_at.toISOString(),
  });
}

/**
 * Get analysis history
 * Note: WafAiAnalysis model does NOT have aws_account_id field
 * Analysis is per-organization, not per-account
 */
async function handleGetAnalysisHistory(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  try {
    // Parse query parameters
    const body = event.body ? JSON.parse(event.body) : {};
    const limit = parseInt(body.limit || '10', 10);
    const offset = parseInt(body.offset || '0', 10);
    // Note: accountId is not used because WafAiAnalysis doesn't have aws_account_id field
    
    const where = { organization_id: organizationId };
    
    // Get total count
    const totalCount = await prisma.wafAiAnalysis.count({ where });
    
    // Get analyses with pagination
    const analyses = await prisma.wafAiAnalysis.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        analysis: true,
        context: true,
        risk_level: true,
        is_fallback: true,
        created_at: true,
      },
    });
    
    return success({
      analyses: analyses.map(a => ({
        id: a.id,
        analysis: a.analysis,
        context: a.context,
        riskLevel: a.risk_level,
        isFallback: a.is_fallback,
        generatedAt: a.created_at.toISOString(),
      })),
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
    });
  } catch (err) {
    logger.error('Error getting analysis history', err as Error);
    return error('Failed to get analysis history', 500);
  }
}

/**
 * Build the prompt for WAF traffic analysis
 */
function buildWafAnalysisPrompt(ctx: any, language: string = 'pt'): string {
  if (language === 'en') {
    return `You are a web application security expert and WAF (Web Application Firewall) traffic analyst.

Analyze the following WAF traffic data from the last 24 hours and provide a detailed analysis in English:

## GENERAL METRICS
- Total requests: ${ctx.metrics.totalRequests}
- Blocked requests: ${ctx.metrics.blockedRequests} (${ctx.metrics.blockRate})
- Unique attackers (IPs): ${ctx.metrics.uniqueAttackers}

## DETECTED THREAT TYPES
${ctx.threatTypes.length > 0 
  ? ctx.threatTypes.map((t: any) => `- ${t.type}: ${t.count} (${t.percentage})`).join('\n')
  : '- No classified threats detected'}

## TOP 5 ATTACKERS
${ctx.topAttackers.map((a: any) => `- ${a.ip} (${a.country}): ${a.blockedRequests} blocks`).join('\n')}

## GEOGRAPHIC DISTRIBUTION
${ctx.geoDistribution.map((g: any) => `- ${g.country}: ${g.blockedRequests} attacks`).join('\n')}

## MOST TARGETED ENDPOINTS
${ctx.targetedEndpoints.map((e: any) => `- ${e.uri}: ${e.attacks} attempts`).join('\n')}

## SUSPICIOUS USER-AGENTS
${ctx.suspiciousUserAgents.map((ua: any) => `- "${ua.userAgent}": ${ua.count} requests`).join('\n')}

## HOURLY PATTERN (attacks per hour)
${ctx.hourlyPattern.map((h: any) => `- ${h.hour}h: ${h.count} attacks`).join('\n')}

## RECENT ATTACK SAMPLES
${ctx.sampleAttacks.slice(0, 5).map((s: any) => 
  `- [${s.time}] ${s.ip} (${s.country}) → ${s.method} ${s.uri} | Rule: ${s.rule} | Type: ${s.threatType}`
).join('\n')}

---

Please provide a structured analysis including:

1. **📊 EXECUTIVE SUMMARY** (2-3 sentences about the overall security state)

2. **🎯 MAIN IDENTIFIED THREATS**
   - Most frequent attack types
   - Suspicious behavior patterns
   - Possible coordinated campaigns

3. **🌍 GEOGRAPHIC ANALYSIS**
   - Attack origin countries
   - Suspicious regional concentrations

4. **⏰ TEMPORAL ANALYSIS**
   - Attack peak hours
   - Patterns indicating automation/bots

5. **🔍 ENDPOINTS AT RISK**
   - Most targeted endpoints
   - Possible vulnerabilities being exploited

6. **⚠️ ALERTS AND RECOMMENDATIONS**
   - Immediate recommended actions
   - IPs that should be permanently blocked
   - Suggested additional WAF rules

7. **📈 OVERALL RISK LEVEL** (Low/Medium/High/Critical)

Be objective and provide actionable insights. Use emojis to improve readability.`;
  }
  
  // Default: Portuguese
  return `Você é um especialista em segurança de aplicações web e análise de tráfego WAF (Web Application Firewall).

Analise os seguintes dados de tráfego WAF das últimas 24 horas e forneça uma análise detalhada em português:

## MÉTRICAS GERAIS
- Total de requisições: ${ctx.metrics.totalRequests}
- Requisições bloqueadas: ${ctx.metrics.blockedRequests} (${ctx.metrics.blockRate})
- Atacantes únicos (IPs): ${ctx.metrics.uniqueAttackers}

## TIPOS DE AMEAÇAS DETECTADAS
${ctx.threatTypes.length > 0 
  ? ctx.threatTypes.map((t: any) => `- ${t.type}: ${t.count} (${t.percentage})`).join('\n')
  : '- Nenhuma ameaça classificada detectada'}

## TOP 5 ATACANTES
${ctx.topAttackers.map((a: any) => `- ${a.ip} (${a.country}): ${a.blockedRequests} bloqueios`).join('\n')}

## DISTRIBUIÇÃO GEOGRÁFICA
${ctx.geoDistribution.map((g: any) => `- ${g.country}: ${g.blockedRequests} ataques`).join('\n')}

## ENDPOINTS MAIS ATACADOS
${ctx.targetedEndpoints.map((e: any) => `- ${e.uri}: ${e.attacks} tentativas`).join('\n')}

## USER-AGENTS SUSPEITOS
${ctx.suspiciousUserAgents.map((ua: any) => `- "${ua.userAgent}": ${ua.count} requisições`).join('\n')}

## PADRÃO HORÁRIO (ataques por hora)
${ctx.hourlyPattern.map((h: any) => `- ${h.hour}h: ${h.count} ataques`).join('\n')}

## AMOSTRA DE ATAQUES RECENTES
${ctx.sampleAttacks.slice(0, 5).map((s: any) => 
  `- [${s.time}] ${s.ip} (${s.country}) → ${s.method} ${s.uri} | Regra: ${s.rule} | Tipo: ${s.threatType}`
).join('\n')}

---

Por favor, forneça uma análise estruturada incluindo:

1. **📊 RESUMO EXECUTIVO** (2-3 frases sobre o estado geral da segurança)

2. **🎯 PRINCIPAIS AMEAÇAS IDENTIFICADAS**
   - Tipos de ataque mais frequentes
   - Padrões de comportamento suspeito
   - Possíveis campanhas coordenadas

3. **🌍 ANÁLISE GEOGRÁFICA**
   - Países de origem dos ataques
   - Se há concentração suspeita de alguma região

4. **⏰ ANÁLISE TEMPORAL**
   - Horários de pico de ataques
   - Se há padrões que indicam automação/bots

5. **🔍 ENDPOINTS EM RISCO**
   - Quais endpoints estão sendo mais visados
   - Possíveis vulnerabilidades sendo exploradas

6. **⚠️ ALERTAS E RECOMENDAÇÕES**
   - Ações imediatas recomendadas
   - IPs que devem ser bloqueados permanentemente
   - Regras WAF adicionais sugeridas

7. **📈 NÍVEL DE RISCO GERAL** (Baixo/Médio/Alto/Crítico)

Seja objetivo e forneça insights acionáveis. Use emojis para melhorar a legibilidade.`;
}

/**
 * Generate fallback analysis when AI is unavailable
 */
function generateFallbackAnalysis(ctx: any, language: string = 'pt'): string {
  if (language === 'en') {
    const riskLevel = ctx.metrics.blockedRequests > 1000 ? 'Medium' : 'Low';
    
    let analysis = `## 📊 Automated Summary (last 24h)\n\n`;
    analysis += `**Total requests:** ${ctx.metrics.totalRequests.toLocaleString()}\n`;
    analysis += `**Blocked requests:** ${ctx.metrics.blockedRequests.toLocaleString()} (${ctx.metrics.blockRate})\n`;
    analysis += `**Unique attackers:** ${ctx.metrics.uniqueAttackers}\n\n`;
    
    if (ctx.threatTypes.length > 0) {
      analysis += `### 🎯 Threat Types\n`;
      ctx.threatTypes.forEach((t: any) => {
        analysis += `- **${t.type}**: ${t.count} occurrences (${t.percentage})\n`;
      });
      analysis += '\n';
    }
    
    if (ctx.topAttackers.length > 0) {
      analysis += `### 🔴 Top Attackers\n`;
      ctx.topAttackers.forEach((a: any) => {
        analysis += `- ${a.ip} (${a.country}): ${a.blockedRequests} blocks\n`;
      });
      analysis += '\n';
    }
    
    if (ctx.geoDistribution.length > 0) {
      analysis += `### 🌍 Attack Origins\n`;
      ctx.geoDistribution.forEach((g: any) => {
        analysis += `- ${g.country}: ${g.blockedRequests} attacks\n`;
      });
      analysis += '\n';
    }
    
    analysis += `### 📈 Risk Level: **${riskLevel}**\n\n`;
    analysis += `*Automated analysis generated without AI. For detailed analysis, try again in a few minutes.*`;
    
    return analysis;
  }
  
  // Default: Portuguese
  const riskLevel = ctx.metrics.blockedRequests > 1000 ? 'Médio' : 'Baixo';
  
  let analysis = `## 📊 Resumo Automático (últimas 24h)\n\n`;
  analysis += `**Total de requisições:** ${ctx.metrics.totalRequests.toLocaleString()}\n`;
  analysis += `**Requisições bloqueadas:** ${ctx.metrics.blockedRequests.toLocaleString()} (${ctx.metrics.blockRate})\n`;
  analysis += `**Atacantes únicos:** ${ctx.metrics.uniqueAttackers}\n\n`;
  
  if (ctx.threatTypes.length > 0) {
    analysis += `### 🎯 Tipos de Ameaças\n`;
    ctx.threatTypes.forEach((t: any) => {
      analysis += `- **${t.type}**: ${t.count} ocorrências (${t.percentage})\n`;
    });
    analysis += '\n';
  }
  
  if (ctx.topAttackers.length > 0) {
    analysis += `### 🔴 Top Atacantes\n`;
    ctx.topAttackers.forEach((a: any) => {
      analysis += `- ${a.ip} (${a.country}): ${a.blockedRequests} bloqueios\n`;
    });
    analysis += '\n';
  }
  
  if (ctx.geoDistribution.length > 0) {
    analysis += `### 🌍 Origem dos Ataques\n`;
    ctx.geoDistribution.forEach((g: any) => {
      analysis += `- ${g.country}: ${g.blockedRequests} ataques\n`;
    });
    analysis += '\n';
  }
  
  analysis += `### 📈 Nível de Risco: **${riskLevel}**\n\n`;
  analysis += `*Análise automática gerada sem IA. Para análise detalhada, tente novamente em alguns minutos.*`;
  
  return analysis;
}


/**
 * Initialize the waf_ai_analyses table if it doesn't exist
 */
async function handleInitAiAnalysisTable(
  prisma: ReturnType<typeof getPrismaClient>
): Promise<APIGatewayProxyResultV2> {
  try {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS waf_ai_analyses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        analysis TEXT NOT NULL,
        context JSONB NOT NULL,
        risk_level VARCHAR(50),
        ai_model VARCHAR(100),
        is_fallback BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_waf_ai_analyses_org ON waf_ai_analyses(organization_id)
    `;
    
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_waf_ai_analyses_org_created ON waf_ai_analyses(organization_id, created_at DESC)
    `;
    
    logger.info('WAF AI Analysis table initialized successfully');
    
    return success({
      success: true,
      message: 'WAF AI Analysis table created/verified successfully',
    });
  } catch (err) {
    logger.error('Failed to initialize WAF AI Analysis table', err as Error);
    return error('Failed to create table');
  }
}

/**
 * GET /waf-timeline - Get hourly timeline of blocked/allowed requests for last 24h
 * Returns data for WafTimelineChart component
 */
async function handleGetTimeline(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  // Parse body for accountId filter
  let accountId: string | undefined;
  if (event.body) {
    try {
      const body = JSON.parse(event.body);
      accountId = body.accountId;
    } catch {
      // Ignore parse errors
    }
  }
  
  const since = new Date();
  since.setHours(since.getHours() - 24);
  
  try {
    // Get hourly aggregation of blocked and allowed requests with optional accountId filter
    let timelineData;
    
    if (accountId) {
      timelineData = await prisma.$queryRaw<Array<{
        hour: Date;
        blocked: bigint;
        allowed: bigint;
      }>>`
        SELECT 
          DATE_TRUNC('hour', timestamp) as hour,
          COUNT(*) FILTER (WHERE action = 'BLOCK') as blocked,
          COUNT(*) FILTER (WHERE action = 'ALLOW') as allowed
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid
          AND aws_account_id = ${accountId}::uuid
          AND timestamp >= ${since}
        GROUP BY DATE_TRUNC('hour', timestamp)
        ORDER BY hour ASC
      `;
    } else {
      timelineData = await prisma.$queryRaw<Array<{
        hour: Date;
        blocked: bigint;
        allowed: bigint;
      }>>`
        SELECT 
          DATE_TRUNC('hour', timestamp) as hour,
          COUNT(*) FILTER (WHERE action = 'BLOCK') as blocked,
          COUNT(*) FILTER (WHERE action = 'ALLOW') as allowed
        FROM waf_events
        WHERE organization_id = ${organizationId}::uuid
          AND timestamp >= ${since}
        GROUP BY DATE_TRUNC('hour', timestamp)
        ORDER BY hour ASC
      `;
    }
    
    // Fill in missing hours with zeros
    const result: Array<{ hour: string; blocked: number; allowed: number }> = [];
    const now = new Date();
    
    for (let i = 23; i >= 0; i--) {
      const hour = new Date(now);
      hour.setHours(now.getHours() - i, 0, 0, 0);
      
      const dataPoint = timelineData.find(d => {
        const dHour = new Date(d.hour);
        return dHour.getTime() === hour.getTime();
      });
      
      result.push({
        hour: hour.toISOString(),
        blocked: dataPoint ? Number(dataPoint.blocked) : 0,
        allowed: dataPoint ? Number(dataPoint.allowed) : 0,
      });
    }
    
    return success({
      timeline: result,
      period: '24h',
    });
  } catch (err) {
    logger.error('Failed to get WAF timeline', err as Error, { organizationId });
    return error('Failed to load timeline data');
  }
}

/**
 * GET /waf-alert-config - Get alert configuration for organization
 */
async function handleGetAlertConfig(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  // Parse body for accountId filter (alert config is per-organization, but we may want per-account in future)
  let accountId: string | undefined;
  if (event.body) {
    try {
      const body = JSON.parse(event.body);
      accountId = body.accountId;
    } catch {
      // Ignore parse errors
    }
  }
  
  try {
    const config = await prisma.wafAlertConfig.findUnique({
      where: { organization_id: organizationId },
    });
    
    if (!config) {
      // Return default config if none exists
      return success({
        snsEnabled: true,
        snsTopicArn: '',
        slackEnabled: false,
        slackWebhookUrl: '',
        inAppEnabled: true,
        campaignThreshold: 10,
        campaignWindowMins: 5,
        autoBlockEnabled: false,
        autoBlockThreshold: 50,
        blockDurationHours: 24,
      });
    }
    
    return success({
      snsEnabled: config.sns_enabled,
      snsTopicArn: config.sns_topic_arn || '',
      slackEnabled: config.slack_enabled,
      slackWebhookUrl: config.slack_webhook_url || '',
      inAppEnabled: config.in_app_enabled,
      campaignThreshold: config.campaign_threshold,
      campaignWindowMins: config.campaign_window_mins,
      autoBlockEnabled: config.auto_block_enabled,
      autoBlockThreshold: config.auto_block_threshold,
      blockDurationHours: config.block_duration_hours,
    });
  } catch (err) {
    logger.error('Failed to get alert config', err as Error, { organizationId });
    return error('Failed to load alert configuration');
  }
}

/**
 * POST /waf-save-alert-config - Save alert configuration
 */
async function handleSaveAlertConfig(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body || '{}');
  const {
    snsEnabled,
    snsTopicArn,
    slackEnabled,
    slackWebhookUrl,
    inAppEnabled,
    campaignThreshold,
    campaignWindowMins,
    autoBlockEnabled,
    autoBlockThreshold,
    blockDurationHours,
  } = body;
  
  try {
    // Validate inputs
    if (typeof snsEnabled !== 'boolean' || typeof slackEnabled !== 'boolean' || typeof inAppEnabled !== 'boolean') {
      return error('Invalid boolean values', 400);
    }
    
    if (typeof campaignThreshold !== 'number' || campaignThreshold < 1 || campaignThreshold > 1000) {
      return error('Campaign threshold must be between 1 and 1000', 400);
    }
    
    if (typeof campaignWindowMins !== 'number' || campaignWindowMins < 1 || campaignWindowMins > 60) {
      return error('Campaign window must be between 1 and 60 minutes', 400);
    }
    
    if (typeof autoBlockEnabled !== 'boolean') {
      return error('Invalid auto-block enabled value', 400);
    }
    
    if (typeof autoBlockThreshold !== 'number' || autoBlockThreshold < 1 || autoBlockThreshold > 10000) {
      return error('Auto-block threshold must be between 1 and 10000', 400);
    }
    
    if (typeof blockDurationHours !== 'number' || blockDurationHours < 1 || blockDurationHours > 720) {
      return error('Block duration must be between 1 and 720 hours', 400);
    }
    
    // Validate SNS Topic ARN format if enabled
    if (snsEnabled && snsTopicArn) {
      if (!snsTopicArn.startsWith('arn:aws:sns:')) {
        return error('Invalid SNS Topic ARN format', 400);
      }
    }
    
    // Validate Slack webhook URL format if enabled
    if (slackEnabled && slackWebhookUrl) {
      if (!slackWebhookUrl.startsWith('https://hooks.slack.com/')) {
        return error('Invalid Slack webhook URL format', 400);
      }
    }
    
    // Upsert configuration
    const config = await prisma.wafAlertConfig.upsert({
      where: { organization_id: organizationId },
      create: {
        organization_id: organizationId,
        sns_enabled: snsEnabled,
        sns_topic_arn: snsTopicArn || null,
        slack_enabled: slackEnabled,
        slack_webhook_url: slackWebhookUrl || null,
        in_app_enabled: inAppEnabled,
        campaign_threshold: campaignThreshold,
        campaign_window_mins: campaignWindowMins,
        auto_block_enabled: autoBlockEnabled,
        auto_block_threshold: autoBlockThreshold,
        block_duration_hours: blockDurationHours,
      },
      update: {
        sns_enabled: snsEnabled,
        sns_topic_arn: snsTopicArn || null,
        slack_enabled: slackEnabled,
        slack_webhook_url: slackWebhookUrl || null,
        in_app_enabled: inAppEnabled,
        campaign_threshold: campaignThreshold,
        campaign_window_mins: campaignWindowMins,
        auto_block_enabled: autoBlockEnabled,
        auto_block_threshold: autoBlockThreshold,
        block_duration_hours: blockDurationHours,
        updated_at: new Date(),
      },
    });
    
    logger.info('WAF alert config saved', { organizationId, configId: config.id });
    
    return success({
      success: true,
      message: 'Alert configuration saved successfully',
      config: {
        snsEnabled: config.sns_enabled,
        snsTopicArn: config.sns_topic_arn || '',
        slackEnabled: config.slack_enabled,
        slackWebhookUrl: config.slack_webhook_url || '',
        inAppEnabled: config.in_app_enabled,
        campaignThreshold: config.campaign_threshold,
        campaignWindowMins: config.campaign_window_mins,
        autoBlockEnabled: config.auto_block_enabled,
        autoBlockThreshold: config.auto_block_threshold,
        blockDurationHours: config.block_duration_hours,
      },
    });
  } catch (err) {
    logger.error('Failed to save alert config', err as Error, { organizationId });
    return error('Failed to save alert configuration');
  }
}


/**
 * POST /waf-evaluate-rules - Evaluate WAF rules with AI (Military Grade Gold Standard)
 */
async function handleEvaluateRules(
  event: AuthorizedEvent,
  prisma: any,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  try {
    const body = JSON.parse(event.body || '{}');
    const accountId = body.accountId;

    if (!accountId) {
      return error('accountId is required', 400);
    }

    logger.info('Evaluating WAF rules with AI', { organizationId, accountId });

    // Get AWS credentials
    const credential = await prisma.awsCredential.findFirst({
      where: {
        organization_id: organizationId,
        account_id: accountId,
      },
    });

    if (!credential) {
      return error('AWS credentials not found for this account', 404);
    }

    // Get WAF monitoring configs for this account FIRST (needed for region)
    const configs = await prisma.wafMonitoringConfig.findMany({
      where: {
        organization_id: organizationId,
        account_id: accountId,
        is_active: true,
      },
    });

    if (configs.length === 0) {
      return error('No active WAF monitoring configured for this account', 404);
    }

    // Now resolve credentials with the correct region
    const resolvedCreds = await resolveAwsCredentials(credential, configs[0].region);
    const awsCredentials = toAwsCredentials(resolvedCreds);

    // Fetch WAF rules from AWS
    const wafClient = new WAFV2Client({
      credentials: awsCredentials,
      region: configs[0].region,
    });

    const allRules: any[] = [];
    
    for (const config of configs) {
      try {
        const { GetWebACLCommand } = await import('@aws-sdk/client-wafv2');
        const webAclResponse = await wafClient.send(new GetWebACLCommand({
          Name: config.web_acl_name,
          Scope: config.scope as 'REGIONAL' | 'CLOUDFRONT',
          Id: config.web_acl_id,
        }));

        if (webAclResponse.WebACL?.Rules) {
          allRules.push(...webAclResponse.WebACL.Rules.map(rule => ({
            ...rule,
            webAclName: config.web_acl_name,
            webAclId: config.web_acl_id,
            scope: config.scope,
          })));
        }
      } catch (err) {
        logger.error('Failed to fetch WAF rules', err as Error, { webAclName: config.web_acl_name });
      }
    }

    if (allRules.length === 0) {
      return error('No WAF rules found', 404);
    }

    // Prepare prompt for AI analysis with Military Grade Gold Standard
    const rulesJson = JSON.stringify(allRules, null, 2);
    
    const prompt = `Você é um especialista em segurança de aplicações web com certificação CISSP e experiência em padrões militares de segurança (NIST 800-53, DoD STIGs).

Analise as seguintes regras do AWS WAF e forneça uma avaliação detalhada seguindo o PADRÃO MILITAR NÍVEL OURO:

REGRAS WAF:
${rulesJson}

CRITÉRIOS DE AVALIAÇÃO (Padrão Militar Nível Ouro):
1. Defense in Depth - Múltiplas camadas de proteção
2. Least Privilege - Bloqueio apenas do necessário
3. Fail Secure - Comportamento seguro em caso de falha
4. Complete Mediation - Todas as requisições devem ser verificadas
5. Separation of Privilege - Regras específicas por tipo de ataque
6. Psychological Acceptability - Regras não devem impactar usuários legítimos
7. Auditability - Todas as ações devem ser logadas
8. Zero Trust - Nunca confie, sempre verifique

Para cada regra, avalie:
- Score de segurança militar (0-100)
- Nível de risco (critical/high/medium/low/safe)
- Problemas identificados
- Recomendações específicas
- Instruções detalhadas de teste em modo COUNT
- Plano de rollback passo a passo

IMPORTANTE - AVISOS DE SEGURANÇA:
- SEMPRE teste em modo COUNT por 24-48h antes de BLOCK
- NUNCA aplique mudanças diretamente em produção
- SEMPRE tenha um plano de rollback documentado
- Monitore falsos positivos continuamente
- Regras mal configuradas podem bloquear tráfego legítimo

Retorne APENAS um JSON válido (sem markdown, sem explicações extras) no seguinte formato:
{
  "overallScore": 85,
  "totalRules": 10,
  "criticalIssues": 2,
  "highIssues": 3,
  "mediumIssues": 4,
  "lowIssues": 1,
  "rules": [
    {
      "ruleId": "rule-id",
      "ruleName": "Rule Name",
      "priority": 1,
      "action": "BLOCK",
      "riskLevel": "high",
      "militaryGradeScore": 75,
      "issues": ["Problema 1", "Problema 2"],
      "recommendations": ["Recomendação 1", "Recomendação 2"],
      "testingInstructions": [
        "1. Acesse AWS WAF Console",
        "2. Selecione a regra",
        "3. Mude action para COUNT",
        "4. Aguarde 24-48h",
        "5. Analise CloudWatch Metrics",
        "6. Verifique falsos positivos",
        "7. Se OK, mude para BLOCK"
      ],
      "rollbackPlan": [
        "1. Acesse AWS WAF Console imediatamente",
        "2. Selecione a regra problemática",
        "3. Mude action para COUNT ou desabilite",
        "4. Verifique se tráfego legítimo voltou",
        "5. Documente o incidente",
        "6. Revise a regra antes de reativar"
      ]
    }
  ],
  "generalRecommendations": [
    "Recomendação geral 1",
    "Recomendação geral 2"
  ],
  "aiAnalysis": "Análise geral detalhada da postura de segurança WAF seguindo padrões militares..."
}`;

    // Call Bedrock AI
    const bedrockCommand = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 8000,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    const bedrockResponse = await bedrockClient.send(bedrockCommand);
    const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
    
    let aiResponseText = '';
    if (responseBody.content && Array.isArray(responseBody.content)) {
      aiResponseText = responseBody.content
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
        .join('');
    }

    // Parse AI response
    let evaluation: any;
    try {
      // Remove markdown code blocks if present
      const cleanedResponse = aiResponseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      evaluation = JSON.parse(cleanedResponse);
    } catch (parseErr) {
      logger.error('Failed to parse AI response', parseErr as Error, { response: aiResponseText });
      return error('Failed to parse AI analysis response', 500);
    }

    // Add metadata
    evaluation.generatedAt = new Date().toISOString();
    evaluation.accountId = accountId;
    evaluation.organizationId = organizationId;

    logger.info('WAF rules evaluation completed', { 
      organizationId, 
      accountId,
      totalRules: evaluation.totalRules,
      overallScore: evaluation.overallScore 
    });

    return success(evaluation);

  } catch (err) {
    logger.error('Failed to evaluate WAF rules', err as Error, { organizationId });
    return error('Failed to evaluate WAF rules');
  }
}
