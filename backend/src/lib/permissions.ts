/**
 * Role-Based Access Control (RBAC) System
 * Provides granular permissions for different user roles
 */

export const PERMISSIONS = {
  // Security permissions
  'security:scan:execute': 'Execute security scans',
  'security:scan:view': 'View security scan results',
  'security:scan:delete': 'Delete security scans',
  'security:findings:resolve': 'Resolve security findings',
  'security:findings:dismiss': 'Dismiss security findings',
  'security:findings:export': 'Export security findings',
  'security:compliance:view': 'View compliance reports',
  'security:compliance:manage': 'Manage compliance frameworks',

  // Cost permissions
  'cost:view': 'View cost data',
  'cost:analyze': 'Run cost analysis',
  'cost:forecast': 'Generate cost forecasts',
  'cost:recommendations:view': 'View cost recommendations',
  'cost:recommendations:apply': 'Apply cost recommendations',
  'cost:budgets:manage': 'Manage budgets and alerts',
  'cost:export': 'Export cost data',

  // Admin permissions
  'admin:users:view': 'View users',
  'admin:users:create': 'Create users',
  'admin:users:edit': 'Edit users',
  'admin:users:delete': 'Delete users',
  'admin:org:settings': 'Manage organization settings',
  'admin:org:billing': 'Manage billing and subscriptions',
  'admin:aws:credentials': 'Manage AWS credentials',
  'admin:integrations:manage': 'Manage third-party integrations',

  // AI permissions
  'ai:copilot:use': 'Use FinOps Copilot',
  'ai:insights:generate': 'Generate AI insights',
  'ai:insights:view': 'View AI insights',
  'ai:models:configure': 'Configure AI models',

  // Monitoring permissions
  'monitoring:alerts:view': 'View alerts',
  'monitoring:alerts:manage': 'Manage alert rules',
  'monitoring:dashboards:view': 'View dashboards',
  'monitoring:dashboards:create': 'Create custom dashboards',
  'monitoring:metrics:view': 'View metrics',

  // Reports permissions
  'reports:view': 'View reports',
  'reports:generate': 'Generate reports',
  'reports:schedule': 'Schedule automated reports',
  'reports:export': 'Export reports',

  // Knowledge Base permissions
  'kb:articles:view': 'View knowledge base articles',
  'kb:articles:create': 'Create knowledge base articles',
  'kb:articles:edit': 'Edit knowledge base articles',
  'kb:articles:delete': 'Delete knowledge base articles',
  'kb:articles:approve': 'Approve knowledge base articles',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  super_admin: Object.keys(PERMISSIONS) as Permission[],
  
  admin: [
    // Security
    'security:scan:execute', 'security:scan:view', 'security:scan:delete',
    'security:findings:resolve', 'security:findings:dismiss', 'security:findings:export',
    'security:compliance:view', 'security:compliance:manage',
    
    // Cost
    'cost:view', 'cost:analyze', 'cost:forecast',
    'cost:recommendations:view', 'cost:recommendations:apply',
    'cost:budgets:manage', 'cost:export',
    
    // Admin
    'admin:users:view', 'admin:users:create', 'admin:users:edit', 'admin:users:delete',
    'admin:org:settings', 'admin:aws:credentials', 'admin:integrations:manage',
    
    // AI
    'ai:copilot:use', 'ai:insights:generate', 'ai:insights:view',
    
    // Monitoring
    'monitoring:alerts:view', 'monitoring:alerts:manage',
    'monitoring:dashboards:view', 'monitoring:dashboards:create',
    'monitoring:metrics:view',
    
    // Reports
    'reports:view', 'reports:generate', 'reports:schedule', 'reports:export',
    
    // Knowledge Base
    'kb:articles:view', 'kb:articles:create', 'kb:articles:edit',
    'kb:articles:delete', 'kb:articles:approve',
  ],

  security_analyst: [
    // Security
    'security:scan:execute', 'security:scan:view',
    'security:findings:resolve', 'security:findings:dismiss', 'security:findings:export',
    'security:compliance:view',
    
    // AI (security focused)
    'ai:insights:generate', 'ai:insights:view',
    
    // Monitoring
    'monitoring:alerts:view', 'monitoring:dashboards:view', 'monitoring:metrics:view',
    
    // Reports
    'reports:view', 'reports:generate', 'reports:export',
    
    // Knowledge Base
    'kb:articles:view', 'kb:articles:create', 'kb:articles:edit',
  ],

  finops_analyst: [
    // Cost
    'cost:view', 'cost:analyze', 'cost:forecast',
    'cost:recommendations:view', 'cost:recommendations:apply',
    'cost:budgets:manage', 'cost:export',
    
    // AI (cost focused)
    'ai:copilot:use', 'ai:insights:generate', 'ai:insights:view',
    
    // Monitoring
    'monitoring:alerts:view', 'monitoring:dashboards:view', 'monitoring:metrics:view',
    
    // Reports
    'reports:view', 'reports:generate', 'reports:export',
    
    // Knowledge Base
    'kb:articles:view', 'kb:articles:create', 'kb:articles:edit',
  ],

  compliance_officer: [
    // Security (compliance focused)
    'security:scan:view', 'security:findings:resolve',
    'security:compliance:view', 'security:compliance:manage',
    
    // Monitoring
    'monitoring:alerts:view', 'monitoring:dashboards:view',
    
    // Reports
    'reports:view', 'reports:generate', 'reports:schedule', 'reports:export',
    
    // Knowledge Base
    'kb:articles:view', 'kb:articles:create', 'kb:articles:edit', 'kb:articles:approve',
  ],

  developer: [
    // Security (read-only)
    'security:scan:view', 'security:findings:resolve',
    
    // Cost (read-only)
    'cost:view', 'cost:recommendations:view',
    
    // AI
    'ai:insights:view',
    
    // Monitoring
    'monitoring:alerts:view', 'monitoring:dashboards:view', 'monitoring:metrics:view',
    
    // Knowledge Base
    'kb:articles:view', 'kb:articles:create', 'kb:articles:edit',
  ],

  viewer: [
    // Security (read-only)
    'security:scan:view', 'security:findings:resolve',
    
    // Cost (read-only)
    'cost:view',
    
    // Monitoring (read-only)
    'monitoring:alerts:view', 'monitoring:dashboards:view', 'monitoring:metrics:view',
    
    // Reports (read-only)
    'reports:view',
    
    // Knowledge Base (read-only)
    'kb:articles:view',
  ],
};

