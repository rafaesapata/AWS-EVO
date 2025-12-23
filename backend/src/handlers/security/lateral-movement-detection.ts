import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Lateral Movement Detection
 * AWS Lambda Handler for lateral-movement-detection
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logging.js';
import { CloudTrailClient, LookupEventsCommand } from '@aws-sdk/client-cloudtrail';

interface LateralMovementRequest {
  accountId: string;
  region?: string;
  lookbackHours?: number;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationId(user);
  
  logger.info('Lateral Movement Detection started', { 
    organizationId,
    userId: user.id,
    requestId: context.awsRequestId 
  });
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const body: LateralMovementRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId, region = 'us-east-1', lookbackHours = 24 } = body;
    
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
    
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - lookbackHours);
    
    const response = await ctClient.send(new LookupEventsCommand({
      StartTime: startTime,
      EndTime: new Date(),
      MaxResults: 50,
    }));
    
    const suspiciousActivities: any[] = [];
    const events = response.Events || [];
    
    // Detectar AssumeRole suspeito
    const assumeRoleEvents = events.filter(e => e.EventName === 'AssumeRole');
    if (assumeRoleEvents.length > 5) {
      suspiciousActivities.push({
        type: 'excessive_assume_role',
        severity: 'medium',
        count: assumeRoleEvents.length,
        description: `${assumeRoleEvents.length} AssumeRole events detected`,
      });
    }
    
    // Detectar acesso a múltiplos serviços
    const services = new Set(events.map(e => e.EventSource));
    if (services.size > 10) {
      suspiciousActivities.push({
        type: 'multiple_services_access',
        severity: 'low',
        count: services.size,
        description: `Access to ${services.size} different services`,
      });
    }
    
    logger.info('Lateral movement detection completed', { 
      organizationId, 
      accountId, 
      region,
      eventsAnalyzed: events.length,
      suspiciousActivitiesFound: suspiciousActivities.length 
    });
    
    return success({
      success: true,
      suspiciousActivities,
      eventsAnalyzed: events.length,
    });
    
  } catch (err) {
    logger.error('Lateral Movement Detection error', err as Error, { 
      organizationId,
      userId: user.id,
      requestId: context.awsRequestId 
    });
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
