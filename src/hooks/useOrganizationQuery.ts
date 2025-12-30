import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { useOrganization } from './useOrganization';

interface OrganizationQueryOptions {
  refetchInterval?: number;
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
}

interface OrganizationQueryResult<TData> {
  data: TData | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<any>;
  isFetching: boolean;
}

/**
 * Hook wrapper que automaticamente adiciona organization_id nas query keys
 * Garante isolamento de cache entre organizações
 */
export function useOrganizationQuery<TData = unknown>(
  baseQueryKey: string[],
  queryFn: (organizationId: string) => Promise<TData>,
  options?: OrganizationQueryOptions
): OrganizationQueryResult<TData> {
  const { data: organizationId, isLoading, error } = useOrganization();

  const result = useQuery<TData, Error>({
    // CRITICAL: Include organization ID in query key for cache isolation
    // This ensures different organizations never share cached data
    queryKey: [...baseQueryKey, organizationId || 'no-org'],
    queryFn: () => {
      if (!organizationId) {
        return Promise.reject(new Error('Organization ID not available'));
      }
      return queryFn(organizationId);
    },
    // Only enable query when organization ID is available
    enabled: !!organizationId && (options?.enabled !== false),
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime,
    gcTime: options?.gcTime,
  });

  // Return combined loading state
  return {
    data: result.data,
    isLoading: isLoading || result.isLoading,
    error: error || result.error,
    refetch: result.refetch,
    isFetching: result.isFetching,
  };
}
