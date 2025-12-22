import { useEffect, useCallback, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { timerManager } from '@/lib/timer-manager';
import { useDebounce } from './useDebounce';
import { useOrganization } from './useOrganization';
import { configManager } from '@/lib/config-manager';
import { metricsCollector } from '@/lib/metrics-collector';
import { withSmartRetry } from '@/lib/retry-utils';

interface AutoRefreshConfig {
  enabled?: boolean;
  interval?: number;
  queryKeys: string[][];
  immediate?: boolean; // Whether to execute immediately on mount
}

/**
 * Hook para auto-refresh de dados em background
 * Corrigido para prevenir race conditions e memory leaks
 */
export function useAutoRefresh(config: AutoRefreshConfig) {
  const queryClient = useQueryClient();
  const { data: organizationId } = useOrganization();
  const systemConfig = configManager.getConfig();
  const { 
    enabled = true, 
    interval = systemConfig.intervals.autoRefresh, 
    queryKeys, 
    immediate = false 
  } = config;
  
  const isRefreshing = useRef(false);
  const timerId = useMemo(() => `auto-refresh-${queryKeys.join('-')}`, [queryKeys]);

  // Memoize query keys para evitar recreação do callback
  const memoizedKeys = useMemo(() => 
    queryKeys.map(key => [...key, organizationId].filter(Boolean)),
    [queryKeys, organizationId]
  );

  const refresh = useCallback(async () => {
    if (isRefreshing.current || !organizationId) return;
    
    const startTime = performance.now();
    isRefreshing.current = true;
    
    try {
      metricsCollector.increment('auto_refresh.started');
      
      // Use smart retry for invalidations
      await withSmartRetry(async () => {
        const { queryBatchSize } = systemConfig.performance;
        
        // Invalidar queries sequencialmente em lotes pequenos
        for (let i = 0; i < memoizedKeys.length; i += queryBatchSize) {
          const batch = memoizedKeys.slice(i, i + queryBatchSize);
          await Promise.all(
            batch.map(key => 
              queryClient.invalidateQueries({ 
                queryKey: key, 
                exact: false,
                refetchType: 'active'
              })
            )
          );
          
          // Small delay between batches
          if (i + queryBatchSize < memoizedKeys.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }, systemConfig.retry);
      
      metricsCollector.recordTiming('auto_refresh.duration', startTime);
      metricsCollector.increment('auto_refresh.success');
    } catch {
      metricsCollector.increment('auto_refresh.error');
    } finally {
      isRefreshing.current = false;
    }
  }, [queryClient, memoizedKeys, organizationId, systemConfig]);

  // Debounce refresh to prevent excessive calls
  const debouncedRefresh = useDebounce(refresh, 1000);

  useEffect(() => {
    if (!enabled || !organizationId) return;

    // Execute immediately if requested
    if (immediate) {
      refresh();
    }

    // Register with centralized timer manager
    timerManager.register(timerId, debouncedRefresh, interval);

    return () => {
      timerManager.clear(timerId);
    };
  }, [enabled, interval, timerId, debouncedRefresh, immediate, organizationId, refresh]);

  return { 
    refresh: debouncedRefresh,
    isRefreshing: isRefreshing.current 
  };
}

/**
 * Hook específico para Dashboard Executivo
 * Configura auto-refresh com intervalo menor e queries específicas
 */
export function useExecutiveDashboardRefresh() {
  return useAutoRefresh({
    enabled: true,
    interval: 2 * 60 * 1000, // 2 minutos
    queryKeys: [
      ['executive-current-month-costs'],
      ['executive-30days-costs'],
      ['executive-cost-recommendations'],
      ['executive-risp-recommendations'],
      ['executive-findings'],
      ['executive-tickets'],
      ['executive-security-posture'],
      ['executive-endpoint-metrics'],
      ['daily-costs'],
      ['cost-recommendations'],
      ['findings'],
      ['remediation-tickets'],
      ['security-posture'],
    ],
  });
}

/**
 * Hook para refresh de dados de custo
 */
export function useCostDataRefresh() {
  return useAutoRefresh({
    enabled: true,
    interval: 5 * 60 * 1000, // 5 minutos
    queryKeys: [
      ['daily-costs'],
      ['daily-costs-history'],
      ['cost-analysis-raw'],
      ['cost-forecast'],
      ['aws-accounts-all'],
      ['aws-credentials-cost'],
    ],
  });
}

/**
 * Hook para refresh de dados de segurança
 */
export function useSecurityDataRefresh() {
  return useAutoRefresh({
    enabled: true,
    interval: 10 * 60 * 1000, // 10 minutos
    queryKeys: [
      ['findings'],
      ['security-posture'],
      ['compliance-checks'],
      ['security-scans'],
      ['well-architected-scores'],
    ],
  });
}
