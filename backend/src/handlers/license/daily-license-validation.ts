import { APIGatewayProxyEvent, APIGatewayProxyResult, ScheduledEvent } from 'aws-lambda';
import { logger } from '../../lib/logging.js';
import { PrismaClient } from '@prisma/client';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const prisma = new PrismaClient();
const snsClient = new SNSClient({});
const sesClient = new SESClient({});

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

export const handler = async (
  event: APIGatewayProxyEvent | ScheduledEvent
): Promise<APIGatewayProxyResult | void> => {
  try {
    const isScheduled = 'source' in event && event.source === 'aws.events';
    
    // Buscar todas as licenças ativas
    const licenses = await prisma.license.findMany({
      where: { is_active: true },
      include: {
        organization: {
          include: {
            profiles: true,
            aws_accounts: true
          }
        }
      }
    });

    const results: ValidationResult[] = [];
    const alertsToSend: ValidationResult[] = [];
    const now = new Date();

    for (const license of licenses) {
      const issues: string[] = [];
      let status: ValidationResult['status'] = 'VALID';

      // Calcular dias até expiração
      const daysUntilExpiration = Math.ceil(
        (license.valid_until.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Verificar expiração
      if (daysUntilExpiration <= 0) {
        status = 'EXPIRED';
        issues.push('License has expired');
        
        // Atualizar status no banco
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

      // Verificar limites de usuários
      const userCount = license.organization.profiles.length;
      if (userCount > license.max_users) {
        status = status === 'VALID' ? 'EXCEEDED_LIMITS' : status;
        issues.push(`User limit exceeded: ${userCount}/${license.max_users}`);
      }

      // Verificar limites de contas AWS
      const accountCount = license.organization.aws_accounts.length;
      if (accountCount > license.max_accounts) {
        status = status === 'VALID' ? 'EXCEEDED_LIMITS' : status;
        issues.push(`AWS account limit exceeded: ${accountCount}/${license.max_accounts}`);
      }

      // Verificar limites de scans (último mês)
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const scanCount = await prisma.securityScan.count({
        where: {
          organization_id: license.organization_id,
          created_at: { gte: monthStart }
        }
      });

      // Assumir limite padrão de 100 scans por mês se não especificado
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

      // Adicionar à lista de alertas se houver problemas
      if (status !== 'VALID') {
        alertsToSend.push(result);
      }

      // Registrar validação (removido pois modelo não existe no schema)
      // await prisma.licenseValidation.create({
      //   data: {
      //     licenseId: license.id,
      //     organizationId: license.organization_id,
      //     status,
      //     issues,
      //     usageStats: result.usageStats as unknown as Record<string, unknown>,
      //     validatedAt: now
      //   }
      // });
    }

    // Enviar alertas
    for (const alert of alertsToSend) {
      await sendLicenseAlert(alert);
    }

    // Gerar relatório diário
    const report = {
      date: now.toISOString().split('T')[0],
      totalLicenses: licenses.length,
      valid: results.filter(r => r.status === 'VALID').length,
      expiringSoon: results.filter(r => r.status === 'EXPIRING_SOON').length,
      expired: results.filter(r => r.status === 'EXPIRED').length,
      exceededLimits: results.filter(r => r.status === 'EXCEEDED_LIMITS').length,
      details: results
    };

    // Salvar relatório (removido pois modelo não existe no schema)
    // await prisma.dailyReport.create({
    //   data: {
    //     reportType: 'LICENSE_VALIDATION',
    //     reportDate: now,
    //     data: report as unknown as Record<string, unknown>
    //   }
    // });

    if (isScheduled) {
      logger.info('Daily license validation completed:', report);
      return;
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, report })
    };
  } catch (error) {
    logger.error('Daily license validation error:', error);
    if ('source' in event) return;
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

async function sendLicenseAlert(result: ValidationResult): Promise<void> {
  // Buscar admins da organização
  const admins = await prisma.profile.findMany({
    where: {
      organization_id: result.organizationId,
      role: { in: ['ADMIN', 'SUPER_ADMIN'] }
    }
  });

  const subject = `[EVO UDS] License Alert: ${result.status} - ${result.organizationName}`;
  const message = `
License Status Alert for ${result.organizationName}

Status: ${result.status}
${result.daysUntilExpiration !== undefined ? `Days until expiration: ${result.daysUntilExpiration}` : ''}

Issues:
${result.issues.map(i => `- ${i}`).join('\n')}

Usage Statistics:
- Users: ${result.usageStats.users.current}/${result.usageStats.users.limit}
- AWS Accounts: ${result.usageStats.accounts.current}/${result.usageStats.accounts.limit}
- Monthly Scans: ${result.usageStats.scans.current}/${result.usageStats.scans.limit}

Please take action to resolve these issues.
  `.trim();

  // Enviar SNS
  if (process.env.LICENSE_ALERT_SNS_TOPIC) {
    await snsClient.send(new PublishCommand({
      TopicArn: process.env.LICENSE_ALERT_SNS_TOPIC,
      Subject: subject,
      Message: message
    }));
  }

  // Enviar email para admins (removido pois Profile não tem email)
  // if (process.env.SES_FROM_EMAIL && admins.length > 0) {
  //   await sesClient.send(new SendEmailCommand({
  //     Source: process.env.SES_FROM_EMAIL,
  //     Destination: { ToAddresses: admins.map(a => a.email) },
  //     Message: {
  //       Subject: { Data: subject },
  //       Body: { Text: { Data: message } }
  //     }
  //   }));
  // }

  // Criar alerta no sistema
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
