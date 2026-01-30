/**
 * Utility functions for Organizations management
 */
import type { Organization } from "./types";

/**
 * Calculate days until demo expiration
 */
export function getDemoExpirationDays(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null;
  const now = new Date();
  const expires = new Date(expiresAt);
  const diffTime = expires.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Filter organizations based on search and filter criteria
 */
export function filterOrganizations(
  organizations: Organization[],
  filters: {
    searchQuery: string;
    statusFilter: string;
    demoFilter: string;
    hasAwsFilter: string;
    hasUsersFilter: string;
  }
): Organization[] {
  const { searchQuery, statusFilter, demoFilter, hasAwsFilter, hasUsersFilter } = filters;

  return organizations.filter(org => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        org.name.toLowerCase().includes(query) ||
        org.domain.toLowerCase().includes(query) ||
        org.billing_email.toLowerCase().includes(query) ||
        (org.description && org.description.toLowerCase().includes(query));
      if (!matchesSearch) return false;
    }
    
    // Status filter
    if (statusFilter !== 'all' && org.status !== statusFilter) return false;
    
    // Demo mode filter
    if (demoFilter === 'demo' && !org.demo_mode) return false;
    if (demoFilter === 'production' && org.demo_mode) return false;
    
    // Has AWS accounts filter
    if (hasAwsFilter === 'with' && org.aws_account_count === 0) return false;
    if (hasAwsFilter === 'without' && org.aws_account_count > 0) return false;
    
    // Has users filter
    if (hasUsersFilter === 'with' && org.user_count === 0) return false;
    if (hasUsersFilter === 'without' && org.user_count > 0) return false;
    
    return true;
  });
}

/**
 * Paginate an array
 */
export function paginateArray<T>(
  items: T[],
  currentPage: number,
  pageSize: number
): { paginatedItems: T[]; totalPages: number; startIndex: number; endIndex: number } {
  const totalPages = Math.ceil(items.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedItems = items.slice(startIndex, endIndex);

  return { paginatedItems, totalPages, startIndex, endIndex };
}

/**
 * Calculate summary metrics from organizations
 */
export function calculateOrgMetrics(organizations: Organization[]) {
  return {
    totalOrgs: organizations.length,
    activeOrgs: organizations.filter(org => org.status === 'active').length,
    totalUsers: organizations.reduce((sum, org) => sum + org.user_count, 0),
    totalMonthlyCost: organizations.reduce((sum, org) => sum + org.monthly_cost, 0),
  };
}
