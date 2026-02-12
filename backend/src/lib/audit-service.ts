/**
 * Centralized Audit Service
 * Provides easy-to-use functions for logging audit events
 */

import { getPrismaClient } from './database.js';
import { logger } from './logger.js';

export type AuditAction = 
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'MFA_ENABLED'
  | 'MFA_DISABLED'
  | 'MFA_VERIFIED'
  | 'PASSWORD_CHANGE'
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_DELETE'
  | 'USER_DISABLE'
  | 'USER_ENABLE'
  | 'CREDENTIAL_CREATE'
  | 'CREDENTIAL_UPDATE'
  | 'CREDENTIAL_DELETE'
  | 'SECURITY_SCAN_START'
  | 'SECURITY_SCAN_COMPLETE'
  | 'COMPLIANCE_SCAN_START'
  | 'COMPLIANCE_SCAN_COMPLETE'
  | 'COST_ANALYSIS'
  | 'REPORT_GENERATE'
  | 'REPORT_EXPORT'
  | 'ALERT_CREATE'
  | 'ALERT_UPDATE'
  | 'ALERT_DELETE'
  | 'TICKET_CREATE'
  | 'TICKET_UPDATE'
  | 'TICKET_CLOSE'
  | 'AI_CHAT'
  | 'SETTINGS_UPDATE'
  | 'ORGANIZATION_UPDATE'
  | 'LICENSE_SYNC'
  | 'DATA_EXPORT'
  | 'DATA_DELETE'
  | 'PERMISSION_CHANGE'
  | 'API_KEY_CREATE'
  | 'API_KEY_REVOKE'
  | 'CLOUDTRAIL_ANALYSIS'
  | 'WAF_SETUP'
  | 'WAF_BLOCK_IP'
  | 'WAF_UNBLOCK_IP'
  | 'AI_NOTIFICATION_SENT'
  | 'AI_NOTIFICATION_READ'
  | 'AI_NOTIFICATION_ACTIONED'
  | 'AI_NOTIFICATION_DISMISSED'
  | 'ORGANIZATION_SUSPENDED'
  | 'ORGANIZATION_UNSUSPENDED'
  | 'SEAT_RELEASED'
  | 'DATA_CREATE'
  | 'DATA_UPDATE'
  | 'DATA_UPSERT'
  | 'ADMIN_UPDATE_AZURE_CREDENTIAL'
  | 'EVO_APP_CREDENTIALS_UPDATE'
  | 'EVO_APP_CREDENTIALS_SYNC'
  | 'WEBAUTHN_CREDENTIAL_DELETED'
  | 'WEBAUTHN_ALL_CREDENTIALS_DELETED';

export type AuditResourceType =
  | 'user'
  | 'organization'
  | 'aws_credential'
  | 'azure_credential'
  | 'security_scan'
  | 'compliance_scan'
  | 'cost_report'
  | 'alert'
  | 'ticket'
  | 'copilot'
  | 'settings'
  | 'license'
  | 'api_key'
  | 'cloudtrail'
  | 'waf'
  | 'report'
  | 'mfa'
  | 'evo_app_credentials'
  | 'session'
  | 'ai_notification'
  | 'organization_license_config'
  | 'license_seat_assignment'
  | 'data'
  | 'webauthn_credential';

export interface AuditLogParams {
  organizationId: string;
  userId?: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log an audit event
 * This function is fire-and-forget - it won't throw errors
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    const prisma = getPrismaClient();
    
    await prisma.auditLog.create({
      data: {
        organization_id: params.organizationId,
        user_id: params.userId || null,
        action: params.action,
        resource_type: params.resourceType,
        resource_id: params.resourceId || null,
        details: params.details || {},
        ip_address: params.ipAddress || null,
        user_agent: params.userAgent || null,
      },
    });
    
    logger.debug(`Audit: ${params.action} on ${params.resourceType}`, {
      organizationId: params.organizationId,
      resourceId: params.resourceId,
    });
  } catch (err) {
    // Don't throw - audit logging should never break the main flow
    logger.error('Failed to log audit event:', err);
  }
}

/**
 * Log audit event asynchronously (fire and forget)
 * Use this when you don't want to wait for the audit log to complete
 */
export function logAuditAsync(params: AuditLogParams): void {
  logAudit(params).catch(() => {
    // Silently ignore errors
  });
}

/**
 * Extract IP address from Lambda event
 */
export function getIpFromEvent(event: any): string | undefined {
  return event?.requestContext?.identity?.sourceIp ||
         event?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
         event?.headers?.['X-Forwarded-For']?.split(',')[0]?.trim();
}

/**
 * Extract User Agent from Lambda event
 */
export function getUserAgentFromEvent(event: any): string | undefined {
  return event?.headers?.['user-agent'] || event?.headers?.['User-Agent'];
}
