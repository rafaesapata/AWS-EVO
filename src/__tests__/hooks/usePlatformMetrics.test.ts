/**
 * Tests for usePlatformMetrics hook
 * 
 * Tests:
 * - Data fetching and caching
 * - Error handling
 * - Memoization
 * - Pattern detection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

// Mock apiClient
vi.mock('@/integrations/aws/api-client', () => ({
  apiClient: {
    invoke: vi.fn(),
  },
}));

// Mock toast
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

import { usePlatformMetrics, useFilteredErrors, useFilteredPatterns } from '@/hooks/usePlatformMetrics';
import { apiClient } from '@/integrations/aws/api-client';

// Test wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe('usePlatformMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch metrics successfully', async () => {
    const mockMetricsData = {
      coverage: {
        totalLambdas: 114,
        monitoredLambdas: 114,
        totalEndpoints: 111,
        monitoredEndpoints: 111,
        frontendCoverage: 100,
        overallCoverage: 100,
      },
      metrics: [
        { name: 'auth', errors: 0, status: 'ok' },
        { name: 'security', errors: 5, status: 'warning' },
      ],
      performanceMetrics: [],
      lambdaErrors: [],
      frontendErrors: { totalErrors: 0 },
    };

    const mockErrorsData = {
      errors: [],
      total: 0,
    };

    (apiClient.invoke as any)
      .mockResolvedValueOnce({ data: mockMetricsData, error: null })
      .mockResolvedValueOnce({ data: mockErrorsData, error: null });

    const { result } = renderHook(() => usePlatformMetrics(), {
      wrapper: createWrapper(),
    });

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    // Wait for data
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Check data
    expect(result.current.metrics).toHaveLength(2);
    expect(result.current.coverage.totalLambdas).toBe(114);
  });

  it('should handle API errors gracefully', async () => {
    (apiClient.invoke as any).mockResolvedValue({
      data: null,
      error: { message: 'Network error' },
    });

    const { result } = renderHook(() => usePlatformMetrics(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it('should return default coverage when no data', async () => {
    (apiClient.invoke as any).mockResolvedValue({
      data: null,
      error: { message: 'Error' },
    });

    const { result } = renderHook(() => usePlatformMetrics(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should return default coverage
    expect(result.current.coverage.totalLambdas).toBe(114);
    expect(result.current.coverage.monitoredLambdas).toBe(114);
  });
});

describe('useFilteredErrors', () => {
  const mockErrors = [
    {
      id: '1',
      timestamp: '2026-01-15T10:00:00Z',
      source: 'backend',
      errorType: 'RuntimeError',
      message: 'Cannot find module',
    },
    {
      id: '2',
      timestamp: '2026-01-15T11:00:00Z',
      source: 'frontend',
      errorType: 'TypeError',
      message: 'undefined is not a function',
    },
    {
      id: '3',
      timestamp: '2026-01-15T12:00:00Z',
      source: 'backend',
      errorType: 'PrismaError',
      message: 'Database connection failed',
    },
  ];

  it('should return all errors when no filters', () => {
    const { result } = renderHook(() => 
      useFilteredErrors(mockErrors, '', 'all')
    );

    expect(result.current).toHaveLength(3);
  });

  it('should filter by search term', () => {
    const { result } = renderHook(() => 
      useFilteredErrors(mockErrors, 'module', 'all')
    );

    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe('1');
  });

  it('should filter by category', () => {
    const { result } = renderHook(() => 
      useFilteredErrors(mockErrors, '', 'frontend')
    );

    expect(result.current).toHaveLength(1);
    expect(result.current[0].source).toBe('frontend');
  });

  it('should combine search and category filters', () => {
    const { result } = renderHook(() => 
      useFilteredErrors(mockErrors, 'database', 'backend')
    );

    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe('3');
  });

  it('should be case insensitive', () => {
    const { result } = renderHook(() => 
      useFilteredErrors(mockErrors, 'MODULE', 'all')
    );

    expect(result.current).toHaveLength(1);
  });
});

describe('useFilteredPatterns', () => {
  const mockPatterns = [
    {
      pattern: 'Cannot find module',
      errorType: 'RuntimeError',
      count: 10,
      affectedLambdas: ['lambda-1'],
      suggestedFix: 'Fix imports',
      severity: 'critical' as const,
      category: 'deployment',
    },
    {
      pattern: 'Timeout',
      errorType: 'TimeoutError',
      count: 5,
      affectedLambdas: ['lambda-2'],
      suggestedFix: 'Increase timeout',
      severity: 'high' as const,
      category: 'performance',
    },
    {
      pattern: 'CORS',
      errorType: 'CORSError',
      count: 2,
      affectedLambdas: ['lambda-3'],
      suggestedFix: 'Configure CORS',
      severity: 'medium' as const,
      category: 'api-gateway',
    },
  ];

  it('should return all patterns when filter is all', () => {
    const { result } = renderHook(() => 
      useFilteredPatterns(mockPatterns, 'all')
    );

    expect(result.current).toHaveLength(3);
  });

  it('should filter by severity', () => {
    const { result } = renderHook(() => 
      useFilteredPatterns(mockPatterns, 'critical')
    );

    expect(result.current).toHaveLength(1);
    expect(result.current[0].severity).toBe('critical');
  });

  it('should return empty array when no matches', () => {
    const { result } = renderHook(() => 
      useFilteredPatterns(mockPatterns, 'low')
    );

    expect(result.current).toHaveLength(0);
  });
});
