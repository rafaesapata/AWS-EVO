/**
 * WAF Alert Engine Module
 * 
 * Sends alerts for WAF security events via multiple channels:
 * - SNS (email/SMS)
 * - Slack webhook
 * - In-app notifications
 */

import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { logger } from '../logging.js';
import type { Severity, ThreatType } from './threat-detector.js';

// Alert configuration from database
export interface AlertConfig {
  organizationId: string;
  snsEnabled: boolean;
  snsTopicArn?: string;
  slackEnabled: boolean;
  slackWebhookUrl?: string;
  inAppEnabled: boolean;
  campaignThreshold: number;
  campaignWindowMins: number;
  autoBlockEnabled: boolean;
  autoBlockThreshold: number;
  blockDurationHours: number;
}

// Alert payload structure
export interface WafAlert {
  id: string;
  organizationId: string;
  timestamp: Date;
  threatType: ThreatType;
  severity: Severity;
  sourceIp: string;
  targetUri: string;
  country?: string;
  eventCount: number;
  isCampaign: boolean;
  campaignId?: string;
  recommendedAction: 'monitor' | 'alert' | 'block';
  indicators: string[];
  rawEventId?: string;
}

// Alert delivery result
export interface AlertDeliveryResult {
  success: boolean;
  channels: {
    sns: boolean;
    slack: boolean;
    inApp: boolean;
  };
  errors: string[];
}

// SNS client (singleton)
let snsClient: SNSClient | null = null;

function getSnsClient(): SNSClient {
  if (!snsClient) {
    snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
  }
  return snsClient;
}

/**
 * Format alert for human-readable display
 */
function formatAlertMessage(alert: WafAlert): string {
  const severityEmoji: Record<Severity, string> = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢',
  };
  
  const emoji = severityEmoji[alert.severity];
  const timestamp = alert.timestamp.toISOString();
  
  let message = `${emoji} WAF Security Alert - ${alert.severity.toUpperCase()}\n\n`;
  message += `Threat Type: ${alert.threatType.replace(/_/g, ' ').toUpperCase()}\n`;
  message += `Source IP: ${alert.sourceIp}`;
  if (alert.country) {
    message += ` (${alert.country})`;
  }
  message += `\n`;
  message += `Target URI: ${alert.targetUri}\n`;
  message += `Timestamp: ${timestamp}\n`;
  
  if (alert.isCampaign) {
    message += `\n⚠️ ATTACK CAMPAIGN DETECTED\n`;
    message += `Events in campaign: ${alert.eventCount}\n`;
    if (alert.campaignId) {
      message += `Campaign ID: ${alert.campaignId}\n`;
    }
  }
  
  if (alert.indicators.length > 0) {
    message += `\nIndicators:\n`;
    for (const indicator of alert.indicators) {
      message += `  • ${indicator}\n`;
    }
  }
  
  message += `\nRecommended Action: ${alert.recommendedAction.toUpperCase()}\n`;
  
  return message;
}

/**
 * Format alert for Slack (with blocks)
 */
function formatSlackMessage(alert: WafAlert): object {
  const severityColor: Record<Severity, string> = {
    critical: '#FF0000',
    high: '#FF8C00',
    medium: '#FFD700',
    low: '#32CD32',
  };
  
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🛡️ WAF Alert: ${alert.threatType.replace(/_/g, ' ').toUpperCase()}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Severity:*\n${alert.severity.toUpperCase()}`,
        },
        {
          type: 'mrkdwn',
          text: `*Source IP:*\n${alert.sourceIp}${alert.country ? ` (${alert.country})` : ''}`,
        },
        {
          type: 'mrkdwn',
          text: `*Target URI:*\n\`${alert.targetUri}\``,
        },
        {
          type: 'mrkdwn',
          text: `*Timestamp:*\n${alert.timestamp.toISOString()}`,
        },
      ],
    },
  ];
  
  if (alert.isCampaign) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `⚠️ *ATTACK CAMPAIGN DETECTED*\nEvents: ${alert.eventCount}`,
      },
    } as any);
  }
  
  if (alert.indicators.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Indicators:*\n${alert.indicators.map(i => `• ${i}`).join('\n')}`,
      },
    } as any);
  }
  
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Recommended Action: *${alert.recommendedAction.toUpperCase()}*`,
      },
    ],
  } as any);
  
  return {
    attachments: [
      {
        color: severityColor[alert.severity],
        blocks,
      },
    ],
  };
}

/**
 * Send alert via SNS
 */
async function sendSnsAlert(alert: WafAlert, topicArn: string): Promise<boolean> {
  try {
    const client = getSnsClient();
    const message = formatAlertMessage(alert);
    
    await client.send(new PublishCommand({
      TopicArn: topicArn,
      Subject: `[${alert.severity.toUpperCase()}] WAF Alert: ${alert.threatType}`,
      Message: message,
      MessageAttributes: {
        severity: {
          DataType: 'String',
          StringValue: alert.severity,
        },
        threatType: {
          DataType: 'String',
          StringValue: alert.threatType,
        },
        sourceIp: {
          DataType: 'String',
          StringValue: alert.sourceIp,
        },
      },
    }));
    
    logger.info('SNS alert sent', { alertId: alert.id, topicArn });
    return true;
  } catch (err) {
    logger.error('Failed to send SNS alert', err as Error, { alertId: alert.id });
    return false;
  }
}

