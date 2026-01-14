import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for IAM Behavior Analysis
 * AWS Lambda Handler for iam-behavior-analysis
 * 
 * Analisa comportamento de usuários IAM para detectar anomalias
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { CloudTrailClient, LookupEventsCommand } from '@aws-sdk/client-cloudtrail';
import { IAMClient, ListUsersCommand, GetUserCommand } from '@aws-sdk/client-iam';

interface IAMBehaviorAnalysisRequest {
  accountId: string;
  region?: string;
  lookbackDays?: number;
}

interface BehaviorAnomaly {
  userName: string;
  anomalyType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: any;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 IAM Behavior Analysis started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    const body: IAMBehaviorAnalysisRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId, region: requestedRegion, lookbackDays = 7 } = body;
    
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
    
    // Usar região solicitada, ou primeira região da conta, ou padrão
    const accountRegions = account.regions as string[] | null;
    const region = requestedRegion || 
                   (accountRegions && accountRegions.length > 0 ? accountRegions[0] : 'us-east-1');
    
    const resolvedCreds = await resolveAwsCredentials(account, region);
    
    // Listar usuários IAM
    const iamClient = new IAMClient({
      region: 'us-east-1', // IAM é global
      credentials: toAwsCredentials(resolvedCreds),
    });
    
    const usersResponse = await iamClient.send(new ListUsersCommand({}));
    const users = usersResponse.Users || [];
    
    // Buscar eventos do CloudTrail
    const ctClient = new CloudTrailClient({
      region,
      credentials: toAwsCredentials(resolvedCreds),
    });
    
    const startTime = new Date();
    startTime.setDate(startTime.getDate() - lookbackDays);
    
    const eventsResponse = await ctClient.send(new LookupEventsCommand({
      StartTime: startTime,
      EndTime: new Date(),
      MaxResults: 50,
    }));
    
    const events = eventsResponse.Events || [];
    
    // Analisar comportamento
    const anomalies: BehaviorAnomaly[] = [];
    
    for (const iamUser of users) {
      const userName = iamUser.UserName!;
      const userEvents = events.filter(e => e.Username === userName);
      
      // 1. Detectar login fora do horário normal
      const afterHoursLogins = userEvents.filter(e => {
        if (e.EventName !== 'ConsoleLogin') return false;
        const hour = new Date(e.EventTime!).getHours();
        return hour < 6 || hour > 22; // Fora do horário 6h-22h
      });
      
      if (afterHoursLogins.length > 0) {
        anomalies.push({
          userName,
          anomalyType: 'after_hours_login',
          severity: 'medium',
          description: `User logged in ${afterHoursLogins.length} times outside normal hours`,
          evidence: {
            count: afterHoursLogins.length,
            events: afterHoursLogins.slice(0, 3),
          },
        });
      }
      
      // 2. Detectar múltiplas falhas de login
      const failedLogins = userEvents.filter(e => 
        e.EventName === 'ConsoleLogin' && 
        (e as any).ErrorCode
      );
      
      if (failedLogins.length >= 3) {
        anomalies.push({
          userName,
          anomalyType: 'multiple_failed_logins',
          severity: 'high',
          description: `User had ${failedLogins.length} failed login attempts`,
          evidence: {
            count: failedLogins.length,
            events: failedLogins.slice(0, 3),
          },
        });
      }
      
      // 3. Detectar ações administrativas incomuns
      const adminActions = userEvents.filter(e => 
        e.EventName?.includes('Delete') ||
        e.EventName?.includes('Terminate') ||
        e.EventName?.includes('Detach')
      );
      
      if (adminActions.length > 5) {
        anomalies.push({
          userName,
          anomalyType: 'excessive_admin_actions',
          severity: 'high',
          description: `User performed ${adminActions.length} administrative actions`,
          evidence: {
            count: adminActions.length,
            actions: adminActions.map(e => e.EventName).slice(0, 5),
          },
        });
      }
      
      // 4. Detectar acesso de múltiplas localizações
      const ipAddresses = new Set(
        userEvents
          .map(e => e.CloudTrailEvent ? JSON.parse(e.CloudTrailEvent).sourceIPAddress : null)
          .filter(Boolean)
      );
      
      if (ipAddresses.size > 3) {
        anomalies.push({
          userName,
          anomalyType: 'multiple_locations',
          severity: 'medium',
          description: `User accessed from ${ipAddresses.size} different IP addresses`,
          evidence: {
            ipCount: ipAddresses.size,
            ips: Array.from(ipAddresses).slice(0, 5),
          },
        });
      }
    }
    
    // Salvar anomalias no banco
    for (const anomaly of anomalies) {
      await prisma.iAMBehaviorAnomaly.create({
        data: {
          organization_id: organizationId,
          aws_account_id: accountId,
          user_name: anomaly.userName,
          anomaly_type: anomaly.anomalyType,
          severity: anomaly.severity,
          description: anomaly.description,
          evidence: anomaly.evidence,
          detected_at: new Date(),
        },
      });
    }
    
    const criticalCount = anomalies.filter(a => a.severity === 'critical').length;
    const highCount = anomalies.filter(a => a.severity === 'high').length;
    
    logger.info(`✅ Analyzed ${users.length} users, found ${anomalies.length} anomalies`);
    
    return success({
      success: true,
      usersAnalyzed: users.length,
      eventsAnalyzed: events.length,
      anomaliesDetected: anomalies.length,
      summary: {
        critical: criticalCount,
        high: highCount,
        medium: anomalies.filter(a => a.severity === 'medium').length,
        low: anomalies.filter(a => a.severity === 'low').length,
      },
      anomalies,
    });
    
  } catch (err) {
    logger.error('❌ IAM Behavior Analysis error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