// Helper functions
export function hasPermission(userRole: string, permission: Permission): boolean {
  const rolePermissions = ROLE_PERMISSIONS[userRole] || [];
  return rolePermissions.includes(permission);
}

export function hasAnyPermission(userRole: string, permissions: Permission[]): boolean {
  return permissions.some(permission => hasPermission(userRole, permission));
}

export function hasAllPermissions(userRole: string, permissions: Permission[]): boolean {
  return permissions.every(permission => hasPermission(userRole, permission));
}

export function getUserPermissions(userRole: string): Permission[] {
  return ROLE_PERMISSIONS[userRole] || [];
}

export function getPermissionsByCategory(userRole: string): Record<string, Permission[]> {
  const permissions = getUserPermissions(userRole);
  const categories: Record<string, Permission[]> = {};

  permissions.forEach(permission => {
    const category = permission.split(':')[0];
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(permission);
  });

  return categories;
}

// Middleware para verificar permissões
export function requirePermission(permission: Permission) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(event: any, context: any, middleware: any) {
      const userRole = middleware?.user?.role;
      
      if (!userRole) {
        return {
          statusCode: 401,
          body: JSON.stringify({ error: 'Authentication required' }),
        };
      }

      if (!hasPermission(userRole, permission)) {
        return {
          statusCode: 403,
          body: JSON.stringify({ 
            error: 'Permission denied',
            required: permission,
            description: PERMISSIONS[permission],
          }),
        };
      }

      return originalMethod.call(this, event, context, middleware);
    };

    return descriptor;
  };
}

// Middleware para verificar múltiplas permissões
export function requireAnyPermission(permissions: Permission[]) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(event: any, context: any, middleware: any) {
      const userRole = middleware?.user?.role;
      
      if (!userRole) {
        return {
          statusCode: 401,
          body: JSON.stringify({ error: 'Authentication required' }),
        };
      }

      if (!hasAnyPermission(userRole, permissions)) {
        return {
          statusCode: 403,
          body: JSON.stringify({ 
            error: 'Permission denied',
            required: permissions,
            description: 'One of the following permissions is required: ' + 
              permissions.map(p => PERMISSIONS[p]).join(', '),
          }),
        };
      }

      return originalMethod.call(this, event, context, middleware);
    };

    return descriptor;
  };
}