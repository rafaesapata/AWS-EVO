/**
 * WAF Log Processor Lambda Handler
 * 
 * Receives WAF logs from CloudWatch Logs Subscription Filter (cross-account).
 * Parses, enriches, and persists events to PostgreSQL.
 * Triggers threat analysis for blocked requests.
 * 
 * Event format: CloudWatch Logs Subscription Filter event
 * - awslogs.data: Base64 + gzip encoded log data
 */

import { gunzipSync } from 'zlib';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { parseWafLogBatch, analyzeWafEvent, type ParsedWafEvent } from '../../lib/waf/index.js';
import type { LambdaContext } from '../../types/lambda.js';

// CloudWatch Logs Subscription Filter event types
interface CloudWatchLogsEvent {
  awslogs: {
    data: string; // Base64 + gzip encoded
  };
}

interface CloudWatchLogsData {
  messageType: string;
  owner: string;        // AWS Account ID do cliente
  logGroup: string;
  logStream: string;
  subscriptionFilters: string[];
  logEvents: Array<{
    id: string;
    timestamp: number;
    message: string;    // JSON do WAF log
  }>;
}

interface ProcessingResult {
  success: boolean;
  eventsReceived: number;
  eventsParsed: number;
  eventsSaved: number;
  errors: string[];
}

/**
 * Decode and decompress CloudWatch Logs data
 */
function decodeCloudWatchLogs(data: string): CloudWatchLogsData {
  const buffer = Buffer.from(data, 'base64');
  const decompressed = gunzipSync(buffer);
  return JSON.parse(decompressed.toString('utf-8'));
}

/**
 * Extract Web ACL name from log group name
 * Log group format: aws-waf-logs-{webAclName}
 */
function extractWebAclNameFromLogGroup(logGroup: string): string {
  const prefix = 'aws-waf-logs-';
  if (logGroup.startsWith(prefix)) {
    return logGroup.substring(prefix.length);
  }
  return logGroup;
}

/**
 * Main Lambda handler for processing WAF logs
 */
