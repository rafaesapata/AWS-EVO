/**
 * Scheduled Scan Executor
 * 
 * Executa scans agendados automaticamente baseado na tabela scan_schedules.
 * Triggered by EventBridge every hour.
 * 
 * @schedule rate(1 hour)
 */

import type { LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { calculateNextRun, isSameDayUTC } from '../../lib/schedule-calculator.js';

// EventBridge scheduled event type
interface ScheduledEvent {
  'detail-type'?: string;
  source?: string;
  time?: string;
  region?: string;
  resources?: string[];
  detail?: Record<string, unknown>;
  requestContext?: {
    http?: { method: string };
  };
}

interface ScanScheduleResult {
  scheduleId: string;
  organizationId: string;
  scanType: string;
  status: 'executed' | 'skipped' | 'failed';
  message?: string;
  error?: string;
}

const MAX_SCHEDULES_PER_BATCH = 50;

function skipResult(schedule: { id: string; organization_id: string; scan_type: string }, message: string): ScanScheduleResult {
  return { scheduleId: schedule.id, organizationId: schedule.organization_id, scanType: schedule.scan_type, status: 'skipped', message };
}

function failResult(schedule: { id: string; organization_id: string; scan_type: string }, errorMessage: string): ScanScheduleResult {
  return { scheduleId: schedule.id, organizationId: schedule.organization_id, scanType: schedule.scan_type, status: 'failed', error: errorMessage };
}

export async function handler(
  event: ScheduledEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }
  
  const startTime = Date.now();
  logger.info('Scheduled Scan Executor started', { 
    requestId: context.awsRequestId,
    source: event.source || 'api-gateway',
    time: event.time || new Date().toISOString()
  });
  
  try {
    const prisma = getPrismaClient();
    const now = new Date();
    const results: ScanScheduleResult[] = [];
    
    // Buscar schedules ativos que devem ser executados
    const schedules = await prisma.scanSchedule.findMany({
      where: {
        is_active: true,
        OR: [
          { next_run_at: { lte: now } },
          { next_run_at: null }
        ]
      },
      include: {
        organization: { select: { id: true, name: true } },
        aws_credential: { select: { id: true, account_name: true, is_active: true } },
        azure_credential: { select: { id: true, subscription_name: true, is_active: true } }
      },
      take: MAX_SCHEDULES_PER_BATCH,
    });
    
    logger.info('Found scan schedules to execute', { schedulesCount: schedules.length });
    
    if (schedules.length === 0) {
      return success({
        success: true,
        message: 'No schedules to execute',
        schedulesProcessed: 0,
        results: [],
        durationMs: Date.now() - startTime
      });
    }
    
    const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
    
    for (const schedule of schedules) {
      try {
        // Daily limit: skip if already ran today (UTC)
        if (schedule.last_run_at && isSameDayUTC(schedule.last_run_at, now)) {
          results.push(skipResult(schedule, 'Daily limit reached - already executed today'));
          continue;
        }

        // Determine if this is an AWS or Azure schedule
        const isAzure = schedule.cloud_provider === 'AZURE' || !!schedule.azure_credential_id;
        
        // Verify credential is active
        const credential = isAzure ? schedule.azure_credential : schedule.aws_credential;
        if (!credential?.is_active) {
          results.push(skipResult(schedule, `${isAzure ? 'Azure' : 'AWS'} credential is inactive`));
          continue;
        }
        
        // Mapear tipo de scan para Lambda
        const lambdaName = getScanLambdaName(schedule.scan_type);
        if (!lambdaName) {
          results.push(skipResult(schedule, `Unknown scan type: ${schedule.scan_type}`));
          continue;
        }
        
        // Preparar payload para a Lambda de scan
        const payload = {
          body: JSON.stringify({
            ...(isAzure 
              ? { credentialId: schedule.azure_credential_id }
              : { accountId: schedule.aws_account_id }
            ),
            scanType: schedule.scan_type,
            scanLevel: schedule.scan_type,
            scheduledExecution: true,
            scheduleId: schedule.id,
            ...(schedule.schedule_config as object || {})
          }),
          requestContext: {
            authorizer: {
              claims: {
                sub: 'scheduled-executor',
                'custom:organization_id': schedule.organization_id
              }
            },
            http: { method: 'POST' }
          }
        };
        
        logger.info('Invoking scan Lambda', {
          scheduleId: schedule.id,
          lambdaName,
          scanType: schedule.scan_type,
          organizationId: schedule.organization_id
        });
        
        // Invocar Lambda de forma assíncrona
        const prefix = process.env.LAMBDA_PREFIX || `evo-uds-v3-${process.env.ENVIRONMENT || 'production'}`;
        const functionName = `${prefix}-${lambdaName}`;
        await lambdaClient.send(new InvokeCommand({
          FunctionName: functionName,
          InvocationType: 'Event', // Async
          Payload: Buffer.from(JSON.stringify(payload))
        }));
        
        // Calcular próxima execução
        const nextRunAt = calculateNextRun(schedule.schedule_type, schedule.schedule_config);
        
        // Atualizar schedule com last_run_at e next_run_at
        await prisma.scanSchedule.update({
          where: { id: schedule.id },
          data: {
            last_run_at: now,
            next_run_at: nextRunAt
          }
        });
        
        results.push({
          scheduleId: schedule.id,
          organizationId: schedule.organization_id,
          scanType: schedule.scan_type,
          status: 'executed',
          message: `Scan triggered, next run: ${nextRunAt?.toISOString() || 'not scheduled'}`
        });
        
        logger.info('Scan scheduled successfully', {
          scheduleId: schedule.id,
          scanType: schedule.scan_type,
          nextRunAt: nextRunAt?.toISOString()
        });

        // NOTE: The scan-report-generator is invoked by the scan Lambda itself
        // when the scan completes (not from here), since the scan runs asynchronously
        // and we don't have the scanId yet at this point.
        
      } catch (err) {
        results.push(failResult(schedule, err instanceof Error ? err.message : 'Unknown error'));
        logger.error('Failed to execute scheduled scan', err as Error, {
          scheduleId: schedule.id,
          scanType: schedule.scan_type
        });
      }
    }
    
    const executed = results.filter(r => r.status === 'executed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const failed = results.filter(r => r.status === 'failed').length;
    
    logger.info('Scheduled Scan Executor completed', {
      schedulesProcessed: results.length,
      executed,
      skipped,
      failed,
      durationMs: Date.now() - startTime
    });
    
    return success({
      success: true,
      schedulesProcessed: results.length,
      summary: { executed, skipped, failed },
      results,
      durationMs: Date.now() - startTime
    });
    
  } catch (err) {
    logger.error('Scheduled Scan Executor error', err as Error, { requestId: context.awsRequestId });
    return error('An unexpected error occurred. Please try again.', 500);
  }
}

/**
 * Mapeia tipo de scan para nome da Lambda
 */
function getScanLambdaName(scanType: string): string | null {
  const mapping: Record<string, string> = {
    'quick': 'start-security-scan',
    'standard': 'start-security-scan',
    'deep': 'start-security-scan',
    'security': 'start-security-scan',
    'security_scan': 'start-security-scan',
    'compliance': 'start-compliance-scan',
    'compliance_scan': 'start-compliance-scan',
    'well_architected': 'well-architected-scan',
    'well-architected': 'well-architected-scan',
    'cost': 'cost-optimization',
    'cost_analysis': 'cost-optimization',
    'drift': 'drift-detection',
    'drift_detection': 'drift-detection',
    'iam': 'iam-deep-analysis',
    'iam_deep': 'iam-deep-analysis',
    'guardduty': 'guardduty-scan',
    'guardduty_scan': 'guardduty-scan'
  };
  return mapping[scanType.toLowerCase()] || null;
}


