import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { getPrismaClient } from '../../lib/database.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getOrigin } from '../../lib/middleware.js';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { createHmac, timingSafeEqual } from 'crypto';

const snsClient = new SNSClient({});

/**
 * CloudFormation Webhook Handler
 * 
 * SECURITY NOTE: This handler intentionally does NOT filter by organization_id
 * because it receives external webhooks from AWS CloudFormation.
 * 
 * Security is enforced via:
 * 1. API Key validation (WEBHOOK_API_KEY)
 * 2. Request signature validation (HMAC-SHA256)
 * 3. Timestamp validation (prevents replay attacks)
 * 4. AWS Account ID lookup (only processes monitored accounts)
 * 
 * The handler looks up the organization from the AWS Account ID in the event,
 * ensuring data is stored in the correct organization context.
 */

interface CloudFormationEvent {
  StackId: string;
  StackName: string;
  LogicalResourceId: string;
  PhysicalResourceId?: string;
  ResourceType: string;
  ResourceStatus: string;
  ResourceStatusReason?: string;
  Timestamp: string;
  RequestId: string;
}

/**
 * Validate request signature (HMAC-SHA256)
 * Prevents tampering and ensures request authenticity
 */
function validateRequestSignature(
  body: string,
  signature: string | undefined,
  timestamp: string | undefined
): boolean {
  const secret = process.env.WEBHOOK_SIGNING_SECRET;
  
  // If no signing secret configured, skip signature validation
  if (!secret) {
    logger.warn('WEBHOOK_SIGNING_SECRET not configured - signature validation skipped');
    return true;
  }
  
  if (!signature || !timestamp) {
    return false;
  }
  
  // Validate timestamp (prevent replay attacks - 5 minute window)
  const requestTime = parseInt(timestamp, 10);
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - requestTime) > 300) {
    logger.warn('Request timestamp outside valid window', { requestTime, currentTime });
    return false;
  }
  
  // Compute expected signature
  const payload = `${timestamp}.${body}`;
  const expectedSignature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  // Timing-safe comparison
  try {
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    return sigBuffer.length === expectedBuffer.length && 
           timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  // Security Layer 1: API Key validation
  const apiKey = event.headers?.['x-api-key'] || event.headers?.['X-Api-Key'];
  if (!apiKey || apiKey !== process.env.WEBHOOK_API_KEY) {
    logger.warn('CloudFormation webhook: Invalid API key');
    return error('Unauthorized', 401, undefined, origin);
  }
  
  // Security Layer 2: Request signature validation (if configured)
  const signature = event.headers?.['x-webhook-signature'] || event.headers?.['X-Webhook-Signature'];
  const timestamp = event.headers?.['x-webhook-timestamp'] || event.headers?.['X-Webhook-Timestamp'];
  
  if (!validateRequestSignature(event.body || '', signature, timestamp)) {
    logger.warn('CloudFormation webhook: Invalid request signature');
    return error('Invalid signature', 401, undefined, origin);
  }


  try {
    const prisma = getPrismaClient();
    const body = JSON.parse(event.body || '{}');
    const cfEvent: CloudFormationEvent = body;

    if (!cfEvent.StackId || !cfEvent.ResourceStatus) {
      return badRequest('Invalid CloudFormation event', undefined, origin);
    }

    // Extrair account ID do StackId
    const accountId = cfEvent.StackId.split(':')[4];

    // Buscar conta AWS
    const awsAccount = await prisma.awsAccount.findFirst({
      where: { account_id: accountId },
      include: { organization: true }
    });

    if (!awsAccount) {
      logger.info(`AWS Account ${accountId} not found, skipping event`);
      return success({ message: 'Account not monitored' }, 200, origin);
    }

    // Verificar se é um evento crítico
    const criticalStatuses = [
      'CREATE_FAILED', 'UPDATE_FAILED', 'DELETE_FAILED',
      'ROLLBACK_IN_PROGRESS', 'ROLLBACK_COMPLETE',
      'UPDATE_ROLLBACK_IN_PROGRESS', 'UPDATE_ROLLBACK_COMPLETE'
    ];

    if (criticalStatuses.includes(cfEvent.ResourceStatus)) {
      const message = {
        type: 'CLOUDFORMATION_EVENT',
        severity: 'HIGH',
        account: awsAccount.account_id,
        accountName: awsAccount.account_name,
        stack: cfEvent.StackName,
        resource: cfEvent.LogicalResourceId,
        status: cfEvent.ResourceStatus,
        reason: cfEvent.ResourceStatusReason,
        timestamp: cfEvent.Timestamp
      };

      if (process.env.ALERT_SNS_TOPIC_ARN) {
        await snsClient.send(new PublishCommand({
          TopicArn: process.env.ALERT_SNS_TOPIC_ARN,
          Subject: `CloudFormation Alert: ${cfEvent.StackName} - ${cfEvent.ResourceStatus}`,
          Message: JSON.stringify(message, null, 2)
        }));
      }

      await prisma.alert.create({
        data: {
          organization_id: awsAccount.organization_id,
          severity: 'HIGH',
          title: `CloudFormation Alert: ${cfEvent.StackName}`,
          message: cfEvent.ResourceStatusReason || `Resource ${cfEvent.LogicalResourceId} failed`,
          metadata: message as any
        }
      });
    }

    // Verificar drift detection
    if (cfEvent.ResourceStatus === 'UPDATE_COMPLETE' || cfEvent.ResourceStatus === 'CREATE_COMPLETE') {
      await prisma.driftDetection.create({
        data: {
          organization_id: awsAccount.organization_id,
          aws_account_id: awsAccount.id,
          resource_id: cfEvent.LogicalResourceId,
          resource_type: cfEvent.ResourceType,
          resource_name: cfEvent.LogicalResourceId,
          drift_type: 'CLOUDFORMATION_UPDATE',
          severity: 'MEDIUM'
        }
      });
    }

    return success({
      eventId: cfEvent.RequestId,
      processed: true
    }, 200, origin);
  } catch (err) {
    logger.error('CloudFormation webhook error:', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
