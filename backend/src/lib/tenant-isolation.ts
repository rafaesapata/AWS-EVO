/**
 * Robust Tenant Isolation System - Military Grade
 * Implements Row Level Security (RLS) and multi-tenant data access patterns
 */

import { getPrismaClient } from './database.js';
import { logger } from './structured-logging.js';
import type { CognitoUser } from '../types/lambda.js';

export interface TenantContext {
  organizationId: string;
  userId: string;
  roles: string[];
  tenantId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export interface TenantFilterOptions {
  allowCrossOrg?: boolean;
  requireTenantId?: boolean;
  auditReason?: string;
}

export interface CrossOrgAuditEntry {
  userId: string;
  sourceOrgId: string;
  targetOrgId: string;
  reason: string;
  timestamp: string;
  requestId: string;
  ipAddress?: string;
}

export class TenantIsolationError extends Error {
  public readonly code: string;
  public readonly context?: TenantContext;

  constructor(message: string, code: string = 'TENANT_ISOLATION_VIOLATION', context?: TenantContext) {
    super(message);
    this.name = 'TenantIsolationError';
    this.code = code;
    this.context = context;
  }
}

/**
 * Tenant Isolation Manager - Military Grade
 * Ensures all database operations respect tenant boundaries
 */
export class TenantIsolationManager {
  private context: TenantContext;
  private prisma = getPrismaClient();

  constructor(context: TenantContext) {
    // ⚠️ CRÍTICO: Validar organizationId obrigatório - SEM FALLBACK
    if (!context.organizationId) {
      throw new TenantIsolationError(
        'Organization ID is required for tenant isolation',
        'MISSING_ORGANIZATION_ID',
        context
      );
    }

    // Validar formato do organizationId
    if (!/^org-[a-zA-Z0-9-]+$/.test(context.organizationId) && 
        !/^[a-f0-9-]{36}$/.test(context.organizationId)) {
      throw new TenantIsolationError(
        'Invalid organization ID format',
        'INVALID_ORGANIZATION_ID',
        context
      );
    }

    if (!context.userId) {
      throw new TenantIsolationError(
        'User ID is required for tenant isolation',
        'MISSING_USER_ID',
        context
      );
    }

    this.context = context;
  }

  /**
   * Apply tenant isolation to Prisma where clause with mandatory audit
   */
  applyTenantFilter<T extends Record<string, unknown>>(
    where: T = {} as T,
    options: TenantFilterOptions = {}
  ): T & { organization_id: string } {
    const { allowCrossOrg = false, requireTenantId = false, auditReason } = options;

    // ⚠️ CRÍTICO: Super admin bypass com AUDITORIA OBRIGATÓRIA
    if (allowCrossOrg && this.context.roles.includes('super_admin')) {
      const targetOrgId = (where as any).organization_id;

      // Auditoria obrigatória para cross-org access
      this.auditCrossOrgAccess({
        userId: this.context.userId,
        sourceOrgId: this.context.organizationId,
        targetOrgId: targetOrgId || 'ALL',
        reason: auditReason || 'NO_REASON_PROVIDED',
        timestamp: new Date().toISOString(),
        requestId: this.context.requestId || 'unknown',
        ipAddress: this.context.ipAddress
      });

      // Log de warning para auditoria
      logger.logSecurityEvent(
        'SUPER_ADMIN_CROSS_ORG_ACCESS',
        'HIGH',
        {
          targetOrgId,
          reason: auditReason,
          hasValidReason: !!auditReason && auditReason !== 'NO_REASON_PROVIDED'
        },
        this.context
      );

      // Se não forneceu razão válida, registrar alerta adicional
      if (!auditReason || auditReason === 'NO_REASON_PROVIDED') {
        logger.logSecurityEvent(
          'CROSS_ORG_ACCESS_WITHOUT_REASON',
          'CRITICAL',
          { targetOrgId },
          this.context
        );
      }

      return where as T & { organization_id: string };
    }

    const filter: any = {
      ...where,
      organization_id: this.context.organizationId,
    };

    // Add tenant-level isolation if required
    if (requireTenantId && this.context.tenantId) {
      filter.tenant_id = this.context.tenantId;
    }

    return filter;
  }

