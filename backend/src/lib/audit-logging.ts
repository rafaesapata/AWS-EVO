/**
 * Comprehensive Audit Logging System
 * Provides detailed audit trails for security, compliance, and monitoring
 */

import type { APIGatewayProxyEventV2 } from '../types/lambda.js';

export interface AuditEvent {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  severity: AuditSeverity;
  userId?: string;
  tenantId?: string;
  sessionId?: string;
  resource: string;
  action: string;
  outcome: 'success' | 'failure' | 'partial';
  details: Record<string, any>;
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    correlationId?: string;
    source: string;
    version: string;
  };
  compliance?: {
    gdpr?: boolean;
    sox?: boolean;
    pci?: boolean;
    hipaa?: boolean;
  };
}

export type AuditEventType = 
  | 'authentication'
  | 'authorization'
  | 'data_access'
  | 'data_modification'
  | 'configuration_change'
  | 'security_event'
  | 'compliance_event'
  | 'system_event'
  | 'user_action'
  | 'api_call'
  | 'file_operation'
  | 'database_operation'
  | 'network_event'
  | 'error_event';

export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AuditFilter {
  eventTypes?: AuditEventType[];
  severities?: AuditSeverity[];
  userIds?: string[];
  tenantIds?: string[];
  resources?: string[];
  actions?: string[];
  outcomes?: ('success' | 'failure' | 'partial')[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface AuditStorage {
  store(event: AuditEvent): Promise<void>;
  query(filter: AuditFilter): Promise<AuditEvent[]>;
  count(filter: AuditFilter): Promise<number>;
  purge(olderThan: Date): Promise<number>;
}

/**
 * In-memory audit storage (for development/testing)
 */
export class MemoryAuditStorage implements AuditStorage {
  private events: AuditEvent[] = [];
  private maxEvents = 10000;

  async store(event: AuditEvent): Promise<void> {
    this.events.push(event);
    
    // Keep only the most recent events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  async query(filter: AuditFilter): Promise<AuditEvent[]> {
    let filtered = [...this.events];

    // Apply filters
    if (filter.eventTypes?.length) {
      filtered = filtered.filter(e => filter.eventTypes!.includes(e.eventType));
    }

    if (filter.severities?.length) {
      filtered = filtered.filter(e => filter.severities!.includes(e.severity));
    }

    if (filter.userIds?.length) {
      filtered = filtered.filter(e => e.userId && filter.userIds!.includes(e.userId));
    }

    if (filter.tenantIds?.length) {
      filtered = filtered.filter(e => e.tenantId && filter.tenantIds!.includes(e.tenantId));
    }

    if (filter.resources?.length) {
      filtered = filtered.filter(e => filter.resources!.includes(e.resource));
    }

    if (filter.actions?.length) {
      filtered = filtered.filter(e => filter.actions!.includes(e.action));
    }

    if (filter.outcomes?.length) {
      filtered = filtered.filter(e => filter.outcomes!.includes(e.outcome));
    }

    if (filter.startDate) {
      filtered = filtered.filter(e => e.timestamp >= filter.startDate!);
    }

    if (filter.endDate) {
      filtered = filtered.filter(e => e.timestamp <= filter.endDate!);
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    const offset = filter.offset || 0;
    const limit = filter.limit || 100;
    
    return filtered.slice(offset, offset + limit);
  }

  async count(filter: AuditFilter): Promise<number> {
    const results = await this.query({ ...filter, limit: undefined, offset: undefined });
    return results.length;
  }

  async purge(olderThan: Date): Promise<number> {
    const initialCount = this.events.length;
    this.events = this.events.filter(e => e.timestamp > olderThan);
    return initialCount - this.events.length;
  }
}

/**
 * CloudWatch audit storage
 */
export class CloudWatchAuditStorage implements AuditStorage {
  constructor(private logGroupName: string = '/aws/lambda/evo-uds-audit') {}

  async store(event: AuditEvent): Promise<void> {
    // In a real implementation, this would use AWS CloudWatch Logs SDK
    console.log(JSON.stringify({
      logGroup: this.logGroupName,
      logStream: `audit-${new Date().toISOString().split('T')[0]}`,
      message: JSON.stringify(event),
      timestamp: event.timestamp.getTime(),
    }));
  }

  async query(filter: AuditFilter): Promise<AuditEvent[]> {
    // In a real implementation, this would use CloudWatch Logs Insights
    // For now, return empty array
    return [];
  }

  async count(filter: AuditFilter): Promise<number> {
    return 0;
  }

  async purge(olderThan: Date): Promise<number> {
    return 0;
  }
}

/**
 * Main Audit Logger Class
 */
export class AuditLogger {
  private storage: AuditStorage;
  private correlationId?: string;

  constructor(storage?: AuditStorage) {
    this.storage = storage || new MemoryAuditStorage();
  }

  setCorrelationId(correlationId: string): void {
    this.correlationId = correlationId;
  }

  /**
   * Log an audit event
   */
  async log(
    eventType: AuditEventType,
    resource: string,
    action: string,
    outcome: 'success' | 'failure' | 'partial',
    details: Record<string, any> = {},
    options: {
      severity?: AuditSeverity;
      userId?: string;
      tenantId?: string;
      sessionId?: string;
      event?: APIGatewayProxyEventV2;
      compliance?: AuditEvent['compliance'];
    } = {}
  ): Promise<void> {
    const event: AuditEvent = {
      id: this.generateId(),
      timestamp: new Date(),
      eventType,
      severity: options.severity || this.determineSeverity(eventType, outcome),
      userId: options.userId,
      tenantId: options.tenantId,
      sessionId: options.sessionId,
      resource,
      action,
      outcome,
      details: this.sanitizeDetails(details),
      metadata: {
        ipAddress: options.event?.requestContext?.http?.sourceIp,
        userAgent: options.event?.headers?.['user-agent'],
        requestId: options.event?.requestContext?.requestId,
        correlationId: this.correlationId,
        source: 'evo-uds-api',
        version: process.env.APP_VERSION || '1.0.0',
      },
      compliance: options.compliance,
    };

    try {
      await this.storage.store(event);
      
      // Log to console for immediate visibility
      console.log(`[AUDIT] ${event.severity.toUpperCase()} - ${eventType}:${action} on ${resource} - ${outcome}`, {
        id: event.id,
        userId: event.userId,
        tenantId: event.tenantId,
        details: event.details,
      });

      // Send alerts for critical events
      if (event.severity === 'critical') {
        await this.sendAlert(event);
      }

    } catch (error) {
      console.error('Failed to store audit event:', error);
      // Don't throw - audit logging should not break the main flow
    }
  }

  /**
   * Authentication events
   */
  async logAuthentication(
    action: 'login' | 'logout' | 'token_refresh' | 'password_change' | 'mfa_challenge',
    outcome: 'success' | 'failure',
    details: Record<string, any> = {},
    options: { userId?: string; event?: APIGatewayProxyEventV2 } = {}
  ): Promise<void> {
    await this.log(
      'authentication',
      'user_session',
      action,
      outcome,
      details,
      {
        ...options,
        severity: outcome === 'failure' ? 'high' : 'medium',
        compliance: { gdpr: true, sox: true },
      }
    );
  }

  /**
   * Authorization events
   */
  async logAuthorization(
    resource: string,
    action: string,
    outcome: 'success' | 'failure',
    details: Record<string, any> = {},
    options: { userId?: string; tenantId?: string; event?: APIGatewayProxyEventV2 } = {}
  ): Promise<void> {
    await this.log(
      'authorization',
      resource,
      action,
      outcome,
      details,
      {
        ...options,
        severity: outcome === 'failure' ? 'high' : 'low',
        compliance: { gdpr: true, sox: true },
      }
    );
  }

  /**
   * Data access events
   */
  async logDataAccess(
    resource: string,
    action: 'read' | 'list' | 'search' | 'export',
    outcome: 'success' | 'failure',
    details: Record<string, any> = {},
    options: { userId?: string; tenantId?: string; event?: APIGatewayProxyEventV2 } = {}
  ): Promise<void> {
    await this.log(
      'data_access',
      resource,
      action,
      outcome,
      details,
      {
        ...options,
        severity: 'low',
        compliance: { gdpr: true, hipaa: true },
      }
    );
  }

  /**
   * Data modification events
   */
  async logDataModification(
    resource: string,
    action: 'create' | 'update' | 'delete' | 'bulk_update' | 'bulk_delete',
    outcome: 'success' | 'failure' | 'partial',
    details: Record<string, any> = {},
    options: { userId?: string; tenantId?: string; event?: APIGatewayProxyEventV2 } = {}
  ): Promise<void> {
    await this.log(
      'data_modification',
      resource,
      action,
      outcome,
      details,
      {
        ...options,
        severity: action.includes('delete') ? 'high' : 'medium',
        compliance: { gdpr: true, sox: true, hipaa: true },
      }
    );
  }

  /**
   * Security events
   */
  async logSecurityEvent(
    action: string,
    outcome: 'success' | 'failure',
    details: Record<string, any> = {},
    options: { 
      severity?: AuditSeverity;
      userId?: string; 
      tenantId?: string; 
      event?: APIGatewayProxyEventV2;
    } = {}
  ): Promise<void> {
    await this.log(
      'security_event',
      'security_system',
      action,
      outcome,
      details,
      {
        ...options,
        severity: options.severity || 'high',
        compliance: { gdpr: true, sox: true, pci: true },
      }
    );
  }

  /**
   * Configuration change events
   */
  async logConfigurationChange(
    resource: string,
    action: string,
    outcome: 'success' | 'failure',
    details: Record<string, any> = {},
    options: { userId?: string; tenantId?: string; event?: APIGatewayProxyEventV2 } = {}
  ): Promise<void> {
    await this.log(
      'configuration_change',
      resource,
      action,
      outcome,
      details,
      {
        ...options,
        severity: 'high',
        compliance: { sox: true },
      }
    );
  }

  /**
   * API call events
   */
  async logApiCall(
    endpoint: string,
    method: string,
    outcome: 'success' | 'failure',
    details: Record<string, any> = {},
    options: { userId?: string; tenantId?: string; event?: APIGatewayProxyEventV2 } = {}
  ): Promise<void> {
    await this.log(
      'api_call',
      endpoint,
      method,
      outcome,
      details,
      {
        ...options,
        severity: 'low',
      }
    );
  }

  /**
   * Query audit events
   */
  async query(filter: AuditFilter): Promise<AuditEvent[]> {
    return this.storage.query(filter);
  }

  /**
   * Count audit events
   */
  async count(filter: AuditFilter): Promise<number> {
    return this.storage.count(filter);
  }

  /**
   * Generate audit report
   */
  async generateReport(
    filter: AuditFilter,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const events = await this.query(filter);
    
    if (format === 'csv') {
      return this.generateCSVReport(events);
    }
    
    return JSON.stringify({
      metadata: {
        generatedAt: new Date().toISOString(),
        totalEvents: events.length,
        filter,
      },
      events,
    }, null, 2);
  }

  private generateCSVReport(events: AuditEvent[]): string {
    const headers = [
      'ID', 'Timestamp', 'Event Type', 'Severity', 'User ID', 'Tenant ID',
      'Resource', 'Action', 'Outcome', 'IP Address', 'User Agent', 'Details'
    ];

    const rows = events.map(event => [
      event.id,
      event.timestamp.toISOString(),
      event.eventType,
      event.severity,
      event.userId || '',
      event.tenantId || '',
      event.resource,
      event.action,
      event.outcome,
      event.metadata.ipAddress || '',
      event.metadata.userAgent || '',
      JSON.stringify(event.details),
    ]);

    return [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
  }

  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private determineSeverity(eventType: AuditEventType, outcome: string): AuditSeverity {
    if (outcome === 'failure') {
      switch (eventType) {
        case 'authentication':
        case 'authorization':
        case 'security_event':
          return 'high';
        case 'data_modification':
        case 'configuration_change':
          return 'medium';
        default:
          return 'low';
      }
    }

    switch (eventType) {
      case 'security_event':
        return 'high';
      case 'authentication':
      case 'authorization':
      case 'data_modification':
      case 'configuration_change':
        return 'medium';
      default:
        return 'low';
    }
  }

  private sanitizeDetails(details: Record<string, any>): Record<string, any> {
    const sanitized = { ...details };
    
    // Remove sensitive fields
    const sensitiveFields = [
      'password', 'token', 'secret', 'key', 'credential',
      'authorization', 'cookie', 'session'
    ];

    const sanitizeObject = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      }

      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        
        if (sensitiveFields.some(field => lowerKey.includes(field))) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = sanitizeObject(value);
        }
      }
      
      return result;
    };

    return sanitizeObject(sanitized);
  }

  private async sendAlert(event: AuditEvent): Promise<void> {
    // In a real implementation, this would send alerts via SNS, email, etc.
    console.error(`[CRITICAL AUDIT EVENT] ${event.eventType}:${event.action} on ${event.resource}`, {
      id: event.id,
      timestamp: event.timestamp,
      userId: event.userId,
      tenantId: event.tenantId,
      details: event.details,
    });
  }
}

