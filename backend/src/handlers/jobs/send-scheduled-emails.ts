/**
 * Send Scheduled Emails Handler (EventBridge Scheduled Job)
 * Runs hourly to send daily summaries, weekly reports, etc.
 * All emails are logged to communication_logs for the Communication Center
 */

import type { LambdaContext } from '../../types/lambda.js';
import type { OrganizationEmailSettings } from '@prisma/client';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { EmailService } from '../../lib/email-service.js';

// Time constants
const HOURS_IN_DAY = 24;
const HOURS_IN_WEEK = 167; // ~7 days
const DAYS_IN_WEEK = 7;
const MONDAY = 1;
const PREFERRED_SEND_HOUR_UTC = 11; // 8 AM BRT = 11 UTC
const SEND_HOUR_TOLERANCE = 1;
const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * HOURS_IN_DAY;

// Frequency types
type EmailFrequency = 'daily' | 'weekly' | 'monthly';

interface EmailResult {
  organizationId: string;
  notificationType: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function handler(
  _event: unknown,
  _context: LambdaContext
): Promise<{ processed: number; sent: number; errors: number; results: EmailResult[] }> {
  const prisma = getPrismaClient();
  const emailService = new EmailService();
  const results: EmailResult[] = [];
  let processed = 0;
  let sent = 0;
  let errors = 0;

  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentDay = now.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.

  logger.info('Starting scheduled email job', { currentHour, currentDay });

  try {
    // Get all enabled email settings that need to be sent
    const settings = await prisma.organizationEmailSettings.findMany({
      where: {
        is_enabled: true,
        notification_type: { in: ['daily_summary', 'weekly_report'] },
      },
    });

    logger.info(`Found ${settings.length} email settings to check`);

    for (const setting of settings) {
      processed++;

      try {
        // Check if it's time to send based on frequency
        const shouldSend = shouldSendEmail(setting, now, currentHour, currentDay);
        
        if (!shouldSend) {
          continue;
        }

        // Get organization details
        const org = await prisma.organization.findUnique({
          where: { id: setting.organization_id },
          select: {
            id: true,
            name: true,
          },
        });

        if (!org) {
          logger.warn('Organization not found', { organizationId: setting.organization_id });
          continue;
        }

        // Get template
        const template = await prisma.emailTemplate.findUnique({
          where: { template_type: setting.notification_type },
        });

        if (!template || !template.is_active) {
          logger.warn('Template not found or inactive', { 
            notificationType: setting.notification_type 
          });
          continue;
        }

        // Get recipients from custom list configured in email preferences
        // Recipients MUST be configured in the email preferences for each organization
        const recipients: string[] = setting.recipients || [];
        
        // Skip if no valid recipients configured
        if (recipients.length === 0) {
          logger.warn('No recipients configured - add recipients in email preferences', { 
            organizationId: org.id,
            orgName: org.name,
          });
          continue;
        }

        // Gather data for the email
        const emailData = await gatherEmailData(prisma, org.id, setting.notification_type);

        // Process template
        let subject = template.subject;
        let htmlBody = template.html_body;
        let textBody = template.text_body || '';

        for (const [key, value] of Object.entries(emailData)) {
          const regex = new RegExp(`\\{${key}\\}`, 'g');
          subject = subject.replace(regex, String(value));
          htmlBody = htmlBody.replace(regex, String(value));
          textBody = textBody.replace(regex, String(value));
        }

        // Send to each recipient
        for (const recipientEmail of recipients) {
          try {
            const result = await emailService.sendEmail({
              to: { email: recipientEmail },
              subject,
              htmlBody,
              textBody: textBody || undefined,
            });

            // Log to communication_logs
            await prisma.communicationLog.create({
              data: {
                organization_id: org.id,
                channel: 'email',
                recipient: recipientEmail,
                subject,
                message: `Scheduled ${setting.notification_type} email`,
                status: 'sent',
                metadata: { 
                  messageId: result.messageId, 
                  template_type: setting.notification_type,
                  is_scheduled: true,
                },
              },
            });

            results.push({
              organizationId: org.id,
              notificationType: setting.notification_type,
              success: true,
              messageId: result.messageId,
            });

            sent++;

            logger.info('Scheduled email sent', {
              organizationId: org.id,
              notificationType: setting.notification_type,
              recipient: recipientEmail,
              messageId: result.messageId,
            });

          } catch (emailErr) {
            errors++;
            const errorMsg = (emailErr as Error).message;

            // Log failed attempt
            await prisma.communicationLog.create({
              data: {
                organization_id: org.id,
                channel: 'email',
                recipient: recipientEmail,
                subject,
                message: `Failed scheduled ${setting.notification_type} email`,
                status: 'failed',
                metadata: { 
                  error: errorMsg,
                  template_type: setting.notification_type,
                  is_scheduled: true,
                },
              },
            });

            results.push({
              organizationId: org.id,
              notificationType: setting.notification_type,
              success: false,
              error: errorMsg,
            });

            logger.error('Failed to send scheduled email', emailErr as Error, {
              organizationId: org.id,
              recipient: recipientEmail,
            });
          }
        }

        // Update last_sent_at and calculate next_scheduled_at
        const nextScheduled = calculateNextScheduled(setting.frequency, now);
        
        await prisma.organizationEmailSettings.update({
          where: { id: setting.id },
          data: {
            last_sent_at: now,
            next_scheduled_at: nextScheduled,
            send_count: { increment: 1 },
          },
        });

      } catch (settingErr) {
        errors++;
        logger.error('Error processing email setting', settingErr as Error, {
          settingId: setting.id,
          organizationId: setting.organization_id,
        });
      }
    }

    logger.info('Scheduled email job completed', { processed, sent, errors });

    return { processed, sent, errors, results };

  } catch (err) {
    logger.error('Error in scheduled email job', err as Error);
    throw err;
  }
}

/**
 * Determines if an email should be sent based on frequency and timing
 */
function shouldSendEmail(
  setting: OrganizationEmailSettings,
  now: Date,
  currentHour: number,
  currentDay: number
): boolean {
  // Check if already sent recently based on frequency
  if (setting.last_sent_at) {
    const hoursSinceLastSent = (now.getTime() - setting.last_sent_at.getTime()) / MS_PER_HOUR;
    const minHoursBetweenSends = getMinHoursBetweenSends(setting.frequency as EmailFrequency);
    
    if (hoursSinceLastSent < minHoursBetweenSends) {
      return false;
    }
  }

  // Check if current hour is within tolerance of preferred send time
  if (Math.abs(currentHour - PREFERRED_SEND_HOUR_UTC) > SEND_HOUR_TOLERANCE) {
    return false;
  }

  // Weekly reports only send on Mondays
  if (setting.frequency === 'weekly' && currentDay !== MONDAY) {
    return false;
  }

  return true;
}

/**
 * Returns minimum hours between sends for each frequency type
 */
function getMinHoursBetweenSends(frequency: EmailFrequency): number {
  const frequencyHours: Record<EmailFrequency, number> = {
    daily: HOURS_IN_DAY - 1, // 23 hours
    weekly: HOURS_IN_WEEK,
    monthly: HOURS_IN_DAY * 28, // ~28 days
  };
  return frequencyHours[frequency] || HOURS_IN_DAY;
}

/**
 * Calculates the next scheduled send time based on frequency
 */
function calculateNextScheduled(frequency: string, now: Date): Date {
  const next = new Date(now);
  
  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      // Next Monday
      const daysUntilMonday = (8 - next.getDay()) % DAYS_IN_WEEK || DAYS_IN_WEEK;
      next.setDate(next.getDate() + daysUntilMonday);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      next.setDate(1);
      break;
  }
  
