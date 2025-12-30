import { useState, useCallback, useMemo, useRef } from 'react';
import { apiClient } from '@/integrations/aws/api-client';
import { MetricsPeriod, PERIOD_CONFIG } from '@/components/dashboard/resource-monitoring/MetricsPeriodSelector';

interface Metric {
  id: string;
  resource_id: string;
  resource_type: string;
  metric_name: string;
  metric_value: number;
  metric_unit: string;
  timestamp: string;
  aws_account_id: string;
  organization_id: string;
}

interface CacheEntry {
  metrics: Metric[];
  fetchedAt: number;
  oldestTimestamp: number;
  newestTimestamp: number;
}

interface MetricsCacheState {
  // Cache por conta AWS: accountId -> CacheEntry
  byAccount: Map<string, CacheEntry>;
  // Períodos já carregados por conta: accountId -> Set<period>
  loadedPeriods: Map<string, Set<MetricsPeriod>>;
}

// Tempo máximo que o cache é considerado válido (5 minutos)
const CACHE_TTL_MS = 5 * 60 * 1000;

// Margem de sobreposição para evitar gaps (10 minutos)
const OVERLAP_MARGIN_MS = 10 * 60 * 1000;

export function useMetricsCache() {
  const cacheRef = useRef<MetricsCacheState>({
    byAccount: new Map(),
    loadedPeriods: new Map()
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number>(0);

  /**
   * Verifica se um período já foi carregado para uma conta
   */
  const isPeriodCached = useCallback((accountId: string, period: MetricsPeriod): boolean => {
    const loadedPeriods = cacheRef.current.loadedPeriods.get(accountId);
    if (!loadedPeriods) return false;
    
    const cacheEntry = cacheRef.current.byAccount.get(accountId);
    if (!cacheEntry) return false;
    
    // Verificar se o cache ainda é válido (não expirou)
    const cacheAge = Date.now() - cacheEntry.fetchedAt;
    if (cacheAge > CACHE_TTL_MS) {
      return false;
    }
    
    // Verificar se o período específico foi carregado
    return loadedPeriods.has(period);
  }, []);

  /**
   * Calcula o range de tempo necessário para buscar baseado no período
   * e no que já está em cache
   */
  const calculateFetchRange = useCallback((
    accountId: string, 
    period: MetricsPeriod
  ): { startTime: number; endTime: number } | null => {
    const now = Date.now();
    const periodHours = PERIOD_CONFIG[period].hours;
    const periodStartTime = now - (periodHours * 60 * 60 * 1000);
    
    const cacheEntry = cacheRef.current.byAccount.get(accountId);
    
    // Se não há cache, buscar período completo
    if (!cacheEntry) {
      return { startTime: periodStartTime, endTime: now };
    }
    
    // Se o cache expirou, buscar período completo
    const cacheAge = now - cacheEntry.fetchedAt;
    if (cacheAge > CACHE_TTL_MS) {
      return { startTime: periodStartTime, endTime: now };
    }
    
    // Se já temos dados que cobrem o período, não precisa buscar
    if (cacheEntry.oldestTimestamp <= periodStartTime + OVERLAP_MARGIN_MS) {
      // Verificar se precisamos de dados mais recentes
      if (cacheEntry.newestTimestamp >= now - OVERLAP_MARGIN_MS) {
        return null; // Cache completo, não precisa buscar
      }
      // Buscar apenas dados mais recentes
      return { 
        startTime: cacheEntry.newestTimestamp - OVERLAP_MARGIN_MS, 
        endTime: now 
      };
    }
    
    // Precisamos de dados mais antigos
    return { startTime: periodStartTime, endTime: now };
  }, []);

  /**
   * Busca métricas do backend, usando cache inteligente
   */
  const fetchMetrics = useCallback(async (
    accountId: string,
    organizationId: string,
    period: MetricsPeriod,
    forceRefresh: boolean = false,
    resourceType?: string // Novo parâmetro para filtrar por tipo de recurso
  ): Promise<Metric[]> => {
    // Se forceRefresh, limpar cache desta conta
    if (forceRefresh) {
      cacheRef.current.byAccount.delete(accountId);
      cacheRef.current.loadedPeriods.delete(accountId);
    }
    
    // Verificar se já temos os dados em cache
    const fetchRange = calculateFetchRange(accountId, period);
    
    if (!fetchRange && !forceRefresh) {
      // Retornar dados do cache filtrados pelo período
      const cacheEntry = cacheRef.current.byAccount.get(accountId);
      if (cacheEntry) {
        const periodHours = PERIOD_CONFIG[period].hours;
        const cutoffTime = Date.now() - (periodHours * 60 * 60 * 1000);
        let filteredMetrics = cacheEntry.metrics.filter(m => 
          new Date(m.timestamp).getTime() >= cutoffTime
        );
        
        // Filtrar por tipo de recurso se especificado
        if (resourceType) {
          filteredMetrics = filteredMetrics.filter(m => m.resource_type === resourceType);
        }
        
        return filteredMetrics;
      }
    }
    
    setIsLoading(true);
    
    try {
      // Construir query com filtro opcional por tipo de recurso
      const queryFilters: any = {
        organization_id: organizationId,
        aws_account_id: accountId
      };
      
      if (resourceType) {
        queryFilters.resource_type = resourceType;
      }
      
      // Buscar métricas do backend
      const metricsResponse = await apiClient.select('resource_metrics', {
        eq: queryFilters,
        order: { column: 'timestamp', ascending: false },
        limit: resourceType ? 1000 : 2000 // Limite menor se filtrando por tipo específico
      });
      
      const newMetrics = (metricsResponse.data || []) as Metric[];
      
      console.log(`[MetricsCache] Fetched ${newMetrics.length} metrics for account ${accountId}${resourceType ? ` (${resourceType})` : ''}`);
      
      // Atualizar cache
      const existingCache = cacheRef.current.byAccount.get(accountId);
      let mergedMetrics: Metric[];
      
      if (existingCache && !forceRefresh) {
        // Merge com dados existentes, removendo duplicatas por ID
        const existingIds = new Set(existingCache.metrics.map(m => m.id));
        const uniqueNewMetrics = newMetrics.filter(m => !existingIds.has(m.id));
        mergedMetrics = [...existingCache.metrics, ...uniqueNewMetrics];
      } else {
        mergedMetrics = newMetrics;
      }
      
      // Ordenar por timestamp (mais antigo primeiro para gráficos)
      mergedMetrics.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      // Calcular timestamps extremos
      const timestamps = mergedMetrics.map(m => new Date(m.timestamp).getTime());
      const oldestTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : Date.now();
      const newestTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : Date.now();
      
      // Salvar no cache
      cacheRef.current.byAccount.set(accountId, {
        metrics: mergedMetrics,
        fetchedAt: Date.now(),
        oldestTimestamp,
        newestTimestamp
      });
      
      // Marcar período como carregado
      if (!cacheRef.current.loadedPeriods.has(accountId)) {
        cacheRef.current.loadedPeriods.set(accountId, new Set());
      }
      cacheRef.current.loadedPeriods.get(accountId)!.add(period);
      
      // Marcar períodos menores como também carregados
      // Se carregamos 7d, também temos 24h e 3h
      if (period === '7d') {
        cacheRef.current.loadedPeriods.get(accountId)!.add('24h');
        cacheRef.current.loadedPeriods.get(accountId)!.add('3h');
      } else if (period === '24h') {
        cacheRef.current.loadedPeriods.get(accountId)!.add('3h');
      }
      
      setLastUpdate(Date.now());
      
      // Retornar dados filtrados pelo período solicitado
      const periodHours = PERIOD_CONFIG[period].hours;
      const cutoffTime = Date.now() - (periodHours * 60 * 60 * 1000);
      let filteredMetrics = mergedMetrics.filter(m => 
        new Date(m.timestamp).getTime() >= cutoffTime
      );
      
      // Filtrar por tipo de recurso se especificado
      if (resourceType) {
        filteredMetrics = filteredMetrics.filter(m => m.resource_type === resourceType);
      }
      
      return filteredMetrics;
      
    } finally {
      setIsLoading(false);
    }
  }, [calculateFetchRange]);

  /**
   * Obtém métricas do cache sem fazer fetch
   */
  const getMetricsFromCache = useCallback((
    accountId: string,
    period: MetricsPeriod
  ): Metric[] | null => {
    const cacheEntry = cacheRef.current.byAccount.get(accountId);
    if (!cacheEntry) return null;
    
    const periodHours = PERIOD_CONFIG[period].hours;
    const cutoffTime = Date.now() - (periodHours * 60 * 60 * 1000);
    
    return cacheEntry.metrics.filter(m => 
      new Date(m.timestamp).getTime() >= cutoffTime
    );
  }, []);

  /**
   * Limpa o cache de uma conta específica ou de todas
   */
  const clearCache = useCallback((accountId?: string) => {
    if (accountId) {
      cacheRef.current.byAccount.delete(accountId);
      cacheRef.current.loadedPeriods.delete(accountId);
    } else {
      cacheRef.current.byAccount.clear();
      cacheRef.current.loadedPeriods.clear();
    }
    setLastUpdate(Date.now());
  }, []);

  /**
   * Retorna estatísticas do cache para debug
   */
  const getCacheStats = useCallback((accountId: string) => {
    const cacheEntry = cacheRef.current.byAccount.get(accountId);
    const loadedPeriods = cacheRef.current.loadedPeriods.get(accountId);
    
    if (!cacheEntry) {
      return { 
        cached: false, 
        metricsCount: 0, 
        loadedPeriods: [], 
        cacheAge: 0 
      };
    }
    
    return {
      cached: true,
      metricsCount: cacheEntry.metrics.length,
      loadedPeriods: loadedPeriods ? Array.from(loadedPeriods) : [],
      cacheAge: Date.now() - cacheEntry.fetchedAt,
      oldestData: new Date(cacheEntry.oldestTimestamp).toISOString(),
      newestData: new Date(cacheEntry.newestTimestamp).toISOString()
    };
  }, []);

  return {
    fetchMetrics,
    getMetricsFromCache,
    isPeriodCached,
    clearCache,
    getCacheStats,
    isLoading,
    lastUpdate
  };
}

export default useMetricsCache;
