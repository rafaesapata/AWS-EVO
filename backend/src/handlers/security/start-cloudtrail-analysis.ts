/**
 * Lambda handler para iniciar análise CloudTrail de forma assíncrona
 * Retorna imediatamente e invoca analyze-cloudtrail em background
 * 
 * CONTROLE DE PERÍODOS:
 * - Verifica se o período solicitado já foi processado
 * - Evita reprocessamento de dados já analisados
 * - Permite forçar reprocessamento com flag forceReprocess
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getOrigin, getHttpMethod } from '../../lib/middleware.js';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

interface StartAnalysisRequest {
  accountId: string;
  hoursBack?: number;
  maxResults?: number;
  forceReprocess?: boolean; // Force reprocessing even if period was already analyzed
}

interface OverlapInfo {
  hasOverlap: boolean;
  overlappingAnalyses: Array<{
    id: string;
    period_start: Date;
    period_end: Date;
    status: string;
    events_processed: number | null;
  }>;
  coveragePercent: number;
  uncoveredRanges: Array<{ start: Date; end: Date }>;
}

/**
 * Check if the requested period overlaps with already processed analyses
 */
async function checkPeriodOverlap(
  prisma: any,
  organizationId: string,
  accountId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<OverlapInfo> {
  // Find completed analyses that overlap with the requested period
  const overlappingAnalyses = await prisma.cloudTrailAnalysis.findMany({
    where: {
      organization_id: organizationId,
      aws_account_id: accountId,
      status: 'completed',
      OR: [
        // Analysis period starts within requested period
        {
          period_start: { gte: periodStart, lte: periodEnd },
        },
        // Analysis period ends within requested period
        {
          period_end: { gte: periodStart, lte: periodEnd },
        },
        // Analysis period completely contains requested period
        {
          period_start: { lte: periodStart },
          period_end: { gte: periodEnd },
        },
      ],
    },
    orderBy: { period_start: 'asc' },
    select: {
      id: true,
      period_start: true,
      period_end: true,
      status: true,
      events_processed: true,
    },
  });

  if (overlappingAnalyses.length === 0) {
    return {
      hasOverlap: false,
      overlappingAnalyses: [],
      coveragePercent: 0,
      uncoveredRanges: [{ start: periodStart, end: periodEnd }],
    };
  }

  // Calculate coverage percentage
  const requestedDuration = periodEnd.getTime() - periodStart.getTime();
  let coveredDuration = 0;
  const coveredRanges: Array<{ start: number; end: number }> = [];

  for (const analysis of overlappingAnalyses) {
    const overlapStart = Math.max(periodStart.getTime(), analysis.period_start.getTime());
    const overlapEnd = Math.min(periodEnd.getTime(), analysis.period_end.getTime());
    
    if (overlapEnd > overlapStart) {
      coveredRanges.push({ start: overlapStart, end: overlapEnd });
    }
  }

  // Merge overlapping ranges and calculate total coverage
  coveredRanges.sort((a, b) => a.start - b.start);
  const mergedRanges: Array<{ start: number; end: number }> = [];
  
  for (const range of coveredRanges) {
    if (mergedRanges.length === 0 || range.start > mergedRanges[mergedRanges.length - 1].end) {
      mergedRanges.push({ ...range });
    } else {
      mergedRanges[mergedRanges.length - 1].end = Math.max(
        mergedRanges[mergedRanges.length - 1].end,
        range.end
      );
    }
  }

  for (const range of mergedRanges) {
    coveredDuration += range.end - range.start;
  }

  const coveragePercent = Math.round((coveredDuration / requestedDuration) * 100);

  // Calculate uncovered ranges
  const uncoveredRanges: Array<{ start: Date; end: Date }> = [];
  let currentStart = periodStart.getTime();

  for (const range of mergedRanges) {
    if (range.start > currentStart) {
      uncoveredRanges.push({
        start: new Date(currentStart),
        end: new Date(range.start),
      });
    }
    currentStart = range.end;
  }

  if (currentStart < periodEnd.getTime()) {
    uncoveredRanges.push({
      start: new Date(currentStart),
      end: periodEnd,
    });
  }

  return {
    hasOverlap: true,
    overlappingAnalyses,
    coveragePercent,
    uncoveredRanges,
  };
}

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }

  let user: ReturnType<typeof getUserFromEvent>;
  let organizationId: string;
  
  try {
    user = getUserFromEvent(event);
    organizationId = getOrganizationId(user);
  } catch (authError) {
    return error('Unauthorized', 401, undefined, origin);
  }
  
  const prisma = getPrismaClient();
  
  // Validate that prisma client was created successfully
  if (!prisma) {
    logger.error('Prisma client is undefined');
    return error('Database client initialization failed', 500, undefined, origin);
  }
  
  // Ensure database connection is established with retry logic
  let connectionAttempts = 0;
  const maxAttempts = 3;
  
  while (connectionAttempts < maxAttempts) {
    try {
      await prisma.$connect();
      // Test the connection with a simple query
      await prisma.$queryRaw`SELECT 1`;
      logger.info('Database connection established successfully');
      break;
    } catch (dbError) {
      connectionAttempts++;
      logger.warn(`Database connection attempt ${connectionAttempts} failed`, { 
        error: (dbError as Error).message,
        attempt: connectionAttempts,
        maxAttempts 
      });
      
      if (connectionAttempts >= maxAttempts) {
        logger.error('Database connection failed after all attempts', dbError as Error);
        return error('Database connection failed', 500, undefined, origin);
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, connectionAttempts) * 1000));
    }
  }
  
  try {
    const body: StartAnalysisRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId, hoursBack = 24, maxResults = 5000, forceReprocess = false } = body;
    
    // Validate hoursBack parameter (max 120 days = 2880 hours)
    if (hoursBack > 2880) {
      return badRequest('Maximum analysis period is 120 days (2880 hours)', undefined, origin);
    }
    
    if (!accountId) {
      return badRequest('Missing required parameter: accountId', undefined, origin);
    }
    
    // Verify account exists and belongs to organization
    const account = await prisma.awsCredential.findFirst({
      where: { id: accountId, organization_id: organizationId, is_active: true },
    });
    
    if (!account) {
      return badRequest('AWS account not found', undefined, origin);
    }
    
    // Calculate the period to analyze
    const periodEnd = new Date();
    const periodStart = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    
    // Check for running analyses on the same account
    const runningAnalysis = await prisma.cloudTrailAnalysis.findFirst({
      where: {
        organization_id: organizationId,
        aws_account_id: accountId,
        status: 'running',
      },
    });
    
    if (runningAnalysis) {
      return success({
        success: false,
        alreadyRunning: true,
        analysisId: runningAnalysis.id,
        message: 'Já existe uma análise em andamento para esta conta. Aguarde a conclusão.',
      }, 200, origin);
    }
    
    // Check for period overlap with completed analyses
    const overlapInfo = await checkPeriodOverlap(
      prisma,
      organizationId,
      accountId,
      periodStart,
      periodEnd
    );
    
    // If period is fully covered and not forcing reprocess, return info
    if (overlapInfo.coveragePercent >= 95 && !forceReprocess) {
      logger.info('Period already processed', {
        organizationId,
        accountId,
        periodStart,
        periodEnd,
        coveragePercent: overlapInfo.coveragePercent,
      });
      
      return success({
        success: false,
        periodAlreadyProcessed: true,
        coveragePercent: overlapInfo.coveragePercent,
        overlappingAnalyses: overlapInfo.overlappingAnalyses.map(a => ({
          id: a.id,
          periodStart: a.period_start,
          periodEnd: a.period_end,
          eventsProcessed: a.events_processed,
        })),
        message: `Este período já foi processado (${overlapInfo.coveragePercent}% coberto). Use a opção "Forçar Reprocessamento" para analisar novamente.`,
      }, 200, origin);
    }
    
    // Create analysis record in database for status tracking
    const analysis = await prisma.cloudTrailAnalysis.create({
      data: {
        organization_id: organizationId,
        aws_account_id: accountId,
        status: 'running',
        hours_back: hoursBack,
        max_results: maxResults,
        period_start: periodStart,
        period_end: periodEnd,
        started_at: new Date(),
      },
    });
    
    const analysisId = analysis.id;
    
    logger.info('Starting CloudTrail analysis async', { 
      analysisId,
      organizationId, 
      accountId,
      hoursBack,
      maxResults,
      periodStart,
      periodEnd,
      forceReprocess,
      previousCoverage: overlapInfo.coveragePercent,
    });
    
    // Invoke analyze-cloudtrail Lambda asynchronously
    const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
    
    const payload = {
      body: JSON.stringify({
        accountId,
        hoursBack,
        maxResults,
        analysisId, // Pass analysis ID for correlation
      }),
      requestContext: event.requestContext,
      headers: event.headers,
    };
    
    await lambdaClient.send(new InvokeCommand({
      FunctionName: process.env.ANALYZE_CLOUDTRAIL_FUNCTION || 'evo-uds-v3-production-analyze-cloudtrail',
      InvocationType: 'Event', // Async invocation
      Payload: Buffer.from(JSON.stringify(payload)),
    }));
    
    logger.info('CloudTrail analysis Lambda invoked async', { analysisId });
    
    return success({
      success: true,
      analysisId,
      status: 'running',
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      previousCoverage: overlapInfo.coveragePercent,
      message: overlapInfo.coveragePercent > 0 
        ? `Análise iniciada. Período parcialmente coberto (${overlapInfo.coveragePercent}%), reprocessando dados.`
        : 'Análise iniciada. Os dados serão atualizados automaticamente.',
    }, 202, origin); // 202 Accepted
    
  } catch (err) {
    logger.error('Start CloudTrail analysis error', err as Error);
    return error(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
  }
}
