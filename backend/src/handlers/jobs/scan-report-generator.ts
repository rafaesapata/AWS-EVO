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
const NOTIFICATION_EXPIRY_DAYS = 7;
const NOTIFICATION_EXPIRY_MS = NOTIFICATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

const ALARM_CONFIG: Record<string, { title: string; action: string }> = {
  new_critical: { title: 'Novos Findings Críticos', action: 'Revise os findings críticos imediatamente' },
  degradation: { title: 'Degradação da Postura de Segurança', action: 'Investigue o aumento de findings' },
  improvement: { title: 'Melhoria na Postura de Segurança', action: 'Continue monitorando' },
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

interface RecipientProfile {
  user_id: string;
  email: string;
  full_name: string | null;
}

/**
 * Envia emails de relatório para todos os destinatários e registra na CommunicationLog.
 */
async function sendReportEmails(
  prisma: ReturnType<typeof getPrismaClient>,
  profiles: RecipientProfile[],
  report: ScanReport,
  payload: ReportGeneratorPayload
): Promise<void> {
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
        tags: { type: 'scan_report', scan_id: payload.scanId },
      });
      messageId = result.messageId;
    } catch (err) {
      emailStatus = 'failed';
      errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to send report email', err as Error, {
        recipient: profile.email,
        scanId: payload.scanId,
      });
    }

    try {
      await prisma.communicationLog.create({
        data: {
          organization_id: payload.organizationId,
          channel: 'email',
          recipient: profile.email,
          subject: emailSubject,
          message: `Relatório de scan de segurança: ${payload.scanId}`,
          status: emailStatus,
          metadata: {
            scan_id: payload.scanId,
            scan_type: payload.scanType,
            cloud_provider: payload.cloudProvider,
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
        scanId: payload.scanId,
      });
    }
  }
}

/**
 * Avalia condições de alarme e cria AiNotifications.
 */
async function createAlarmNotifications(
  prisma: ReturnType<typeof getPrismaClient>,
  report: ScanReport,
  payload: ReportGeneratorPayload
): Promise<void> {
  const alarmConditions = evaluateAlarmConditions(report);

  for (const condition of alarmConditions) {
    const config = ALARM_CONFIG[condition.type];
    await prisma.aiNotification.create({
      data: {
        organization_id: payload.organizationId,
        user_id: null,
        type: `scan_report_${condition.type}`,
        priority: condition.priority,
        title: config?.title || condition.type,
        message: condition.message,
        suggested_action: config?.action || null,
        action_type: 'navigate',
        action_params: { path: '/security-scans' },
        context: { scan_id: payload.scanId, cloud_provider: payload.cloudProvider },
        status: 'pending',
        expires_at: new Date(Date.now() + NOTIFICATION_EXPIRY_MS),
      },
    });
  }

  if (alarmConditions.length > 0) {
    logger.info('Alarm conditions created', {
      scanId: payload.scanId,
      conditionCount: alarmConditions.length,
      types: alarmConditions.map((c) => c.type),
    });
  }
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
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (cloudProvider === 'AWS' && accountId) {
      // accountId may be credential UUID or 12-digit AWS account number (legacy)
      const awsCred = isUuid.test(accountId)
        ? await prisma.awsCredential.findUnique({ where: { id: accountId } })
        : await prisma.awsCredential.findFirst({ where: { account_id: accountId, organization_id: organizationId } });
      accountName = awsCred?.account_name || awsCred?.account_id || 'Conta AWS';
    } else if (cloudProvider === 'AZURE' && azureCredentialId) {
      const azureCred = await prisma.azureCredential.findUnique({ where: { id: azureCredentialId } });
      accountName = azureCred?.subscription_name || azureCred?.subscription_id || 'Conta Azure';
    }

    // 4. Fetch current findings
    const currentFindings = await prisma.finding.findMany({
      where: { scan_id: scanId, organization_id: organizationId },
    });

    // 5. Resolve credential UUID for previous scan lookup
    let credentialUuid: string | undefined;
    if (cloudProvider === 'AWS' && accountId) {
      if (isUuid.test(accountId)) {
        credentialUuid = accountId;
      } else {
        // Legacy: accountId is 12-digit AWS account number, resolve to credential UUID
        const cred = await prisma.awsCredential.findFirst({
          where: { account_id: accountId, organization_id: organizationId },
          select: { id: true },
        });
        credentialUuid = cred?.id;
      }
    }

    // 6. Fetch previous scan of same account/type
    const previousScan = await prisma.securityScan.findFirst({
      where: {
        organization_id: organizationId,
        ...(credentialUuid ? { aws_account_id: credentialUuid } : azureCredentialId ? { azure_credential_id: azureCredentialId } : {}),
        scan_type: currentScan.scan_type,
        status: 'completed',
        id: { not: scanId },
      },
      orderBy: { created_at: 'desc' },
    });

    // 7. Compare findings if previous scan exists
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

    // 8. Build ScanReport
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

    // 9. Fetch recipients with email notifications enabled
    // If no notification_settings exist, default behavior is to send to all org profiles
    // (model defaults are email_enabled=true, security_alerts=true)
    const orgProfiles = await prisma.profile.findMany({
      where: { organization_id: organizationId },
      select: { user_id: true, email: true, full_name: true },
    });

    const orgUserIds = orgProfiles.map((p) => p.user_id);

    const existingSettings = orgUserIds.length > 0
      ? await prisma.notificationSettings.findMany({
          where: { userId: { in: orgUserIds } },
          select: { userId: true, email_enabled: true, security_alerts: true, additional_emails: true },
        })
      : [];

    // Users with explicit settings: respect their preferences
    const settingsMap = new Map(existingSettings.map((ns) => [ns.userId, ns]));
    
    // Include user if: no settings exist (use defaults) OR settings have both flags enabled
    const profiles = orgProfiles.filter((p) => {
      const settings = settingsMap.get(p.user_id);
      if (!settings) return true; // No settings = use defaults (both true)
      return settings.email_enabled && settings.security_alerts;
    });

    // Collect additional_emails from all settings that have email+security enabled
    const additionalEmails = new Set<string>();
    for (const ns of existingSettings) {
      if (ns.email_enabled && ns.security_alerts && ns.additional_emails?.length) {
        for (const email of ns.additional_emails) {
          // Avoid duplicates with org profile emails
          if (!orgProfiles.some((p) => p.email === email)) {
            additionalEmails.add(email);
          }
        }
      }
    }

    // Add additional emails as extra recipients
    const additionalProfiles: RecipientProfile[] = Array.from(additionalEmails).map((email) => ({
      user_id: 'additional',
      email,
      full_name: null,
    }));

    const allRecipients = [...profiles, ...additionalProfiles];

    // 10. Send emails via CommunicationLog
    if (allRecipients.length === 0) {
      logger.warn('No recipients with email enabled for organization', { organizationId });
    } else {
      await sendReportEmails(prisma, allRecipients, report, payload);
      logger.info('Report emails processed', { scanId, recipientCount: allRecipients.length, additionalCount: additionalProfiles.length });
    }

    // 11. Evaluate alarm conditions and create AiNotifications
    try {
      await createAlarmNotifications(prisma, report, payload);
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
