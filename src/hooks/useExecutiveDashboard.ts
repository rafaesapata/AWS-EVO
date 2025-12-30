/**
 * Hook for Executive Dashboard - Single consolidated API call
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/integrations/aws/api-client';
import { useOrganization } from './useOrganization';
import { useAwsAccount } from '@/contexts/AwsAccountContext';
import { useTVDashboard } from '@/contexts/TVDashboardContext';
import type { ExecutiveDashboardData } from '@/components/dashboard/ExecutiveDashboard/types';

interface UseExecutiveDashboardOptions {
  includeForecasts?: boolean;
  includeTrends?: boolean;
  includeInsights?: boolean;
  trendPeriod?: '7d' | '30d' | '90d';
  refetchInterval?: number;
}

export function useExecutiveDashboard(options: UseExecutiveDashboardOptions = {}) {
  const { data: organizationId } = useOrganization();
  const { selectedAccountId, isLoading: accountLoading } = useAwsAccount();
  const { isTVMode } = useTVDashboard();
  const queryClient = useQueryClient();

  const {
    includeForecasts = true,
    includeTrends = true,
    includeInsights = true,
    trendPeriod = '30d',
    refetchInterval = isTVMode ? 30000 : 120000 // 30s TV, 2min normal
  } = options;

  const query = useQuery<ExecutiveDashboardData, Error>({
    queryKey: [
      'executive-dashboard-v2',
      organizationId,
      selectedAccountId,
      trendPeriod
    ],
    enabled: !!organizationId && (isTVMode || (!accountLoading && !!selectedAccountId)),
    queryFn: async () => {
      const response = await apiClient.lambda<ExecutiveDashboardData>('get-executive-dashboard', {
        accountId: isTVMode ? null : selectedAccountId,
        includeForecasts,
        includeTrends,
        includeInsights,
        trendPeriod
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      return response.data as ExecutiveDashboardData;
    },
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval,
    refetchIntervalInBackground: isTVMode,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ 
      queryKey: ['executive-dashboard-v2', organizationId] 
    });
  };

  return {
    ...query,
    refresh,
    isReady: !!organizationId && (isTVMode || !accountLoading)
  };
}
