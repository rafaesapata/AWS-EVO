/**
 * Helpers para autenticação com Cognito
 */

import type { AuthorizedEvent, CognitoUser } from '../types/lambda.js';

export function getUserFromEvent(event: AuthorizedEvent): CognitoUser {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  
  if (!claims) {
    throw new Error('No authentication claims found');
  }
  
  return claims;
}

export function getOrganizationId(user: CognitoUser): string {
  const orgId = user['custom:organization_id'];
  
  if (!orgId) {
    throw new Error('User has no organization');
  }
  
  return orgId;
}

export function getTenantId(user: CognitoUser): string | undefined {
  return user['custom:tenant_id'];
}

export function getUserRoles(user: CognitoUser): string[] {
  const rolesStr = user['custom:roles'];
  
  if (!rolesStr) {
    return ['user'];
  }
  
  try {
    return JSON.parse(rolesStr);
  } catch {
    return [rolesStr];
  }
}

export function hasRole(user: CognitoUser, role: string): boolean {
  const roles = getUserRoles(user);
  return roles.includes(role);
}

export function requireRole(user: CognitoUser, role: string): void {
  if (!hasRole(user, role)) {
    throw new Error(`User does not have required role: ${role}`);
  }
}

export function isSuperAdmin(user: CognitoUser): boolean {
  return hasRole(user, 'super_admin');
}

export function isAdmin(user: CognitoUser): boolean {
  return hasRole(user, 'admin') || isSuperAdmin(user);
}
