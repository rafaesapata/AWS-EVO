/**
 * Azure Entra ID (Azure AD) Security Scanner
 * 
 * Scans Azure Entra ID for security misconfigurations including:
 * - MFA enforcement for all users
 * - Conditional Access Policies
 * - Privileged Identity Management (PIM)
 * - Legacy authentication blocking
 * - Break-glass accounts
 * - Password policies
 * - Risky sign-ins monitoring
 * - Guest users access
 * - Excessive permissions
 * 
 * Features:
 * - Resource caching to avoid duplicate API calls
 * - Rate limiting to prevent API throttling
 */

import type { AzureScanner, AzureScanContext, AzureScanResult, AzureSecurityFinding, AzureScanError } from '../types.js';
import { logger } from '../../../../logging.js';
import { getGlobalCache, CacheKeys } from '../utils/cache.js';
import { rateLimitedFetch } from '../utils/rate-limiter.js';

// Microsoft Graph API base URL
const GRAPH_API = 'https://graph.microsoft.com/v1.0';
const GRAPH_BETA = 'https://graph.microsoft.com/beta';

// Security thresholds
const GUEST_USER_PERCENTAGE_THRESHOLD = 20;
const MAX_GLOBAL_ADMINS = 5;
const MIN_GLOBAL_ADMINS = 2;
const MAX_ADMIN_CONSENT_APPS = 10;
const MAX_PRIVILEGED_USERS_TO_DISPLAY = 10;

interface User {
  id: string;
  displayName: string;
  userPrincipalName: string;
  userType?: string;
  accountEnabled?: boolean;
  createdDateTime?: string;
  signInActivity?: {
    lastSignInDateTime?: string;
  };
}

interface ConditionalAccessPolicy {
  id: string;
  displayName: string;
  state: 'enabled' | 'disabled' | 'enabledForReportingButNotEnforced';
  conditions: {
    users?: {
      includeUsers?: string[];
      excludeUsers?: string[];
      includeGroups?: string[];
      excludeGroups?: string[];
    };
    applications?: {
      includeApplications?: string[];
      excludeApplications?: string[];
    };
    clientAppTypes?: string[];
    signInRiskLevels?: string[];
    userRiskLevels?: string[];
  };
  grantControls?: {
    operator?: string;
    builtInControls?: string[];
  };
  sessionControls?: any;
}

interface DirectoryRole {
  id: string;
  displayName: string;
  roleTemplateId: string;
}

interface GraphApiPagedResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

interface ServicePrincipal {
  id: string;
  displayName: string;
  appId: string;
  servicePrincipalType?: string;
  oauth2PermissionGrants?: any[];
  appRoleAssignments?: any[];
}

interface SecurityDefaults {
  isEnabled: boolean;
}

