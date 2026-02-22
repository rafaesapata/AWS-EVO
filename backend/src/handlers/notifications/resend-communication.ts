/**
 * Resend Communication Handler
 * Reenvia um email da central de comunicações para o destinatário original ou outro email.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, notFound, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getOrigin } from '../../lib/middleware.js';
import { getPrismaClient } from '../../lib/database.js';
import { createEmailService } from '../../lib/email-service.js';
import { logger } from '../../lib/logger.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

const resendSchema = z.object({
  communicationLogId: z.string().uuid(),
  newRecipient: z.string().email().optional(),
});

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;

  if (httpMethod === 'OPTIONS') return corsOptions(origin);

  let organizationId: string;
  let user: any;
  try {
    user = getUserFromEvent(event);
    organizationId = getOrganizationIdWithImpersonation(event, user);
  } catch {
    return error('Unauthorized', 401, undefined, origin);
  }

  try {
    const validation = parseAndValidateBody(resendSchema, event.body);
    if (!validation.success) return validation.error;

    const { communicationLogId, newRecipient } = validation.data;
    const prisma = getPrismaClient();

    // Buscar log original - FILTRAR POR ORGANIZATION_ID
    const originalLog = await prisma.communicationLog.findFirst({
      where: { id: communicationLogId, organization_id: organizationId },
    });

    if (!originalLog) {
      return notFound('Communication log not found', origin);
    }

    if (originalLog.channel !== 'email') {
      return badRequest('Only email communications can be resent', undefined, origin);
    }

    const recipient = newRecipient || originalLog.recipient;
    const emailService = createEmailService();

    logger.info('Resending communication', {
      originalId: communicationLogId,
      originalRecipient: originalLog.recipient,
      newRecipient: recipient,
      subject: originalLog.subject,
    });

    // Extrair HTML do metadata se disponível, senão usar message como textBody
    const metadata = (originalLog.metadata as Record<string, any>) || {};
    const htmlBody = metadata.htmlBody || undefined;
    const subject = originalLog.subject || 'Reenvio de comunicação';

    let messageId: string | undefined;
    let sendStatus = 'sent';
    let errorMsg: string | undefined;

    try {
      const result = await emailService.sendEmail({
        to: { email: recipient },
        subject,
        htmlBody,
        textBody: !htmlBody ? originalLog.message : undefined,
        tags: { type: 'resend', original_id: communicationLogId },
      });
      messageId = result.messageId;
      logger.info('Communication resent successfully', { messageId, to: recipient });
    } catch (err) {
      sendStatus = 'failed';
      errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to resend communication', err as Error, { communicationLogId, recipient });
    }

    // Criar novo log na central de comunicações
    const newLog = await prisma.communicationLog.create({
      data: {
        organization_id: organizationId,
        channel: 'email',
        recipient,
        subject: `[Reenvio] ${subject}`,
        message: originalLog.message,
        status: sendStatus,
        metadata: {
          type: 'resend',
          original_communication_id: communicationLogId,
          original_recipient: originalLog.recipient,
          resent_by: user.sub || user.id,
          ...(messageId ? { messageId } : {}),
          ...(errorMsg ? { error: errorMsg } : {}),
          ...(newRecipient ? { redirected_to: newRecipient } : {}),
        },
      },
    });

    // Audit log
    logAuditAsync({
      organizationId,
      userId: user.sub || user.id,
      action: 'COMMUNICATION_RESEND',
      resourceType: 'communication',
      resourceId: communicationLogId,
      details: {
        new_log_id: newLog.id,
        recipient,
        original_recipient: originalLog.recipient,
        status: sendStatus,
      },
      ipAddress: getIpFromEvent(event),
      userAgent: getUserAgentFromEvent(event),
    });

    return success({
      success: sendStatus === 'sent',
      newLogId: newLog.id,
      messageId,
      recipient,
      status: sendStatus,
      ...(errorMsg ? { error: errorMsg } : {}),
    }, 200, origin);

  } catch (err) {
    logger.error('Resend communication error', err as Error);
    return error('Internal server error', 500, undefined, origin);
  }
}
