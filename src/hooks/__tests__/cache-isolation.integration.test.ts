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

// Mock AWS clients
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

describe('Cache Isolation Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should isolate cache between different organizations', async () => {
    const user1 = 'user-1';
    const user2 = 'user-2';
    const org1 = 'org-1';
    const org2 = 'org-2';
    const org1Data = { costs: 1000 };
    const org2Data = { costs: 2000 };

    // Create separate query clients for each organization
    const queryClient1 = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    const queryClient2 = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    const Wrapper1 = ({ children }: any) =>
      createElement(QueryClientProvider, { client: queryClient1 }, children);

    const Wrapper2 = ({ children }: any) =>
      createElement(QueryClientProvider, { client: queryClient2 }, children);

    // Mock user 1 with org 1
    vi.mocked(cognitoAuth.getCurrentUser).mockResolvedValue({
      id: user1,
      email: 'user1@example.com',
      organizationId: org1,
    });
    vi.mocked(apiClient.rpc).mockResolvedValue({
      data: org1,
      error: null,
    });

    const queryFn1 = vi.fn().mockResolvedValue(org1Data);

    const { result: result1 } = renderHook(
      () => useOrganizationQuery(['cost-data'], queryFn1),
      { wrapper: Wrapper1 }
    );

    await waitFor(() => expect(result1.current.isSuccess).toBe(true));
    expect(result1.current.data).toEqual(org1Data);
    expect(queryFn1).toHaveBeenCalledWith(org1);

    // Switch to user 2 with org 2
    vi.clearAllMocks();
    vi.mocked(cognitoAuth.getCurrentUser).mockResolvedValue({
      id: user2,
      email: 'user2@example.com',
      organizationId: org2,
    });
    vi.mocked(apiClient.rpc).mockResolvedValue({
      data: org2,
      error: null,
    });

    const queryFn2 = vi.fn().mockResolvedValue(org2Data);

    const { result: result2 } = renderHook(
      () => useOrganizationQuery(['cost-data'], queryFn2),
      { wrapper: Wrapper2 }
    );

    await waitFor(() => expect(result2.current.isSuccess).toBe(true));
    expect(result2.current.data).toEqual(org2Data);
    expect(queryFn2).toHaveBeenCalledWith(org2);

    // Verify that the data is different and isolated
    expect(result1.current.data).not.toEqual(result2.current.data);
    expect(queryFn1).toHaveBeenCalledWith(org1);
    expect(queryFn2).toHaveBeenCalledWith(org2);
  });

  it('should maintain separate cache entries for different organizations', async () => {
    const user1 = 'user-1';
    const org1 = 'org-1';
    const org1Data = { costs: 1000 };

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    const wrapper = ({ children }: any) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    vi.mocked(cognitoAuth.getCurrentUser).mockResolvedValue({
      id: user1,
      email: 'user1@example.com',
      organizationId: org1,
    });
    vi.mocked(apiClient.rpc).mockResolvedValue({
      data: org1,
      error: null,
    });

    const queryFn = vi.fn().mockResolvedValue(org1Data);

    const { result } = renderHook(
      () => useOrganizationQuery(['cost-data'], queryFn),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Check that the cache key includes the organization ID
    const cacheData = queryClient.getQueryData(['cost-data', org1]);
    expect(cacheData).toEqual(org1Data);

    // Verify that a different organization key would not have data
    const differentOrgData = queryClient.getQueryData(['cost-data', 'different-org']);
    expect(differentOrgData).toBeUndefined();
  });
});