/**
 * Robust Tenant Isolation System - Military Grade
 * Implements Row Level Security (RLS) and multi-tenant data access patterns
 */
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
export declare class TenantIsolationError extends Error {
    readonly code: string;
    readonly context?: TenantContext;
    constructor(message: string, code?: string, context?: TenantContext);
}
/**
 * Tenant Isolation Manager - Military Grade
 * Ensures all database operations respect tenant boundaries
 */
export declare class TenantIsolationManager {
    private context;
    private prisma;
    constructor(context: TenantContext);
    /**
     * Apply tenant isolation to Prisma where clause with mandatory audit
     */
    applyTenantFilter<T extends Record<string, unknown>>(where?: T, options?: TenantFilterOptions): T & {
        organization_id: string;
    };
    /**
     * Audit cross-org access
     */
    private auditCrossOrgAccess;
    /**
     * Apply tenant isolation to create data
     */
    applyTenantData<T extends Record<string, unknown>>(data: T, options?: {
        requireTenantId?: boolean;
    }): T & {
        organization_id: string;
    };
    /**
     * Validate that user can access specific organization
     */
    validateOrganizationAccess(targetOrgId: string): void;
    /**
     * Validate that user can access specific tenant
     */
    validateTenantAccess(targetTenantId: string): void;
    /**
     * Check if user has permission for specific resource
     */
    validateResourceAccess(resourceType: string, resourceId: string, action?: 'read' | 'write' | 'delete'): Promise<void>;
    /**
     * Get tenant context for logging/auditing
     */
    getAuditContext(): Record<string, unknown>;
}
/**
 * Create tenant isolation manager from Cognito user
 * ⚠️ CRÍTICO: Não aceita fallback para organização padrão
 */
export declare function createTenantIsolationManager(user: CognitoUser, requestContext?: {
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
}): TenantIsolationManager;
/**
 * Middleware for automatic tenant isolation
 */
export declare function withTenantIsolation<T extends Record<string, unknown>>(manager: TenantIsolationManager, operation: 'read' | 'write' | 'delete', where?: T, options?: {
    allowCrossOrg?: boolean;
    requireTenantId?: boolean;
}): T & {
    organization_id: string;
};
/**
 * Database query wrapper with automatic tenant isolation
 */
export declare class TenantIsolatedQueries {
    private manager;
    constructor(manager: TenantIsolationManager);
    findAwsCredentials(where?: any, options?: any): Promise<{
        regions: string[];
        id: string;
        organization_id: string;
        created_at: Date;
        updated_at: Date;
        is_active: boolean;
        account_id: string | null;
        account_name: string | null;
        access_key_id: string | null;
        secret_access_key: string | null;
        role_arn: string | null;
        external_id: string | null;
        session_token: string | null;
    }[]>;
    findAwsCredential(where?: any, options?: any): Promise<{
        regions: string[];
        id: string;
        organization_id: string;
        created_at: Date;
        updated_at: Date;
        is_active: boolean;
        account_id: string | null;
        account_name: string | null;
        access_key_id: string | null;
        secret_access_key: string | null;
        role_arn: string | null;
        external_id: string | null;
        session_token: string | null;
    } | null>;
    createAwsCredential(data: any): Promise<{
        regions: string[];
        id: string;
        organization_id: string;
        created_at: Date;
        updated_at: Date;
        is_active: boolean;
        account_id: string | null;
        account_name: string | null;
        access_key_id: string | null;
        secret_access_key: string | null;
        role_arn: string | null;
        external_id: string | null;
        session_token: string | null;
    }>;
    findSecurityScans(where?: any, options?: any): Promise<{
        status: string;
        id: string;
        organization_id: string;
        created_at: Date;
        aws_account_id: string;
        scan_type: string;
        scan_config: import("@prisma/client/runtime/library.js").JsonValue | null;
        results: import("@prisma/client/runtime/library.js").JsonValue | null;
        findings_count: number | null;
        critical_count: number | null;
        high_count: number | null;
        medium_count: number | null;
        low_count: number | null;
        started_at: Date;
        completed_at: Date | null;
    }[]>;
    createSecurityScan(data: any): Promise<{
        status: string;
        id: string;
        organization_id: string;
        created_at: Date;
        aws_account_id: string;
        scan_type: string;
        scan_config: import("@prisma/client/runtime/library.js").JsonValue | null;
        results: import("@prisma/client/runtime/library.js").JsonValue | null;
        findings_count: number | null;
        critical_count: number | null;
        high_count: number | null;
        medium_count: number | null;
        low_count: number | null;
        started_at: Date;
        completed_at: Date | null;
    }>;
    updateSecurityScan(where: any, data: any): Promise<{
        status: string;
        id: string;
        organization_id: string;
        created_at: Date;
        aws_account_id: string;
        scan_type: string;
        scan_config: import("@prisma/client/runtime/library.js").JsonValue | null;
        results: import("@prisma/client/runtime/library.js").JsonValue | null;
        findings_count: number | null;
        critical_count: number | null;
        high_count: number | null;
        medium_count: number | null;
        low_count: number | null;
        started_at: Date;
        completed_at: Date | null;
    }>;
    findFindings(where?: any, options?: any): Promise<{
        status: string;
        severity: string;
        service: string | null;
        category: string | null;
        description: string;
        details: import("@prisma/client/runtime/library.js").JsonValue;
        id: string;
        compliance: string[];
        organization_id: string | null;
        created_at: Date;
        updated_at: Date;
        resource_id: string | null;
        aws_account_id: string | null;
        scan_type: string | null;
        source: string | null;
        event_id: string | null;
        event_name: string | null;
        event_time: Date | null;
        user_identity: import("@prisma/client/runtime/library.js").JsonValue | null;
        ai_analysis: string | null;
        resource_arn: string | null;
        remediation: string | null;
        risk_vector: string | null;
        evidence: import("@prisma/client/runtime/library.js").JsonValue | null;
        remediation_ticket_id: string | null;
    }[]>;
    createFindings(data: any[]): Promise<import(".prisma/client").Prisma.BatchPayload>;
    updateFinding(where: any, data: any): Promise<{
        status: string;
        severity: string;
        service: string | null;
        category: string | null;
        description: string;
        details: import("@prisma/client/runtime/library.js").JsonValue;
        id: string;
        compliance: string[];
        organization_id: string | null;
        created_at: Date;
        updated_at: Date;
        resource_id: string | null;
        aws_account_id: string | null;
        scan_type: string | null;
        source: string | null;
        event_id: string | null;
        event_name: string | null;
        event_time: Date | null;
        user_identity: import("@prisma/client/runtime/library.js").JsonValue | null;
        ai_analysis: string | null;
        resource_arn: string | null;
        remediation: string | null;
        risk_vector: string | null;
        evidence: import("@prisma/client/runtime/library.js").JsonValue | null;
        remediation_ticket_id: string | null;
    }>;
    query<T>(model: string, operation: string, params?: any): Promise<T>;
}
/**
 * Audit logging for tenant isolation violations - Military Grade
 */
export declare function logTenantIsolationViolation(context: TenantContext, violation: {
    type: string;
    resource: string;
    attemptedAccess: string;
    error: string;
}): Promise<void>;
//# sourceMappingURL=tenant-isolation.d.ts.map