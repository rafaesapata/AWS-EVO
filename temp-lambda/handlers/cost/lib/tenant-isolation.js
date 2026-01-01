"use strict";
/**
 * Robust Tenant Isolation System - Military Grade
 * Implements Row Level Security (RLS) and multi-tenant data access patterns
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantIsolatedQueries = exports.TenantIsolationManager = exports.TenantIsolationError = void 0;
exports.createTenantIsolationManager = createTenantIsolationManager;
exports.withTenantIsolation = withTenantIsolation;
exports.logTenantIsolationViolation = logTenantIsolationViolation;
const database_js_1 = require("./database.js");
const structured_logging_js_1 = require("./structured-logging.js");
class TenantIsolationError extends Error {
    constructor(message, code = 'TENANT_ISOLATION_VIOLATION', context) {
        super(message);
        this.name = 'TenantIsolationError';
        this.code = code;
        this.context = context;
    }
}
exports.TenantIsolationError = TenantIsolationError;
/**
 * Tenant Isolation Manager - Military Grade
 * Ensures all database operations respect tenant boundaries
 */
class TenantIsolationManager {
    constructor(context) {
        this.prisma = (0, database_js_1.getPrismaClient)();
        // ⚠️ CRÍTICO: Validar organizationId obrigatório - SEM FALLBACK
        if (!context.organizationId) {
            throw new TenantIsolationError('Organization ID is required for tenant isolation', 'MISSING_ORGANIZATION_ID', context);
        }
        // Validar formato do organizationId com regex UUID completo
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const ORG_PREFIX_REGEX = /^org-[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$/;
        if (!ORG_PREFIX_REGEX.test(context.organizationId) &&
            !UUID_REGEX.test(context.organizationId)) {
            throw new TenantIsolationError('Invalid organization ID format', 'INVALID_ORGANIZATION_ID', context);
        }
        if (!context.userId) {
            throw new TenantIsolationError('User ID is required for tenant isolation', 'MISSING_USER_ID', context);
        }
        this.context = context;
    }
    /**
     * Apply tenant isolation to Prisma where clause with mandatory audit
     */
    applyTenantFilter(where = {}, options = {}) {
        const { allowCrossOrg = false, requireTenantId = false, auditReason } = options;
        // ⚠️ CRÍTICO: Super admin bypass com AUDITORIA OBRIGATÓRIA
        if (allowCrossOrg && this.context.roles.includes('super_admin')) {
            const targetOrgId = where.organization_id;
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
            structured_logging_js_1.logger.logSecurityEvent('SUPER_ADMIN_CROSS_ORG_ACCESS', 'HIGH', {
                targetOrgId,
                reason: auditReason,
                hasValidReason: !!auditReason && auditReason !== 'NO_REASON_PROVIDED'
            }, this.context);
            // Se não forneceu razão válida, registrar alerta adicional
            if (!auditReason || auditReason === 'NO_REASON_PROVIDED') {
                structured_logging_js_1.logger.logSecurityEvent('CROSS_ORG_ACCESS_WITHOUT_REASON', 'CRITICAL', { targetOrgId }, this.context);
            }
            return where;
        }
        const filter = {
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
    async auditCrossOrgAccess(entry) {
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
        }
        catch (error) {
            // Log but don't fail
            console.error('Failed to log cross-org access audit:', error);
        }
    }
    /**
     * Apply tenant isolation to create data
     */
    applyTenantData(data, options = {}) {
        const { requireTenantId = false } = options;
        const tenantData = {
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
    validateOrganizationAccess(targetOrgId) {
        // Super admins can access any organization
        if (this.context.roles.includes('super_admin')) {
            return;
        }
        if (this.context.organizationId !== targetOrgId) {
            throw new TenantIsolationError(`Access denied: User cannot access organization ${targetOrgId}`, 'CROSS_ORG_ACCESS_DENIED');
        }
    }
    /**
     * Validate that user can access specific tenant
     */
    validateTenantAccess(targetTenantId) {
        // Admins can access any tenant within their organization
        if (this.context.roles.includes('admin') || this.context.roles.includes('super_admin')) {
            return;
        }
        if (this.context.tenantId && this.context.tenantId !== targetTenantId) {
            throw new TenantIsolationError(`Access denied: User cannot access tenant ${targetTenantId}`, 'CROSS_TENANT_ACCESS_DENIED');
        }
    }
    /**
     * Check if user has permission for specific resource
     */
    async validateResourceAccess(resourceType, resourceId, action = 'read') {
        const prisma = (0, database_js_1.getPrismaClient)();
        // Check resource ownership/access based on type
        switch (resourceType) {
            case 'aws_credential':
                const credential = await prisma.awsCredential.findFirst({
                    where: this.applyTenantFilter({ id: resourceId }),
                    select: { id: true, organization_id: true },
                });
                if (!credential) {
                    throw new TenantIsolationError(`AWS credential ${resourceId} not found or access denied`, 'RESOURCE_NOT_FOUND');
                }
                break;
            case 'security_scan':
                const scan = await prisma.securityScan.findFirst({
                    where: this.applyTenantFilter({ id: resourceId }),
                    select: { id: true, organization_id: true },
                });
                if (!scan) {
                    throw new TenantIsolationError(`Security scan ${resourceId} not found or access denied`, 'RESOURCE_NOT_FOUND');
                }
                break;
            case 'finding':
                const finding = await prisma.finding.findFirst({
                    where: this.applyTenantFilter({ id: resourceId }),
                    select: { id: true, organization_id: true },
                });
                if (!finding) {
                    throw new TenantIsolationError(`Finding ${resourceId} not found or access denied`, 'RESOURCE_NOT_FOUND');
                }
                break;
            default:
                throw new TenantIsolationError(`Unknown resource type: ${resourceType}`, 'UNKNOWN_RESOURCE_TYPE');
        }
    }
    /**
     * Get tenant context for logging/auditing
     */
    getAuditContext() {
        return {
            organizationId: this.context.organizationId,
            userId: this.context.userId,
            tenantId: this.context.tenantId,
            roles: this.context.roles,
        };
    }
}
exports.TenantIsolationManager = TenantIsolationManager;
/**
 * Create tenant isolation manager from Cognito user
 * ⚠️ CRÍTICO: Não aceita fallback para organização padrão
 */
function createTenantIsolationManager(user, requestContext) {
    const organizationId = user['custom:organization_id'];
    const tenantId = user['custom:tenant_id'];
    const rolesStr = user['custom:roles'];
    // ⚠️ CRÍTICO: NUNCA usar fallback para 'default-org'
    if (!organizationId) {
        throw new TenantIsolationError('User must have organization_id attribute. Access denied.', 'MISSING_ORGANIZATION_ID');
    }
    let roles = ['user'];
    if (rolesStr) {
        try {
            const parsed = JSON.parse(rolesStr);
            roles = Array.isArray(parsed) ? parsed : [parsed];
        }
        catch {
            roles = [rolesStr];
        }
    }
    const context = {
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
function withTenantIsolation(manager, operation, where, options) {
    return manager.applyTenantFilter(where, options);
}
/**
 * Database query wrapper with automatic tenant isolation
 */
class TenantIsolatedQueries {
    constructor(manager) {
        this.manager = manager;
    }
    // AWS Credentials
    async findAwsCredentials(where = {}, options = {}) {
        const prisma = (0, database_js_1.getPrismaClient)();
        return prisma.awsCredential.findMany({
            ...options,
            where: this.manager.applyTenantFilter(where),
        });
    }
    async findAwsCredential(where = {}, options = {}) {
        const prisma = (0, database_js_1.getPrismaClient)();
        return prisma.awsCredential.findFirst({
            ...options,
            where: this.manager.applyTenantFilter(where),
        });
    }
    async createAwsCredential(data) {
        const prisma = (0, database_js_1.getPrismaClient)();
        return prisma.awsCredential.create({
            data: this.manager.applyTenantData(data),
        });
    }
    // Security Scans
    async findSecurityScans(where = {}, options = {}) {
        const prisma = (0, database_js_1.getPrismaClient)();
        return prisma.securityScan.findMany({
            ...options,
            where: this.manager.applyTenantFilter(where),
        });
    }
    async createSecurityScan(data) {
        const prisma = (0, database_js_1.getPrismaClient)();
        return prisma.securityScan.create({
            data: this.manager.applyTenantData(data),
        });
    }
    async updateSecurityScan(where, data) {
        const prisma = (0, database_js_1.getPrismaClient)();
        return prisma.securityScan.update({
            where: this.manager.applyTenantFilter(where),
            data,
        });
    }
    // Findings
    async findFindings(where = {}, options = {}) {
        const prisma = (0, database_js_1.getPrismaClient)();
        return prisma.finding.findMany({
            ...options,
            where: this.manager.applyTenantFilter(where),
        });
    }
    async createFindings(data) {
        const prisma = (0, database_js_1.getPrismaClient)();
        const tenantData = data.map(item => this.manager.applyTenantData(item));
        return prisma.finding.createMany({
            data: tenantData,
        });
    }
    async updateFinding(where, data) {
        const prisma = (0, database_js_1.getPrismaClient)();
        return prisma.finding.update({
            where: this.manager.applyTenantFilter(where),
            data,
        });
    }
    // Generic query method with tenant isolation
    async query(model, operation, params = {}) {
        const prisma = (0, database_js_1.getPrismaClient)();
        const modelClient = prisma[model];
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
                params.data = params.data.map((item) => this.manager.applyTenantData(item));
            }
            else {
                params.data = this.manager.applyTenantData(params.data);
            }
        }
        // Call method with proper 'this' binding
        return modelClient[operation](params);
    }
}
exports.TenantIsolatedQueries = TenantIsolatedQueries;
/**
 * Audit logging for tenant isolation violations - Military Grade
 */
async function logTenantIsolationViolation(context, violation) {
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
        const prisma = (0, database_js_1.getPrismaClient)();
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
        await structured_logging_js_1.logger.logTenantViolation(context, violation);
    }
    catch (error) {
        // Log de falha, mas não falhar a operação principal
        console.error('Failed to persist violation log:', error);
    }
}
//# sourceMappingURL=tenant-isolation.js.map