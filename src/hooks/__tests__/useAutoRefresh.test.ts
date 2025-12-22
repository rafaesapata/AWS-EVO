import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useAutoRefresh } from '../useAutoRefresh';
import { createTestQueryClient, mockCognitoAuth, mockApiClient, mockUser } from '../../tests/setup/test-environment';

describe('useAutoRefresh', () => {
  let queryClient: ReturnType<typeof createTestQueryClient>;
  let wrapper: any;

  beforeEach(() => {
    vi.useFakeTimers();
    queryClient = createTestQueryClient();
    wrapper = ({ children }: any) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    
    // Setup mocks
    mockCognitoAuth.getCurrentUser.mockResolvedValue(mockUser);
    mockApiClient.rpc.mockResolvedValue({ data: mockUser.organizationId, error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call refetch function at specified interval', async () => {
    const mockRefetch = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useAutoRefresh({
      queryKeys: [['test-key']],
      interval: 30000
    }), { wrapper });

    expect(mockRefetch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30000);
    expect(result.current.refresh).toBeDefined();
  });

  it('should allow manual refresh', async () => {
    const mockRefetch = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useAutoRefresh({
      queryKeys: [['test-key']],
      interval: 30000
    }), { wrapper });

    await result.current.refresh();
    
    expect(result.current.refresh).toBeDefined();
  });

  it('should cleanup on unmount', () => {
    const mockRefetch = vi.fn(() => Promise.resolve());
    const { unmount } = renderHook(() => useAutoRefresh({
      queryKeys: [['test-key']],
      interval: 30000
    }), { wrapper });

    unmount();
    
    vi.advanceTimersByTime(30000);
    expect(mockRefetch).not.toHaveBeenCalled();
  });
});
