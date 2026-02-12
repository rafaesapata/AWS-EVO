/**
 * WAF Threat Analyzer Lambda Handler
 * 
 * Analyzes WAF events for threats, detects attack campaigns,
 * and triggers alerts for high-severity events.
 * 
 * Can be invoked:
 * - Directly by waf-log-processor for real-time analysis
 * - Via SNS for async processing
 * - Via scheduled event for batch analysis
 */

import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import {
  analyzeWafEvent,
  detectCampaign,
  sendAlert,
  createAlert,
  shouldSendAlert,
  type ParsedWafEvent,
  type AlertConfig,
  type CampaignConfig,
} from '../../lib/waf/index.js';
import type { LambdaContext } from '../../types/lambda.js';

// Event types that can trigger this Lambda
interface AnalyzeEventsRequest {
  type: 'analyze_events';
  organizationId: string;
  events: ParsedWafEvent[];
}

interface AnalyzeBatchRequest {
  type: 'analyze_batch';
  organizationId: string;
  startTime: string; // ISO timestamp
  endTime: string;   // ISO timestamp
}

interface AnalyzeCampaignsRequest {
  type: 'analyze_campaigns';
  organizationId: string;
}

type ThreatAnalyzerEvent = AnalyzeEventsRequest | AnalyzeBatchRequest | AnalyzeCampaignsRequest;

interface AnalysisResult {
  success: boolean;
  eventsAnalyzed: number;
  threatsDetected: number;
  campaignsDetected: number;
  alertsSent: number;
  errors: string[];
}

/**
 * Get alert configuration for an organization
 */
async function getAlertConfig(
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string
): Promise<AlertConfig> {
  const config = await prisma.wafAlertConfig.findUnique({
    where: { organization_id: organizationId },
  });
  
  if (config) {
    return {
      organizationId,
      snsEnabled: config.sns_enabled,
      snsTopicArn: config.sns_topic_arn || undefined,
      slackEnabled: config.slack_enabled,
      slackWebhookUrl: config.slack_webhook_url || undefined,
      inAppEnabled: config.in_app_enabled,
      campaignThreshold: config.campaign_threshold,
      campaignWindowMins: config.campaign_window_mins,
      autoBlockEnabled: config.auto_block_enabled,
      autoBlockThreshold: config.auto_block_threshold,
      blockDurationHours: config.block_duration_hours,
    };
  }
  
  // Return default config if none exists
  return {
    organizationId,
    snsEnabled: false,
    slackEnabled: false,
    inAppEnabled: true,
    campaignThreshold: 10,
    campaignWindowMins: 5,
    autoBlockEnabled: false,
    autoBlockThreshold: 50,
    blockDurationHours: 24,
  };
}

/**
 * Analyze a batch of WAF events
 */
async function analyzeEvents(
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string,
  events: ParsedWafEvent[],
  alertConfig: AlertConfig
): Promise<{
  threatsDetected: number;
  campaignsDetected: number;
  alertsSent: number;
  errors: string[];
}> {
  let threatsDetected = 0;
  let campaignsDetected = 0;
  let alertsSent = 0;
  const errors: string[] = [];
  
  const campaignConfig: CampaignConfig = {
    threshold: alertConfig.campaignThreshold,
    windowMinutes: alertConfig.campaignWindowMins,
    cooldownMinutes: 30,
  };
  
  for (const event of events) {
    try {
      // Analyze the event for threats
      const analysis = analyzeWafEvent(event);
      
      if (analysis.threatType !== 'unknown') {
        threatsDetected++;
      }
      
      // Check for campaign
      const campaignResult = detectCampaign(
        organizationId,
        event.sourceIp,
        analysis.threatType,
        analysis.severity,
        campaignConfig
      );
      
      if (campaignResult.isNewCampaign) {
        campaignsDetected++;
        
        // Update event in database to mark as campaign
        // Note: This would need the event ID from the database
      }
      
      // Determine if we should send an alert
      if (shouldSendAlert(
        analysis.severity,
        campaignResult.isCampaign,
        campaignResult.eventCount,
        alertConfig
      )) {
        const alert = createAlert(
          organizationId,
          analysis.threatType,
          analysis.severity,
          event.sourceIp,
          event.uri,
          {
            country: event.country || undefined,
            eventCount: campaignResult.eventCount,
            isCampaign: campaignResult.isCampaign,
            campaignId: campaignResult.campaignId,
            recommendedAction: analysis.recommendedAction,
            indicators: analysis.indicators,
          }
        );
        
        const deliveryResult = await sendAlert(alert, alertConfig, prisma);
        
        if (deliveryResult.success) {
          alertsSent++;
        } else {
          errors.push(`Alert delivery failed: ${deliveryResult.errors.join(', ')}`);
        }
      }
      
    } catch (err) {
      errors.push(`Error analyzing event: ${err}`);
    }
  }
  
  return { threatsDetected, campaignsDetected, alertsSent, errors };
}

