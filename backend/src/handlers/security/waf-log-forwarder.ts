/**
 * WAF Log Forwarder Lambda Handler
 * 
 * Receives WAF logs from CloudWatch Logs Subscription Filter in regional accounts
 * and forwards them to the main waf-log-processor Lambda in us-east-1.
 * 
 * This is needed because:
 * 1. CloudWatch Logs destinations can only invoke Lambdas in the same region
 * 2. The main waf-log-processor needs VPC access to RDS in us-east-1
 * 
 * Event format: CloudWatch Logs Subscription Filter event
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { logger } from '../../lib/logger.js';
import type { LambdaContext } from '../../types/lambda.js';

// CloudWatch Logs Subscription Filter event type
interface CloudWatchLogsEvent {
  awslogs: {
    data: string; // Base64 + gzip encoded
  };
}

interface ForwardingResult {
  success: boolean;
  message: string;
  targetLambda: string;
  region: string;
}

// Target Lambda in us-east-1
const TARGET_LAMBDA = 'evo-uds-v3-production-waf-log-processor';
const TARGET_REGION = 'us-east-1';

// Lambda client for us-east-1
const lambdaClient = new LambdaClient({ region: TARGET_REGION });

export async function handler(
  event: CloudWatchLogsEvent,
  context: LambdaContext
): Promise<ForwardingResult> {
  const startTime = Date.now();
  
  logger.info('WAF Log Forwarder started', { 
    requestId: context.awsRequestId,
    hasAwslogs: !!event.awslogs,
    sourceRegion: process.env.AWS_REGION
  });
  
  // Validate event structure
  if (!event.awslogs?.data) {
    logger.error('Invalid event: missing awslogs.data');
    return {
      success: false,
      message: 'Invalid event: missing awslogs.data',
      targetLambda: TARGET_LAMBDA,
      region: TARGET_REGION
    };
  }
  
  try {
    // Forward the event as-is to the main processor in us-east-1
    const command = new InvokeCommand({
      FunctionName: TARGET_LAMBDA,
      InvocationType: 'Event', // Async invocation
      Payload: Buffer.from(JSON.stringify(event))
    });
    
    const response = await lambdaClient.send(command);
    
    const processingTime = Date.now() - startTime;
    
    logger.info('WAF Log Forwarder completed', {
      requestId: context.awsRequestId,
      statusCode: response.StatusCode,
      processingTimeMs: processingTime,
      targetLambda: TARGET_LAMBDA,
      targetRegion: TARGET_REGION
    });
    
    return {
      success: response.StatusCode === 202, // 202 = Accepted for async
      message: `Forwarded to ${TARGET_LAMBDA} in ${TARGET_REGION}`,
      targetLambda: TARGET_LAMBDA,
      region: TARGET_REGION
    };
    
  } catch (err) {
    logger.error('WAF Log Forwarder error', err as Error, {
      requestId: context.awsRequestId,
      targetLambda: TARGET_LAMBDA,
      targetRegion: TARGET_REGION
    });
    
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Unknown error',
      targetLambda: TARGET_LAMBDA,
      region: TARGET_REGION
    };
  }
}