  next.setUTCHours(PREFERRED_SEND_HOUR_UTC, 0, 0, 0);
  return next;
}

// Platform URLs
const PLATFORM_BASE_URL = process.env.PLATFORM_BASE_URL || 'https://evo.nuevacore.com';
const PLATFORM_URLS = {
  dashboard: `${PLATFORM_BASE_URL}/dashboard`,
  reports: `${PLATFORM_BASE_URL}/reports`,
} as const;

// Color constants for email styling
const COLORS = {
  danger: '#dc3545',
  success: '#28a745',
} as const;

// Security score calculation constants
const SECURITY_SCORE_BASE = 100;
const SECURITY_SCORE_PENALTY_PER_FINDING = 2;
const COST_TREND_THRESHOLD = 100;
const DEFAULT_FRAMEWORKS_CHECKED = 4;

/**
 * Gathers email data for templates based on notification type
 */
async function gatherEmailData(
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string,
  notificationType: string
): Promise<Record<string, string | number>> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - MS_PER_DAY);
  const weekAgo = new Date(now.getTime() - DAYS_IN_WEEK * MS_PER_DAY);

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  const baseData: Record<string, string | number> = {
    organizationName: org?.name || 'Organização',
    userName: 'Administrador',
    date: now.toLocaleDateString('pt-BR'),
    dashboardUrl: PLATFORM_URLS.dashboard,
    reportUrl: PLATFORM_URLS.reports,
  };

  if (notificationType === 'daily_summary') {
    return gatherDailySummaryData(prisma, organizationId, baseData, yesterday);
  }

  if (notificationType === 'weekly_report') {
    return gatherWeeklyReportData(prisma, organizationId, baseData, now, weekAgo);
  }

  return baseData;
}

