/**
 * Role-Based Access Control (RBAC) System
 * Provides granular permissions for different user roles
 */
export declare const PERMISSIONS: {
    readonly 'security:scan:execute': "Execute security scans";
    readonly 'security:scan:view': "View security scan results";
    readonly 'security:scan:delete': "Delete security scans";
    readonly 'security:findings:resolve': "Resolve security findings";
    readonly 'security:findings:dismiss': "Dismiss security findings";
    readonly 'security:findings:export': "Export security findings";
    readonly 'security:compliance:view': "View compliance reports";
    readonly 'security:compliance:manage': "Manage compliance frameworks";
    readonly 'cost:view': "View cost data";
    readonly 'cost:analyze': "Run cost analysis";
    readonly 'cost:forecast': "Generate cost forecasts";
    readonly 'cost:recommendations:view': "View cost recommendations";
    readonly 'cost:recommendations:apply': "Apply cost recommendations";
    readonly 'cost:budgets:manage': "Manage budgets and alerts";
    readonly 'cost:export': "Export cost data";
    readonly 'admin:users:view': "View users";
    readonly 'admin:users:create': "Create users";
    readonly 'admin:users:edit': "Edit users";
    readonly 'admin:users:delete': "Delete users";
    readonly 'admin:org:settings': "Manage organization settings";
    readonly 'admin:org:billing': "Manage billing and subscriptions";
    readonly 'admin:aws:credentials': "Manage AWS credentials";
    readonly 'admin:integrations:manage': "Manage third-party integrations";
    readonly 'ai:copilot:use': "Use FinOps Copilot";
    readonly 'ai:insights:generate': "Generate AI insights";
    readonly 'ai:insights:view': "View AI insights";
    readonly 'ai:models:configure': "Configure AI models";
    readonly 'monitoring:alerts:view': "View alerts";
    readonly 'monitoring:alerts:manage': "Manage alert rules";
    readonly 'monitoring:dashboards:view': "View dashboards";
    readonly 'monitoring:dashboards:create': "Create custom dashboards";
    readonly 'monitoring:metrics:view': "View metrics";
    readonly 'reports:view': "View reports";
    readonly 'reports:generate': "Generate reports";
    readonly 'reports:schedule': "Schedule automated reports";
    readonly 'reports:export': "Export reports";
    readonly 'kb:articles:view': "View knowledge base articles";
    readonly 'kb:articles:create': "Create knowledge base articles";
    readonly 'kb:articles:edit': "Edit knowledge base articles";
    readonly 'kb:articles:delete': "Delete knowledge base articles";
    readonly 'kb:articles:approve': "Approve knowledge base articles";
};
export type Permission = keyof typeof PERMISSIONS;
export declare const ROLE_PERMISSIONS: Record<string, Permission[]>;
export declare function hasPermission(userRole: string, permission: Permission): boolean;
export declare function hasAnyPermission(userRole: string, permissions: Permission[]): boolean;
export declare function hasAllPermissions(userRole: string, permissions: Permission[]): boolean;
export declare function getUserPermissions(userRole: string): Permission[];
export declare function getPermissionsByCategory(userRole: string): Record<string, Permission[]>;
export declare function requirePermission(permission: Permission): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
export declare function requireAnyPermission(permissions: Permission[]): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
//# sourceMappingURL=permissions.d.ts.map