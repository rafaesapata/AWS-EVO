import { useQueryClient } from '@tanstack/react-query';
import { useOrganization } from './useOrganization';

/**
 * Hook para invalidação segura de cache isolado por organização
 * Garante que apenas os dados da organização atual sejam invalidados
 */
export function useCacheInvalidation() {
  const queryClient = useQueryClient();
  const { data: organizationId } = useOrganization();

  /**
   * Invalida queries específicas da organização atual
   * @param queryKey - Base query key (sem organization ID)
   * @param exact - Se true, invalida apenas a query exata. Se false, invalida todas as queries que começam com a key
   */
  const invalidateOrganizationQuery = async (
    queryKey: string[],
    exact: boolean = false
  ) => {
    if (!organizationId) {
      console.warn('Cannot invalidate cache: Organization ID not available');
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: [...queryKey, organizationId],
      exact,
    });
  };

  /**
   * Invalida todas as queries relacionadas a custos da organização atual
   */
  const invalidateCostData = async () => {
    if (!organizationId) return;

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['daily-costs', organizationId], exact: false }),
      queryClient.invalidateQueries({ queryKey: ['cost-overview', organizationId], exact: false }),
      queryClient.invalidateQueries({ queryKey: ['cost-forecast', organizationId], exact: false }),
      queryClient.invalidateQueries({ queryKey: ['cost-recommendations', organizationId], exact: false }),
    ]);
  };

  /**
   * Invalida todas as queries relacionadas a segurança da organização atual
   */
  const invalidateSecurityData = async () => {
    if (!organizationId) return;

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['security-posture', organizationId], exact: false }),
      queryClient.invalidateQueries({ queryKey: ['security-scans', organizationId], exact: false }),
      queryClient.invalidateQueries({ queryKey: ['findings', organizationId], exact: false }),
    ]);
  };

  /**
   * Invalida todas as queries da organização atual
   * CUIDADO: Usa esta função apenas quando necessário (ex: troca de organização)
   */
  const invalidateAllOrganizationData = async () => {
    if (!organizationId) return;

    await queryClient.invalidateQueries({
      predicate: (query) => {
        const queryKey = query.queryKey;
        // Invalida qualquer query que contenha o organization ID
        return queryKey.includes(organizationId);
      },
    });
  };

  /**
   * Remove todas as queries da organização anterior quando o usuário troca de organização
   * CRÍTICO: Previne data leakage entre organizações
   */
  const clearPreviousOrganizationCache = async (previousOrgId: string) => {
    await queryClient.removeQueries({
      predicate: (query) => {
        const queryKey = query.queryKey;
        return queryKey.includes(previousOrgId);
      },
    });
  };

  return {
    invalidateOrganizationQuery,
    invalidateCostData,
    invalidateSecurityData,
    invalidateAllOrganizationData,
    clearPreviousOrganizationCache,
  };
}
