import { useEffect, useRef } from "react";
import { useCacheInvalidation } from "@/hooks/useCacheInvalidation";
import { useOrganization } from "@/hooks/useOrganization";
import { timerManager } from "@/lib/timer-manager";

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const TIMER_KEY = 'global-data-refresh';

/**
 * Componente global que gerencia refresh automático de dados
 * Corrigido para prevenir stale closures e vazamento de dados entre organizações
 */
export function GlobalDataRefresh() {
  const { invalidateAllOrganizationData } = useCacheInvalidation();
  const { data: organizationId } = useOrganization();
  const lastOrgIdRef = useRef(organizationId);

  useEffect(() => {
    if (!organizationId) return;

    // Se organização mudou, limpar timer antigo imediatamente
    if (lastOrgIdRef.current !== organizationId) {
      timerManager.clear(TIMER_KEY);
      lastOrgIdRef.current = organizationId;
    }

    // Criar função refresh com closure atual
    const refresh = () => {
      invalidateAllOrganizationData();
    };

    // Registrar no timer manager centralizado
    timerManager.register(TIMER_KEY, refresh, REFRESH_INTERVAL);

    return () => {
      timerManager.clear(TIMER_KEY);
    };
  }, [invalidateAllOrganizationData, organizationId]);

  return null;
}