/**
 * Send alert via Slack webhook
 */
async function sendSlackAlert(alert: WafAlert, webhookUrl: string): Promise<boolean> {
  try {
    const payload = formatSlackMessage(alert);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      throw new Error(`Slack webhook returned ${response.status}`);
    }
    
    logger.info('Slack alert sent', { alertId: alert.id });
    return true;
  } catch (err) {
    logger.error('Failed to send Slack alert', err as Error, { alertId: alert.id });
    return false;
  }
}

/**
 * Create in-app alert (stored in database)
 */
async function createInAppAlert(
  alert: WafAlert,
  prisma: any
): Promise<boolean> {
  try {
    await prisma.securityAlert.create({
      data: {
        organization_id: alert.organizationId,
        alert_type: `waf_${alert.threatType}`,
        severity: alert.severity,
        title: `WAF: ${alert.threatType.replace(/_/g, ' ')}`,
        description: formatAlertMessage(alert),
        resource_id: alert.sourceIp,
        resource_type: 'ip_address',
        metadata: {
          sourceIp: alert.sourceIp,
          targetUri: alert.targetUri,
          country: alert.country,
          eventCount: alert.eventCount,
          isCampaign: alert.isCampaign,
          campaignId: alert.campaignId,
          indicators: alert.indicators,
          recommendedAction: alert.recommendedAction,
        },
      },
    });
    
    logger.info('In-app alert created', { alertId: alert.id });
    return true;
  } catch (err) {
    logger.error('Failed to create in-app alert', err as Error, { alertId: alert.id });
    return false;
  }
}

/**
 * Send alert through all configured channels
 */
export async function sendAlert(
  alert: WafAlert,
  config: AlertConfig,
  prisma?: any
): Promise<AlertDeliveryResult> {
  const result: AlertDeliveryResult = {
    success: false,
    channels: {
      sns: false,
      slack: false,
      inApp: false,
    },
    errors: [],
  };
  
  // Send via SNS
  if (config.snsEnabled && config.snsTopicArn) {
    result.channels.sns = await sendSnsAlert(alert, config.snsTopicArn);
    if (!result.channels.sns) {
      result.errors.push('SNS delivery failed');
    }
  }
  
  // Send via Slack
  if (config.slackEnabled && config.slackWebhookUrl) {
    result.channels.slack = await sendSlackAlert(alert, config.slackWebhookUrl);
    if (!result.channels.slack) {
      result.errors.push('Slack delivery failed');
    }
  }
  
  // Create in-app alert
  if (config.inAppEnabled && prisma) {
    result.channels.inApp = await createInAppAlert(alert, prisma);
    if (!result.channels.inApp) {
      result.errors.push('In-app alert creation failed');
    }
  }
  
  // Consider success if at least one channel succeeded
  result.success = result.channels.sns || result.channels.slack || result.channels.inApp;
  
  return result;
}

/**
 * Create a WafAlert object from event data
 */
export function createAlert(
  organizationId: string,
  threatType: ThreatType,
  severity: Severity,
  sourceIp: string,
  targetUri: string,
  options: {
    country?: string;
    eventCount?: number;
    isCampaign?: boolean;
    campaignId?: string;
    recommendedAction?: 'monitor' | 'alert' | 'block';
    indicators?: string[];
    rawEventId?: string;
  } = {}
): WafAlert {
  return {
    id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    organizationId,
    timestamp: new Date(),
    threatType,
    severity,
    sourceIp,
    targetUri,
    country: options.country,
    eventCount: options.eventCount || 1,
    isCampaign: options.isCampaign || false,
    campaignId: options.campaignId,
    recommendedAction: options.recommendedAction || 'alert',
    indicators: options.indicators || [],
    rawEventId: options.rawEventId,
  };
}

/**
 * Check if an alert should be sent based on severity and configuration
 */
export function shouldSendAlert(
  severity: Severity,
  isCampaign: boolean,
  eventCount: number,
  config: AlertConfig
): boolean {
  // Always alert on critical
  if (severity === 'critical') {
    return true;
  }
  
  // Alert on high severity
  if (severity === 'high') {
    return true;
  }
  
  // Alert on new campaigns
  if (isCampaign && eventCount === config.campaignThreshold) {
    return true;
  }
  
  // Alert on campaign milestones
  const milestones = [25, 50, 100, 250, 500, 1000];
  if (isCampaign && milestones.includes(eventCount)) {
    return true;
  }
  
  // Don't alert on medium/low unless it's a campaign
  return false;
}
