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
import { createHash } from 'crypto';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
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
 * Handles both direct CloudWatch Logs events and forwarded events
 */
function decodeCloudWatchLogs(data: string): CloudWatchLogsData {
  try {
    // First, try to decode as base64
    const buffer = Buffer.from(data, 'base64');
    
    // Check if it's gzip compressed (gzip magic number: 0x1f 0x8b)
    if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      // It's gzip compressed, decompress it
      const decompressed = gunzipSync(buffer);
      return JSON.parse(decompressed.toString('utf-8'));
    } else {
      // Not gzip, might be plain JSON after base64 decode
      const decoded = buffer.toString('utf-8');
      try {
        return JSON.parse(decoded);
      } catch {
        // If that fails, the original data might already be JSON
        return JSON.parse(data);
      }
    }
  } catch (err) {
    // Last resort: try parsing the data directly as JSON
    // This handles cases where the data was double-encoded or forwarded
    logger.warn('Standard decode failed, trying alternative methods', { 
      error: err instanceof Error ? err.message : 'Unknown',
      dataLength: data.length,
      dataPreview: data.substring(0, 100)
    });
    
    try {
      // Maybe it's already plain JSON
      return JSON.parse(data);
    } catch {
      // Re-throw the original error
      throw err;
    }
  }
}

/**
 * Gera hash determinístico para deduplicação de eventos
 * Hash baseado em: timestamp + sourceIp + uri + httpMethod + action
 * 
 * @param event - Evento WAF parseado
 * @param organizationId - ID da organização
 * @returns Hash SHA-256 (32 caracteres)
 */
function generateEventHash(event: ParsedWafEvent, organizationId: string): string {
  const hashInput = [
    organizationId,
    event.timestamp.getTime().toString(),
    event.sourceIp,
    event.uri,
    event.httpMethod,
    event.action,
  ].join('|');
  
  return createHash('sha256')
    .update(hashInput)
    .digest('hex')
    .substring(0, 32); // Usar apenas 32 caracteres
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
    
    // Step 3: Look up organization from WAF monitoring config - ROBUSTO
    const prisma = getPrismaClient();
    const webAclName = extractWebAclNameFromLogGroup(logsData.logGroup);
    
    // ESTRATÉGIA 1: Buscar por log group name (mais específico)
    let monitoringConfig = await prisma.wafMonitoringConfig.findFirst({
      where: {
        log_group_name: logsData.logGroup,
        is_active: true,
      },
    });
    
    // ESTRATÉGIA 2: Buscar por Web ACL name
    if (!monitoringConfig) {
      logger.info('Config not found by log group, trying by Web ACL name', { webAclName });
      monitoringConfig = await prisma.wafMonitoringConfig.findFirst({
        where: {
          web_acl_name: webAclName,
          is_active: true,
        },
      });
    }
    
    // ESTRATÉGIA 3: Buscar por AWS Account ID do owner
    if (!monitoringConfig) {
      logger.info('Config not found by Web ACL name, trying by AWS Account ID', { 
        ownerAccountId: logsData.owner 
      });
      
      // Buscar todas as configs ativas
      const allConfigs = await prisma.wafMonitoringConfig.findMany({
        where: {
          is_active: true,
        },
      });
      
      logger.info('Found active WAF configs for account lookup', {
        activeConfigsCount: allConfigs.length,
        configIds: allConfigs.map(c => c.id),
      });
      
      // Para cada config, buscar o credential e verificar account ID
      for (const config of allConfigs) {
        const credential = await prisma.awsCredential.findUnique({
          where: { id: config.aws_account_id },
          select: { role_arn: true, account_id: true },
        });
        
        logger.info('Checking credential for WAF config', {
          configId: config.id,
          credentialId: config.aws_account_id,
          credentialFound: !!credential,
          credentialAccountId: credential?.account_id,
          roleArn: credential?.role_arn?.substring(0, 50),
        });
        
        // Primeiro, verificar o campo account_id diretamente
        if (credential?.account_id === logsData.owner) {
          logger.info('Found matching config by account_id field', { 
            configId: config.id,
            accountId: credential.account_id,
          });
          monitoringConfig = config;
          break;
        }
        
        // Fallback: extrair account ID do role_arn
        if (credential?.role_arn) {
          const accountIdFromRole = credential.role_arn.split(':')[4];
          if (accountIdFromRole === logsData.owner) {
            logger.info('Found matching config by role_arn', { 
              configId: config.id,
              accountIdFromRole,
            });
            monitoringConfig = config;
            break;
          }
        }
      }
    }
    
    // CRÍTICO: Se não encontrou config, não processar (enviar para DLQ no futuro)
    if (!monitoringConfig) {
      logger.error('No active monitoring config found - logs orphaned', {
        logGroup: logsData.logGroup,
        webAclName,
        ownerAccountId: logsData.owner,
        eventsCount: parsedEvents.length,
      });
      
      // TODO: Implementar Dead Letter Queue para logs órfãos
      // Por enquanto, retornar erro para que o CloudWatch Logs retenha
      return {
        success: false,
        eventsReceived,
        eventsParsed,
        eventsSaved: 0,
        errors: ['No active monitoring configuration found for this WAF - logs cannot be mapped to organization'],
      };
    }
    
    const organizationId = monitoringConfig.organization_id;
    const awsAccountId = monitoringConfig.aws_account_id;
    
    logger.info('Monitoring config found', {
      organizationId,
      awsAccountId,
      configId: monitoringConfig.id,
      webAclName: monitoringConfig.web_acl_name,
    });
    
    // Step 4: Analyze threats and prepare database records com hash para deduplicação
    const wafEventsToCreate = parsedEvents.map(event => {
      const analysis = analyzeWafEvent(event);
      const eventHash = generateEventHash(event, organizationId);
      
      return {
        id: eventHash, // ID determinístico para deduplicação
        organization_id: organizationId, // Sempre definido agora (validado acima)
        aws_account_id: awsAccountId,   // Sempre definido agora (validado acima)
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
    
    // Step 5: Upsert individual para garantir deduplicação
    let eventsSaved = 0;
    let duplicatesSkipped = 0;
    
    try {
      for (const eventData of wafEventsToCreate) {
        try {
          await prisma.wafEvent.upsert({
            where: { id: eventData.id },
            create: eventData,
            update: {}, // Não atualiza se já existe (mantém o original)
          });
          eventsSaved++;
        } catch (err: any) {
          // Se for erro de constraint único, é duplicata (ignorar silenciosamente)
          if (err.code === 'P2002' || err.message?.includes('Unique constraint')) {
            duplicatesSkipped++;
            logger.debug('Duplicate event skipped', { eventId: eventData.id });
          } else {
            // Outro erro - logar e continuar
            logger.warn('Failed to save individual event', { 
              error: err.message,
              eventId: eventData.id 
            });
            errors.push(`Failed to save event ${eventData.id}: ${err.message}`);
          }
        }
      }
      
      logger.info('Saved WAF events to database', { 
        eventsSaved, 
        duplicatesSkipped,
        totalProcessed: wafEventsToCreate.length 
      });
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
