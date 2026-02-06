/**
 * Comprehensive Data Fetching Patterns
 * Provides consistent, optimized data fetching across the application
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { useCallback, useMemo, useState, useEffect } from 'react';
import { apiClient } from '@/integrations/aws/api-client';
import { ErrorHandler, ErrorFactory, AppError } from './error-handler';
import { withCircuitBreaker } from './circuit-breaker';
import { useCacheInvalidation } from './cache-invalidation';
import { createQueryKey, CACHE_CONFIGS } from '@/hooks/useQueryCache';

// Types for data fetching
export interface FetchOptions {
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  cache?: keyof typeof CACHE_CONFIGS;
  circuitBreaker?: boolean;
  optimistic?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface FilterOptions {
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, any>;
  page?: number;
  limit?: number;
}

/**
 * Enhanced data fetching hook with built-in error handling and caching
 */
export function useDataFetch<TData = unknown, TError = AppError>(
  queryKey: string[],
  queryFn: () => Promise<TData>,
  options: FetchOptions & Omit<UseQueryOptions<TData, TError>, 'queryKey' | 'queryFn'> = {}
) {
  const {
    retries = 3,
    retryDelay = 1000,
    timeout = 30000,
    cache = 'SETTINGS',
    circuitBreaker = true,
    optimistic = false,
    ...queryOptions
  } = options;

  const cacheConfig = CACHE_CONFIGS[cache];

  const enhancedQueryFn = useCallback(async (): Promise<TData> => {
    const operation = async () => {
      // Add timeout to the operation
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(ErrorFactory.timeout('Data fetch', timeout)), timeout);
      });

      const dataPromise = queryFn();
      
      return Promise.race([dataPromise, timeoutPromise]);
    };

    if (circuitBreaker) {
      return withCircuitBreaker(`data-fetch-${queryKey.join('-')}`, operation);
    }

    return operation();
  }, [queryFn, queryKey, timeout, circuitBreaker]);

  return useQuery<TData, TError>({
    queryKey,
    queryFn: enhancedQueryFn,
    ...cacheConfig,
    retry: (failureCount, error) => {
      if (failureCount >= retries) return false;
      
      // Don't retry client errors
      if (error instanceof AppError && error.statusCode < 500) {
        return false;
      }
      
      return true;
    },
    retryDelay: (attemptIndex) => Math.min(retryDelay * Math.pow(2, attemptIndex), 30000),
    ...queryOptions,
  });
}

/**
 * Paginated data fetching hook
 */
export function usePaginatedFetch<TData = unknown>(
  baseQueryKey: string[],
  queryFn: (options: FilterOptions) => Promise<PaginatedResponse<TData>>,
  initialFilters: FilterOptions = {},
  options: FetchOptions = {}
) {
  const [filters, setFilters] = useState<FilterOptions>({
    page: 1,
    limit: 20,
    ...initialFilters,
  });

  const stableBaseKey = useMemo(() => baseQueryKey, [JSON.stringify(baseQueryKey)]);

  const queryKey = useMemo(() => [
    ...stableBaseKey,
    'paginated',
    filters,
  ], [stableBaseKey, filters]);

  const query = useDataFetch(
    queryKey,
    () => queryFn(filters),
    {
      keepPreviousData: true,
      ...options,
    }
  );

  const updateFilters = useCallback((newFilters: Partial<FilterOptions>) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters,
      // Reset to first page when filters change (except for page changes)
      page: 'page' in newFilters ? newFilters.page : 1,
    }));
  }, []);

  const nextPage = useCallback(() => {
    if (query.data?.hasMore) {
      setFilters(prev => ({ ...prev, page: (prev.page || 1) + 1 }));
    }
  }, [query.data?.hasMore]);

  const previousPage = useCallback(() => {
    setFilters(prev => ({ ...prev, page: Math.max((prev.page || 1) - 1, 1) }));
  }, []);

  const goToPage = useCallback((page: number) => {
    setFilters(prev => ({ ...prev, page: Math.max(page, 1) }));
  }, []);

  return {
    ...query,
    filters,
    updateFilters,
    nextPage,
    previousPage,
    goToPage,
    hasNextPage: query.data?.hasMore || false,
    hasPreviousPage: (filters.page || 1) > 1,
    totalPages: query.data ? Math.ceil(query.data.count / (filters.limit || 20)) : 0,
  };
}

