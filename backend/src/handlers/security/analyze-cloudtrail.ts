import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Analyze CloudTrail
 * AWS Lambda Handler for analyze-cloudtrail
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logging.js';
import { CloudTrailClient, LookupEventsCommand } from '@aws-sdk/client-cloudtrail';

interface AnalyzeCloudTrailRequest {
  accountId: string;
  region?: string;
  startTime?: string;
  endTime?: string;
  maxResults?: number;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationId(user);
  
  logger.info('Analyze CloudTrail started', { 
    organizationId,
    userId: user.id,
    requestId: context.awsRequestId 
  });
  
  try {
    const body: AnalyzeCloudTrailRequest = event.body ? JSON.parse(event.body) : {};
    const {
      accountId,
      region = 'us-east-1',
      startTime = getTimeAgo(24),
      endTime = new Date().toISOString(),
      maxResults = 50,
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
    
    const ctClient = new CloudTrailClient({
      region,
      credentials: toAwsCredentials(resolvedCreds),
    });
    
    const command = new LookupEventsCommand({
      StartTime: new Date(startTime),
      EndTime: new Date(endTime),
      MaxResults: maxResults,
    });
    
    const response = await ctClient.send(command);
    
    const events = (response.Events || []).map(e => ({
      eventId: e.EventId,
      eventName: e.EventName,
      eventTime: e.EventTime?.toISOString(),
      username: e.Username,
      resources: e.Resources,
      cloudTrailEvent: e.CloudTrailEvent,
    }));
    
    logger.info('CloudTrail analysis completed', { 
      organizationId,
      accountId,
      region,
      eventsCount: events.length,
      timeRange: { startTime, endTime }
    });
    
    return success({
      success: true,
      events,
      summary: {
        count: events.length,
        startTime,
        endTime,
      },
    });
    
  } catch (err) {
    logger.error('Analyze CloudTrail error', err as Error, { 
      organizationId,
      userId: user.id,
      requestId: context.awsRequestId 
    });
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

function getTimeAgo(hours: number): string {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date.toISOString();
}
