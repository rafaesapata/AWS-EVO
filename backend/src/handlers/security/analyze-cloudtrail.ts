/**
 * Lambda handler for Analyze CloudTrail
 * Busca eventos do CloudTrail, analisa riscos de segurança e salva no banco
 * Identifica usuários responsáveis por ações que resultaram em problemas de segurança
 * 
 * OTIMIZADO COM PARALELISMO:
 * - Busca paralela de páginas do CloudTrail
 * - Processamento paralelo de eventos em batches
 * - Upsert em batch no banco de dados
 */

import { getHttpMethod } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logging.js';
import { getContextualExplanation, getSecurityExplanation } from '../../lib/security-explanations.js';
import { CloudTrailClient, LookupEventsCommand, LookupEventsCommandInput } from '@aws-sdk/client-cloudtrail';

interface AnalyzeCloudTrailRequest {
  accountId: string;
  region?: string;
  regions?: string[];  // Support multiple regions
  hoursBack?: number;
  maxResults?: number;
  analysisId?: string; // ID from start-cloudtrail-analysis for status tracking
}

interface ProcessedEvent {
  id?: string;
  event_name: string;
  event_time: Date;
  user_name: string;
  user_type: string;
  risk_level: string;
  risk_reasons: string[];
  error_code: string | null;
  source_ip_address: string | null;
  aws_region: string;
  security_explanation?: string;
  remediation_suggestion?: string;
  event_category?: string;
}

interface EventData {
  organization_id: string;
  aws_account_id: string;
  event_id: string;
  event_name: string;
  event_source: string;
  event_time: Date;
  aws_region: string;
  source_ip_address: string | null;
  user_agent: string | null;
  user_identity: any;
  user_name: string;
  user_type: string;
  user_arn: string;
  error_code: string | null;
  error_message: string | null;
  request_parameters: any;
  response_elements: any;
  resources: any;
  risk_level: string;
  risk_reasons: string[];
  security_explanation: string | null;
  remediation_suggestion: string | null;
  event_category: string | null;
  is_security_event: boolean;
}

// High-risk events that indicate security issues
const HIGH_RISK_EVENTS = new Set([
  // IAM - Critical
  'CreateUser', 'DeleteUser', 'CreateAccessKey', 'DeleteAccessKey',
  'CreateLoginProfile', 'UpdateLoginProfile', 'DeleteLoginProfile',
  'AttachUserPolicy', 'DetachUserPolicy', 'PutUserPolicy', 'DeleteUserPolicy',
  'AttachRolePolicy', 'DetachRolePolicy', 'PutRolePolicy', 'DeleteRolePolicy',
  'AttachGroupPolicy', 'DetachGroupPolicy', 'PutGroupPolicy', 'DeleteGroupPolicy',
  'CreateRole', 'DeleteRole', 'UpdateAssumeRolePolicy',
  'CreatePolicy', 'DeletePolicy', 'CreatePolicyVersion',
  'AddUserToGroup', 'RemoveUserFromGroup',
  'DeactivateMFADevice', 'DeleteVirtualMFADevice',
  'UpdateAccountPasswordPolicy', 'DeleteAccountPasswordPolicy',
  
  // S3 - High Risk
  'PutBucketPolicy', 'DeleteBucketPolicy', 'PutBucketAcl',
  'PutBucketPublicAccessBlock', 'DeleteBucketPublicAccessBlock',
  'PutBucketEncryption', 'DeleteBucketEncryption',
  'PutBucketVersioning', 'DeleteBucket',
  
  // EC2 - Security Groups
  'AuthorizeSecurityGroupIngress', 'AuthorizeSecurityGroupEgress',
  'RevokeSecurityGroupIngress', 'RevokeSecurityGroupEgress',
  'CreateSecurityGroup', 'DeleteSecurityGroup',
  'ModifyInstanceAttribute', 'RunInstances', 'TerminateInstances',
  
  // KMS
  'DisableKey', 'ScheduleKeyDeletion', 'PutKeyPolicy',
  'CreateGrant', 'RevokeGrant',
  
  // CloudTrail
  'StopLogging', 'DeleteTrail', 'UpdateTrail',
  
  // Config
  'StopConfigurationRecorder', 'DeleteConfigurationRecorder',
  'DeleteDeliveryChannel',
  
  // GuardDuty
  'DeleteDetector', 'DisassociateFromMasterAccount',
  
  // Organizations
  'LeaveOrganization', 'RemoveAccountFromOrganization',
  
  // Lambda
  'AddPermission', 'RemovePermission', 'UpdateFunctionConfiguration',
  
  // RDS
  'ModifyDBInstance', 'DeleteDBInstance', 'ModifyDBCluster',
  
  // Secrets Manager
  'DeleteSecret', 'PutSecretValue',
  
  // Console Login
  'ConsoleLogin',
]);