/**
 * Infinite scroll data fetching hook
 */
export function useInfiniteFetch<TData = unknown>(
  queryKey: string[],
  queryFn: (page: number, limit: number) => Promise<PaginatedResponse<TData>>,
  options: FetchOptions & { limit?: number } = {}
) {
  const { limit = 20, ...fetchOptions } = options;
  const queryClient = useQueryClient();

  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam = 1 }) => queryFn(pageParam, limit),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.page + 1 : undefined,
    ...CACHE_CONFIGS[fetchOptions.cache || 'FREQUENT'],
    ...fetchOptions,
  });
}

/**
 * Optimistic mutation hook with automatic rollback
 */
export function useOptimisticMutation<TData, TVariables, TContext = unknown>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: {
    queryKey: string[];
    updateFn: (oldData: any, variables: TVariables) => any;
    onSuccess?: (data: TData, variables: TVariables, context: TContext) => void;
    onError?: (error: AppError, variables: TVariables, context: TContext) => void;
  } & Omit<UseMutationOptions<TData, AppError, TVariables, TContext>, 'mutationFn'>
) {
  const queryClient = useQueryClient();
  const { invalidateByTrigger } = useCacheInvalidation();

  return useMutation({
    mutationFn,
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: options.queryKey });

      // Snapshot previous value
      const previousData = queryClient.getQueryData(options.queryKey);

      // Optimistically update
      queryClient.setQueryData(options.queryKey, (old: any) => 
        options.updateFn(old, variables)
      );

      return { previousData };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(options.queryKey, context.previousData);
      }

      const appError = ErrorHandler.handle(error, {
        component: 'OptimisticMutation',
        action: 'executar mutação otimista',
      });

      options.onError?.(appError, variables, context as TContext);
    },
    onSuccess: (data, variables, context) => {
      // Invalidate related queries
      invalidateByTrigger(options.queryKey, data);
      
      options.onSuccess?.(data, variables, context);
    },
    onSettled: () => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: options.queryKey });
    },
    ...options,
  });
}

/**
 * Batch mutation hook for multiple operations
 */