// Global audit logger instance
export const auditLogger = new AuditLogger(
  process.env.NODE_ENV === 'production' 
    ? new CloudWatchAuditStorage()
    : new MemoryAuditStorage()
);

/**
 * Middleware for automatic audit logging
 */
export function withAuditLogging(
  handler: (event: APIGatewayProxyEventV2, context: any) => Promise<any>,
  options: {
    resource?: string;
    action?: string;
    logRequest?: boolean;
    logResponse?: boolean;
  } = {}
) {
  return async (event: APIGatewayProxyEventV2, context: any) => {
    const startTime = Date.now();
    const requestId = event.requestContext.requestId;
    
    auditLogger.setCorrelationId(requestId);

    const resource = options.resource || event.routeKey || 'unknown';
    const action = options.action || event.requestContext.http.method;
    
    // Log request if enabled
    if (options.logRequest) {
      await auditLogger.logApiCall(
        resource,
        `${action}_request`,
        'success',
        {
          path: event.requestContext.http.path,
          queryParams: (event as any).queryStringParameters,
          headers: Object.keys(event.headers || {}),
        },
        {
          userId: event.requestContext.authorizer?.jwt?.claims?.sub,
          event,
        }
      );
    }

    let response;
    let outcome: 'success' | 'failure' = 'success';
    
    try {
      response = await handler(event, context);
      
      // Determine outcome based on status code
      if (response.statusCode >= 400) {
        outcome = 'failure';
      }
      
    } catch (error) {
      outcome = 'failure';
      
      // Log the error
      await auditLogger.log(
        'error_event',
        resource,
        action,
        'failure',
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        {
          severity: 'high',
          userId: event.requestContext.authorizer?.jwt?.claims?.sub,
          event,
        }
      );
      
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      
      // Log API call completion
      await auditLogger.logApiCall(
        resource,
        action,
        outcome,
        {
          statusCode: response?.statusCode,
          duration,
          ...(options.logResponse && response ? { responseSize: JSON.stringify(response).length } : {}),
        },
        {
          userId: event.requestContext.authorizer?.jwt?.claims?.sub,
          event,
        }
      );
    }

    return response;
  };
}

