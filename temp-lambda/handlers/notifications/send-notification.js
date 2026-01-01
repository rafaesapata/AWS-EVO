"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
const schemas_js_1 = require("../../lib/schemas.js");
const client_sns_1 = require("@aws-sdk/client-sns");
const client_ses_1 = require("@aws-sdk/client-ses");
async function handler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    const user = (0, auth_js_1.getUserFromEvent)(event);
    const organizationId = (0, auth_js_1.getOrganizationId)(user);
    logging_js_1.logger.info('Send notification started', {
        organizationId,
        userId: user.sub,
        requestId: context.awsRequestId
    });
    try {
        // Validar input com Zod
        const parseResult = schemas_js_1.sendNotificationSchema.safeParse(event.body ? JSON.parse(event.body) : {});
        if (!parseResult.success) {
            const errorMessages = parseResult.error.errors
                .map(err => `${err.path.join('.')}: ${err.message}`)
                .join(', ');
            return (0, response_js_1.badRequest)(`Validation error: ${errorMessages}`, undefined, origin);
        }
        const { channel, recipient, subject, message, metadata } = parseResult.data;
        logging_js_1.logger.info('Sending notification', {
            organizationId,
            channel,
            recipient: recipient.substring(0, 10) + '***' // Mask recipient for privacy
        });
        const prisma = (0, database_js_1.getPrismaClient)();
        let messageId;
        switch (channel) {
            case 'email': {
                const sesClient = new client_ses_1.SESClient({ region: process.env.AWS_REGION || 'us-east-1' });
                const emailResponse = await sesClient.send(new client_ses_1.SendEmailCommand({
                    Source: process.env.FROM_EMAIL || 'noreply@evo-uds.com',
                    Destination: {
                        ToAddresses: [recipient],
                    },
                    Message: {
                        Subject: {
                            Data: subject || 'EVO UDS Notification',
                        },
                        Body: {
                            Text: {
                                Data: message,
                            },
                            Html: {
                                Data: `
                    <html>
                      <body>
                        <h2>${subject || 'EVO UDS Notification'}</h2>
                        <p>${message}</p>
                        ${metadata ? `<pre>${JSON.stringify(metadata, null, 2)}</pre>` : ''}
                      </body>
                    </html>
                  `,
                            },
                        },
                    },
                }));
                messageId = emailResponse.MessageId;
                break;
            }
            case 'sms': {
                const snsClient = new client_sns_1.SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
                const smsResponse = await snsClient.send(new client_sns_1.PublishCommand({
                    PhoneNumber: recipient,
                    Message: message,
                }));
                messageId = smsResponse.MessageId;
                break;
            }
            case 'sns': {
                const snsClient = new client_sns_1.SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
                const snsResponse = await snsClient.send(new client_sns_1.PublishCommand({
                    TopicArn: recipient, // recipient é o ARN do tópico SNS
                    Subject: subject,
                    Message: message,
                }));
                messageId = snsResponse.MessageId;
                break;
            }
            default:
                return (0, response_js_1.badRequest)(`Invalid channel: ${channel}`);
        }
        // Log da comunicação
        await prisma.communicationLog.create({
            data: {
                organization_id: organizationId,
                channel,
                recipient,
                subject: subject || 'Notification',
                message,
                status: 'sent',
                metadata: {
                    message_id: messageId,
                    ...metadata,
                },
            },
        });
        logging_js_1.logger.info('Notification sent successfully', {
            organizationId,
            channel,
            messageId,
            recipient: recipient.substring(0, 10) + '***'
        });
        return (0, response_js_1.success)({
            message_id: messageId,
            channel,
            recipient,
            status: 'sent',
        });
    }
    catch (err) {
        logging_js_1.logger.error('Send notification error', err, {
            organizationId,
            userId: user.sub,
            requestId: context.awsRequestId
        });
        // Log do erro
        try {
            const prisma = (0, database_js_1.getPrismaClient)();
            const body = event.body ? JSON.parse(event.body) : {};
            await prisma.communicationLog.create({
                data: {
                    organization_id: organizationId,
                    channel: body.channel,
                    recipient: body.recipient,
                    subject: body.subject || 'Notification',
                    message: body.message,
                    status: 'failed',
                    metadata: {
                        error: err instanceof Error ? err.message : 'Unknown error',
                    },
                },
            });
        }
        catch (logError) {
            logging_js_1.logger.error('Failed to log notification error', logError, { organizationId });
        }
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=send-notification.js.map