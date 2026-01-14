import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { ScheduledEvent } from 'aws-lambda';
import { logger } from '../../lib/logging.js';
import { getPrismaClient } from '../../lib/database.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getOrigin } from '../../lib/middleware.js';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const snsClient = new SNSClient({});

interface ValidationResult {
  organizationId: string;
  organizationName: string;
  licenseId: string;
  status: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'EXCEEDED_LIMITS' | 'INVALID';
  issues: string[];
  daysUntilExpiration?: number;
  usageStats: {
    users: { current: number; limit: number };
    accounts: { current: number; limit: number };
    scans: { current: number; limit: number };
  };
}

export async function handler(
  event: AuthorizedEvent | ScheduledEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2 | void> {
  const isScheduled = 'source' in event && event.source === 'aws.events';
  const origin = !isScheduled ? getOrigin(event as AuthorizedEvent) : undefined;
  const httpMethod = !isScheduled ? ((event as AuthorizedEvent).httpMethod || (event as AuthorizedEvent).requestContext?.http?.method) : undefined;
  
  if (!isScheduled && httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }


  // For API calls, validate auth and filter by organization
  let filterOrgId: string | undefined;
  if (!isScheduled) {
    try {
      const authorizedEvent = event as AuthorizedEvent;
      const user = getUserFromEvent(authorizedEvent);
      filterOrgId = getOrganizationIdWithImpersonation(authorizedEvent, user);
    } catch (authError) {
      logger.error('Authentication error', authError);
      return error('Unauthorized', 401, undefined, origin);
    }
  }

  try {
    const prisma = getPrismaClient();
    
    // Buscar licenças - filtrar por org se for chamada API
    const licenses = await prisma.license.findMany({
      where: { 
        is_active: true,
        ...(filterOrgId ? { organization_id: filterOrgId } : {})
      },
      include: {
        organization: {
          include: { profiles: true, aws_accounts: true }
        }
      }
    });

    const results: ValidationResult[] = [];
    const alertsToSend: ValidationResult[] = [];
    const now = new Date();

    for (const license of licenses) {
      const issues: string[] = [];
      let status: ValidationResult['status'] = 'VALID';

      const daysUntilExpiration = Math.ceil(
        (license.valid_until.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysUntilExpiration <= 0) {
        status = 'EXPIRED';
        issues.push('License has expired');
        await prisma.license.update({
          where: { id: license.id },
          data: { is_active: false }
        });
      } else if (daysUntilExpiration <= 7) {
        status = 'EXPIRING_SOON';
        issues.push(`License expires in ${daysUntilExpiration} days`);
      } else if (daysUntilExpiration <= 30) {
        issues.push(`License expires in ${daysUntilExpiration} days`);
      }

      const userCount = license.organization.profiles.length;
      if (userCount > license.max_users) {
        status = status === 'VALID' ? 'EXCEEDED_LIMITS' : status;
        issues.push(`User limit exceeded: ${userCount}/${license.max_users}`);
      }

      const accountCount = license.organization.aws_accounts.length;
      if (accountCount > license.max_accounts) {
        status = status === 'VALID' ? 'EXCEEDED_LIMITS' : status;
        issues.push(`AWS account limit exceeded: ${accountCount}/${license.max_accounts}`);
      }

      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const scanCount = await prisma.securityScan.count({
        where: {
          organization_id: license.organization_id,
          created_at: { gte: monthStart }
        }
      });

      const maxScansPerMonth = 100;
      if (scanCount > maxScansPerMonth) {
        status = status === 'VALID' ? 'EXCEEDED_LIMITS' : status;
        issues.push(`Monthly scan limit exceeded: ${scanCount}/${maxScansPerMonth}`);
      }

      const result: ValidationResult = {
        organizationId: license.organization_id,
        organizationName: license.organization.name,
        licenseId: license.id,
        status,
        issues,
        daysUntilExpiration: daysUntilExpiration > 0 ? daysUntilExpiration : 0,
        usageStats: {
          users: { current: userCount, limit: license.max_users },
          accounts: { current: accountCount, limit: license.max_accounts },
          scans: { current: scanCount, limit: maxScansPerMonth }
        }
      };

      results.push(result);
      if (status !== 'VALID') alertsToSend.push(result);
    }

    // Enviar alertas
    for (const alert of alertsToSend) {
      await sendLicenseAlert(alert);
    }

    const report = {
      date: now.toISOString().split('T')[0],
      totalLicenses: licenses.length,
      valid: results.filter(r => r.status === 'VALID').length,
      expiringSoon: results.filter(r => r.status === 'EXPIRING_SOON').length,
      expired: results.filter(r => r.status === 'EXPIRED').length,
      exceededLimits: results.filter(r => r.status === 'EXCEEDED_LIMITS').length,
      details: results
    };

    if (isScheduled) {
      logger.info('Daily license validation completed:', report);
      return;
    }

    return success(report, 200, origin);
  } catch (err) {
    logger.error('Daily license validation error:', err);
    if (isScheduled) return;
    return error('Internal server error', 500, undefined, origin);
  }
}

async function sendLicenseAlert(result: ValidationResult): Promise<void> {
  const prisma = getPrismaClient();
  const subject = `[EVO UDS] License Alert: ${result.status} - ${result.organizationName}`;
  const message = `License Status Alert for ${result.organizationName}\n\nStatus: ${result.status}\nDays until expiration: ${result.daysUntilExpiration}\n\nIssues:\n${result.issues.map(i => `- ${i}`).join('\n')}`;

  if (process.env.LICENSE_ALERT_SNS_TOPIC) {
    await snsClient.send(new PublishCommand({
      TopicArn: process.env.LICENSE_ALERT_SNS_TOPIC,
      Subject: subject,
      Message: message
    }));
  }

  await prisma.alert.create({
    data: {
      organization_id: result.organizationId,
      severity: result.status === 'EXPIRED' ? 'CRITICAL' : 'HIGH',
      title: subject,
      message: result.issues.join('; '),
      metadata: result as any
    }
  });
}