/**
 * Compliance audit utilities
 */
export class ComplianceAuditor {
  constructor(private logger: AuditLogger) {}

  /**
   * GDPR compliance audit
   */
  async auditGDPRCompliance(tenantId: string, startDate: Date, endDate: Date): Promise<{
    dataAccess: AuditEvent[];
    dataModification: AuditEvent[];
    dataExport: AuditEvent[];
    dataRetention: AuditEvent[];
    consentChanges: AuditEvent[];
  }> {
    const filter: AuditFilter = {
      tenantIds: [tenantId],
      startDate,
      endDate,
    };

    const [dataAccess, dataModification, dataExport] = await Promise.all([
      this.logger.query({ ...filter, eventTypes: ['data_access'] }),
      this.logger.query({ ...filter, eventTypes: ['data_modification'] }),
      this.logger.query({ 
        ...filter, 
        eventTypes: ['data_access'],
        actions: ['export']
      }),
    ]);

    return {
      dataAccess,
      dataModification,
      dataExport,
      dataRetention: [], // Would be populated from retention policies
      consentChanges: [], // Would be populated from consent management
    };
  }

  /**
   * SOX compliance audit
   */
  async auditSOXCompliance(startDate: Date, endDate: Date): Promise<{
    configurationChanges: AuditEvent[];
    privilegedAccess: AuditEvent[];
    dataModifications: AuditEvent[];
    systemEvents: AuditEvent[];
  }> {
    const filter: AuditFilter = { startDate, endDate };

    const [configurationChanges, privilegedAccess, dataModifications, systemEvents] = await Promise.all([
      this.logger.query({ ...filter, eventTypes: ['configuration_change'] }),
      this.logger.query({ ...filter, eventTypes: ['authorization'], outcomes: ['success'] }),
      this.logger.query({ ...filter, eventTypes: ['data_modification'] }),
      this.logger.query({ ...filter, eventTypes: ['system_event'] }),
    ]);

    return {
      configurationChanges,
      privilegedAccess,
      dataModifications,
      systemEvents,
    };
  }
}

export const complianceAuditor = new ComplianceAuditor(auditLogger);