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
    
    // Action-based routing from body (preferred for frontend)
    if (body.action) {
      switch (body.action) {
        case 'events':
          return await handleGetEvents(event, prisma, organizationId);
        case 'metrics':
          return await handleGetMetrics(prisma, organizationId);
        case 'timeline':
          return await handleGetTimeline(prisma, organizationId);
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
          return await handleGetBlockedIps(prisma, organizationId);
        case 'campaigns':
          return await handleGetCampaigns(event, prisma, organizationId);
        case 'config':
          return await handleGetConfig(prisma, organizationId);
        case 'update-config':
          return await handleUpdateConfig(event, prisma, organizationId);
        case 'get-monitoring-configs':
        case 'get-configs': // Alias for backwards compatibility
          return await handleGetMonitoringConfigs(prisma, organizationId);
        case 'diagnose':
          return await handleDiagnose(event, prisma, organizationId);
        case 'fix-subscription':
          return await handleFixSubscription(event, prisma, organizationId);
        case 'ai-analysis':
          return await handleAiAnalysis(event, prisma, organizationId);
        case 'get-latest-analysis':
          return await handleGetLatestAnalysis(prisma, organizationId);
        case 'threat-stats':
          return await handleGetThreatStats(prisma, organizationId);
        case 'get-alert-config':
          return await handleGetAlertConfig(prisma, organizationId);
        case 'save-alert-config':
          return await handleSaveAlertConfig(event, prisma, organizationId);
        case 'evaluate-rules':
          return await handleEvaluateRules(event, prisma, organizationId);
        case 'init-ai-analysis-table':
          return await handleInitAiAnalysisTable(prisma);
        default:
          return error(`Unknown action: ${body.action}`, 400);
      }
    }
    
    // Path-based routing (fallback for direct API Gateway calls)
    if (path.includes('waf-events')) {
      return await handleGetEvents(event, prisma, organizationId);
    }
    
    if (path.includes('waf-metrics')) {
      return await handleGetMetrics(prisma, organizationId);
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
      return await handleGetBlockedIps(prisma, organizationId);
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
    return error(err instanceof Error ? err.message : 'Internal server error');
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
  const limit = Math.min(parseInt(params.limit || bodyParams.limit || '50', 10), 1000);
  const skip = (page - 1) * limit;
  
  // Build where clause
  const where: any = { organization_id: organizationId };
  
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
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  // Get metrics for last 24 hours (current period)
  const since = new Date();
  since.setHours(since.getHours() - 24);
  
  // Get metrics for 24-48 hours ago (previous period for trend calculation)
  const previousSince = new Date();
  previousSince.setHours(previousSince.getHours() - 48);
  const previousUntil = new Date();
  previousUntil.setHours(previousUntil.getHours() - 24);
  
  try {
    // Use a single optimized raw SQL query to get current period metrics
    const metricsResult = await prisma.$queryRaw<Array<{
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
    
    // Get previous period metrics for trend calculation
    const previousMetricsResult = await prisma.$queryRaw<Array<{
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
    
    // Get active campaigns count separately (different table)
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
  
  const since = new Date();
  since.setHours(since.getHours() - 24);
  
  try {
    // Use raw SQL for better performance
    const topAttackers = await prisma.$queryRaw<Array<{
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
  const since = new Date();
  since.setHours(since.getHours() - 24);
  
  try {
    const attackTypes = await prisma.$queryRaw<Array<{
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
  const since = new Date();
  since.setHours(since.getHours() - 24);
  
  try {
    const geoDistribution = await prisma.$queryRaw<Array<{
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
  const params = event.queryStringParameters || {};
  const { ipAddress, accountId } = params;
  
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
 */
async function handleGetBlockedIps(
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
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
      slack_webhook_url: body.slackWebhookUrl,
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
      slack_webhook_url: body.slackWebhookUrl,
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
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  logger.info('Fetching WAF monitoring configs', { organizationId });
  
  const configs = await prisma.wafMonitoringConfig.findMany({
    where: { organization_id: organizationId },
    orderBy: { created_at: 'desc' },
  });
  
  logger.info('WAF monitoring configs fetched', { 
    organizationId, 
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
      
      const evoDestinationArn = `arn:aws:logs:${region}:${process.env.AWS_ACCOUNT_ID || '383234048592'}:destination:evo-uds-v3-production-waf-logs-destination`;
      
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
    const evoDestinationArn = `arn:aws:logs:${region}:383234048592:destination:evo-uds-v3-production-waf-logs-destination`;
    
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
    return error(err instanceof Error ? err.message : 'Failed to fix subscription filter');
  }
}


/**
 * GET /waf-threat-stats - Get threat type statistics
 * Returns distribution of threat types and events with/without classification
 * OPTIMIZED: Uses single raw SQL query for better performance
 */
async function handleGetThreatStats(
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  const since = new Date();
  since.setHours(since.getHours() - 24);
  
  try {
    // Get all stats in a single query
    const statsResult = await prisma.$queryRaw<Array<{
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
    
    // Get threat type distribution
    const threatTypeDistribution = await prisma.$queryRaw<Array<{
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
    
    // Get severity distribution
    const severityDistribution = await prisma.$queryRaw<Array<{
      severity: string | null;
      count: bigint;
    }>>`
      SELECT severity, COUNT(*) as count
      FROM waf_events
      WHERE organization_id = ${organizationId}::uuid
        AND timestamp >= ${since}
      GROUP BY severity
    `;
    
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
  
  // 1. Check if there's a recent analysis (< 5 minutes old)
  const recentAnalysis = await prisma.wafAiAnalysis.findFirst({
    where: { organization_id: organizationId },
    orderBy: { created_at: 'desc' },
  });
  
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const hasRecentAnalysis = recentAnalysis && recentAnalysis.created_at > fiveMinutesAgo;
  
  if (hasRecentAnalysis) {
    logger.info('Returning cached AI analysis', { 
      organizationId, 
      age: Math.round((Date.now() - recentAnalysis.created_at.getTime()) / 1000) + 's' 
    });
    
    return success({
      id: recentAnalysis.id,
      analysis: recentAnalysis.analysis,
      context: recentAnalysis.context,
      riskLevel: recentAnalysis.risk_level,
      generatedAt: recentAnalysis.created_at.toISOString(),
      cached: true,
      cacheAge: Math.round((Date.now() - recentAnalysis.created_at.getTime()) / 1000),
    });
  }
  
  // 2. No recent analysis - trigger background processing and return fallback
  logger.info('No recent analysis, triggering background generation', { organizationId });
  
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
        }),
      }),
    }));
    
    logger.info('Background AI analysis triggered', { organizationId });
  } catch (err) {
    logger.warn('Failed to trigger background analysis', err as Error);
  }
  
  // 3. Return immediate fallback response
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
  
  const fallbackAnalysis = `## 📊 Análise Rápida (últimas 24h)

**Status:** Análise detalhada em processamento...

**Métricas Rápidas:**
- Total de requisições: ${Number(metrics.total_events).toLocaleString()}
- Requisições bloqueadas: ${blockedCount.toLocaleString()}
- IPs únicos bloqueados: ${Number(metrics.unique_ips).toLocaleString()}

**Nível de Risco:** ${blockedCount > 1000 ? 'Alto' : blockedCount > 100 ? 'Médio' : 'Baixo'}

*Uma análise completa com IA está sendo gerada em segundo plano. Recarregue a página em 30 segundos para ver a análise detalhada.*`;

  const riskLevel = blockedCount > 1000 ? 'alto' : blockedCount > 100 ? 'médio' : 'baixo';
  
  return success({
    analysis: fallbackAnalysis,
    riskLevel,
    generatedAt: new Date().toISOString(),
    processing: true,
    message: 'Quick analysis returned. Detailed AI analysis is being generated in background.',
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
  logger.info('Starting background WAF AI analysis', { organizationId });
  
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
    
    // Build AI prompt
    const prompt = buildWafAnalysisPrompt(analysisContext);
    
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
      const fallbackAnalysis = generateFallbackAnalysis(analysisContext);
      const riskLevel = analysisContext.metrics.blockedRequests > 1000 ? 'alto' 
        : analysisContext.metrics.blockedRequests > 100 ? 'médio' 
        : 'baixo';
      
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
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
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
 * Build the prompt for WAF traffic analysis
 */
function buildWafAnalysisPrompt(ctx: any): string {
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
function generateFallbackAnalysis(ctx: any): string {
  const riskLevel = ctx.metrics.blockedRequests > 1000 ? 'Alto' 
    : ctx.metrics.blockedRequests > 100 ? 'Médio' 
    : 'Baixo';
  
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
    return error(err instanceof Error ? err.message : 'Failed to create table');
  }
}

/**
 * GET /waf-timeline - Get hourly timeline of blocked/allowed requests for last 24h
 * Returns data for WafTimelineChart component
 */
async function handleGetTimeline(
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  const since = new Date();
  since.setHours(since.getHours() - 24);
  
  try {
    // Get hourly aggregation of blocked and allowed requests
    const timelineData = await prisma.$queryRaw<Array<{
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
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
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
