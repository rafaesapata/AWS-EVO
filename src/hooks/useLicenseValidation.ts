import { useQuery } from '@tanstack/react-query';
import { cognitoAuth } from '@/integrations/aws/cognito-client-simple';
import { apiClient } from '@/integrations/aws/api-client';

export interface LicenseStatus {
  isValid: boolean;
  reason?: "expired" | "no_seats" | "no_license" | "seats_exceeded";
  message?: string;
  hasCustomerId: boolean;
  activeUsersCount?: number;
  totalSeats?: number;
  excessUsers?: number;
}

export const useLicenseValidation = () => {
  return useQuery<LicenseStatus>({
    queryKey: ['license-status'],
    queryFn: async () => {
      const session = await cognitoAuth.getCurrentSession();
      
      if (!session) {
        return {
          isValid: false,
          reason: 'no_license' as const,
          message: 'Não autenticado',
          hasCustomerId: false
        };
      }

      const result = await apiClient.invoke<LicenseStatus>('check-license', {
        headers: {
          Authorization: `Bearer ${session.accessToken}`
        },
        body: {}
      });

      if (result.error) {
        console.error('License check error:', result.error);
        return {
          isValid: false,
          reason: 'no_license' as const,
          message: 'Erro ao validar licença',
          hasCustomerId: false
        };
      }

      return result.data as LicenseStatus;
    },
    staleTime: 3 * 60 * 1000, // 3 minutes cache
    gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
    retry: 2, // Retry twice on failure
    retryDelay: 1000, // 1 second between retries
    refetchOnMount: 'always', // CRITICAL: Always refetch on mount to get fresh license status after login
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
    refetchInterval: false, // No automatic interval refetch
    placeholderData: (previousData) => previousData // Keep previous data while revalidating
  });
};