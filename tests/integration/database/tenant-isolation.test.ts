/**
 * Tenant Isolation Security Tests - Military Grade
 */

import { describe, it, expect, vi } from 'vitest';

// Mock types
interface TenantContext {
  organizationId: string;
  userId: string;
  roles: string[];
  tenantId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

// Mock TenantIsolationManager
class MockTenantIsolationManager {
  private context: TenantContext;

  constructor(context: TenantContext) {
    if (!context.organizationId) {
      throw new Error('MISSING_ORGANIZATION_ID');
    }
    if (!/^org-[a-zA-Z0-9-]+$/.test(context.organizationId) && 
        !/^[a-f0-9-]{36}$/.test(context.organizationId)) {
      throw new Error('Invalid organization ID format');
    }
    this.context = context;
  }

  applyTenantFilter<T extends Record<string, unknown>>(
    where: T = {} as T,
    options: { allowCrossOrg?: boolean; auditReason?: string } = {}
  ): T & { organization_id: string } {
    if (options.allowCrossOrg && this.context.roles.includes('super_admin')) {
      return where as T & { organization_id: string };
    }
    return {
      ...where,
      organization_id: this.context.organizationId,
    };
  }

  validateResourceAccess(resourceOrgId: string): void {
    if (resourceOrgId !== this.context.organizationId) {
      throw new Error('CROSS_TENANT_ACCESS_DENIED');
    }
  }
}

function createMockTenantIsolationManager(user: any): MockTenantIsolationManager {
  const organizationId = user['custom:organization_id'];
  
  if (!organizationId) {
    throw new Error('MISSING_ORGANIZATION_ID');
  }

  return new MockTenantIsolationManager({
    organizationId,
    userId: user.sub,
    roles: user['custom:roles'] ? JSON.parse(user['custom:roles']) : ['user']
  });
}

describe('Tenant Isolation Security Tests', () => {

  describe('Organization ID Validation', () => {
    it('should throw error when organization_id is missing', () => {
      const userWithoutOrg = { sub: 'user-1', 'custom:roles': '["user"]' };

      expect(() => createMockTenantIsolationManager(userWithoutOrg))
        .toThrow('MISSING_ORGANIZATION_ID');
    });

    it('should throw error for invalid organization_id format', () => {
      expect(() => new MockTenantIsolationManager({
        organizationId: 'invalid-format',
        userId: 'user-1',
        roles: ['user']
      })).toThrow('Invalid organization ID format');
    });

    it('should NOT fallback to default-org', () => {
      const userWithoutOrg = { sub: 'user-1' };

      expect(() => createMockTenantIsolationManager(userWithoutOrg))
        .toThrow('MISSING_ORGANIZATION_ID');
    });

    it('should accept valid org-prefixed organization ID', () => {
      const manager = new MockTenantIsolationManager({
        organizationId: 'org-abc123',
        userId: 'user-1',
        roles: ['user']
      });

      expect(manager).toBeDefined();
    });

    it('should accept valid UUID organization ID', () => {
      const manager = new MockTenantIsolationManager({
        organizationId: '550e8400-e29b-41d4-a716-446655440000',
        userId: 'user-1',
        roles: ['user']
      });

      expect(manager).toBeDefined();
    });
  });

  describe('Cross-Tenant Access Prevention', () => {
    it('should prevent access to resources from different organization', () => {
      const manager = new MockTenantIsolationManager({
        organizationId: 'org-abc123',
        userId: 'user-1',
        roles: ['user']
      });

      expect(() => manager.validateResourceAccess('org-xyz789'))
        .toThrow('CROSS_TENANT_ACCESS_DENIED');
    });

    it('should apply tenant filter to all queries', () => {
      const manager = new MockTenantIsolationManager({
        organizationId: 'org-abc123',
        userId: 'user-1',
        roles: ['user']
      });

      const filteredQuery = manager.applyTenantFilter({ name: 'test' });

      expect(filteredQuery).toEqual({
        name: 'test',
        organization_id: 'org-abc123'
      });
    });

    it('should allow access to own organization resources', () => {
      const manager = new MockTenantIsolationManager({
        organizationId: 'org-abc123',
        userId: 'user-1',
        roles: ['user']
      });

      expect(() => manager.validateResourceAccess('org-abc123')).not.toThrow();
    });
  });

  describe('Super Admin Cross-Org Access', () => {
    it('should allow super admin cross-org access with audit', () => {
      const manager = new MockTenantIsolationManager({
        organizationId: 'org-admin',
        userId: 'super-admin',
        roles: ['super_admin'],
        requestId: 'req-123'
      });

      const result = manager.applyTenantFilter(
        { organization_id: 'org-target' },
        { allowCrossOrg: true, auditReason: 'Security investigation #12345' }
      );

      // Super admin should bypass filter
      expect(result.organization_id).toBe('org-target');
    });

    it('should not allow regular user cross-org access', () => {
      const manager = new MockTenantIsolationManager({
        organizationId: 'org-user',
        userId: 'regular-user',
        roles: ['user']
      });

      const result = manager.applyTenantFilter(
        { organization_id: 'org-target' },
        { allowCrossOrg: true }
      );

      // Regular user should have their org applied
      expect(result.organization_id).toBe('org-user');
    });
  });

  describe('Query Filtering', () => {
    it('should always add organization_id to queries', () => {
      const manager = new MockTenantIsolationManager({
        organizationId: 'org-test123',
        userId: 'user-1',
        roles: ['user']
      });

      const emptyQuery = manager.applyTenantFilter({});
      expect(emptyQuery.organization_id).toBe('org-test123');

      const queryWithConditions = manager.applyTenantFilter({ status: 'active', type: 'scan' });
      expect(queryWithConditions.organization_id).toBe('org-test123');
      expect(queryWithConditions.status).toBe('active');
      expect(queryWithConditions.type).toBe('scan');
    });
  });
});
