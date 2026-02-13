/**
 * Hook for fetching Executive Dashboard trend data independently
 * Separated from main dashboard query to avoid full page reload on period change
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/integrations/aws/api-client';
import { useOrganization } from './useOrganization';
import { useCloudAccount } from '@/contexts/CloudAccountContext';
import { useTVDashboard } from '@/contexts/TVDashboardContext';
import { useDemoModeOptional } from '@/contexts/DemoModeContext';
import type { TrendData } from '@/components/dashboard/ExecutiveDashboard/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

interface UseExecutiveTrendsOptions {
  trendPeriod: '7d' | '30d' | '90d';
}

export function useExecutiveTrends({ trendPeriod }: UseExecutiveTrendsOptions) {
  const { data: organizationId } = useOrganization();
  const { selectedAccountId, selectedProvider, isLoading: accountLoading } = useCloudAccount();
  const { isTVMode, organizationId: tvOrgId } = useTVDashboard();
  const { isDemoMode, isLoading: demoLoading, isVerified: demoVerified } = useDemoModeOptional();

  const effectiveOrgId = isTVMode ? tvOrgId : organizationId;
  const isInDemoMode = isDemoMode && demoVerified && !demoLoading;

  const query = useQuery<TrendData, Error>({
    queryKey: [
      'executive-dashboard-trends',
      effectiveOrgId,
      selectedAccountId,
      selectedProvider,
      trendPeriod
    ],
    enabled: !!effectiveOrgId && (isTVMode || isInDemoMode || (!accountLoading && !!selectedAccountId)),
    queryFn: async () => {
      if (isTVMode) {
        const response = await fetch(`${API_BASE_URL}/api/functions/get-executive-dashboard-public`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationId: tvOrgId,
            includeTrends: true,
            trendPeriod
          })
        });

        const result = await response.json();
        const data = result.data || result;

        if (!response.ok || data.error) {
          throw new Error(data.error || data.message || 'Failed to load trends');
        }

        return data.trends as TrendData;
      }

      const response = await apiClient.lambda<{ trends: TrendData }>('get-executive-dashboard', {
        accountId: selectedAccountId,
        provider: selectedProvider,
        includeTrends: true,
        includeForecasts: false,
        includeInsights: false,
        trendPeriod
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      return (response.data as any).trends as TrendData;
    },
    placeholderData: (previousData) => previousData,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000,
  });

  return query;
}