/**
 * Analyze events from database within a time range
 */
async function analyzeBatch(
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string,
  startTime: Date,
  endTime: Date,
  alertConfig: AlertConfig
): Promise<{
  eventsAnalyzed: number;
  threatsDetected: number;
  campaignsDetected: number;
  alertsSent: number;
  errors: string[];
}> {
  // Fetch events from database
  const dbEvents = await prisma.wafEvent.findMany({
    where: {
      organization_id: organizationId,
      timestamp: {
        gte: startTime,
        lte: endTime,
      },
      // Only analyze events that haven't been analyzed yet
      threat_type: null,
    },
    orderBy: { timestamp: 'asc' },
    take: 1000, // Limit batch size
  });
  
  if (dbEvents.length === 0) {
    return {
      eventsAnalyzed: 0,
      threatsDetected: 0,
      campaignsDetected: 0,
      alertsSent: 0,
      errors: [],
    };
  }
  
  // Convert database events to ParsedWafEvent format
  const events: ParsedWafEvent[] = dbEvents.map(e => ({
    timestamp: e.timestamp,
    action: e.action,
    sourceIp: e.source_ip,
    country: e.country,
    region: e.region,
    userAgent: e.user_agent,
    uri: e.uri,
    httpMethod: e.http_method,
    ruleMatched: e.rule_matched,
    webaclId: '', // Not stored in simplified format
    rawLog: e.raw_log as any,
  }));
  
  const result = await analyzeEvents(prisma, organizationId, events, alertConfig);
  
  // Update analyzed events in database
  const eventIds = dbEvents.map(e => e.id);
  // Note: Would need to update threat_type for each event based on analysis
  
  return {
    eventsAnalyzed: events.length,
    ...result,
  };
}

/**
 * Main Lambda handler
 */
export async function handler(
  event: ThreatAnalyzerEvent,
  context: LambdaContext
): Promise<AnalysisResult> {
  const startTime = Date.now();
  
  logger.info('WAF Threat Analyzer started', {
    requestId: context.awsRequestId,
    eventType: event.type,
    organizationId: event.organizationId,
  });
  
  const prisma = getPrismaClient();
  
  try {
    // Get alert configuration
    const alertConfig = await getAlertConfig(prisma, event.organizationId);
    
    let result: AnalysisResult;
    
    switch (event.type) {
      case 'analyze_events': {
        // Real-time analysis of events
        const analysisResult = await analyzeEvents(
          prisma,
          event.organizationId,
          event.events,
          alertConfig
        );
        
        result = {
          success: true,
          eventsAnalyzed: event.events.length,
          ...analysisResult,
        };
        break;
      }
      
      case 'analyze_batch': {
        // Batch analysis of events in time range
        const batchResult = await analyzeBatch(
          prisma,
          event.organizationId,
          new Date(event.startTime),
          new Date(event.endTime),
          alertConfig
        );
        
        result = {
          success: true,
          ...batchResult,
        };
        break;
      }
      
      case 'analyze_campaigns': {
        // Analyze and update campaign status
        // This would check for campaigns that should be resolved
        result = {
          success: true,
          eventsAnalyzed: 0,
          threatsDetected: 0,
          campaignsDetected: 0,
          alertsSent: 0,
          errors: [],
        };
        break;
      }
      
      default:
        result = {
          success: false,
          eventsAnalyzed: 0,
          threatsDetected: 0,
          campaignsDetected: 0,
          alertsSent: 0,
          errors: ['Unknown event type'],
        };
    }
    
    const processingTime = Date.now() - startTime;
    
    logger.info('WAF Threat Analyzer completed', {
      requestId: context.awsRequestId,
      ...result,
      processingTimeMs: processingTime,
    });
    
    return result;
    
  } catch (err) {
    logger.error('WAF Threat Analyzer error', err as Error, {
      requestId: context.awsRequestId,
    });
    
    return {
      success: false,
      eventsAnalyzed: 0,
      threatsDetected: 0,
      campaignsDetected: 0,
      alertsSent: 0,
      errors: [err instanceof Error ? err.message : 'Unknown error'],
    };
  }
}
