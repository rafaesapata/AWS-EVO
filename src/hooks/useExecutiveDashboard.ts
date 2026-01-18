/**
 * Hook for Executive Dashboard - Single consolidated API call
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/integrations/aws/api-client';
import { useOrganization } from './useOrganization';
import { useCloudAccount } from '@/contexts/CloudAccountContext';
import { useTVDashboard } from '@/contexts/TVDashboardContext';
import type { ExecutiveDashboardData } from '@/components/dashboard/ExecutiveDashboard/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

interface UseExecutiveDashboardOptions {
  includeForecasts?: boolean;
  includeTrends?: boolean;
  includeInsights?: boolean;
  trendPeriod?: '7d' | '30d' | '90d';
  refetchInterval?: number;
}

export function useExecutiveDashboard(options: UseExecutiveDashboardOptions = {}) {
  const { data: organizationId } = useOrganization();
  const { selectedAccountId, isLoading: accountLoading } = useCloudAccount();
  const { isTVMode, organizationId: tvOrgId } = useTVDashboard();
  const queryClient = useQueryClient();

  // Use TV org ID in TV mode, otherwise use authenticated org ID
  const effectiveOrgId = isTVMode ? tvOrgId : organizationId;

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
      effectiveOrgId,
      selectedAccountId,
      trendPeriod,
      isTVMode
    ],
    enabled: !!effectiveOrgId && (isTVMode || (!accountLoading && !!selectedAccountId)),
    queryFn: async () => {
      // In TV mode, use direct fetch without authentication
      if (isTVMode) {
        const response = await fetch(`${API_BASE_URL}/api/functions/get-executive-dashboard-public`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationId: tvOrgId,
            includeForecasts,
            includeTrends,
            includeInsights,
            trendPeriod
          })
        });

        const result = await response.json();
        const data = result.data || result;
        
        if (!response.ok || data.error) {
          throw new Error(data.error || data.message || 'Failed to load dashboard');
        }

        return data as ExecutiveDashboardData;
      }

      // Normal authenticated mode
      const response = await apiClient.lambda<ExecutiveDashboardData>('get-executive-dashboard', {
        accountId: selectedAccountId,
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
    staleTime: 0, // Always refetch when account changes (queryKey includes selectedAccountId)
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval,
    refetchIntervalInBackground: isTVMode,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ 
      queryKey: ['executive-dashboard-v2']
    });
    queryClient.refetchQueries({
      queryKey: ['executive-dashboard-v2', effectiveOrgId, selectedAccountId]
    });
  };

  return {
    ...query,
    refresh,
    isReady: !!effectiveOrgId && (isTVMode || !accountLoading)
  };
}
