import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCacheInvalidation } from '../useCacheInvalidation';
import { cognitoAuth } from '@/integrations/aws/cognito-client-simple';
import { apiClient } from '@/integrations/aws/api-client';
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

vi.mock('@/integrations/aws/cognito-client-simple', () => ({
  cognitoAuth: {
    getCurrentUser: vi.fn(),
  },
}));

vi.mock('@/integrations/aws/api-client', () => ({
  apiClient: {
    rpc: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  
  const wrapper = ({ children }: any) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  
  return { wrapper, queryClient };
};

describe('useCacheInvalidation', () => {
  const mockOrgId = 'test-org-123';
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cognitoAuth.getCurrentUser).mockResolvedValue({
      username: 'test-user',
      organizationId: mockOrgId,
    } as any);
    vi.mocked(apiClient.rpc).mockResolvedValue({ data: mockOrgId, error: null });
  });

  it('should invalidate organization-specific queries', async () => {

    vi.mocked(cognitoAuth.getCurrentUser).mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      organizationId: mockOrgId,
    });

    vi.mocked(apiClient.rpc).mockResolvedValue({
      data: mockOrgId,
      error: null,
    });

    const { wrapper, queryClient } = createWrapper();

    queryClient.setQueryData(['test-data', mockOrgId], { data: 'old' });

    const { result } = renderHook(() => useCacheInvalidation(), { wrapper });

    await waitFor(() => expect(result.current.invalidateOrganizationQuery).toBeDefined());

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await result.current.invalidateOrganizationQuery(['test-data']);

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['test-data', mockOrgId],
      exact: false,
    });
  });

  it('should not invalidate when organization ID is not available', async () => {
    vi.mocked(cognitoAuth.getCurrentUser).mockResolvedValue(null);

    const { wrapper, queryClient } = createWrapper();

    const { result } = renderHook(() => useCacheInvalidation(), { wrapper });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await result.current.invalidateOrganizationQuery(['test-data']);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Cannot invalidate cache: Organization ID not available'
    );
    expect(invalidateSpy).not.toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });
});
