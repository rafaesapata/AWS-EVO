import { useQuery } from '@tanstack/react-query';
import { cognitoAuth } from '@/integrations/aws/cognito-client-simple';
import { CACHE_CONFIGS } from './useQueryCache';
import { useTVDashboard } from '@/contexts/TVDashboardContext';

/**
 * Hook para obter a organização do usuário atual
 * Inclui suporte a impersonation para super admins e modo TV Dashboard
 * Cache isolado por sessão de usuário com retry automático
 */
export const useOrganization = () => {
  const { organizationId: tvOrgId, isTVMode } = useTVDashboard();
  
  console.log('🔐 useOrganization: Context values', { tvOrgId, isTVMode });
  
  // In TV mode, return organization ID directly from context without query
  if (isTVMode && tvOrgId) {
    console.log('🔐 useOrganization: TV mode with orgId, returning directly');
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
    console.log('🔐 useOrganization: TV mode without orgId, returning loading');
    return {
      data: null,
      isLoading: true,
      isError: false,
      isSuccess: false,
      error: null,
      refetch: () => Promise.resolve({ data: null }),
    } as any;
  }
  
  console.log('🔐 useOrganization: Normal mode, using query');
  
  return useQuery({
    queryKey: ['user-organization'],
    queryFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      console.log('🔐 useOrganization: Getting organization for user', {
        userId: user.id,
        email: user.email,
        organizationId: user.organizationId,
      });

      // Use organization ID from AWS Cognito user attributes (primary and only source)
      if (user.organizationId) {
        // Validate UUID format
        const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
        if (!uuidRegex.test(user.organizationId)) {
          console.error('🔐 useOrganization: Invalid organization ID format, forcing logout');
          // Force logout to get new token
          await cognitoAuth.signOut();
          window.location.href = '/login?reason=session_expired';
          throw new Error('Session expired. Redirecting to login...');
        }
        
        console.log('🔐 useOrganization: Using organizationId from Cognito token:', user.organizationId);
        return user.organizationId;
      }

      // No valid organization found - force logout
      console.error('🔐 useOrganization: No organization found for user. Forcing logout.');
      await cognitoAuth.signOut();
      window.location.href = '/login?reason=no_organization';
      throw new Error('Organization not found. Redirecting to login...');
    },
    ...CACHE_CONFIGS.SETTINGS, // 5 minutos de cache
    // Reduce retry count and delays for faster feedback
    retry: 0, // Don't retry - if org is invalid, logout immediately
    // Keep previous data while refetching to prevent UI flickering
    placeholderData: (previousData) => previousData,
  });
};
