import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useQueryCache, CACHE_CONFIGS } from '../useQueryCache';
import { createElement } from 'react';

const waitFor = async (callback: () => any) => {
  let attempts = 0;
  while (attempts < 50) {
    try {
      const result = callback();
      if (result) return result;
    } catch (e) {}
    await new Promise(resolve => setTimeout(resolve, 50));
    attempts++;
  }
  throw new Error('waitFor timeout');
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  
  return ({ children }: any) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useQueryCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute query function and return data', async () => {
    const mockData = { test: 'data' };
    const mockQueryFn = vi.fn().mockResolvedValue(mockData);

    const { result } = renderHook(
      () => useQueryCache(['test-key'], mockQueryFn),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockData);
    expect(mockQueryFn).toHaveBeenCalledTimes(1);
  });

  it('should handle query errors', async () => {
    const mockError = new Error('Query failed');
    const mockQueryFn = vi.fn().mockRejectedValue(mockError);

    const { result } = renderHook(
      () => useQueryCache(['test-key'], mockQueryFn),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(mockError);
  });

  describe('CACHE_CONFIGS', () => {
    it('should have correct cache configurations', () => {
      expect(CACHE_CONFIGS.STATIC.staleTime).toBe(60 * 60 * 1000);
      expect(CACHE_CONFIGS.SETTINGS.staleTime).toBe(5 * 60 * 1000);
      expect(CACHE_CONFIGS.METRICS.staleTime).toBe(2 * 60 * 1000);
      expect(CACHE_CONFIGS.REALTIME.staleTime).toBe(30 * 1000);
      expect(CACHE_CONFIGS.FREQUENT.staleTime).toBe(60 * 1000);
    });
  });
});
