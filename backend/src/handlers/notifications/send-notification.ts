import { getHttpMethod, getHttpPath, getOrigin } from '../../lib/middleware.js';
/**
 * Lambda handler para enviar notificações
 * AWS Lambda Handler for send-notification
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { sendNotificationSchema } from '../../lib/schemas.js';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationId(user);
  
  logger.info('Send notification started', { 
    organizationId,
    userId: user.id,
    requestId: context.awsRequestId 
  });
  
  try {
    // Validar input com Zod
    const parseResult = sendNotificationSchema.safeParse(
      event.body ? JSON.parse(event.body) : {}
    );
    
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      return badRequest(`Validation error: ${errorMessages}`, undefined, origin);
    }
    
    const { channel, recipient, subject, message, metadata } = parseResult.data;
    
    logger.info('Sending notification', { 
      organizationId, 
      channel, 
      recipient: recipient.substring(0, 10) + '***' // Mask recipient for privacy
    });
    
    const prisma = getPrismaClient();
    let messageId: string | undefined;
    
    switch (channel) {
      case 'email': {
        const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });
        
        const emailResponse = await sesClient.send(
          new SendEmailCommand({
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
      userId: user.id,
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
    
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