  /**
   * Audit cross-org access
   */
  private async auditCrossOrgAccess(entry: CrossOrgAuditEntry): Promise<void> {
    try {
      // Persistir em audit_logs table (crossOrgAccessLog não existe no schema)
      await this.prisma.auditLog.create({
        data: {
          id: `cross-org-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          user_id: entry.userId,
          organization_id: entry.sourceOrgId,
          action: 'READ',
          resource_type: 'cross_org_access',
          resource_id: entry.targetOrgId,
          ip_address: entry.ipAddress || null,
          details: {
            event_type: 'CROSS_ORG_ACCESS',
            source_organization_id: entry.sourceOrgId,
            target_organization_id: entry.targetOrgId,
            reason: entry.reason,
            request_id: entry.requestId,
            timestamp: entry.timestamp
          },
          created_at: new Date(entry.timestamp)
        }
      }).catch(() => {
        // Table might not exist, log to console
        console.log(JSON.stringify({
          level: 'AUDIT',
          event: 'CROSS_ORG_ACCESS',
          ...entry
        }));
      });
    } catch (error) {
      // Log but don't fail
      console.error('Failed to log cross-org access audit:', error);
    }
  }

  /**
   * Apply tenant isolation to create data
   */
  applyTenantData<T extends Record<string, unknown>>(
    data: T,
    options: {
      requireTenantId?: boolean;
    } = {}
  ): T & { organization_id: string } {
    const { requireTenantId = false } = options;

    const tenantData: any = {
      ...data,
      organization_id: this.context.organizationId,
      created_by: this.context.userId,
    };

    if (requireTenantId && this.context.tenantId) {
      tenantData.tenant_id = this.context.tenantId;
    }

    return tenantData;
  }

  /**
   * Validate that user can access specific organization
   */
  validateOrganizationAccess(targetOrgId: string): void {
    // Super admins can access any organization
    if (this.context.roles.includes('super_admin')) {
      return;
    }

    if (this.context.organizationId !== targetOrgId) {
      throw new TenantIsolationError(
        `Access denied: User cannot access organization ${targetOrgId}`,
        'CROSS_ORG_ACCESS_DENIED'
      );
    }
  }

  /**
   * Validate that user can access specific tenant
   */
  validateTenantAccess(targetTenantId: string): void {
    // Admins can access any tenant within their organization
    if (this.context.roles.includes('admin') || this.context.roles.includes('super_admin')) {
      return;
    }

    if (this.context.tenantId && this.context.tenantId !== targetTenantId) {
      throw new TenantIsolationError(
        `Access denied: User cannot access tenant ${targetTenantId}`,
        'CROSS_TENANT_ACCESS_DENIED'
      );
    }
  }

  /**
   * Check if user has permission for specific resource
   */
  async validateResourceAccess(
    resourceType: string,
    resourceId: string,
    action: 'read' | 'write' | 'delete' = 'read'
  ): Promise<void> {
    const prisma = getPrismaClient();

    // Check resource ownership/access based on type
    switch (resourceType) {
      case 'aws_credential':
        const credential = await prisma.awsCredential.findFirst({
          where: this.applyTenantFilter({ id: resourceId }),
          select: { id: true, organization_id: true },
        });
        
        if (!credential) {
          throw new TenantIsolationError(
            `AWS credential ${resourceId} not found or access denied`,
            'RESOURCE_NOT_FOUND'
          );
        }
        break;

      case 'security_scan':
        const scan = await prisma.securityScan.findFirst({
          where: this.applyTenantFilter({ id: resourceId }),
          select: { id: true, organization_id: true },
        });
        
        if (!scan) {
          throw new TenantIsolationError(
            `Security scan ${resourceId} not found or access denied`,
            'RESOURCE_NOT_FOUND'
          );
        }
        break;

      case 'finding':
        const finding = await prisma.finding.findFirst({
          where: this.applyTenantFilter({ id: resourceId }),
          select: { id: true, organization_id: true },
        });
        
        if (!finding) {
          throw new TenantIsolationError(
            `Finding ${resourceId} not found or access denied`,
            'RESOURCE_NOT_FOUND'
          );
        }
        break;

      default:
        throw new TenantIsolationError(
          `Unknown resource type: ${resourceType}`,
          'UNKNOWN_RESOURCE_TYPE'
        );
    }
  }

  /**
   * Get tenant context for logging/auditing
   */
  getAuditContext(): Record<string, unknown> {
    return {
      organizationId: this.context.organizationId,
      userId: this.context.userId,
      tenantId: this.context.tenantId,
      roles: this.context.roles,
    };
  }
}

/**
 * Create tenant isolation manager from Cognito user
 * ⚠️ CRÍTICO: Não aceita fallback para organização padrão
 */
export function createTenantIsolationManager(
  user: CognitoUser,
  requestContext?: {
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
  }
): TenantIsolationManager {
  const organizationId = user['custom:organization_id'];
  const tenantId = user['custom:tenant_id'];
  const rolesStr = user['custom:roles'];

  // ⚠️ CRÍTICO: NUNCA usar fallback para 'default-org'
  if (!organizationId) {
    throw new TenantIsolationError(
      'User must have organization_id attribute. Access denied.',
      'MISSING_ORGANIZATION_ID'
    );
  }

  let roles: string[] = ['user'];
  if (rolesStr) {
    try {
      const parsed = JSON.parse(rolesStr);
      roles = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      roles = [rolesStr];
    }
  }

  const context: TenantContext = {
    organizationId,
    userId: user.sub,
    roles,
    tenantId,
    ...requestContext
  };

  return new TenantIsolationManager(context);
}

/**
 * Middleware for automatic tenant isolation
 */
export function withTenantIsolation<T extends Record<string, unknown>>(
  manager: TenantIsolationManager,
  operation: 'read' | 'write' | 'delete',
  where?: T,
  options?: {
    allowCrossOrg?: boolean;
    requireTenantId?: boolean;
  }
): T & { organization_id: string } {
  return manager.applyTenantFilter(where, options);
}

/**
 * Database query wrapper with automatic tenant isolation
 */
export class TenantIsolatedQueries {
  constructor(private manager: TenantIsolationManager) {}

  // AWS Credentials
  async findAwsCredentials(where: any = {}, options: any = {}) {
    const prisma = getPrismaClient();
    return prisma.awsCredential.findMany({
      ...options,
      where: this.manager.applyTenantFilter(where),
    });
  }

  async findAwsCredential(where: any = {}, options: any = {}) {
    const prisma = getPrismaClient();
    return prisma.awsCredential.findFirst({
      ...options,
      where: this.manager.applyTenantFilter(where),
    });
  }

  async createAwsCredential(data: any) {
    const prisma = getPrismaClient();
    return prisma.awsCredential.create({
      data: this.manager.applyTenantData(data),
    });
  }

  // Security Scans
  async findSecurityScans(where: any = {}, options: any = {}) {
    const prisma = getPrismaClient();
    return prisma.securityScan.findMany({
      ...options,
      where: this.manager.applyTenantFilter(where),
    });
  }

  async createSecurityScan(data: any) {
    const prisma = getPrismaClient();
    return prisma.securityScan.create({
      data: this.manager.applyTenantData(data),
    });
  }

  async updateSecurityScan(where: any, data: any) {
    const prisma = getPrismaClient();
    return prisma.securityScan.update({
      where: this.manager.applyTenantFilter(where),
      data,
    });
  }

  // Findings
  async findFindings(where: any = {}, options: any = {}) {
    const prisma = getPrismaClient();
    return prisma.finding.findMany({
      ...options,
      where: this.manager.applyTenantFilter(where),
    });
  }

  async createFindings(data: any[]) {
    const prisma = getPrismaClient();
    const tenantData = data.map(item => this.manager.applyTenantData(item));
    return prisma.finding.createMany({
      data: tenantData,
    });
  }

  async updateFinding(where: any, data: any) {
    const prisma = getPrismaClient();
    return prisma.finding.update({
      where: this.manager.applyTenantFilter(where),
      data,
    });
  }

  // Generic query method with tenant isolation
  async query<T>(
    model: string,
    operation: string,
    params: any = {}
  ): Promise<T> {
    const prisma = getPrismaClient();
    const modelClient = (prisma as any)[model];
    
    if (!modelClient) {
      throw new TenantIsolationError(`Unknown model: ${model}`);
    }

    const operationFn = modelClient[operation];
    if (!operationFn) {
      throw new TenantIsolationError(`Unknown operation: ${operation} on model ${model}`);
    }

    // Apply tenant isolation to where clauses
    if (params.where) {
      params.where = this.manager.applyTenantFilter(params.where);
    }

    // Apply tenant data to create/update operations
    if (params.data && ['create', 'createMany', 'upsert'].includes(operation)) {
      if (Array.isArray(params.data)) {
        params.data = params.data.map((item: any) => this.manager.applyTenantData(item));
      } else {
        params.data = this.manager.applyTenantData(params.data);
      }
    }

    return operationFn(params);
  }
}

/**
 * Audit logging for tenant isolation violations - Military Grade
 */
export async function logTenantIsolationViolation(
  context: TenantContext,
  violation: {
    type: string;
    resource: string;
    attemptedAccess: string;
    error: string;
  }
): Promise<void> {
  const violationEntry = {
    level: 'CRITICAL',
    event: 'TENANT_ISOLATION_VIOLATION',
    timestamp: new Date().toISOString(),
    context,
    violation,
    stackTrace: new Error().stack
  };

  // 1. Log estruturado para CloudWatch
  console.error(JSON.stringify(violationEntry));

  try {
    const prisma = getPrismaClient();
    
    // 2. Persistir em banco de dados
    await prisma.securityEvent.create({
      data: {
        organization_id: context.organizationId,
        event_type: 'TENANT_ISOLATION_VIOLATION',
        severity: 'CRITICAL',
        description: `Tenant isolation violation: ${violation.type} - ${violation.error}`,
        metadata: {
          user_id: context.userId,
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
          violation
        },
        created_at: new Date()
      }
    }).catch(() => {
      // Table might not exist yet
      console.error('Could not persist violation to database');
    });

    // 3. Log security event via structured logger
    await logger.logTenantViolation(context, violation);

  } catch (error) {
    // Log de falha, mas não falhar a operação principal
    console.error('Failed to persist violation log:', error);
  }
}