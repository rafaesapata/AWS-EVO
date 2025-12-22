/**
 * Audit Trail System - Military Grade
 * Complete audit logging for compliance and security
 */

import { getPrismaClient } from './database.js';
import { logger } from './structured-logging.js';

// ============================================================================
// TYPES
// ============================================================================

export type AuditAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'EXPORT' | 'LOGIN' | 'LOGOUT';

export interface AuditEvent {
  userId: string;
  organizationId: string;
  eventType: string;
  resourceType: string;
  resourceId: string;
  action: AuditAction;
  oldValue?: any;
  newValue?: any;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface AuditQueryFilters {
  organizationId?: string;
  userId?: string;
  eventType?: string;
  resourceType?: string;
  action?: AuditAction;
  startDate?: Date;
  endDate?: Date;
  success?: boolean;
  limit?: number;
  offset?: number;
}

// ============================================================================
// AUDIT TRAIL CLASS
// ============================================================================

export class AuditTrail {
  private prisma = getPrismaClient();

  /**
   * Log audit event
   */
  async logEvent(event: AuditEvent): Promise<string> {
    const auditId = `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Sanitize sensitive values before persisting
      const sanitizedOldValue = this.sanitizeForAudit(event.oldValue);
      const sanitizedNewValue = this.sanitizeForAudit(event.newValue);

      await this.prisma.auditLog.create({
        data: {
          id: auditId,
          user_id: event.userId,
          organization_id: event.organizationId,
          event_type: event.eventType,
          resource_type: event.resourceType,
          resource_id: event.resourceId,
          action: event.action,
          old_value: sanitizedOldValue ? JSON.stringify(sanitizedOldValue) : null,
          new_value: sanitizedNewValue ? JSON.stringify(sanitizedNewValue) : null,
          ip_address: event.ipAddress,
          user_agent: event.userAgent,
          success: event.success,
          error_message: event.errorMessage,
          metadata: event.metadata ? JSON.stringify(event.metadata) : null,
          created_at: new Date()
        }
      });

      // Structured log
      await logger.log('INFO', 'Audit event logged', {
        auditId,
        eventType: event.eventType,
        action: event.action,
        userId: event.userId,
        organizationId: event.organizationId,
        resourceType: event.resourceType,
        success: event.success
      });

      return auditId;

    } catch (error: any) {
      // Never fail silently on audit
      await logger.log('ERROR', 'Failed to log audit event', {
        event,
        error: error.message
      });

      // Re-throw to ensure audit failures are handled
      throw new AuditError('Failed to record audit trail', event);
    }
  }

  /**
   * Remove sensitive fields before persisting
   */
  private sanitizeForAudit(value: any): any {
    if (!value || typeof value !== 'object') return value;

    const sensitiveFields = [
      'password',
      'secret',
      'token',
      'apiKey',
      'api_key',
      'accessKey',
      'access_key',
      'secretKey',
      'secret_key',
      'credential',
      'ssn',
      'creditCard',
      'credit_card',
      'refreshToken',
      'refresh_token'
    ];

    const sanitized = { ...value };

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    // Recursively sanitize nested objects
    for (const [key, val] of Object.entries(sanitized)) {
      if (val && typeof val === 'object') {
        sanitized[key] = this.sanitizeForAudit(val);
      }
    }

    return sanitized;
  }

  /**
   * Query audit logs
   */
  async queryAuditLog(filters: AuditQueryFilters): Promise<{
    events: any[];
    total: number;
    hasMore: boolean;
  }> {
    const where: any = {};

    if (filters.organizationId) where.organization_id = filters.organizationId;
    if (filters.userId) where.user_id = filters.userId;
    if (filters.eventType) where.event_type = filters.eventType;
    if (filters.resourceType) where.resource_type = filters.resourceType;
    if (filters.action) where.action = filters.action;
    if (filters.success !== undefined) where.success = filters.success;

    if (filters.startDate || filters.endDate) {
      where.created_at = {};
      if (filters.startDate) where.created_at.gte = filters.startDate;
      if (filters.endDate) where.created_at.lte = filters.endDate;
    }

    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    const [events, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit + 1,
        skip: offset
      }),
      this.prisma.auditLog.count({ where })
    ]);

    const hasMore = events.length > limit;
    if (hasMore) events.pop();

    return { events, total, hasMore };
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    summary: any;
    events: any[];
    violations: any[];
  }> {
    const events = await this.prisma.auditLog.findMany({
      where: {
        organization_id: organizationId,
        created_at: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { created_at: 'desc' }
    });

    const violations = await this.prisma.securityEvent.findMany({
      where: {
        organization_id: organizationId,
        created_at: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { created_at: 'desc' }
    });

    const summary = {
      period: { startDate, endDate },
      totalEvents: events.length,
      totalViolations: violations.length,
      eventsByType: this.groupBy(events, 'event_type'),
      eventsByAction: this.groupBy(events, 'action'),
      failedOperations: events.filter(e => !e.success).length,
      uniqueUsers: new Set(events.map(e => e.user_id)).size,
      violationsBySeverity: this.groupBy(violations, 'severity')
    };

    return { summary, events, violations };
  }

  /**
   * Log cross-org access for super admins
   */
  async logCrossOrgAccess(entry: {
    userId: string;
    sourceOrgId: string;
    targetOrgId: string;
    reason: string;
    requestId: string;
    ipAddress?: string;
  }): Promise<void> {
    try {
      await this.prisma.crossOrgAccessLog.create({
        data: {
          user_id: entry.userId,
          source_organization_id: entry.sourceOrgId,
          target_organization_id: entry.targetOrgId,
          reason: entry.reason,
          request_id: entry.requestId,
          ip_address: entry.ipAddress,
          created_at: new Date()
        }
      });

      console.log(JSON.stringify({
        level: 'AUDIT',
        event: 'CROSS_ORG_ACCESS',
        timestamp: new Date().toISOString(),
        ...entry
      }));
    } catch (error) {
      console.error('CRITICAL: Failed to log cross-org access audit:', error);
      throw new AuditError('Failed to record audit trail for cross-org access', entry as any);
    }
  }

  private groupBy(items: any[], key: string): Record<string, number> {
    return items.reduce((acc, item) => {
      const value = item[key] || 'unknown';
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
  }
}

/**
 * Custom error for audit failures
 */
export class AuditError extends Error {
  public readonly event: AuditEvent | any;

  constructor(message: string, event: AuditEvent | any) {
    super(message);
    this.name = 'AuditError';
    this.event = event;
  }
}

// Singleton export
export const auditTrail = new AuditTrail();
