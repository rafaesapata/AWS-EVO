/**
 * scan-report-generator
 *
 * Lambda invocada assincronamente ao final de cada scan agendado.
 * Gera relatório comparativo, envia email via EmailService,
 * registra na CommunicationLog e avalia alarmes inteligentes.
 *
 * Requirements: 3.1, 3.6, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3
 */

import type { LambdaContext } from '../../types/lambda.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { compareFindings, calculateSeveritySummary } from '../../lib/report-comparison-engine.js';
import type { FindingInput } from '../../lib/report-comparison-engine.js';
import { generateSecurityReportHtml, generateReportSubject } from '../../lib/report-email-templates.js';
import type { ScanReport } from '../../lib/report-email-templates.js';
import { evaluateAlarmConditions } from '../../lib/alarm-evaluator.js';
import { createEmailService } from '../../lib/email-service.js';

interface ReportGeneratorPayload {
  scanId: string;
  organizationId: string;
  accountId?: string;
  azureCredentialId?: string;
  cloudProvider: 'AWS' | 'AZURE';
  scanType: string;
  scheduledExecution: boolean;
  scheduleId?: string;
}

const PLATFORM_BASE_URL = process.env.PLATFORM_BASE_URL || 'https://evo.nuevacore.com';
const NOTIFICATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const ALARM_TITLES: Record<string, string> = {
  new_critical: 'Novos Findings Críticos',
  degradation: 'Degradação da Postura de Segurança',
  improvement: 'Melhoria na Postura de Segurança',
};

const ALARM_ACTIONS: Record<string, string> = {
  new_critical: 'Revise os findings críticos imediatamente',
  degradation: 'Investigue o aumento de findings',
  improvement: 'Continue monitorando',
};

interface DbFinding {
  fingerprint: string | null;
  severity: string;
  title: string;
  resource_id: string | null;
  resource_type: string | null;
  category: string | null;
  resolved_at: Date | null;
}

function dbFindingToInput(f: DbFinding): FindingInput {
  return {
    fingerprint: f.fingerprint || '',
    severity: f.severity as FindingInput['severity'],
    title: f.title,
    resourceId: f.resource_id || undefined,
    resourceType: f.resource_type || undefined,
    category: f.category || undefined,
    resolved_at: f.resolved_at || null,
  };
}

function findingInputToSummary(f: FindingInput) {
  return {
    title: f.title,
    severity: f.severity,
    resourceId: f.resourceId,
    resourceType: f.resourceType,
    category: f.category,
  };
}

