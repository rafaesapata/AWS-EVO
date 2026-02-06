import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cognitoAuth } from '@/integrations/aws/cognito-client-simple';
import { apiClient } from '@/integrations/aws/api-client';
import { CACHE_CONFIGS } from './useQueryCache';
import { useTVDashboard } from '@/contexts/TVDashboardContext';
import { useLocation } from 'react-router-dom';

// Public routes that should NOT trigger organization/auth queries
const PUBLIC_PATHS = ['/', '/auth', '/register', '/features', '/terms', '/404'];

/**
 * Result type for useOrganization hook
 */
interface UseOrganizationResult {
  data: string | null;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: Error | null;
  refetch: () => Promise<{ data: string | null }>;
}

/**
 * Hook para obter a organização do usuário atual
 * Inclui suporte a impersonation para super admins e modo TV Dashboard
 * Cache isolado por sessão de usuário com retry automático
 * 
 * IMPORTANTE: Este hook também garante que o profile do usuário seja criado
 * no banco de dados (via chamada à API get-user-organization)
 */
export const useOrganization = (): UseOrganizationResult => {
  const { organizationId: tvOrgId, isTVMode } = useTVDashboard();
  const location = useLocation();
  
  // Check if we're on a public page - skip auth queries to avoid 401 loops
  const isPublicPage = PUBLIC_PATHS.includes(location.pathname) || location.pathname.startsWith('/tv/');
  
  // Always call useQuery to follow React hooks rules
  // Use 'enabled' option to control when the query runs
  const query = useQuery({
    queryKey: ['user-organization'],
    queryFn: async () => {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      // Use organization ID from AWS Cognito user attributes (primary and only source)
      if (user.organizationId) {
        // Validate UUID format
        const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
        if (!uuidRegex.test(user.organizationId)) {
          // Force logout to get new token
          await cognitoAuth.signOut();
          throw new Error('Session expired - invalid organization ID format');
        }
        
        // Call API to ensure user profile exists in database
        // This creates the profile if it doesn't exist (first login)
        try {
          await apiClient.invoke('get-user-organization', {
            body: { userId: user.id }
          });
        } catch (err) {
          console.warn('Failed to sync user profile:', err);
          // Don't fail the whole flow if profile sync fails
        }
        
        return user.organizationId;
      }

      // No valid organization found - force logout
      await cognitoAuth.signOut();
      throw new Error('Organization not found');
    },
    enabled: !isTVMode && !isPublicPage, // Disable query in TV mode and on public pages
    ...CACHE_CONFIGS.SETTINGS, // 5 minutos de cache
    retry: 0, // Don't retry - if org is invalid, logout immediately
    placeholderData: (previousData) => previousData,
  });

  // Handle redirect on specific errors (only on protected pages)
  // Must be in useEffect to avoid redirect during render
  // Must be BEFORE conditional returns to respect React hooks rules
  useEffect(() => {
    if (query.error && !isPublicPage && !isTVMode) {
      const errorMessage = query.error.message;
      if (errorMessage.includes('Session expired') || errorMessage.includes('Organization not found')) {
        const reason = errorMessage.includes('Session expired') ? 'session_expired' : 'no_organization';
        window.location.href = `/auth?reason=${reason}`;
      }
    }
  }, [query.error, isPublicPage, isTVMode]);
  
  // In TV mode, return organization ID directly from context
  if (isTVMode) {
    return {
      data: tvOrgId || null,
      isLoading: !tvOrgId,
      isError: false,
      isSuccess: !!tvOrgId,
      error: null,
      refetch: () => Promise.resolve({ data: tvOrgId || null }),
    };
  }
  
  // On public pages, return null org without triggering any auth flow
  if (isPublicPage) {
    return {
      data: null,
      isLoading: false,
      isError: false,
      isSuccess: false,
      error: null,
      refetch: () => Promise.resolve({ data: null }),
    };
  }
  
  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    isSuccess: query.isSuccess,
    error: query.error,
    refetch: async () => {
      const result = await query.refetch();
      return { data: result.data ?? null };
    },
  };
};
