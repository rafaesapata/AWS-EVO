import { getHttpMethod, getHttpPath, getOrigin } from '../../lib/middleware.js';
/**
 * Lambda handler para enviar notificações
 * AWS Lambda Handler for send-notification
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions, safeHandler } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { sendNotificationSchema } from '../../lib/schemas.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

// SES Configuration from environment variables
const SES_CONFIG = {
  region: process.env.AWS_SES_REGION || process.env.AWS_REGION || 'us-east-1',
  fromEmail: process.env.AWS_SES_FROM_EMAIL || 'evo@nuevacore.com',
  fromName: process.env.AWS_SES_FROM_NAME || 'EVO Platform',
  accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY,
};

/**
 * Create SES client with optional dedicated credentials
 */
function createSESClient(): SESClient {
  const config: any = {
    region: SES_CONFIG.region,
  };

  if (SES_CONFIG.accessKeyId && SES_CONFIG.secretAccessKey) {
    config.credentials = {
      accessKeyId: SES_CONFIG.accessKeyId,
      secretAccessKey: SES_CONFIG.secretAccessKey,
    };
  }

  return new SESClient(config);
}

export const handler = safeHandler(async (
  event: AuthorizedEvent,
  context: LambdaContext
) => {
  const origin = getOrigin(event);
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  let user: ReturnType<typeof getUserFromEvent>;
  let organizationId: string;
  
  try {
    user = getUserFromEvent(event);
    organizationId = getOrganizationIdWithImpersonation(event, user);
  } catch (authError) {
    logger.error('Authentication error in send-notification', authError);
    return error('Unauthorized', 401, undefined, origin);
  }
  
  logger.info('Send notification started', { 
    organizationId,
    userId: user.sub,
    requestId: context.awsRequestId 
  });
  
  try {
    // Validar input com Zod usando parseAndValidateBody
    const validation = parseAndValidateBody(sendNotificationSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { channel, recipient, subject, message, metadata } = validation.data;
    
    logger.info('Sending notification', { 
      organizationId, 
      channel, 
      recipient: recipient.substring(0, 10) + '***' // Mask recipient for privacy
    });
    
    const prisma = getPrismaClient();
    let messageId: string | undefined;
    
    switch (channel) {
      case 'email': {
        const sesClient = createSESClient();
        const fromAddress = SES_CONFIG.fromName 
          ? `${SES_CONFIG.fromName} <${SES_CONFIG.fromEmail}>`
          : SES_CONFIG.fromEmail;
        
        const emailResponse = await sesClient.send(
          new SendEmailCommand({
            Source: fromAddress,
            Destination: {
              ToAddresses: [recipient],
            },
            Message: {
              Subject: {
                Data: subject || 'EVO - Notificação',
              },
              Body: {
                Text: {
                  Data: message,
                },
                Html: {
                  Data: `
                    <html>
                      <body style="font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 20px; background-color: #f0f2f5;">
                        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
                          <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); padding: 32px 24px; text-align: center;">
                            <span style="font-size: 36px; font-weight: 700; color: #ffffff; letter-spacing: -1px;">EVO</span>
                            <span style="font-size: 12px; color: rgba(255,255,255,0.6); display: block; letter-spacing: 3px; text-transform: uppercase; margin-top: 4px;">Cloud Platform</span>
                          </div>
                          <div style="padding: 32px 28px;">
                            <h2 style="color: #1a1a2e; margin: 0 0 16px 0; font-size: 20px; font-weight: 600;">${subject || 'Notificação'}</h2>
                            <p style="font-size: 15px; line-height: 1.6; color: #4a5568; margin: 0 0 20px 0;">${message}</p>
                            ${metadata ? `<div style="background-color: #f8f9fb; border-radius: 8px; padding: 16px; margin-top: 16px;"><pre style="margin: 0; font-size: 13px; color: #64748b; white-space: pre-wrap; word-break: break-word;">${JSON.stringify(metadata, null, 2)}</pre></div>` : ''}
                          </div>
                          <div style="background-color: #f8f9fb; padding: 16px 28px; text-align: center; border-top: 1px solid #e8ecf1;">
                            <p style="margin: 0; font-size: 11px; color: #94a3b8;">© ${new Date().getFullYear()} EVO Platform · Powered by NuevaCore</p>
                          </div>
                        </div>
                      </body>
                    </html>
                  `,
                },
              },
            },
          })
        );
        
        messageId = emailResponse.MessageId;
        break;
      }
      
      case 'sms': {
        const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
        
        const smsResponse = await snsClient.send(
          new PublishCommand({
            PhoneNumber: recipient,
            Message: message,
          })
        );
        
        messageId = smsResponse.MessageId;
        break;
      }
      
      case 'sns': {
        const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
        
        const snsResponse = await snsClient.send(
          new PublishCommand({
            TopicArn: recipient, // recipient é o ARN do tópico SNS
            Subject: subject,
            Message: message,
          })
        );
        
        messageId = snsResponse.MessageId;
        break;
      }
      
      default:
        return badRequest(`Invalid channel: ${channel}`);
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
    
    logger.info('Notification sent successfully', { 
      organizationId, 
      channel, 
      messageId,
      recipient: recipient.substring(0, 10) + '***'
    });
    
    return success({
      message_id: messageId,
      channel,
      recipient,
      status: 'sent',
    });
    
  } catch (err) {
    logger.error('Send notification error', err as Error, { 
      organizationId,
      userId: user.sub,
      requestId: context.awsRequestId 
    });
    
    // Log do erro
    try {
      const prisma = getPrismaClient();
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
    } catch (logError) {
      logger.error('Failed to log notification error', logError as Error, { organizationId });
    }
    
    return error('Failed to send notification. Please try again.', 500, undefined, origin);
  }
});