export async function handler(event: any, _context: LambdaContext): Promise<{ statusCode: number; body: string }> {
  const prisma = getPrismaClient();

  let payload: ReportGeneratorPayload;
  try {
    payload = typeof event.body === 'string' ? JSON.parse(event.body) : event;
  } catch (err) {
    logger.error('Failed to parse event payload', err as Error);
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid payload' }) };
  }

  const { scanId, organizationId, accountId, azureCredentialId, cloudProvider, scanType } = payload;

  logger.info('Starting report generation', { scanId, organizationId, cloudProvider, scanType });

  try {
    // 1. Fetch current scan
    const currentScan = await prisma.securityScan.findUnique({ where: { id: scanId } });
    if (!currentScan || currentScan.status !== 'completed') {
      logger.error('Scan not found or not completed', undefined, { scanId, status: currentScan?.status });
      return { statusCode: 404, body: JSON.stringify({ error: 'Scan not found or not completed' }) };
    }

    // 2. Fetch organization name
    const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
    const organizationName = organization?.name || 'Organização';

    // 3. Fetch account name based on cloud provider
    let accountName = 'Conta Cloud';
    if (cloudProvider === 'AWS' && accountId) {
      const awsCred = await prisma.awsCredential.findUnique({ where: { id: accountId } });
      accountName = awsCred?.account_name || awsCred?.account_id || 'Conta AWS';
    } else if (cloudProvider === 'AZURE' && azureCredentialId) {
      const azureCred = await prisma.azureCredential.findUnique({ where: { id: azureCredentialId } });
      accountName = azureCred?.subscription_name || azureCred?.subscription_id || 'Conta Azure';
    }

    // 4. Fetch current findings
    const currentFindings = await prisma.finding.findMany({
      where: { scan_id: scanId, organization_id: organizationId },
    });

    // 5. Fetch previous scan of same account/type
    const previousScan = await prisma.securityScan.findFirst({
      where: {
        organization_id: organizationId,
        ...(accountId ? { aws_account_id: accountId } : { azure_credential_id: azureCredentialId }),
        scan_type: currentScan.scan_type,
        status: 'completed',
        id: { not: scanId },
      },
      orderBy: { created_at: 'desc' },
    });

    // 6. Compare findings if previous scan exists
    let comparison: ScanReport['comparison'] = null;
    const isFirstScan = !previousScan;

    if (previousScan) {
      const previousFindings = await prisma.finding.findMany({
        where: { scan_id: previousScan.id, organization_id: organizationId },
      });

      const comparisonResult = compareFindings({
        currentFindings: currentFindings.map(dbFindingToInput),
        previousFindings: previousFindings.map(dbFindingToInput),
      });

      comparison = {
        newFindings: comparisonResult.newFindings.map(findingInputToSummary),
        resolvedFindings: comparisonResult.resolvedFindings.map(findingInputToSummary),
        persistentCount: comparisonResult.summary.persistentCount,
        previousTotal: comparisonResult.summary.previousTotal,
        changePercentage: comparisonResult.summary.changePercentage,
      };
    }

    // 7. Build ScanReport
    const severitySummary = calculateSeveritySummary(
      currentFindings.map(dbFindingToInput)
    );

    const report: ScanReport = {
      scanId,
      organizationName,
      accountName,
      cloudProvider,
      scanType,
      executedAt: currentScan.created_at,
      isFirstScan,
      summary: severitySummary,
      comparison,
    };

    // 8. Fetch recipients: org profiles first, then check notification preferences
    const orgProfiles = await prisma.profile.findMany({
      where: { organization_id: organizationId },
      select: { user_id: true, email: true, full_name: true },
    });

    const orgUserIds = orgProfiles.map((p) => p.user_id);

    const enabledSettings = orgUserIds.length > 0
      ? await prisma.notificationSettings.findMany({
          where: {
            userId: { in: orgUserIds },
            email_enabled: true,
            security_alerts: true,
          },
          select: { userId: true },
        })
      : [];

    const enabledUserIds = new Set(enabledSettings.map((ns) => ns.userId));
    const profiles = orgProfiles.filter((p) => enabledUserIds.has(p.user_id));

    // 9. Send emails
    if (profiles.length === 0) {
      logger.warn('No recipients with email enabled for organization', { organizationId });
    } else {
      const emailService = createEmailService();
      const emailSubject = generateReportSubject(report);
      const emailHtml = generateSecurityReportHtml({
        report,
        platformUrl: `${PLATFORM_BASE_URL}/security-scans`,
      });

      for (const profile of profiles) {
        let messageId: string | undefined;
        let emailStatus = 'sent';
        let errorMsg: string | undefined;

        try {
          const result = await emailService.sendEmail({
            to: { email: profile.email, name: profile.full_name || undefined },
            subject: emailSubject,
            htmlBody: emailHtml,
            tags: { type: 'scan_report', scan_id: scanId },
          });
          messageId = result.messageId;
        } catch (err) {
          emailStatus = 'failed';
          errorMsg = err instanceof Error ? err.message : String(err);
          logger.error('Failed to send report email', err as Error, {
            recipient: profile.email,
            scanId,
          });
        }

        // Register in CommunicationLog
        try {
          await prisma.communicationLog.create({
            data: {
              organization_id: organizationId,
              channel: 'email',
              recipient: profile.email,
              subject: emailSubject,
              message: `Relatório de scan de segurança: ${scanId}`,
              status: emailStatus,
              metadata: {
                scan_id: scanId,
                scan_type: scanType,
                cloud_provider: cloudProvider,
                template_type: 'scan_report',
                is_automated: true,
                ...(messageId ? { messageId } : {}),
                ...(errorMsg ? { error: errorMsg } : {}),
              },
            },
          });
        } catch (logErr) {
          logger.error('Failed to create CommunicationLog entry', logErr as Error, {
            recipient: profile.email,
            scanId,
          });
        }
      }

      logger.info('Report emails processed', {
        scanId,
        recipientCount: profiles.length,
      });
    }

    // 10. Evaluate alarm conditions and create AiNotifications
    try {
      const alarmConditions = evaluateAlarmConditions(report);

      for (const condition of alarmConditions) {
        await prisma.aiNotification.create({
          data: {
            organization_id: organizationId,
            user_id: null,
            type: `scan_report_${condition.type}`,
            priority: condition.priority,
            title: ALARM_TITLES[condition.type] || condition.type,
            message: condition.message,
            suggested_action: ALARM_ACTIONS[condition.type] || null,
            action_type: 'navigate',
            action_params: { path: '/security-scans' },
            context: { scan_id: scanId, cloud_provider: cloudProvider },
            status: 'pending',
            expires_at: new Date(Date.now() + NOTIFICATION_EXPIRY_MS),
          },
        });
      }

      if (alarmConditions.length > 0) {
        logger.info('Alarm conditions created', {
          scanId,
          conditionCount: alarmConditions.length,
          types: alarmConditions.map((c) => c.type),
        });
      }
    } catch (alarmErr) {
      logger.error('Failed to evaluate alarm conditions', alarmErr as Error, { scanId });
    }

    logger.info('Report generation completed', { scanId, organizationId });
    return { statusCode: 200, body: JSON.stringify({ success: true, scanId }) };

  } catch (err) {
    logger.error('Report generation failed', err as Error, { scanId, organizationId });
    return { statusCode: 500, body: JSON.stringify({ error: 'Report generation failed' }) };
  }
}
