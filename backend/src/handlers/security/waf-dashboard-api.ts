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
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logging.js';
import { WAFV2Client } from '@aws-sdk/client-wafv2';
import { blockIp, unblockIp, DEFAULT_AUTO_BLOCK_CONFIG } from '../../lib/waf/auto-blocker.js';

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
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationId(user);
  const method = getHttpMethod(event);
  const path = getHttpPath(event);
  
  logger.info('WAF Dashboard API request', { 
    organizationId,
    method,
    path,
    requestId: context.awsRequestId 
  });
  
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
    
    // Action-based routing from body (preferred for frontend)
    if (body.action) {
      switch (body.action) {
        case 'events':
          return await handleGetEvents(event, prisma, organizationId);
        case 'metrics':
          return await handleGetMetrics(prisma, organizationId);
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
      organizationId,
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
  
  const page = parseInt(params.page || '1', 10);
  const limit = Math.min(parseInt(params.limit || '50', 10), 1000);
  const skip = (page - 1) * limit;
  
  // Build where clause
  const where: any = { organization_id: organizationId };
  
  if (params.startDate) {
    where.timestamp = { ...where.timestamp, gte: new Date(params.startDate) };
  }
  if (params.endDate) {
    where.timestamp = { ...where.timestamp, lte: new Date(params.endDate) };
  }
  if (params.severity) {
    where.severity = params.severity;
  }
  if (params.threatType) {
    where.threat_type = params.threatType;
  }
  if (params.sourceIp) {
    where.source_ip = params.sourceIp;
  }
  if (params.action) {
    where.action = params.action;
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
 */
async function handleGetMetrics(
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  // Get metrics for last 24 hours
  const since = new Date();
  since.setHours(since.getHours() - 24);
  
  const where = {
    organization_id: organizationId,
    timestamp: { gte: since },
  };
  
  const [
    totalRequests,
    blockedRequests,
    allowedRequests,
    countedRequests,
    uniqueIpsResult,
    uniqueCountriesResult,
    severityCounts,
    activeCampaigns,
  ] = await Promise.all([
    prisma.wafEvent.count({ where }),
    prisma.wafEvent.count({ where: { ...where, action: 'BLOCK' } }),
    prisma.wafEvent.count({ where: { ...where, action: 'ALLOW' } }),
    prisma.wafEvent.count({ where: { ...where, action: 'COUNT' } }),
    prisma.wafEvent.groupBy({
      by: ['source_ip'],
      where,
      _count: true,
    }),
    prisma.wafEvent.groupBy({
      by: ['country'],
      where,
      _count: true,
    }),
    prisma.wafEvent.groupBy({
      by: ['severity'],
      where,
      _count: true,
    }),
    prisma.wafAttackCampaign.count({
      where: {
        organization_id: organizationId,
        status: 'active',
      },
    }),
  ]);
  
  const severityMap = severityCounts.reduce((acc, item) => {
    acc[item.severity] = item._count;
    return acc;
  }, {} as Record<string, number>);
  
  const metrics: WafMetrics = {
    totalRequests,
    blockedRequests,
    allowedRequests,
    countedRequests,
    uniqueIps: uniqueIpsResult.length,
    uniqueCountries: uniqueCountriesResult.length,
    criticalThreats: severityMap['critical'] || 0,
    highThreats: severityMap['high'] || 0,
    mediumThreats: severityMap['medium'] || 0,
    lowThreats: severityMap['low'] || 0,
    activeCampaigns,
  };
  
  return success({ metrics, period: '24h' });
}

/**
 * GET /waf-top-attackers - Top attacking IPs
 */
async function handleGetTopAttackers(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  const params = event.queryStringParameters || {};
  const limit = Math.min(parseInt(params.limit || '10', 10), 100);
  
  const since = new Date();
  since.setHours(since.getHours() - 24);
  
  const topAttackers = await prisma.wafEvent.groupBy({
    by: ['source_ip', 'country'],
    where: {
      organization_id: organizationId,
      timestamp: { gte: since },
      action: 'BLOCK',
    },
    _count: true,
    orderBy: {
      _count: {
        source_ip: 'desc',
      },
    },
    take: limit,
  });
  
  return success({
    topAttackers: topAttackers.map(item => ({
      sourceIp: item.source_ip,
      country: item.country,
      blockedRequests: item._count,
    })),
    period: '24h',
  });
}

/**
 * GET /waf-attack-types - Distribution by attack type
 */
async function handleGetAttackTypes(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  const since = new Date();
  since.setHours(since.getHours() - 24);
  
  const attackTypes = await prisma.wafEvent.groupBy({
    by: ['threat_type'],
    where: {
      organization_id: organizationId,
      timestamp: { gte: since },
      threat_type: { not: null },
    },
    _count: true,
    orderBy: {
      _count: {
        threat_type: 'desc',
      },
    },
  });
  
  return success({
    attackTypes: attackTypes.map(item => ({
      type: item.threat_type,
      count: item._count,
    })),
    period: '24h',
  });
}

/**
 * GET /waf-geo-distribution - Geographic distribution
 */
async function handleGetGeoDistribution(
  event: AuthorizedEvent,
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  const since = new Date();
  since.setHours(since.getHours() - 24);
  
  const geoDistribution = await prisma.wafEvent.groupBy({
    by: ['country'],
    where: {
      organization_id: organizationId,
      timestamp: { gte: since },
      action: 'BLOCK',
      country: { not: null },
    },
    _count: true,
    orderBy: {
      _count: {
        country: 'desc',
      },
    },
  });
  
  return success({
    geoDistribution: geoDistribution.map(item => ({
      country: item.country,
      blockedRequests: item._count,
    })),
    period: '24h',
  });
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
        diagnosticResults.checks.push({
          name: 'WAF Logging',
          status: 'success',
          message: 'WAF logging is enabled',
          details: {
            destinations: loggingConfig.LoggingConfiguration.LogDestinationConfigs || [],
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
    
    const wafId = config.web_acl_arn.split('/').pop();
    const logGroupName = `aws-waf-logs-${wafId}`;
    
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
      
      const evoDestinationArn = `arn:aws:logs:${region}:${process.env.AWS_ACCOUNT_ID || '383234048592'}:destination:evo-waf-logs-destination`;
      
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
