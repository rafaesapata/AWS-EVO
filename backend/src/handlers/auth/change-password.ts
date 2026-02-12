/**
 * Change Password Handler
 * Changes user password via Cognito, sends notification email, logs to communication center
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import { emailService } from '../../lib/email-service.js';
import { safeParseJSON } from '../../lib/request-parser.js';
import {
  CognitoIdentityProviderClient,
  ChangePasswordCommand
} from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' });

interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

const MIN_PASSWORD_LENGTH = 8;

function isValidPassword(password: string): boolean {
  return (
    password.length >= MIN_PASSWORD_LENGTH &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
  );
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);

  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    const prisma = getPrismaClient();

    const body = safeParseJSON<ChangePasswordRequest>(
      event.body,
      {} as ChangePasswordRequest,
      'change-password'
    );

    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return badRequest('Senha atual e nova senha são obrigatórias', undefined, origin);
    }

    if (!isValidPassword(newPassword)) {
      return badRequest('Nova senha não atende aos requisitos de segurança', undefined, origin);
    }

    if (currentPassword === newPassword) {
      return badRequest('A nova senha deve ser diferente da atual', undefined, origin);
    }

    // Get access token from Authorization header
    const accessToken = event.headers?.['authorization']?.replace('Bearer ', '')
      || event.headers?.['Authorization']?.replace('Bearer ', '');

    if (!accessToken) {
      return error('Token de acesso não encontrado', 401, undefined, origin);
    }

    // Change password via Cognito
    const command = new ChangePasswordCommand({
      PreviousPassword: currentPassword,
      ProposedPassword: newPassword,
      AccessToken: accessToken,
    });

    try {
      await cognitoClient.send(command);
    } catch (cognitoError: any) {
      logger.error('Cognito change password error', { error: cognitoError.name });

      if (cognitoError.name === 'NotAuthorizedException') {
        return badRequest('Senha atual incorreta', undefined, origin);
      }
      if (cognitoError.name === 'InvalidPasswordException') {
        return badRequest('Nova senha não atende aos requisitos de segurança', undefined, origin);
      }
      if (cognitoError.name === 'LimitExceededException') {
        return error('Muitas tentativas. Tente novamente mais tarde.', 429, undefined, origin);
      }

      throw cognitoError;
    }

    const ipAddress = getIpFromEvent(event) || 'unknown';
    const userAgent = getUserAgentFromEvent(event) || 'unknown';
    const changeTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // Send notification email (async, don't block response)
    sendPasswordChangedNotification(prisma, {
      email: user.email,
      name: user.email.split('@')[0],
      organizationId,
      changeTime,
      ipAddress,
      userAgent,
    }).catch(err => logger.error('Failed to send password changed email', err));

    // Audit log
    logAuditAsync({
      organizationId,
      userId: user.sub,
      action: 'PASSWORD_CHANGE',
      resourceType: 'user',
      resourceId: user.sub,
      details: { ip: ipAddress },
      ipAddress,
      userAgent,
    });

    logger.info('Password changed successfully', { userId: user.sub });

    return success({ message: 'Senha alterada com sucesso' }, 200, origin);
  } catch (err) {
    logger.error('Change password error', err);
    return error('Erro ao alterar senha', 500, undefined, origin);
  }
}

const NOTIFICATION_SUBJECT = 'Sua senha foi alterada - EVO Platform';
const TEMPLATE_TYPE = 'password_changed';

interface NotificationData {
  email: string;
  name: string;
  organizationId: string;
  changeTime: string;
  ipAddress: string;
  userAgent: string;
}

async function logCommunication(
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string,
  recipient: string,
  subject: string,
  status: 'sent' | 'failed',
  metadata: Record<string, any>
): Promise<void> {
  await prisma.communicationLog.create({
    data: {
      organization_id: organizationId,
      channel: 'email',
      recipient,
      subject,
      message: status === 'sent'
        ? 'Notificação de alteração de senha enviada'
        : 'Falha ao enviar notificação de alteração de senha',
      status,
      metadata: { ...metadata, template_type: TEMPLATE_TYPE },
    },
  }).catch(err => logger.error('Failed to log communication', err));
}

async function sendPasswordChangedNotification(
  prisma: ReturnType<typeof getPrismaClient>,
  data: NotificationData
): Promise<void> {
  const { email, name, organizationId, changeTime, ipAddress, userAgent } = data;

  try {
    const dbTemplate = await prisma.emailTemplate.findUnique({
      where: { template_type: TEMPLATE_TYPE },
    }).catch(() => null);

    let result: { messageId: string };
    let subject = NOTIFICATION_SUBJECT;

    if (dbTemplate?.is_active) {
      // Process DB template variables
      const variables: Record<string, string> = {
        user_name: name,
        change_time: changeTime,
        ip_address: ipAddress,
        user_agent: userAgent,
        support_url: process.env.PLATFORM_BASE_URL || 'https://evo.nuevacore.com',
      };

      subject = dbTemplate.subject;
      let htmlBody = dbTemplate.html_body;
      let textBody = dbTemplate.text_body || '';

      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{${key}}`, 'g');
        htmlBody = htmlBody.replace(regex, value);
        textBody = textBody.replace(regex, value);
        subject = subject.replace(regex, value);
      }

      result = await emailService.sendEmail({
        to: { email, name },
        subject,
        htmlBody,
        textBody: textBody || undefined,
        tags: { type: TEMPLATE_TYPE },
      });
    } else {
      result = await emailService.sendPasswordChangedEmail(
        { email, name },
        { userName: name, changeTime, ipAddress, userAgent }
      );
    }

    await logCommunication(prisma, organizationId, email, subject, 'sent', { messageId: result.messageId });
    logger.info('Password changed notification sent', { email, messageId: result.messageId });
  } catch (err) {
    logger.error('Failed to send password changed notification', err);
    await logCommunication(prisma, organizationId, email, NOTIFICATION_SUBJECT, 'failed', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    throw err;
  }
}