// Medium risk events
const MEDIUM_RISK_EVENTS = new Set([
  'CreateBucket', 'PutObject', 'DeleteObject',
  'CreateDBInstance', 'CreateDBCluster',
  'CreateFunction', 'UpdateFunctionCode',
  'CreateStack', 'UpdateStack', 'DeleteStack',
  'CreateVpc', 'DeleteVpc', 'CreateSubnet', 'DeleteSubnet',
  'CreateNetworkAcl', 'DeleteNetworkAcl',
  'CreateInternetGateway', 'DeleteInternetGateway',
  'CreateNatGateway', 'DeleteNatGateway',
  'AssumeRole', 'GetSessionToken',
]);

function analyzeEventRisk(eventName: string, errorCode: string | null, userIdentity: any): { level: string; reasons: string[] } {
  const reasons: string[] = [];
  let level = 'low';
  
  if (HIGH_RISK_EVENTS.has(eventName)) {
    level = 'high';
    reasons.push(`Evento de alto risco: ${eventName}`);
  } else if (MEDIUM_RISK_EVENTS.has(eventName)) {
    level = 'medium';
    reasons.push(`Evento de risco médio: ${eventName}`);
  }
  
  if (userIdentity?.type === 'Root') {
    level = 'critical';
    reasons.push('Ação executada pelo usuário root');
  }
  
  if (errorCode === 'AccessDenied' || errorCode === 'UnauthorizedAccess') {
    if (level === 'low') level = 'medium';
    reasons.push(`Tentativa de acesso negada: ${errorCode}`);
  }
  
  if (eventName === 'ConsoleLogin' && errorCode) {
    level = 'high';
    reasons.push('Falha de login no console AWS');
  }
  
  if (eventName === 'ConsoleLogin' && !errorCode && userIdentity?.type === 'Root') {
    level = 'critical';
    reasons.push('Login do usuário root no console');
  }
  
  if (eventName.includes('Policy') && !errorCode) {
    if (level !== 'critical') level = 'high';
    reasons.push('Alteração de política IAM');
  }
  
  if (eventName.includes('SecurityGroup') && !errorCode) {
    if (level === 'low') level = 'medium';
    reasons.push('Modificação de Security Group');
  }
  
  if (eventName.includes('MFA') && eventName.includes('Deactivate')) {
    level = 'critical';
    reasons.push('MFA desativado');
  }
  
  if (eventName === 'StopLogging' || eventName === 'DeleteTrail') {
    level = 'critical';
    reasons.push('Logging do CloudTrail desativado');
  }
  
  return { level, reasons };
}

function extractUserInfo(userIdentity: any): { userName: string; userType: string; userArn: string } {
  let userName = 'Unknown';
  let userType = userIdentity?.type || 'Unknown';
  let userArn = userIdentity?.arn || '';
  
  if (userIdentity) {
    if (userIdentity.userName) {
      userName = userIdentity.userName;
    } else if (userIdentity.sessionContext?.sessionIssuer?.userName) {
      userName = userIdentity.sessionContext.sessionIssuer.userName;
    } else if (userIdentity.principalId) {
      const parts = userIdentity.principalId.split(':');
      userName = parts.length > 1 ? parts[1] : parts[0];
    } else if (userIdentity.type === 'Root') {
      userName = 'root';
    } else if (userIdentity.invokedBy) {
      userName = userIdentity.invokedBy;
    }
  }
  
  return { userName, userType, userArn };
}

