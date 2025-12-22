import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useAwsAccount } from '@/contexts/AwsAccountContext';
import { useOrganization } from './useOrganization';

interface AccountQueryOptions<TData> extends Omit<UseQueryOptions<TData, Error>, 'queryKey' | 'queryFn'> {
  // Additional options can be added here
}

/**
 * Hook for queries that require both organization AND account isolation
 * CRITICAL: Use this for all data that should be isolated per AWS account
 * 
 * The query key automatically includes both organizationId and accountId
 * ensuring complete cache isolation between accounts
 */
export function useAccountQuery<TData = unknown>(
  baseQueryKey: string[],
  queryFn: (params: { organizationId: string; accountId: string }) => Promise<TData>,
  options?: AccountQueryOptions<TData>
) {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useOrganization();
  const { selectedAccountId, isLoading: accountLoading, error: accountError } = useAwsAccount();

  const isReady = !!organizationId && !!selectedAccountId;
  const isLoading = orgLoading || accountLoading;
  const error = orgError || accountError;

  const result = useQuery<TData, Error>({
    // CRITICAL: Include BOTH organization AND account in query key for complete isolation
    queryKey: [...baseQueryKey, 'org', organizationId || 'no-org', 'account', selectedAccountId || 'no-account'],
    queryFn: () => {
      if (!organizationId || !selectedAccountId) {
        return Promise.reject(new Error('Organization or Account not available'));
      }
      return queryFn({ organizationId, accountId: selectedAccountId });
    },
    enabled: isReady && (options?.enabled !== false),
    ...options,
  });

  return {
    ...result,
    isLoading: isLoading || result.isLoading,
    error: error || result.error,
    organizationId,
    accountId: selectedAccountId,
    isReady,
  };
}

/**
 * Hook for queries that only need organization isolation (shared across accounts)
 * Use sparingly - most data should be account-isolated
 */
export function useOrgOnlyQuery<TData = unknown>(
  baseQueryKey: string[],
  queryFn: (organizationId: string) => Promise<TData>,
  options?: AccountQueryOptions<TData>
) {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useOrganization();

  const result = useQuery<TData, Error>({
    queryKey: [...baseQueryKey, 'org', organizationId || 'no-org'],
    queryFn: () => {
      if (!organizationId) {
        return Promise.reject(new Error('Organization not available'));
      }
      return queryFn(organizationId);
    },
    enabled: !!organizationId && (options?.enabled !== false),
    ...options,
  });

  return {
    ...result,
    isLoading: orgLoading || result.isLoading,
    error: orgError || result.error,
    organizationId,
  };
}
