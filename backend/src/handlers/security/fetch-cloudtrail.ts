import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { getPrismaClient } from '../../lib/database.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getOrigin } from '../../lib/middleware.js';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { CloudTrailClient, LookupEventsCommand, LookupAttribute } from '@aws-sdk/client-cloudtrail';

interface CloudTrailRequest {
  awsAccountId: string;
  startTime?: string;
  endTime?: string;
  eventName?: string;
  resourceType?: string;
  resourceName?: string;
  username?: string;
  maxResults?: number;
}

interface CloudTrailEvent {
  eventId: string;
  eventName: string;
  eventTime: Date;
  eventSource: string;
  username: string;
  sourceIPAddress: string;
  userAgent: string;
  resources: { resourceType: string; resourceName: string }[];
  errorCode?: string;
  errorMessage?: string;
  readOnly: boolean;
  rawEvent: Record<string, unknown>;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  let organizationId: string;
  let userId: string;
  
  try {
    const user = getUserFromEvent(event);
    userId = user.sub || user.id || 'unknown';
    organizationId = getOrganizationIdWithImpersonation(event, user);
  } catch (authError: any) {
    logger.error('Authentication error', authError);
    return error('Unauthorized', 401, undefined, origin);
  }

  try {
    const body: CloudTrailRequest = event.body ? JSON.parse(event.body) : {};
    const { awsAccountId, startTime, endTime, eventName, resourceType, resourceName, username, maxResults = 50 } = body;

    if (!awsAccountId) {
      return badRequest('awsAccountId is required', undefined, origin);
    }

    const prisma = getPrismaClient();
    const stsClient = new STSClient({});

    // Buscar credenciais AWS - FILTRAR POR ORGANIZATION_ID
    const awsCredential = await prisma.awsCredential.findFirst({
      where: { 
        id: awsAccountId,
        organization_id: organizationId  // CRITICAL: Multi-tenancy filter
      },
      include: { organization: true }
    });

    if (!awsCredential) {
      return error('AWS Credential not found', 404, undefined, origin);
    }

    // Assume role
    const assumeRoleResponse = await stsClient.send(new AssumeRoleCommand({
      RoleArn: awsCredential.role_arn!,
      RoleSessionName: 'FetchCloudTrailSession',
      ExternalId: awsCredential.external_id!,
      DurationSeconds: 3600
    }));

    const credentials = {
      accessKeyId: assumeRoleResponse.Credentials!.AccessKeyId!,
      secretAccessKey: assumeRoleResponse.Credentials!.SecretAccessKey!,
      sessionToken: assumeRoleResponse.Credentials!.SessionToken!
    };

    const cloudTrailClient = new CloudTrailClient({ region: 'us-east-1', credentials });

    // Construir filtros
    const lookupAttributes: LookupAttribute[] = [];
    
    if (eventName) {
      lookupAttributes.push({ AttributeKey: 'EventName', AttributeValue: eventName });
    }
    if (resourceType) {
      lookupAttributes.push({ AttributeKey: 'ResourceType', AttributeValue: resourceType });
    }
    if (resourceName) {
      lookupAttributes.push({ AttributeKey: 'ResourceName', AttributeValue: resourceName });
    }
    if (username) {
      lookupAttributes.push({ AttributeKey: 'Username', AttributeValue: username });
    }

    // Definir período
    const end = endTime ? new Date(endTime) : new Date();
    const start = startTime ? new Date(startTime) : new Date(end.getTime() - 24 * 60 * 60 * 1000);

    // Buscar eventos
    const response = await cloudTrailClient.send(new LookupEventsCommand({
      LookupAttributes: lookupAttributes.length > 0 ? lookupAttributes : undefined,
      StartTime: start,
      EndTime: end,
      MaxResults: Math.min(maxResults, 50)
    }));

    // Processar eventos
    const events: CloudTrailEvent[] = (response.Events || []).map(e => {
      const cloudTrailEvent = e.CloudTrailEvent ? JSON.parse(e.CloudTrailEvent) : {};
      
      return {
        eventId: e.EventId || '',
        eventName: e.EventName || '',
        eventTime: e.EventTime || new Date(),
        eventSource: e.EventSource || '',
        username: e.Username || 'Unknown',
        sourceIPAddress: cloudTrailEvent.sourceIPAddress || '',
        userAgent: cloudTrailEvent.userAgent || '',
        resources: (e.Resources || []).map(r => ({
          resourceType: r.ResourceType || '',
          resourceName: r.ResourceName || ''
        })),
        errorCode: cloudTrailEvent.errorCode,
        errorMessage: cloudTrailEvent.errorMessage,
        readOnly: cloudTrailEvent.readOnly || false,
        rawEvent: cloudTrailEvent
      };
    });

    // Analisar eventos para detectar atividades suspeitas
    const suspiciousEvents = analyzeSuspiciousActivity(events);

    // Agrupar por tipo de evento
    const eventsByType = events.reduce((acc, e) => {
      acc[e.eventName] = (acc[e.eventName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Agrupar por usuário
    const eventsByUser = events.reduce((acc, e) => {
      acc[e.username] = (acc[e.username] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Salvar no banco para análise histórica
    await prisma.cloudTrailFetch.create({
      data: {
        organization_id: awsCredential.organization_id,
        aws_account_id: awsAccountId,
        region: 'us-east-1',
        start_time: new Date(startTime || Date.now() - 24 * 60 * 60 * 1000),
        end_time: new Date(endTime || Date.now()),
        status: 'completed',
        events_count: events.length
      }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        summary: {
          totalEvents: events.length,
          timeRange: { start: start.toISOString(), end: end.toISOString() },
          byEventType: eventsByType,
          byUser: eventsByUser,
          suspiciousEvents: suspiciousEvents.length
        },
        events,
        suspiciousActivity: suspiciousEvents
      })
    };
  } catch (error) {
    logger.error('Fetch CloudTrail error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};

function analyzeSuspiciousActivity(events: CloudTrailEvent[]): CloudTrailEvent[] {
  const suspicious: CloudTrailEvent[] = [];

  // Eventos de alto risco
  const highRiskEvents = [
    'DeleteTrail', 'StopLogging', 'UpdateTrail',
    'CreateUser', 'DeleteUser', 'CreateAccessKey', 'DeleteAccessKey',
    'AttachUserPolicy', 'AttachRolePolicy', 'PutUserPolicy', 'PutRolePolicy',
    'CreateRole', 'DeleteRole', 'UpdateAssumeRolePolicy',
    'AuthorizeSecurityGroupIngress', 'AuthorizeSecurityGroupEgress',
    'CreateSecurityGroup', 'DeleteSecurityGroup',
    'ModifyInstanceAttribute', 'RunInstances',
    'CreateBucket', 'DeleteBucket', 'PutBucketPolicy', 'DeleteBucketPolicy',
    'PutBucketAcl', 'PutObjectAcl'
  ];

  // IPs suspeitos (exemplo - em produção usar lista atualizada)
  const suspiciousIPs = ['0.0.0.0'];

  for (const event of events) {
    // Eventos de alto risco
    if (highRiskEvents.includes(event.eventName)) {
      suspicious.push(event);
      continue;
    }

    // Eventos com erro (podem indicar tentativas de ataque)
    if (event.errorCode === 'AccessDenied' || event.errorCode === 'UnauthorizedAccess') {
      suspicious.push(event);
      continue;
    }

    // IPs suspeitos
    if (suspiciousIPs.includes(event.sourceIPAddress)) {
      suspicious.push(event);
      continue;
    }

    // Atividade fora do horário comercial (exemplo: entre 22h e 6h)
    const hour = event.eventTime.getHours();
    if ((hour >= 22 || hour < 6) && !event.readOnly) {
      suspicious.push(event);
    }
  }

  return suspicious;
}