export async function handler(
  event: CloudWatchLogsEvent,
  context: LambdaContext
): Promise<ProcessingResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  
  logger.info('WAF Log Processor started', { 
    requestId: context.awsRequestId,
    hasAwslogs: !!event.awslogs
  });
  
  // Validate event structure
  if (!event.awslogs?.data) {
    logger.error('Invalid event: missing awslogs.data');
    return {
      success: false,
      eventsReceived: 0,
      eventsParsed: 0,
      eventsSaved: 0,
      errors: ['Invalid event: missing awslogs.data'],
    };
  }
  
  try {
    // Step 1: Decode CloudWatch Logs data
    const logsData = decodeCloudWatchLogs(event.awslogs.data);
    
    logger.info('Decoded CloudWatch Logs data', {
      messageType: logsData.messageType,
      owner: logsData.owner,
      logGroup: logsData.logGroup,
      eventsCount: logsData.logEvents.length,
    });
    
    // Skip control messages
    if (logsData.messageType === 'CONTROL_MESSAGE') {
      logger.info('Skipping control message');
      return {
        success: true,
        eventsReceived: 0,
        eventsParsed: 0,
        eventsSaved: 0,
        errors: [],
      };
    }
    
    const eventsReceived = logsData.logEvents.length;
    
    // Step 2: Parse WAF log messages
    const rawLogs = logsData.logEvents.map(logEvent => {
      try {
        return JSON.parse(logEvent.message);
      } catch (err) {
        errors.push(`Failed to parse log event ${logEvent.id}: ${err}`);
        return null;
      }
    }).filter(Boolean);
    
    const parsedEvents = parseWafLogBatch(rawLogs);
    const eventsParsed = parsedEvents.length;
    
    logger.info('Parsed WAF events', {
      rawLogsCount: rawLogs.length,
      parsedEventsCount: eventsParsed,
    });
    
    if (parsedEvents.length === 0) {
      logger.warn('No events parsed successfully');
      return {
        success: true,
        eventsReceived,
        eventsParsed: 0,
        eventsSaved: 0,
        errors,
      };
    }
    
    // Step 3: Look up organization from WAF monitoring config
    const prisma = getPrismaClient();
    const webAclName = extractWebAclNameFromLogGroup(logsData.logGroup);
    
    // Find the monitoring config for this WAF
    const monitoringConfig = await prisma.wafMonitoringConfig.findFirst({
      where: {
        log_group_name: logsData.logGroup,
        is_active: true,
      },
    });
    
    if (!monitoringConfig) {
      // Try to find by web ACL name pattern
      const configByName = await prisma.wafMonitoringConfig.findFirst({
        where: {
          web_acl_name: webAclName,
          is_active: true,
        },
      });
      
      if (!configByName) {
        logger.warn('No active monitoring config found for log group', { 
          logGroup: logsData.logGroup,
          webAclName,
          ownerAccountId: logsData.owner
        });
        // Still process but without organization context
        // This could happen during initial setup
      }
    }
    
    const organizationId = monitoringConfig?.organization_id;
    const awsAccountId = monitoringConfig?.aws_account_id;
    
    // Step 4: Analyze threats and prepare database records
    const wafEventsToCreate = parsedEvents.map(event => {
      const analysis = analyzeWafEvent(event);
      
      return {
        organization_id: organizationId || '00000000-0000-0000-0000-000000000000',
        aws_account_id: awsAccountId || '00000000-0000-0000-0000-000000000000',
        timestamp: event.timestamp,
        action: event.action,
        source_ip: event.sourceIp,
        country: event.country,
        region: event.region,
        user_agent: event.userAgent,
        uri: event.uri,
        http_method: event.httpMethod,
        rule_matched: event.ruleMatched,
        threat_type: analysis.threatType !== 'unknown' ? analysis.threatType : null,
        severity: analysis.severity,
        is_campaign: false, // Will be updated by campaign detector
        campaign_id: null,
        raw_log: event.rawLog as object,
      };
    });
    
    // Step 5: Batch insert to database
    let eventsSaved = 0;
    try {
      const result = await prisma.wafEvent.createMany({
        data: wafEventsToCreate,
        skipDuplicates: true,
      });
      eventsSaved = result.count;
      
      logger.info('Saved WAF events to database', { eventsSaved });
    } catch (dbError) {
      logger.error('Failed to save WAF events', dbError as Error);
      errors.push(`Database error: ${dbError}`);
    }
    
    // Step 6: Update monitoring config stats
    if (monitoringConfig) {
      const blockedCount = parsedEvents.filter(e => e.action === 'BLOCK').length;
      
      await prisma.wafMonitoringConfig.update({
        where: { id: monitoringConfig.id },
        data: {
          last_event_at: new Date(),
          events_today: { increment: eventsSaved },
          blocked_today: { increment: blockedCount },
        },
      });
    }
    
    // Step 7: Trigger threat analysis for high-severity events (async)
    const highSeverityEvents = parsedEvents.filter(event => {
      const analysis = analyzeWafEvent(event);
      return analysis.severity === 'critical' || analysis.severity === 'high';
    });
    
    if (highSeverityEvents.length > 0) {
      logger.info('High severity events detected', {
        count: highSeverityEvents.length,
        // In production, trigger SNS or invoke threat analyzer Lambda
      });
      // TODO: Invoke waf-threat-analyzer Lambda or publish to SNS
    }
    
    const processingTime = Date.now() - startTime;
    
    logger.info('WAF Log Processor completed', {
      requestId: context.awsRequestId,
      eventsReceived,
      eventsParsed,
      eventsSaved,
      processingTimeMs: processingTime,
      errorsCount: errors.length,
    });
    
    return {
      success: errors.length === 0,
      eventsReceived,
      eventsParsed,
      eventsSaved,
      errors,
    };
    
  } catch (err) {
    logger.error('WAF Log Processor error', err as Error, {
      requestId: context.awsRequestId,
    });
    
    return {
      success: false,
      eventsReceived: 0,
      eventsParsed: 0,
      eventsSaved: 0,
      errors: [err instanceof Error ? err.message : 'Unknown error'],
    };
  }
}