// Process a single CloudTrail event
function processEvent(ctEvent: any, organizationId: string, accountId: string, defaultRegion: string): EventData | null {
  try {
    const eventData = ctEvent.CloudTrailEvent ? JSON.parse(ctEvent.CloudTrailEvent) : {};
    
    const eventName = ctEvent.EventName || eventData.eventName || 'Unknown';
    const eventSource = eventData.eventSource || 'unknown';
    const eventTime = ctEvent.EventTime || new Date(eventData.eventTime);
    const userIdentity = eventData.userIdentity || {};
    const errorCode = eventData.errorCode || null;
    const errorMessage = eventData.errorMessage || null;
    const sourceIp = eventData.sourceIPAddress || null;
    
    const { userName, userType, userArn } = extractUserInfo(userIdentity);
    const { level: riskLevel, reasons: riskReasons } = analyzeEventRisk(eventName, errorCode, userIdentity);
    
    // Get security explanation and remediation
    const baseExplanation = getSecurityExplanation(eventName);
    const { explanation, remediation } = getContextualExplanation(eventName, errorCode, userType, sourceIp);
    
    const isSecurityEvent = HIGH_RISK_EVENTS.has(eventName) || 
                           MEDIUM_RISK_EVENTS.has(eventName) ||
                           riskLevel !== 'low';
    
    const resources = ctEvent.Resources?.map((r: any) => ({
      resourceType: r.ResourceType,
      resourceName: r.ResourceName,
    })) || [];
    
    return {
      organization_id: organizationId,
      aws_account_id: accountId,
      event_id: ctEvent.EventId || `${eventTime.getTime()}-${eventName}`,
      event_name: eventName,
      event_source: eventSource,
      event_time: eventTime,
      aws_region: eventData.awsRegion || defaultRegion,
      source_ip_address: sourceIp,
      user_agent: eventData.userAgent || null,
      user_identity: userIdentity,
      user_name: userName,
      user_type: userType,
      user_arn: userArn,
      error_code: errorCode,
      error_message: errorMessage,
      request_parameters: eventData.requestParameters || null,
      response_elements: eventData.responseElements || null,
      resources: resources,
      risk_level: riskLevel,
      risk_reasons: riskReasons,
      security_explanation: isSecurityEvent ? explanation : null,
      remediation_suggestion: isSecurityEvent ? remediation : null,
      event_category: baseExplanation.category,
      is_security_event: isSecurityEvent,
    };
  } catch {
    return null;
  }
}

