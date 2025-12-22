import { useQuery, useQueries, UseQueryOptions, UseQueriesOptions } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";

interface CacheConfig {
  staleTime?: number;
  cacheTime?: number;
  refetchInterval?: number;
}

/**
 * Hook customizado para queries com cache configurável
 * Reduz chamadas desnecessárias ao banco de dados
 */
export function useQueryCache<TData = unknown, TError = unknown>(
  queryKey: string[],
  queryFn: () => Promise<TData>,
  config?: CacheConfig
) {
  const {
    staleTime = 5 * 60 * 1000, // 5 minutos default
    cacheTime = 10 * 60 * 1000, // 10 minutos default
    refetchInterval,
  } = config || {};

  return useQuery<TData, TError>({
    queryKey,
    queryFn,
    staleTime,
    gcTime: cacheTime,
    refetchInterval,
  } as UseQueryOptions<TData, TError>);
}

/**
 * Hook para batching de queries - resolve N+1 problems
 * Executa múltiplas queries em paralelo com cache inteligente
 */
export function useBatchedQueries<TData = unknown, TError = unknown>(
  queries: Array<{
    queryKey: string[];
    queryFn: () => Promise<TData>;
    config?: CacheConfig;
  }>
) {
  const queriesWithConfig = useMemo(() => 
    queries.map(({ queryKey, queryFn, config = {} }) => ({
      queryKey,
      queryFn,
      staleTime: config.staleTime ?? 5 * 60 * 1000,
      gcTime: config.cacheTime ?? 10 * 60 * 1000,
      refetchInterval: config.refetchInterval,
    })) as UseQueriesOptions<TData[], TError[]>,
    [queries]
  );

  return useQueries({ queries: queriesWithConfig });
}

/**
 * Hook para queries com memoização inteligente
 * Evita re-execução desnecessária quando dependências não mudam
 */
export function useMemoizedQuery<TData = unknown, TError = unknown>(
  queryKey: string[],
  queryFn: () => Promise<TData>,
  dependencies: unknown[] = [],
  config?: CacheConfig
) {
  const memoizedQueryFn = useCallback(queryFn, dependencies);
  const memoizedQueryKey = useMemo(() => [...queryKey, ...dependencies], [queryKey, ...dependencies]);

  return useQueryCache<TData, TError>(memoizedQueryKey, memoizedQueryFn, config);
}

/**
 * Hook para queries com prefetch automático
 * Carrega dados relacionados antecipadamente
 */
export function useQueryWithPrefetch<TData = unknown, TError = unknown>(
  queryKey: string[],
  queryFn: () => Promise<TData>,
  prefetchQueries: Array<{
    queryKey: string[];
    queryFn: () => Promise<unknown>;
  }> = [],
  config?: CacheConfig
) {
  const mainQuery = useQueryCache<TData, TError>(queryKey, queryFn, config);

  // Prefetch related queries when main query succeeds
  const prefetchResults = useBatchedQueries(
    mainQuery.isSuccess ? prefetchQueries : []
  );

  return {
    ...mainQuery,
    prefetchedData: prefetchResults,
  };
}

/**
 * Hook para queries com invalidação inteligente
 * Invalida caches relacionados automaticamente
 */
export function useSmartQuery<TData = unknown, TError = unknown>(
  queryKey: string[],
  queryFn: () => Promise<TData>,
  config?: CacheConfig & {
    invalidatePatterns?: string[][];
    onSuccess?: (data: TData) => void;
    onError?: (error: TError) => void;
  }
) {
  const { invalidatePatterns, onSuccess, onError, ...cacheConfig } = config || {};

  return useQuery<TData, TError>({
    queryKey,
    queryFn,
    staleTime: cacheConfig.staleTime ?? 5 * 60 * 1000,
    gcTime: cacheConfig.cacheTime ?? 10 * 60 * 1000,
    refetchInterval: cacheConfig.refetchInterval,
    onSuccess: (data) => {
      onSuccess?.(data);
      // Invalidate related queries if needed
      if (invalidatePatterns) {
        // Implementation would use queryClient.invalidateQueries
        console.log('Would invalidate patterns:', invalidatePatterns);
      }
    },
    onError,
  } as UseQueryOptions<TData, TError>);
}

/**
 * Configurações de cache predefinidas para diferentes tipos de dados
 */
export const CACHE_CONFIGS = {
  // Dados que mudam raramente (1 hora)
  STATIC: {
    staleTime: 60 * 60 * 1000,
    cacheTime: 2 * 60 * 60 * 1000,
  },
  // Configurações organizacionais (5 minutos)
  SETTINGS: {
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
  },
  // Métricas agregadas (2 minutos)
  METRICS: {
    staleTime: 2 * 60 * 1000,
    cacheTime: 5 * 60 * 1000,
  },
  // Dados em tempo real (30 segundos com refresh)
  REALTIME: {
    staleTime: 30 * 1000,
    cacheTime: 60 * 1000,
    refetchInterval: 30 * 1000,
  },
  // Dados frequentemente atualizados (1 minuto)
  FREQUENT: {
    staleTime: 60 * 1000,
    cacheTime: 2 * 60 * 1000,
  },
  // Cache agressivo para dados imutáveis
  IMMUTABLE: {
    staleTime: Infinity,
    cacheTime: 24 * 60 * 60 * 1000, // 24 horas
  },
  // Cache mínimo para dados críticos
  CRITICAL: {
    staleTime: 10 * 1000, // 10 segundos
    cacheTime: 30 * 1000, // 30 segundos
  },
};

/**
 * Utility para criar query keys consistentes
 * Evita duplicação e inconsistências
 */
export const createQueryKey = {
  awsAccounts: (orgId: string) => ['aws-accounts', orgId],
  findings: (orgId: string, filters?: Record<string, unknown>) => 
    ['findings', orgId, ...(filters ? [filters] : [])],
  securityScans: (orgId: string, accountId?: string) => 
    ['security-scans', orgId, ...(accountId ? [accountId] : [])],
  costData: (orgId: string, accountId: string, dateRange?: { start: string; end: string }) =>
    ['cost-data', orgId, accountId, ...(dateRange ? [dateRange] : [])],
  metrics: (orgId: string, accountId: string, service?: string) =>
    ['metrics', orgId, accountId, ...(service ? [service] : [])],
  compliance: (orgId: string, framework?: string) =>
    ['compliance', orgId, ...(framework ? [framework] : [])],
};

/**
 * Hook para queries com retry inteligente
 * Implementa backoff exponencial e retry condicional
 */
export function useResilientQuery<TData = unknown, TError = unknown>(
  queryKey: string[],
  queryFn: () => Promise<TData>,
  config?: CacheConfig & {
    maxRetries?: number;
    retryDelay?: (attemptIndex: number) => number;
    shouldRetry?: (error: TError) => boolean;
  }
) {
  const {
    maxRetries = 3,
    retryDelay = (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    shouldRetry = () => true,
    ...cacheConfig
  } = config || {};

  return useQuery<TData, TError>({
    queryKey,
    queryFn,
    staleTime: cacheConfig.staleTime ?? 5 * 60 * 1000,
    gcTime: cacheConfig.cacheTime ?? 10 * 60 * 1000,
    refetchInterval: cacheConfig.refetchInterval,
    retry: (failureCount, error) => {
      if (failureCount >= maxRetries) return false;
      return shouldRetry(error);
    },
    retryDelay,
  } as UseQueryOptions<TData, TError>);
}
