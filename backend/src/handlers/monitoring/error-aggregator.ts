/**
 * Error Aggregator Lambda
 * Processes CloudWatch Logs subscription and aggregates 5XX errors
 * Sends detailed notifications via SNS
 */

import type { CloudWatchLogsEvent, CloudWatchLogsDecodedData, Context } from 'aws-lambda';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { gunzipSync } from 'zlib';
import { logger } from '../../lib/logging.js';

const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN || '';
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';
const ENVIRONMENT = process.env.ENVIRONMENT || 'production';

interface ErrorEvent {
  timestamp: number;
  message: string;
  logGroup: string;
  logStream: string;
  functionName: string;
  errorType?: string;
  statusCode?: number;
  requestId?: string;
  duration?: number;
}

interface AggregatedError {
  count: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  functionName: string;
  errorType: string;
  sampleMessages: string[];
  requestIds: string[];
}

export async function handler(
  event: CloudWatchLogsEvent,
  _context: Context
): Promise<void> {
  logger.info('🔍 Processing CloudWatch Logs for errors');
  
  try {
    // Decode and decompress the CloudWatch Logs data
    const payload = Buffer.from(event.awslogs.data, 'base64');
    const decompressed = gunzipSync(payload);
    const logData: CloudWatchLogsDecodedData = JSON.parse(decompressed.toString());
    
    logger.info(`Processing ${logData.logEvents.length} log events from ${logData.logGroup}`);
    
    // Extract function name from log group
    const functionName = logData.logGroup.replace('/aws/lambda/', '');
    
    // Parse and filter error events
    const errors: ErrorEvent[] = [];
    
    for (const logEvent of logData.logEvents) {
      const error = parseLogEvent(logEvent.message, logEvent.timestamp, logData.logGroup, logData.logStream, functionName);
      if (error) {
        errors.push(error);
      }
    }
    
    if (errors.length === 0) {
      logger.info('No 5XX errors found in this batch');
      return;
    }
    
    logger.warn(`Found ${errors.length} errors`, { functionName, errorCount: errors.length });
    
    // Aggregate errors by type
    const aggregated = aggregateErrors(errors);
    
    // Send notifications
    await sendNotifications(aggregated, functionName);
    
    logger.info('✅ Error processing complete');
    
  } catch (err) {
    logger.error('❌ Error processing CloudWatch Logs:', err);
    throw err;
  }
}

function parseLogEvent(
  message: string,
  timestamp: number,
  logGroup: string,
  logStream: string,
  functionName: string
): ErrorEvent | null {
  // Check if this is a 5XX error
  const is5xxError = 
    message.includes('"statusCode":5') ||
    message.includes('"statusCode": 5') ||
    message.includes('statusCode\":5') ||
    message.includes('ERROR') ||
    message.includes('CRITICAL') ||
    message.includes('Exception') ||
    message.includes('Error:');
  
  if (!is5xxError) {
    return null;
  }
  
  // Try to extract status code
  let statusCode: number | undefined;
  const statusMatch = message.match(/"statusCode":\s*(\d+)/);
  if (statusMatch) {
    statusCode = parseInt(statusMatch[1], 10);
    // Only process 5XX errors
    if (statusCode < 500 || statusCode >= 600) {
      return null;
    }
  }
  
  // Try to extract request ID
  let requestId: string | undefined;
  const requestIdMatch = message.match(/RequestId:\s*([a-f0-9-]+)/i);
  if (requestIdMatch) {
    requestId = requestIdMatch[1];
  }
  
  // Determine error type
  let errorType = 'Unknown Error';
  if (message.includes('Cannot find module')) {
    errorType = 'Module Not Found';
  } else if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT')) {
    errorType = 'Connection Error';
  } else if (message.includes('PrismaClientInitializationError')) {
    errorType = 'Database Connection Error';
  } else if (message.includes('AccessDenied') || message.includes('UnauthorizedAccess')) {
    errorType = 'Permission Error';
  } else if (message.includes('ValidationError')) {
    errorType = 'Validation Error';
  } else if (message.includes('TimeoutError') || message.includes('Task timed out')) {
    errorType = 'Timeout Error';
  } else if (message.includes('OutOfMemory')) {
    errorType = 'Memory Error';
  } else if (statusCode === 502) {
    errorType = 'Bad Gateway (502)';
  } else if (statusCode === 503) {
    errorType = 'Service Unavailable (503)';
  } else if (statusCode === 504) {
    errorType = 'Gateway Timeout (504)';
  } else if (statusCode === 500) {
    errorType = 'Internal Server Error (500)';
  }
  
  return {
    timestamp,
    message: message.substring(0, 500), // Truncate long messages
    logGroup,
    logStream,
    functionName,
    errorType,
    statusCode,
    requestId,
  };
}