/**
 * Gathers data specific to daily summary emails
 */
async function gatherDailySummaryData(
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string,
  baseData: Record<string, string | number>,
  yesterday: Date
): Promise<Record<string, string | number>> {
  const [criticalFindings, highFindings, newAlerts, dailyCosts, previousDayCosts, savings] = await Promise.all([
    prisma.finding.count({
      where: { organization_id: organizationId, severity: 'critical', status: { in: ['new', 'active', 'reopened', 'pending'] } },
    }),
    prisma.finding.count({
      where: { organization_id: organizationId, severity: 'high', status: { in: ['new', 'active', 'reopened', 'pending'] } },
    }),
    prisma.alert.count({
      where: { organization_id: organizationId, triggered_at: { gte: yesterday } },
    }),
    prisma.dailyCost.aggregate({
      where: { organization_id: organizationId, date: { gte: yesterday } },
      _sum: { cost: true },
    }),
    prisma.dailyCost.aggregate({
      where: { 
        organization_id: organizationId, 
        date: { gte: new Date(yesterday.getTime() - MS_PER_DAY), lt: yesterday } 
      },
      _sum: { cost: true },
    }),
    prisma.riSpRecommendation.aggregate({
      where: { organization_id: organizationId, status: 'active' },
      _sum: { estimated_monthly_savings: true },
    }),
  ]);

  const dailyCost = dailyCosts._sum.cost || 0;
  const prevCost = previousDayCosts._sum.cost || dailyCost;
  const variation = prevCost > 0 ? ((dailyCost - prevCost) / prevCost * 100).toFixed(1) : '0';

  return {
    ...baseData,
    criticalFindings,
    highFindings,
    newAlerts,
    dailyCost: dailyCost.toFixed(2),
    costVariation: variation,
    costVariationColor: parseFloat(variation) > 0 ? COLORS.danger : COLORS.success,
    potentialSavings: (savings._sum.estimated_monthly_savings || 0).toFixed(2),
  };
}

/**
 * Gathers data specific to weekly report emails
 */
async function gatherWeeklyReportData(
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string,
  baseData: Record<string, string | number>,
  now: Date,
  weekAgo: Date
): Promise<Record<string, string | number>> {
  const [totalFindings, scansCompleted, findingsResolved, weeklyCosts, complianceChecks, totalChecks] = await Promise.all([
    prisma.finding.count({
      where: { organization_id: organizationId, status: { in: ['new', 'active', 'reopened', 'pending'] } },
    }),
    prisma.securityScan.count({
      where: { organization_id: organizationId, created_at: { gte: weekAgo }, status: 'completed' },
    }),
    prisma.finding.count({
      where: { organization_id: organizationId, updated_at: { gte: weekAgo }, status: 'resolved' },
    }),
    prisma.dailyCost.aggregate({
      where: { organization_id: organizationId, date: { gte: weekAgo } },
      _sum: { cost: true },
    }),
    prisma.complianceCheck.count({
      where: { scan_id: { not: undefined }, status: 'passed' },
    }),
    prisma.complianceCheck.count({
      where: { scan_id: { not: undefined } },
    }),
  ]);

  const securityScore = Math.max(0, SECURITY_SCORE_BASE - totalFindings * SECURITY_SCORE_PENALTY_PER_FINDING);
  const weeklyTotal = weeklyCosts._sum.cost || 0;
  const dailyAverage = weeklyTotal / DAYS_IN_WEEK;
  const complianceScore = totalChecks > 0 ? Math.round((complianceChecks / totalChecks) * 100) : 0;

  return {
    ...baseData,
    weekRange: `${weekAgo.toLocaleDateString('pt-BR')} - ${now.toLocaleDateString('pt-BR')}`,
    securityScore,
    scansCompleted,
    findingsResolved,
    weeklyTotalCost: weeklyTotal.toFixed(2),
    dailyAverage: dailyAverage.toFixed(2),
    trend: dailyAverage > COST_TREND_THRESHOLD ? 'Em alta' : 'Estável',
    trendColor: dailyAverage > COST_TREND_THRESHOLD ? COLORS.danger : COLORS.success,
    complianceScore,
    frameworksChecked: DEFAULT_FRAMEWORKS_CHECKED,
  };
}