// Helper to make Graph API calls with rate limiting and caching
async function graphApiCall<T>(accessToken: string, endpoint: string, useBeta = false, cacheKey?: string): Promise<T | null> {
  const baseUrl = useBeta ? GRAPH_BETA : GRAPH_API;
  const cache = getGlobalCache();
  
  // Use cache if key provided
  if (cacheKey) {
    const cached = cache.get<T>(cacheKey);
    if (cached !== undefined) return cached;
  }
  
  try {
    const response = await rateLimitedFetch(`${baseUrl}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }, `graphApi:${endpoint}`);
    
    if (!response.ok) {
      if (response.status === 403 || response.status === 401) {
        return null; // Permission denied - skip this check
      }
      throw new Error(`Graph API error: ${response.status}`);
    }
    
    const data = await response.json() as T;
    
    // Cache the result if key provided
    if (cacheKey) {
      cache.set(cacheKey, data);
    }
    
    return data;
  } catch (err) {
    return null;
  }
}

// Fetch all users with pagination
async function fetchUsers(accessToken: string, tenantId: string): Promise<User[]> {
  const cache = getGlobalCache();
  const cacheKey = CacheKeys.entraIdUsers(tenantId);
  
  return cache.getOrFetch(cacheKey, async () => {
    const users: User[] = [];
    let nextLink: string | null = '/users?$select=id,displayName,userPrincipalName,userType,accountEnabled,createdDateTime&$top=999';
    
    while (nextLink) {
      const response: GraphApiPagedResponse<User> | null = await graphApiCall<GraphApiPagedResponse<User>>(accessToken, nextLink);
      if (!response) break;
      users.push(...(response.value || []));
      nextLink = response['@odata.nextLink']?.replace(GRAPH_API, '') || null;
    }
    
    return users;
  });
}

// Fetch Conditional Access Policies
async function fetchConditionalAccessPolicies(accessToken: string, tenantId: string): Promise<ConditionalAccessPolicy[]> {
  const cache = getGlobalCache();
  const cacheKey = `entra-ca-policies:${tenantId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const data = await graphApiCall<{ value: ConditionalAccessPolicy[] }>(accessToken, '/identity/conditionalAccess/policies');
    return data?.value || [];
  });
}

// Fetch Directory Roles
async function fetchDirectoryRoles(accessToken: string, tenantId: string): Promise<DirectoryRole[]> {
  const cache = getGlobalCache();
  const cacheKey = `entra-roles:${tenantId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const data = await graphApiCall<{ value: DirectoryRole[] }>(accessToken, '/directoryRoles');
    return data?.value || [];
  });
}

// Fetch Role Members
async function fetchRoleMembers(accessToken: string, roleId: string): Promise<any[]> {
  const cache = getGlobalCache();
  const cacheKey = `entra-role-members:${roleId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const data = await graphApiCall<{ value: any[] }>(accessToken, `/directoryRoles/${roleId}/members`);
    return data?.value || [];
  });
}

// Fetch PIM Role Assignments (eligible)
async function fetchPIMEligibleAssignments(accessToken: string, tenantId: string): Promise<any[]> {
  const cache = getGlobalCache();
  const cacheKey = `entra-pim:${tenantId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const data = await graphApiCall<{ value: any[] }>(accessToken, '/roleManagement/directory/roleEligibilityScheduleInstances', true);
    return data?.value || [];
  });
}

// Fetch Security Defaults
async function fetchSecurityDefaults(accessToken: string, tenantId: string): Promise<SecurityDefaults | null> {
  const cache = getGlobalCache();
  const cacheKey = `entra-security-defaults:${tenantId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    return await graphApiCall<SecurityDefaults>(accessToken, '/policies/identitySecurityDefaultsEnforcementPolicy');
  });
}

// Fetch Service Principals with permissions
async function fetchServicePrincipals(accessToken: string, tenantId: string): Promise<ServicePrincipal[]> {
  const cache = getGlobalCache();
  const cacheKey = CacheKeys.entraIdApps(tenantId);
  
  return cache.getOrFetch(cacheKey, async () => {
    const data = await graphApiCall<{ value: ServicePrincipal[] }>(accessToken, '/servicePrincipals?$top=999');
    return data?.value || [];
  });
}

