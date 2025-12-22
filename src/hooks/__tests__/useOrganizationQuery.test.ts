import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useOrganizationQuery } from '../useOrganizationQuery';
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
  
  return ({ children }: any) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useOrganizationQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should include organization ID in query key', async () => {
    const mockUserId = 'user-123';
    const mockOrgId = 'org-456';
    const mockData = { test: 'data' };

    vi.mocked(cognitoAuth.getCurrentUser).mockResolvedValue({
      id: mockUserId,
      email: 'test@example.com',
      organizationId: mockOrgId,
    });

    vi.mocked(apiClient.rpc).mockResolvedValue({
      data: mockOrgId,
      error: null,
    });

    const mockQueryFn = vi.fn().mockResolvedValue(mockData);

    const { result } = renderHook(
      () => useOrganizationQuery(['test-query'], mockQueryFn),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockData);
    expect(mockQueryFn).toHaveBeenCalledWith(mockOrgId);
  });

  it('should not execute query when organization ID is not available', async () => {
    vi.mocked(cognitoAuth.getCurrentUser).mockResolvedValue(null);

    const mockQueryFn = vi.fn();

    const { result } = renderHook(
      () => useOrganizationQuery(['test-query'], mockQueryFn),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mockQueryFn).not.toHaveBeenCalled();
  });
});
