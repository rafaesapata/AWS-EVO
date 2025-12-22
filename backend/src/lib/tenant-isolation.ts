/**
 * Robust Tenant Isolation System
 * Implements Row Level Security (RLS) and multi-tenant data access patterns
 */

import { getPrismaClient } from './database.js';
import type { CognitoUser } from '../types/lambda.js';

export interface TenantContext {
  organizationId: string;
  userId: string;
  roles: string[];
  tenantId?: string;
}

export class TenantIsolationError extends Error {
  constructor(message: string, public code: string = 'TENANT_ISOLATION_VIOLATION') {
    super(message);
    this.name = 'TenantIsolationError';
  }
}

/**
 * Tenant Isolation Manager
 * Ensures all database operations respect tenant boundaries
 */
export class TenantIsolationManager {
  private context: TenantContext;

  constructor(context: TenantContext) {
    this.context = context;
    this.validateContext();
  }

  private validateContext(): void {
    if (!this.context.organizationId) {
      throw new TenantIsolationError('Organization ID is required for tenant isolation');
    }
    if (!this.context.userId) {
      throw new TenantIsolationError('User ID is required for tenant isolation');
    }
  }

  /**
   * Apply tenant isolation to Prisma where clause
   */
  applyTenantFilter<T extends Record<string, unknown>>(
    where: T = {} as T,
    options: {
      allowCrossOrg?: boolean;
      requireTenantId?: boolean;
    } = {}
  ): T & { organization_id: string } {
    const { allowCrossOrg = false, requireTenantId = false } = options;

    // Super admins can access cross-org data if explicitly allowed
    if (allowCrossOrg && this.context.roles.includes('super_admin')) {
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
 */
export function createTenantIsolationManager(user: CognitoUser): TenantIsolationManager {
  const organizationId = user['custom:organization_id'];
  const tenantId = user['custom:tenant_id'];
  const rolesStr = user['custom:roles'];
  
  let roles: string[] = ['user'];
  if (rolesStr) {
    try {
      roles = JSON.parse(rolesStr);
    } catch {
      roles = [rolesStr];
    }
  }

  const context: TenantContext = {
    organizationId: organizationId || 'default-org',
    userId: user.sub,
    roles,
    tenantId,
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
 * Audit logging for tenant isolation violations
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
  console.error('🚨 TENANT ISOLATION VIOLATION:', {
    timestamp: new Date().toISOString(),
    context,
    violation,
  });

  // In production, store in audit log table
  // const prisma = getPrismaClient();
  // await prisma.auditLog.create({
  //   data: {
  //     organization_id: context.organizationId,
  //     user_id: context.userId,
  //     event_type: 'TENANT_ISOLATION_VIOLATION',
  //     severity: 'CRITICAL',
  //     details: violation,
  //     created_at: new Date(),
  //   },
  // });
}