function aggregateErrors(errors: ErrorEvent[]): Map<string, AggregatedError> {
  const aggregated = new Map<string, AggregatedError>();
  
  for (const error of errors) {
    const key = `${error.functionName}:${error.errorType}`;
    
    if (aggregated.has(key)) {
      const existing = aggregated.get(key)!;
      existing.count++;
      existing.lastOccurrence = new Date(error.timestamp);
      if (existing.sampleMessages.length < 3) {
        existing.sampleMessages.push(error.message);
      }
      if (error.requestId && existing.requestIds.length < 5) {
        existing.requestIds.push(error.requestId);
      }
    } else {
      aggregated.set(key, {
        count: 1,
        firstOccurrence: new Date(error.timestamp),
        lastOccurrence: new Date(error.timestamp),
        functionName: error.functionName,
        errorType: error.errorType || 'Unknown',
        sampleMessages: [error.message],
        requestIds: error.requestId ? [error.requestId] : [],
      });
    }
  }
  
  return aggregated;
}

async function sendNotifications(
  aggregated: Map<string, AggregatedError>,
  functionName: string
): Promise<void> {
  const totalErrors = Array.from(aggregated.values()).reduce((sum, e) => sum + e.count, 0);
  
  // Build notification message
  const timestamp = new Date().toISOString();
  let message = `🚨 EVO Platform Error Alert\n`;
  message += `Environment: ${ENVIRONMENT}\n`;
  message += `Time: ${timestamp}\n`;
  message += `Total Errors: ${totalErrors}\n\n`;
  
  for (const [key, error] of aggregated) {
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `Function: ${error.functionName}\n`;
    message += `Error Type: ${error.errorType}\n`;
    message += `Count: ${error.count}\n`;
    message += `First: ${error.firstOccurrence.toISOString()}\n`;
    message += `Last: ${error.lastOccurrence.toISOString()}\n`;
    if (error.requestIds.length > 0) {
      message += `Request IDs: ${error.requestIds.join(', ')}\n`;
    }
    message += `\nSample Error:\n${error.sampleMessages[0].substring(0, 200)}...\n\n`;
  }
  
  message += `\n📊 View Dashboard: https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=EVO-${ENVIRONMENT}-Error-Monitoring`;
  
  // Send to SNS
  if (SNS_TOPIC_ARN) {
    try {
      await snsClient.send(new PublishCommand({
        TopicArn: SNS_TOPIC_ARN,
        Subject: `🚨 [${ENVIRONMENT.toUpperCase()}] ${totalErrors} Errors in ${functionName}`,
        Message: message,
      }));
      logger.info('✅ SNS notification sent');
    } catch (err) {
      logger.error('Failed to send SNS notification:', err);
    }
  }
  
  // Send to Slack (if configured)
  if (SLACK_WEBHOOK_URL) {
    try {
      await sendSlackNotification(aggregated, totalErrors);
      logger.info('✅ Slack notification sent');
    } catch (err) {
      logger.error('Failed to send Slack notification:', err);
    }
  }
}

async function sendSlackNotification(
  aggregated: Map<string, AggregatedError>,
  totalErrors: number
): Promise<void> {
  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🚨 EVO Platform Error Alert`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Environment:*\n${ENVIRONMENT}`,
        },
        {
          type: 'mrkdwn',
          text: `*Total Errors:*\n${totalErrors}`,
        },
      ],
    },
    {
      type: 'divider',
    },
  ];
  
  for (const [key, error] of aggregated) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${error.functionName}*\n` +
          `Type: \`${error.errorType}\`\n` +
          `Count: ${error.count}\n` +
          `\`\`\`${error.sampleMessages[0].substring(0, 150)}...\`\`\``,
      },
    });
  }
  
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '📊 View Dashboard',
          emoji: true,
        },
        url: `https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=EVO-${ENVIRONMENT}-Error-Monitoring`,
      },
    ],
  });
  
  const response = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  });
  
  if (!response.ok) {
    throw new Error(`Slack webhook failed: ${response.status}`);
  }
}
