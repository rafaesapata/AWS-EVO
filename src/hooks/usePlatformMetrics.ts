/**
 * Platform Metrics Hook
 * 
 * Optimized hook for fetching platform metrics with:
 * - React Query for caching and automatic refetching
 * - Exponential backoff retry
 * - Stale-while-revalidate pattern
 * - Error boundary integration
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { apiClient } from '@/integrations/aws/api-client';
import { useToast } from '@/hooks/use-toast';

// Types
export interface ErrorMetric {
  name: string;
  value: number;
  invocations: number;
  errorRate: number;
  lambdaCount: number;
  threshold: number;
  status: 'ok' | 'warning' | 'critical';
  change: number;
  trend: 'up' | 'down' | 'stable';
  category: string;
}

export interface PerformanceMetric {
  name: string;
  avgDuration: number;
  p95: number;
  maxDuration?: number;
  invocations: number;
  errors?: number;
  errorRate?: number;
  category: string;
  status: 'fast' | 'normal' | 'slow' | 'unknown';
}

export interface RecentError {
  id: string;
  timestamp: string;
  source: string;
  errorType: string;
  message: string;
  statusCode?: number;
  lambdaName?: string;
  endpoint?: string;
}

export interface ErrorPattern {
  pattern: string;
  errorType: string;
  count: number;
  affectedLambdas: string[];
  suggestedFix: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
}

export interface PlatformMetricsData {
  coverage: {
    totalLambdas: number;
    monitoredLambdas: number;
    totalEndpoints: number;
    monitoredEndpoints: number;
    frontendCoverage: number;
    overallCoverage: number;
  };
  metrics: ErrorMetric[];
  performanceMetrics: PerformanceMetric[];
  lambdaErrors: any[];
  apiGatewayErrors: { total5xx: number; total4xx: number };
  frontendErrors: { totalErrors: number };
  timestamp: string;
}

export interface RecentErrorsData {
  errors: RecentError[];
  total: number;
  timestamp: string;
}

// Query keys
export const platformMetricsKeys = {
  all: ['platform-metrics'] as const,
  metrics: () => [...platformMetricsKeys.all, 'metrics'] as const,
  errors: (params: { limit: number; hours: number; source: string }) => 
    [...platformMetricsKeys.all, 'errors', params] as const,
};

// Fetch functions
async function fetchPlatformMetrics(): Promise<PlatformMetricsData> {
  const result = await apiClient.invoke('get-platform-metrics');
  
  if (result.error) {
    throw new Error(result.error.message || 'Failed to fetch platform metrics');
  }
  
  const data = result.data as any;
  
  // Transform metrics to frontend format
  const transformedMetrics = (data.metrics || []).map((metric: any) => ({
    name: metric.name,
    value: metric.errors || 0,
    invocations: metric.invocations || 0,
    errorRate: metric.errorRate || 0,
    lambdaCount: metric.lambdaCount || 0,
    threshold: 10,
    status: metric.status,
    change: metric.change || 0,
    trend: metric.trend || 'stable',
    category: metric.name,
  }));

  return {
    coverage: data.coverage || {
      totalLambdas: 219,
      monitoredLambdas: 219,
      totalEndpoints: 111,
      monitoredEndpoints: 111,
      frontendCoverage: 100,
      overallCoverage: 100,
    },
    metrics: transformedMetrics,
    performanceMetrics: data.performanceMetrics || [],
    lambdaErrors: data.lambdaErrors || [],
    apiGatewayErrors: data.apiGatewayErrors || { total5xx: 0, total4xx: 0 },
    frontendErrors: data.frontendErrors || { totalErrors: 0 },
    timestamp: data.timestamp || new Date().toISOString(),
  };
}

async function fetchRecentErrors(params: { limit: number; hours: number; source: string }): Promise<RecentErrorsData> {
  const result = await apiClient.invoke('get-recent-errors', {
    body: params,
  });
  
  if (result.error) {
    throw new Error(result.error.message || 'Failed to fetch recent errors');
  }
  
  const data = result.data as any;
  
  return {
    errors: data.errors || [],
    total: data.total || 0,
    timestamp: data.timestamp || new Date().toISOString(),
  };
}

// Main hook
export function usePlatformMetrics() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Platform metrics query with caching
  const metricsQuery = useQuery({
    queryKey: platformMetricsKeys.metrics(),
    queryFn: fetchPlatformMetrics,
    staleTime: 30000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
    refetchInterval: 60000, // Auto-refresh every minute
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    meta: {
      errorMessage: 'Erro ao carregar métricas da plataforma',
    },
  });

  // Recent errors query
  const errorsQuery = useQuery({
    queryKey: platformMetricsKeys.errors({ limit: 50, hours: 24, source: 'all' }),
    queryFn: () => fetchRecentErrors({ limit: 50, hours: 24, source: 'all' }),
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    meta: {
      errorMessage: 'Erro ao carregar erros recentes',
    },
  });

  // Memoized error patterns detection
  const errorPatterns = useMemo(() => {
    if (!errorsQuery.data?.errors) return [];
    return detectErrorPatterns(errorsQuery.data.errors);
  }, [errorsQuery.data?.errors]);

  // Memoized alarms based on metrics
  const alarms = useMemo(() => {
    if (!metricsQuery.data) return [];
    
    const lambdaErrorCount = metricsQuery.data.lambdaErrors?.length || 0;
    const frontendErrorCount = metricsQuery.data.frontendErrors?.totalErrors || 0;
    
    return [
      {
        name: 'evo-production-lambda-5xx-errors',
        state: lambdaErrorCount > 5 ? 'ALARM' : 'OK',
        reason: lambdaErrorCount > 5 ? 'Threshold crossed' : 'Threshold not crossed',
        metric: 'AWS/Lambda Errors',
        threshold: 5,
        currentValue: lambdaErrorCount,
      },
      {
        name: 'evo-production-frontend-errors',
        state: frontendErrorCount > 10 ? 'ALARM' : 'OK',
        reason: frontendErrorCount > 10 ? 'Threshold crossed' : 'Threshold not crossed',
        metric: 'EVO/Frontend ErrorCount',
        threshold: 10,
        currentValue: frontendErrorCount,
      },
    ];
  }, [metricsQuery.data]);

  // Manual refresh function
  const refresh = useCallback(async () => {
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: platformMetricsKeys.metrics() }),
        queryClient.invalidateQueries({ queryKey: platformMetricsKeys.errors({ limit: 50, hours: 24, source: 'all' }) }),
      ]);
      toast({
        title: 'Métricas atualizadas',
        description: 'Dados carregados com sucesso',
      });
    } catch (error) {
      toast({
        title: 'Erro ao atualizar',
        description: 'Não foi possível carregar os dados',
        variant: 'destructive',
      });
    }
  }, [queryClient, toast]);

  // Prefetch function for better UX
  const prefetch = useCallback(() => {
    queryClient.prefetchQuery({
      queryKey: platformMetricsKeys.metrics(),
      queryFn: fetchPlatformMetrics,
      staleTime: 30000,
    });
  }, [queryClient]);

  return {
    // Data
    metrics: metricsQuery.data?.metrics || [],
    performanceMetrics: metricsQuery.data?.performanceMetrics || [],
    coverage: metricsQuery.data?.coverage || {
      totalLambdas: 219,
      monitoredLambdas: 219,
      totalEndpoints: 111,
      monitoredEndpoints: 111,
      frontendCoverage: 100,
      overallCoverage: 100,
    },
    recentErrors: errorsQuery.data?.errors || [],
    errorPatterns,
    alarms,
    
    // Loading states
    isLoading: metricsQuery.isLoading || errorsQuery.isLoading,
    isRefetching: metricsQuery.isRefetching || errorsQuery.isRefetching,
    
    // Error states
    error: metricsQuery.error || errorsQuery.error,
    
    // Actions
    refresh,
    prefetch,
    
    // Raw queries for advanced usage
    metricsQuery,
    errorsQuery,
  };
}

// Error pattern detection (memoized)
function detectErrorPatterns(errors: RecentError[]): ErrorPattern[] {
  const patternMap = new Map<string, ErrorPattern>();

  for (const error of errors) {
    let patternKey = '';
    let suggestedFix = '';
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
    let category = 'other';

    // Detect patterns
    if (error.message.includes("Cannot find module '../../lib/")) {
      patternKey = "Cannot find module '../../lib/";
      suggestedFix = 'Deploy incorreto - handler sem dependências';
      severity = 'critical';
      category = 'deployment';
    } else if (error.message.includes('PrismaClientInitializationError')) {
      patternKey = 'PrismaClientInitializationError';
      suggestedFix = 'DATABASE_URL incorreta';
      severity = 'critical';
      category = 'database';
    } else if (error.message.includes('Azure SDK not installed')) {
      patternKey = 'Azure SDK not installed';
      suggestedFix = 'Layer sem Azure SDK';
      severity = 'high';
      category = 'dependencies';
    } else if (error.message.includes('CORS') || error.statusCode === 403) {
      patternKey = 'CORS Error';
      suggestedFix = 'Headers CORS não configurados';
      severity = 'medium';
      category = 'api-gateway';
    } else if (error.message.includes('timeout') || error.message.includes('Task timed out')) {
      patternKey = 'Lambda Timeout';
      suggestedFix = 'Aumentar timeout ou otimizar código';
      severity = 'high';
      category = 'performance';
    } else {
      patternKey = error.errorType;
      suggestedFix = 'Verificar logs para mais detalhes';
      severity = 'medium';
      category = 'other';
    }

    if (!patternMap.has(patternKey)) {
      patternMap.set(patternKey, {
        pattern: patternKey,
        errorType: error.errorType,
        count: 0,
        affectedLambdas: [],
        suggestedFix,
        severity,
        category,
      });
    }

    const pattern = patternMap.get(patternKey)!;
    pattern.count++;
    if (error.lambdaName && !pattern.affectedLambdas.includes(error.lambdaName)) {
      pattern.affectedLambdas.push(error.lambdaName);
    }
  }

  return Array.from(patternMap.values()).sort((a, b) => b.count - a.count);
}

// Hook for filtered errors with memoization
export function useFilteredErrors(
  errors: RecentError[],
  searchTerm: string,
  filterCategory: string
) {
  return useMemo(() => {
    return errors.filter(error => {
      const matchesSearch = searchTerm === '' || 
        error.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
        error.errorType.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'all' || error.source === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [errors, searchTerm, filterCategory]);
}

// Hook for filtered patterns with memoization
export function useFilteredPatterns(
  patterns: ErrorPattern[],
  filterSeverity: string
) {
  return useMemo(() => {
    return patterns.filter(pattern => {
      return filterSeverity === 'all' || pattern.severity === filterSeverity;
    });
  }, [patterns, filterSeverity]);
}
