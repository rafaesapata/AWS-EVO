"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const logging_js_1 = require("../../lib/logging.js");
const database_js_1 = require("../../lib/database.js");
const response_js_1 = require("../../lib/response.js");
const middleware_js_1 = require("../../lib/middleware.js");
const client_sns_1 = require("@aws-sdk/client-sns");
const crypto_1 = require("crypto");
const snsClient = new client_sns_1.SNSClient({});
/**
 * Validate request signature (HMAC-SHA256)
 * Prevents tampering and ensures request authenticity
 */
function validateRequestSignature(body, signature, timestamp) {
    const secret = process.env.WEBHOOK_SIGNING_SECRET;
    // If no signing secret configured, skip signature validation
    if (!secret) {
        logging_js_1.logger.warn('WEBHOOK_SIGNING_SECRET not configured - signature validation skipped');
        return true;
    }
    if (!signature || !timestamp) {
        return false;
    }
    // Validate timestamp (prevent replay attacks - 5 minute window)
    const requestTime = parseInt(timestamp, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - requestTime) > 300) {
        logging_js_1.logger.warn('Request timestamp outside valid window', { requestTime, currentTime });
        return false;
    }
    // Compute expected signature
    const payload = `${timestamp}.${body}`;
    const expectedSignature = (0, crypto_1.createHmac)('sha256', secret)
        .update(payload)
        .digest('hex');
    // Timing-safe comparison
    try {
        const sigBuffer = Buffer.from(signature, 'hex');
        const expectedBuffer = Buffer.from(expectedSignature, 'hex');
        return sigBuffer.length === expectedBuffer.length &&
            (0, crypto_1.timingSafeEqual)(sigBuffer, expectedBuffer);
    }
    catch {
        return false;
    }
}
async function handler(event, _context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    if (httpMethod === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    // Security Layer 1: API Key validation
    const apiKey = event.headers?.['x-api-key'] || event.headers?.['X-Api-Key'];
    if (!apiKey || apiKey !== process.env.WEBHOOK_API_KEY) {
        logging_js_1.logger.warn('CloudFormation webhook: Invalid API key');
        return (0, response_js_1.error)('Unauthorized', 401, undefined, origin);
    }
    // Security Layer 2: Request signature validation (if configured)
    const signature = event.headers?.['x-webhook-signature'] || event.headers?.['X-Webhook-Signature'];
    const timestamp = event.headers?.['x-webhook-timestamp'] || event.headers?.['X-Webhook-Timestamp'];
    if (!validateRequestSignature(event.body || '', signature, timestamp)) {
        logging_js_1.logger.warn('CloudFormation webhook: Invalid request signature');
        return (0, response_js_1.error)('Invalid signature', 401, undefined, origin);
    }
    try {
        const prisma = (0, database_js_1.getPrismaClient)();
        const body = JSON.parse(event.body || '{}');
        const cfEvent = body;
        if (!cfEvent.StackId || !cfEvent.ResourceStatus) {
            return (0, response_js_1.badRequest)('Invalid CloudFormation event', undefined, origin);
        }
        // Extrair account ID do StackId
        const accountId = cfEvent.StackId.split(':')[4];
        // Buscar conta AWS
        const awsAccount = await prisma.awsAccount.findFirst({
            where: { account_id: accountId },
            include: { organization: true }
        });
        if (!awsAccount) {
            logging_js_1.logger.info(`AWS Account ${accountId} not found, skipping event`);
            return (0, response_js_1.success)({ message: 'Account not monitored' }, 200, origin);
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
                await snsClient.send(new client_sns_1.PublishCommand({
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
                    metadata: message
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
        return (0, response_js_1.success)({
            eventId: cfEvent.RequestId,
            processed: true
        }, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('CloudFormation webhook error:', err);
        return (0, response_js_1.error)('Internal server error', 500, undefined, origin);
    }
}
//# sourceMappingURL=cloudformation-webhook.js.map