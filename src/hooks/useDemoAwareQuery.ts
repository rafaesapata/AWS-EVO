/**
 * Demo-Aware Query Hook
 * 
 * Utility hook that provides query enablement logic that considers demo mode.
 * In demo mode, queries can be enabled even without a selected cloud account,
 * because the backend will return demo data.
 * 
 * Usage:
 * const { shouldEnableQuery, isInDemoMode } = useDemoAwareQuery();
 * 
 * const { data } = useQuery({
 *   queryKey: ['my-query', organizationId, selectedAccountId],
 *   enabled: shouldEnableQuery(!!organizationId && !!selectedAccountId),
 *   // or for queries that don't need account in demo mode:
 *   enabled: shouldEnableQuery(!!organizationId, { requireAccountInDemoMode: false }),
 * });
 */

import { useDemoModeOptional } from '@/contexts/DemoModeContext';
import { useCloudAccount } from '@/contexts/CloudAccountContext';
import { useOrganization } from './useOrganization';

interface DemoAwareQueryOptions {
  /**
   * If true, requires selectedAccountId even in demo mode.
   * Default: false (in demo mode, account is not required)
   */
  requireAccountInDemoMode?: boolean;
}

interface DemoAwareQueryResult {
  /**
   * Whether the query should be enabled.
   * Takes into account demo mode status.
   */
  shouldEnableQuery: (baseCondition: boolean, options?: DemoAwareQueryOptions) => boolean;
  
  /**
   * Whether the system is currently in demo mode
   */
  isInDemoMode: boolean;
  
  /**
   * Whether demo mode status is still loading
   */
  isDemoLoading: boolean;
  
  /**
   * Organization ID
   */
  organizationId: string | undefined;
  
  /**
   * Selected cloud account ID (may be null in demo mode)
   */
  selectedAccountId: string | null;
  
  /**
   * Whether accounts are still loading
   */
  isAccountLoading: boolean;
  
  /**
   * Helper to check if query should be enabled for org-only queries
   * (queries that only need organizationId, not accountId)
   */
  shouldEnableOrgQuery: () => boolean;
  
  /**
   * Helper to check if query should be enabled for account-specific queries
   * In demo mode, this returns true even without an account
   */
  shouldEnableAccountQuery: () => boolean;
}

export function useDemoAwareQuery(): DemoAwareQueryResult {
  const { data: organizationId } = useOrganization();
  const { selectedAccountId, isLoading: isAccountLoading } = useCloudAccount();
  const { isDemoMode, isLoading: isDemoLoading, isVerified } = useDemoModeOptional();
  
  // Demo mode is active when verified and not loading
  const isInDemoMode = isDemoMode && isVerified && !isDemoLoading;
  
  /**
   * Determines if a query should be enabled, considering demo mode.
   * 
   * @param baseCondition - The normal condition for enabling the query
   * @param options - Additional options
   * @returns Whether the query should be enabled
   */
  const shouldEnableQuery = (
    baseCondition: boolean, 
    options: DemoAwareQueryOptions = {}
  ): boolean => {
    const { requireAccountInDemoMode = false } = options;
    
    // If in demo mode and account is not required, enable if org exists
    if (isInDemoMode && !requireAccountInDemoMode) {
      return !!organizationId;
    }
    
    // Otherwise, use the base condition
    return baseCondition;
  };
  
  /**
   * Helper for org-only queries (always enabled if org exists)
   */
  const shouldEnableOrgQuery = (): boolean => {
    return !!organizationId;
  };
  
  /**
   * Helper for account-specific queries
   * In demo mode, enabled even without account
   * In normal mode, requires both org and account
   */
  const shouldEnableAccountQuery = (): boolean => {
    if (isInDemoMode) {
      return !!organizationId;
    }
    return !!organizationId && !isAccountLoading && !!selectedAccountId;
  };
  
  return {
    shouldEnableQuery,
    isInDemoMode,
    isDemoLoading,
    organizationId,
    selectedAccountId,
    isAccountLoading,
    shouldEnableOrgQuery,
    shouldEnableAccountQuery,
  };
}

export default useDemoAwareQuery;