// Sleep utility for delays
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 1000,
  maxDelay: number = 30000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a rate limit error
      const isRateLimit = error.name === 'ThrottlingException' || 
                         error.message?.includes('Rate exceeded') ||
                         error.message?.includes('Throttling') ||
                         error.$metadata?.httpStatusCode === 429;
      
      if (!isRateLimit || attempt === maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = Math.random() * 1000; // Add up to 1 second of jitter
      const delay = exponentialDelay + jitter;
      
      logger.warn(`Rate limit hit, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`, {
        error: error.message,
        attempt: attempt + 1,
        maxRetries,
        delay: Math.round(delay)
      });
      
      await sleep(delay);
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

// Fetch events from a single region with pagination and rate limit handling
async function fetchEventsFromRegion(
  credentials: any,
  region: string,
  startTime: Date,
  endTime: Date,
  maxResults: number
): Promise<any[]> {
  const ctClient = new CloudTrailClient({
    region,
    credentials,
  });
  
  const commandInput: LookupEventsCommandInput = {
    StartTime: startTime,
    EndTime: endTime,
    MaxResults: 50, // CloudTrail max per request
  };
  
  const allEvents: any[] = [];
  let nextToken: string | undefined;
  let paginationCount = 0;
  const maxPaginations = Math.ceil(maxResults / 50);
  
  // Delay between requests to avoid rate limiting (CloudTrail has 2 TPS limit)
  const REQUEST_DELAY = 600; // 600ms = ~1.6 requests per second (safe margin)
  
  do {
    if (nextToken) {
      commandInput.NextToken = nextToken;
    }
    
    // Add delay between requests (except first one)
    if (paginationCount > 0) {
      await sleep(REQUEST_DELAY);
    }
    
    // Fetch with retry and backoff
    const response = await retryWithBackoff(
      async () => await ctClient.send(new LookupEventsCommand(commandInput)),
      5, // max retries
      2000, // base delay 2s
      60000 // max delay 60s
    );
    
    if (response.Events) {
      allEvents.push(...response.Events);
      logger.info(`Fetched ${response.Events.length} events from ${region} (page ${paginationCount + 1})`, {
        region,
        pageEvents: response.Events.length,
        totalEvents: allEvents.length,
        hasMore: !!response.NextToken
      });
    }
    
    nextToken = response.NextToken;
    paginationCount++;
    
    if (allEvents.length >= maxResults || paginationCount >= maxPaginations) {
      break;
    }
  } while (nextToken);
  
  return allEvents;
}

// Batch upsert events using raw SQL for performance
async function batchUpsertEvents(prisma: any, events: EventData[]): Promise<number> {
  if (events.length === 0) return 0;
  
  let savedCount = 0;
  const BATCH_SIZE = 100;
  
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    
    // Use Promise.all for parallel upserts within batch
    const results = await Promise.all(
      batch.map(event => 
        prisma.cloudTrailEvent.upsert({
          where: {
            organization_id_event_id: {
              organization_id: event.organization_id,
              event_id: event.event_id,
            },
          },
          update: {
            risk_level: event.risk_level,
            risk_reasons: event.risk_reasons,
            security_explanation: event.security_explanation,
            remediation_suggestion: event.remediation_suggestion,
            event_category: event.event_category,
            is_security_event: event.is_security_event,
          },
          create: event,
        }).catch(() => null) // Ignore individual failures
      )
    );
    
    savedCount += results.filter(r => r !== null).length;
  }
  
  return savedCount;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationIdWithImpersonation(event, user);
  
  logger.info('Analyze CloudTrail started', { 
    organizationId,
    userId: user.sub,
    requestId: context.awsRequestId 
  });
  
  try {
    const body: AnalyzeCloudTrailRequest = event.body ? JSON.parse(event.body) : {};
    const {
      accountId,
      region = 'us-east-1',
      regions,
      hoursBack = 24,
      maxResults = 5000,
    } = body;
    
    if (!accountId) {
      return error('Missing required parameter: accountId');
    }
    
    const prisma = getPrismaClient();
    
    const account = await prisma.awsCredential.findFirst({
      where: { id: accountId, organization_id: organizationId, is_active: true },
    });
    
    if (!account) {
      return error('AWS account not found');
    }
    
    const resolvedCreds = await resolveAwsCredentials(account, region);
    const awsCreds = toAwsCredentials(resolvedCreds);
    
    const startTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const endTime = new Date();
    
    // Determine regions to scan - use account's registered regions if available
    // Priority: 1) explicit regions param, 2) account's registered regions, 3) default region
    let regionsToScan: string[];
    if (regions && regions.length > 0) {
      regionsToScan = regions;
    } else if (account.regions && account.regions.length > 0) {
      regionsToScan = account.regions;
    } else {
      regionsToScan = [region];
    }
    
    const maxResultsPerRegion = Math.ceil(maxResults / regionsToScan.length);
    
    logger.info('Fetching CloudTrail events', { 
      regions: regionsToScan,
      hoursBack,
      maxResultsPerRegion
    });
    
    // SEQUENTIAL with delay: Fetch events from regions one by one to avoid rate limits
    // CloudTrail has a 2 TPS (transactions per second) limit per account
    const allEvents: any[] = [];
    const REGION_DELAY = 2000; // 2 seconds delay between regions
    
    for (let i = 0; i < regionsToScan.length; i++) {
      const r = regionsToScan[i];
      
      // Add delay between regions (except first one)
      if (i > 0) {
        logger.info(`Waiting ${REGION_DELAY}ms before fetching next region`, { 
          nextRegion: r,
          regionIndex: i + 1,
          totalRegions: regionsToScan.length
        });
        await sleep(REGION_DELAY);
      }
      
      try {
        logger.info(`Fetching events from region ${r}`, { 
          region: r,
          regionIndex: i + 1,
          totalRegions: regionsToScan.length
        });
        
        const regionEvents = await fetchEventsFromRegion(
          awsCreds, 
          r, 
          startTime, 
          endTime, 
          maxResultsPerRegion
        );
        
        allEvents.push(...regionEvents);
        
        logger.info(`Region ${r} fetch completed`, { 
          region: r,
          eventsFound: regionEvents.length,
          totalEventsSoFar: allEvents.length
        });
      } catch (err: any) {
        logger.warn(`Failed to fetch from region ${r}`, { 
          region: r,
          error: err.message,
          errorType: err.name
        });
        // Continue with next region even if one fails
      }
    }
    
    logger.info('CloudTrail events fetched from all regions', { 
      totalCount: allEvents.length,
      regions: regionsToScan,
      hoursBack
    });
    
    // PARALLEL: Process events in parallel batches
    const PROCESS_BATCH_SIZE = 500;
    const processedEvents: EventData[] = [];
    
    for (let i = 0; i < allEvents.length; i += PROCESS_BATCH_SIZE) {
      const batch = allEvents.slice(i, i + PROCESS_BATCH_SIZE);
      const processed = batch
        .map(e => processEvent(e, organizationId, accountId, region))
        .filter((e): e is EventData => e !== null);
      processedEvents.push(...processed);
    }
    
    logger.info('Events processed', { processedCount: processedEvents.length });
    
    // PARALLEL: Batch upsert to database
    const savedCount = await batchUpsertEvents(prisma, processedEvents);
    
    // Calculate summary
    const summary = {
      total: processedEvents.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      errors: 0,
      byUser: {} as Record<string, number>,
      byEventName: {} as Record<string, number>,
    };
    
    const savedEvents: ProcessedEvent[] = [];
    
    for (const event of processedEvents) {
      summary[event.risk_level as keyof typeof summary]++;
      if (event.error_code) summary.errors++;
      summary.byUser[event.user_name] = (summary.byUser[event.user_name] || 0) + 1;
      summary.byEventName[event.event_name] = (summary.byEventName[event.event_name] || 0) + 1;
      
      savedEvents.push({
        event_name: event.event_name,
        event_time: event.event_time,
        user_name: event.user_name,
        user_type: event.user_type,
        risk_level: event.risk_level,
        risk_reasons: event.risk_reasons,
        error_code: event.error_code,
        source_ip_address: event.source_ip_address,
        aws_region: event.aws_region,
      });
    }
    
    const topUsers = Object.entries(summary.byUser)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([user, count]) => ({ user, count }));
    
    const topEvents = Object.entries(summary.byEventName)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([event, count]) => ({ event, count }));
    
    logger.info('CloudTrail analysis completed', { 
      organizationId,
      accountId,
      regions: regionsToScan,
      savedCount,
      summary: {
        total: summary.total,
        critical: summary.critical,
        high: summary.high,
        medium: summary.medium,
        low: summary.low,
      }
    });
    
    // Update analysis status if analysisId was provided (async invocation)
    if (body.analysisId) {
      try {
        await prisma.cloudTrailAnalysis.update({
          where: { id: body.analysisId },
          data: {
            status: 'completed',
            events_processed: processedEvents.length,
            events_saved: savedCount,
            critical_count: summary.critical,
            high_count: summary.high,
            medium_count: summary.medium,
            low_count: summary.low,
            completed_at: new Date(),
          },
        });
        logger.info('Analysis status updated to completed', { analysisId: body.analysisId });
      } catch (updateErr) {
        logger.warn('Failed to update analysis status', { analysisId: body.analysisId, error: (updateErr as Error).message });
      }
    }
    
    return success({
      success: true,
      events: savedEvents,
      summary: {
        total: summary.total,
        critical: summary.critical,
        high: summary.high,
        medium: summary.medium,
        low: summary.low,
        errors: summary.errors,
        topUsers,
        topEvents,
        timeRange: {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          hoursBack,
        },
        regionsScanned: regionsToScan,
      },
    });
    
  } catch (err) {
    logger.error('Analyze CloudTrail error', err as Error, { 
      organizationId,
      userId: user.sub,
      requestId: context.awsRequestId 
    });
    
    // Update analysis status to failed if analysisId was provided
    const body: AnalyzeCloudTrailRequest = event.body ? JSON.parse(event.body) : {};
    if (body.analysisId) {
      try {
        const prisma = getPrismaClient();
        await prisma.cloudTrailAnalysis.update({
          where: { id: body.analysisId },
          data: {
            status: 'failed',
            error_message: err instanceof Error ? err.message : 'Unknown error',
            completed_at: new Date(),
          },
        });
      } catch (updateErr) {
        logger.warn('Failed to update analysis status to failed', { analysisId: body.analysisId });
      }
    }
    
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