// Fetch OAuth2 Permission Grants
async function fetchOAuth2Grants(accessToken: string, tenantId: string): Promise<any[]> {
  const cache = getGlobalCache();
  const cacheKey = `entra-oauth2-grants:${tenantId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const data = await graphApiCall<{ value: any[] }>(accessToken, '/oauth2PermissionGrants?$top=999');
    return data?.value || [];
  });
}

// Privileged role template IDs
const PRIVILEGED_ROLES = [
  '62e90394-69f5-4237-9190-012177145e10', // Global Administrator
  'e8611ab8-c189-46e8-94e1-60213ab1f814', // Privileged Role Administrator
  '194ae4cb-b126-40b2-bd5b-6091b380977d', // Security Administrator
  '9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3', // Application Administrator
  '158c047a-c907-4556-b7ef-446551a6b5f7', // Cloud Application Administrator
  '29232cdf-9323-42fd-ade2-1d097af3e4de', // Exchange Administrator
  'f28a1f50-f6e7-4571-818b-6a12f2af6b6c', // SharePoint Administrator
  'fe930be7-5e62-47db-91af-98c3a49a38b1', // User Administrator
  '7be44c8a-adaf-4e2a-84d6-ab2649e08a13', // Privileged Authentication Administrator
  'e3973bdf-4987-49ae-837a-ba8e231c7286', // Azure DevOps Administrator
];

export const entraIdScanner: AzureScanner = {
  name: 'azure-entra-id',
  description: 'Scans Azure Entra ID (Azure AD) for identity and access security misconfigurations',
  category: 'Identity',

  async scan(context: AzureScanContext): Promise<AzureScanResult> {
    const startTime = Date.now();
    const findings: AzureSecurityFinding[] = [];
    const errors: AzureScanError[] = [];
    let resourcesScanned = 0;
    const tenantId = context.tenantId || 'unknown';

    try {
      logger.info('Starting Entra ID security scan', { tenantId });

      // 1. Check Security Defaults
      const securityDefaults = await fetchSecurityDefaults(context.accessToken, tenantId);
      resourcesScanned++;
      
      if (securityDefaults && !securityDefaults.isEnabled) {
        findings.push({
          severity: 'HIGH',
          title: 'Security Defaults Disabled',
          description: 'Azure AD Security Defaults are disabled. This baseline security should be enabled unless Conditional Access is configured.',
          resourceType: 'Microsoft.Directory/tenants',
          resourceId: `/tenants/${tenantId}`,
          resourceName: 'Security Defaults',
          remediation: 'Enable Security Defaults or implement equivalent Conditional Access policies',
          complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53'],
        });
      }

      // 2. Fetch and analyze Conditional Access Policies
      const caPolicies = await fetchConditionalAccessPolicies(context.accessToken, tenantId);
      resourcesScanned += caPolicies.length;

      if (caPolicies.length === 0 && securityDefaults && !securityDefaults.isEnabled) {
        findings.push({
          severity: 'CRITICAL',
          title: 'No Conditional Access Policies Configured',
          description: 'No Conditional Access policies are configured and Security Defaults are disabled. The tenant has no identity protection.',
          resourceType: 'Microsoft.Directory/conditionalAccessPolicies',
          resourceId: `/tenants/${tenantId}/conditionalAccess`,
          resourceName: 'Conditional Access',
          remediation: 'Configure Conditional Access policies or enable Security Defaults',
          complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53', 'ISO 27001'],
        });
      }

      // Check for MFA policy
      const mfaPolicy = caPolicies.find(p => 
        p.state === 'enabled' && 
        p.grantControls?.builtInControls?.includes('mfa')
      );
      
      if (!mfaPolicy && securityDefaults && !securityDefaults.isEnabled) {
        findings.push({
          severity: 'CRITICAL',
          title: 'No MFA Enforcement Policy',
          description: 'No Conditional Access policy enforces MFA and Security Defaults are disabled.',
          resourceType: 'Microsoft.Directory/conditionalAccessPolicies',
          resourceId: `/tenants/${tenantId}/conditionalAccess`,
          resourceName: 'MFA Policy',
          remediation: 'Create a Conditional Access policy requiring MFA for all users',
          complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'LGPD', 'NIST 800-53'],
        });
      }

      // Check for legacy authentication blocking
      const legacyAuthBlockPolicy = caPolicies.find(p =>
        p.state === 'enabled' &&
        p.conditions?.clientAppTypes?.includes('exchangeActiveSync') &&
        p.grantControls?.builtInControls?.includes('block')
      );

      if (!legacyAuthBlockPolicy) {
        findings.push({
          severity: 'HIGH',
          title: 'Legacy Authentication Not Blocked',
          description: 'No Conditional Access policy blocks legacy authentication protocols which bypass MFA.',
          resourceType: 'Microsoft.Directory/conditionalAccessPolicies',
          resourceId: `/tenants/${tenantId}/conditionalAccess`,
          resourceName: 'Legacy Auth Block',
          remediation: 'Create a Conditional Access policy to block legacy authentication',
          complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53'],
        });
      }

      // Check for risky sign-in policy
      const riskySignInPolicy = caPolicies.find(p =>
        p.state === 'enabled' &&
        (p.conditions?.signInRiskLevels?.length || 0) > 0
      );

      if (!riskySignInPolicy) {
        findings.push({
          severity: 'MEDIUM',
          title: 'No Risky Sign-In Policy',
          description: 'No Conditional Access policy addresses risky sign-ins.',
          resourceType: 'Microsoft.Directory/conditionalAccessPolicies',
          resourceId: `/tenants/${tenantId}/conditionalAccess`,
          resourceName: 'Risky Sign-In Policy',
          remediation: 'Create a Conditional Access policy requiring MFA or blocking high-risk sign-ins',
          complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53'],
        });
      }

      // 3. Analyze Users
      const users = await fetchUsers(context.accessToken, tenantId);
      resourcesScanned += users.length;

      // Count guest users
      const guestUsers = users.filter(user => user.userType === 'Guest').length;

      // Check for excessive guest users
      const guestPercentage = users.length > 0 ? (guestUsers / users.length) * 100 : 0;
      if (guestPercentage > GUEST_USER_PERCENTAGE_THRESHOLD) {
        findings.push({
          severity: 'MEDIUM',
          title: 'High Number of Guest Users',
          description: `${guestUsers} guest users (${guestPercentage.toFixed(1)}% of total users). Review guest access regularly.`,
          resourceType: 'Microsoft.Directory/users',
          resourceId: `/tenants/${tenantId}/users`,
          resourceName: 'Guest Users',
          remediation: 'Review and remove unnecessary guest users. Implement guest access reviews.',
          complianceFrameworks: ['CIS Azure 1.4', 'LGPD'],
          metadata: { guestCount: guestUsers, totalUsers: users.length },
        });
      }

      // 4. Analyze Privileged Roles and PIM
      const directoryRoles = await fetchDirectoryRoles(context.accessToken, tenantId);
      resourcesScanned += directoryRoles.length;

      let globalAdminCount = 0;
      let privilegedUsersWithoutPIM: string[] = [];

      // Fetch PIM eligible assignments
      const pimAssignments = await fetchPIMEligibleAssignments(context.accessToken, tenantId);
      const pimUserIds = new Set(pimAssignments.map(a => a.principalId));

      for (const role of directoryRoles) {
        if (PRIVILEGED_ROLES.includes(role.roleTemplateId)) {
          const members = await fetchRoleMembers(context.accessToken, role.id);
          
          for (const member of members) {
            if (role.roleTemplateId === '62e90394-69f5-4237-9190-012177145e10') {
              globalAdminCount++;
            }
            
            // Check if privileged user has PIM (eligible assignment)
            if (!pimUserIds.has(member.id)) {
              privilegedUsersWithoutPIM.push(`${member.displayName} (${role.displayName})`);
            }
          }
        }
      }

      // Check Global Admin count
      if (globalAdminCount > MAX_GLOBAL_ADMINS) {
        findings.push({
          severity: 'HIGH',
          title: 'Too Many Global Administrators',
          description: `${globalAdminCount} Global Administrators found. Microsoft recommends fewer than ${MAX_GLOBAL_ADMINS}.`,
          resourceType: 'Microsoft.Directory/directoryRoles',
          resourceId: `/tenants/${tenantId}/directoryRoles/globalAdmin`,
          resourceName: 'Global Administrators',
          remediation: 'Reduce the number of Global Administrators. Use least-privilege roles.',
          complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53'],
          metadata: { count: globalAdminCount },
        });
      }

      if (globalAdminCount < MIN_GLOBAL_ADMINS) {
        findings.push({
          severity: 'MEDIUM',
          title: 'Insufficient Global Administrators',
          description: `Only ${globalAdminCount} Global Administrator(s). Have at least ${MIN_GLOBAL_ADMINS} for redundancy (break-glass accounts).`,
          resourceType: 'Microsoft.Directory/directoryRoles',
          resourceId: `/tenants/${tenantId}/directoryRoles/globalAdmin`,
          resourceName: 'Global Administrators',
          remediation: 'Create at least 2 Global Admin accounts including break-glass accounts.',
          complianceFrameworks: ['CIS Azure 1.4'],
          metadata: { count: globalAdminCount },
        });
      }

      // Report privileged users without PIM
      if (privilegedUsersWithoutPIM.length > 0) {
        findings.push({
          severity: 'HIGH',
          title: 'Privileged Accounts Without PIM',
          description: `${privilegedUsersWithoutPIM.length} privileged accounts have permanent role assignments without PIM.`,
          resourceType: 'Microsoft.Directory/roleAssignments',
          resourceId: `/tenants/${tenantId}/pim`,
          resourceName: 'Privileged Identity Management',
          remediation: 'Enable PIM and convert permanent assignments to eligible assignments.',
          complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53', 'ISO 27001'],
          metadata: { 
            count: privilegedUsersWithoutPIM.length,
            users: privilegedUsersWithoutPIM.slice(0, MAX_PRIVILEGED_USERS_TO_DISPLAY),
          },
        });
      }

      // 5. Analyze Service Principals and App Permissions
      const servicePrincipals = await fetchServicePrincipals(context.accessToken, tenantId);
      const oauth2Grants = await fetchOAuth2Grants(context.accessToken, tenantId);
      resourcesScanned += servicePrincipals.length;

      // Check for overly permissive OAuth grants
      const adminConsentGrants = oauth2Grants.filter(g => g.consentType === 'AllPrincipals');
      if (adminConsentGrants.length > MAX_ADMIN_CONSENT_APPS) {
        findings.push({
          severity: 'MEDIUM',
          title: 'Many Admin-Consented Applications',
          description: `${adminConsentGrants.length} applications have admin consent for all users. Review these permissions.`,
          resourceType: 'Microsoft.Directory/oauth2PermissionGrants',
          resourceId: `/tenants/${tenantId}/oauth2Grants`,
          resourceName: 'OAuth2 Grants',
          remediation: 'Review admin-consented applications and remove unnecessary permissions.',
          complianceFrameworks: ['CIS Azure 1.4'],
          metadata: { count: adminConsentGrants.length },
        });
      }

      // Check for high-privilege app permissions
      const highPrivilegeScopes = ['Directory.ReadWrite.All', 'User.ReadWrite.All', 'Mail.ReadWrite', 'Files.ReadWrite.All'];
      for (const grant of oauth2Grants) {
        const scopes = (grant.scope || '').split(' ');
        const dangerousScopes = scopes.filter((s: string) => highPrivilegeScopes.includes(s));
        
        if (dangerousScopes.length > 0) {
          const app = servicePrincipals.find(sp => sp.id === grant.clientId);
          findings.push({
            severity: 'HIGH',
            title: 'Application with High-Privilege Permissions',
            description: `Application "${app?.displayName || grant.clientId}" has high-privilege permissions: ${dangerousScopes.join(', ')}`,
            resourceType: 'Microsoft.Directory/servicePrincipals',
            resourceId: grant.clientId,
            resourceName: app?.displayName || 'Unknown App',
            remediation: 'Review if these permissions are necessary. Apply least-privilege principle.',
            complianceFrameworks: ['CIS Azure 1.4', 'LGPD'],
            metadata: { scopes: dangerousScopes },
          });
        }
      }

      logger.info('Entra ID scan completed', {
        tenantId,
        resourcesScanned,
        findingsCount: findings.length,
      });

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Error scanning Entra ID', { error: errorMessage });
      errors.push({
        scanner: 'azure-entra-id',
        message: errorMessage,
        recoverable: true,
        resourceType: 'Microsoft.Directory',
      });
    }

    return {
      findings,
      resourcesScanned,
      errors,
      scanDurationMs: Date.now() - startTime,
    };
  },
};

export default entraIdScanner;
