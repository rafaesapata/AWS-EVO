import { useQuery } from '@tanstack/react-query';
import { cognitoAuth } from '@/integrations/aws/cognito-client-simple';
import { apiClient } from '@/integrations/aws/api-client';
import { CACHE_CONFIGS } from './useQueryCache';
import { useTVDashboard } from '@/contexts/TVDashboardContext';

/**
 * Hook para obter a organização do usuário atual
 * Inclui suporte a impersonation para super admins e modo TV Dashboard
 * Cache isolado por sessão de usuário com retry automático
 */
export const useOrganization = () => {
  const { organizationId: tvOrgId, isTVMode } = useTVDashboard();
  
  // In TV mode, return organization ID directly from context without query
  if (isTVMode && tvOrgId) {
    return {
      data: tvOrgId,
      isLoading: false,
      isError: false,
      isSuccess: true,
      error: null,
      refetch: () => Promise.resolve({ data: tvOrgId }),
    } as any;
  }
  
  // If in TV mode but no orgId yet, show loading
  if (isTVMode && !tvOrgId) {
    return {
      data: null,
      isLoading: true,
      isError: false,
      isSuccess: false,
      error: null,
      refetch: () => Promise.resolve({ data: null }),
    } as any;
  }
  
  return useQuery({
    queryKey: ['user-organization'],
    queryFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      // Try to get organization from profile in DynamoDB via API
      try {
        const profileResponse = await apiClient.invoke('check-organization', {
          body: { userId: user.id }
        });
        
        if (profileResponse.data?.organizationId) {
          return profileResponse.data.organizationId;
        }
      } catch (error) {
        console.warn('Failed to fetch organization from profile, using fallback:', error);
      }

      // Use organization ID from AWS Cognito user attributes
      if (user.organizationId) {
        return user.organizationId;
      }

      // Fallback: extract organization from email domain
      if (user.email) {
        const domain = user.email.split('@')[1];
        // Create a simple organization ID based on domain
        return `org-${domain.replace(/\./g, '-')}`;
      }

      // Last fallback: use user ID as organization
      return `org-${user.id.substring(0, 8)}`;
    },
    ...CACHE_CONFIGS.SETTINGS, // 5 minutos de cache
    // Reduce retry count and delays for faster feedback
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 2000),
    // Keep previous data while refetching to prevent UI flickering
    placeholderData: (previousData) => previousData,
  });
};
