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

      // Use validate-license endpoint (check-license doesn't exist)
      const result = await apiClient.invoke<any>('validate-license', {
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

      const data = result.data;
      
      // Transform validate-license response to LicenseStatus format
      if (!data) {
        return {
          isValid: false,
          reason: 'no_license' as const,
          message: 'Resposta inválida do servidor',
          hasCustomerId: false
        };
      }

      // Check if license is configured
      if (data.configured === false) {
        return {
          isValid: false,
          reason: 'no_license' as const,
          message: data.message || 'Licença não configurada',
          hasCustomerId: false
        };
      }

      // Check various invalid states
      if (!data.valid) {
        let reason: "expired" | "no_seats" | "no_license" | "seats_exceeded" = 'no_license';
        let message = 'Licença inválida';

        if (data.status === 'expired' || data.license?.is_expired) {
          reason = 'expired';
          message = 'Sua licença expirou';
        } else if (data.status === 'no_seat' || !data.user_access?.has_seat) {
          reason = 'no_seats';
          message = 'Não há assentos disponíveis para seu usuário';
        }

        return {
          isValid: false,
          reason,
          message,
          hasCustomerId: !!data.customer_id,
          totalSeats: data.seats?.total,
          activeUsersCount: data.seats?.used
        };
      }

      // License is valid
      return {
        isValid: true,
        hasCustomerId: !!data.customer_id,
        totalSeats: data.seats?.total,
        activeUsersCount: data.seats?.used
      };
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