export function useBatchMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: {
    batchSize?: number;
    delayBetweenBatches?: number;
    onBatchComplete?: (results: TData[], batch: TVariables[]) => void;
    onAllComplete?: (allResults: TData[]) => void;
    onError?: (error: AppError, failedItem: TVariables, index: number) => void;
  } = {}
) {
  const {
    batchSize = 5,
    delayBetweenBatches = 100,
    onBatchComplete,
    onAllComplete,
    onError,
  } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<TData[]>([]);
  const [errors, setErrors] = useState<{ error: AppError; item: TVariables; index: number }[]>([]);

  const executeBatch = useCallback(async (items: TVariables[]) => {
    setIsLoading(true);
    setProgress(0);
    setResults([]);
    setErrors([]);

    const allResults: TData[] = [];
    const allErrors: { error: AppError; item: TVariables; index: number }[] = [];

    // Process in batches
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchPromises = batch.map(async (item, batchIndex) => {
        const globalIndex = i + batchIndex;
        try {
          const result = await mutationFn(item);
          return { success: true, result, index: globalIndex };
        } catch (error) {
          const appError = ErrorHandler.normalizeError(error);
          allErrors.push({ error: appError, item, index: globalIndex });
          onError?.(appError, item, globalIndex);
          return { success: false, error: appError, index: globalIndex };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      const successfulResults = batchResults
        .filter(r => r.success)
        .map(r => (r as any).result);

      allResults.push(...successfulResults);
      onBatchComplete?.(successfulResults, batch);

      setProgress((i + batch.length) / items.length * 100);
      setResults([...allResults]);

      // Delay between batches
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    setErrors(allErrors);
    setIsLoading(false);
    onAllComplete?.(allResults);

    return { results: allResults, errors: allErrors };
  }, [mutationFn, batchSize, delayBetweenBatches, onBatchComplete, onAllComplete, onError]);

  return {
    executeBatch,
    isLoading,
    progress,
    results,
    errors,
    hasErrors: errors.length > 0,
  };
}

/**
 * Real-time data subscription hook
 */
export function useRealtimeSubscription<TData>(
  table: string,
  filter?: string,
  options: {
    onInsert?: (payload: TData) => void;
    onUpdate?: (payload: TData) => void;
    onDelete?: (payload: { old_record: TData }) => void;
    enabled?: boolean;
  } = {}
) {
  const { onInsert, onUpdate, onDelete, enabled = true } = options;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    // Real-time functionality would need to be implemented with WebSockets or Server-Sent Events
    // For now, we'll use polling as a fallback
    const pollInterval = setInterval(async () => {
      try {
        const result = await apiClient.select(table, { eq: filter ? { [filter.split('=')[0]]: filter.split('=')[1] } : undefined });
        if (result.error) return;
        
        // Invalidate queries to trigger refetch
        queryClient.invalidateQueries({ queryKey: [table] });
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 5000); // Poll every 5 seconds

    return () => {
      clearInterval(pollInterval);
    };
  }, [table, filter, enabled, queryClient]);
}

/**
 * Prefetch utility for preloading data
 */
export function usePrefetch() {
  const queryClient = useQueryClient();

  const prefetchQuery = useCallback(async <TData>(
    queryKey: string[],
    queryFn: () => Promise<TData>,
    options: FetchOptions = {}
  ) => {
    const cacheConfig = CACHE_CONFIGS[options.cache || 'SETTINGS'];
    
    await queryClient.prefetchQuery({
      queryKey,
      queryFn,
      ...cacheConfig,
    });
  }, [queryClient]);

  const prefetchInfiniteQuery = useCallback(async <TData>(
    queryKey: string[],
    queryFn: (page: number) => Promise<PaginatedResponse<TData>>,
    options: FetchOptions = {}
  ) => {
    const cacheConfig = CACHE_CONFIGS[options.cache || 'SETTINGS'];
    
    await queryClient.prefetchInfiniteQuery({
      queryKey,
      queryFn: ({ pageParam = 1 }) => queryFn(pageParam),
      ...cacheConfig,
    });
  }, [queryClient]);

  return {
    prefetchQuery,
    prefetchInfiniteQuery,
  };
}

/**
 * Data synchronization hook for offline support
 */
export function useDataSync<TData>(
  queryKey: string[],
  syncFn: () => Promise<TData>,
  options: {
    syncInterval?: number;
    syncOnFocus?: boolean;
    syncOnReconnect?: boolean;
  } = {}
) {
  const {
    syncInterval = 5 * 60 * 1000, // 5 minutes
    syncOnFocus = true,
    syncOnReconnect = true,
  } = options;

  const queryClient = useQueryClient();

  const sync = useCallback(async () => {
    try {
      const data = await syncFn();
      queryClient.setQueryData(queryKey, data);
      return data;
    } catch (error) {
      ErrorHandler.handleSilent(error, {
        component: 'DataSync',
        action: 'sincronizar dados',
      });
    }
  }, [syncFn, queryKey, queryClient]);

  // Periodic sync
  useEffect(() => {
    if (syncInterval > 0) {
      const interval = setInterval(sync, syncInterval);
      return () => clearInterval(interval);
    }
  }, [sync, syncInterval]);

  // Sync on window focus
  useEffect(() => {
    if (syncOnFocus) {
      const handleFocus = () => sync();
      window.addEventListener('focus', handleFocus);
      return () => window.removeEventListener('focus', handleFocus);
    }
  }, [sync, syncOnFocus]);

  // Sync on network reconnect
  useEffect(() => {
    if (syncOnReconnect) {
      const handleOnline = () => sync();
      window.addEventListener('online', handleOnline);
      return () => window.removeEventListener('online', handleOnline);
    }
  }, [sync, syncOnReconnect]);

  return { sync };
}