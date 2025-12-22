import { useOrganization } from './useOrganization';

/**
 * Simplified hook to get just the organization ID
 * Used for query key construction
 */
export function useOrganizationId(): string | null {
  const { data: organizationId } = useOrganization();
  return organizationId || null;
}
