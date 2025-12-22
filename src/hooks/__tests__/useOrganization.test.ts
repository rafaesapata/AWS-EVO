import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useOrganization } from '../useOrganization';
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

describe('useOrganization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return organization ID for authenticated user', async () => {
    const mockUserId = 'user-123';
    const mockOrgId = 'org-456';

    vi.mocked(cognitoAuth.getCurrentUser).mockResolvedValue({
      id: mockUserId,
      email: 'test@example.com',
      organizationId: mockOrgId,
    });

    vi.mocked(apiClient.rpc).mockResolvedValue({
      data: mockOrgId,
      error: null,
    });

    const { result } = renderHook(() => useOrganization(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBe(mockOrgId);
    expect(cognitoAuth.getCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('should throw error when user is not authenticated', async () => {
    vi.mocked(cognitoAuth.getCurrentUser).mockResolvedValue(null);

    const { result } = renderHook(() => useOrganization(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Not authenticated');
  });

  it('should throw error when user has no organization', async () => {
    const mockUserId = 'user-123';

    vi.mocked(cognitoAuth.getCurrentUser).mockResolvedValue({
      id: mockUserId,
      email: 'test@example.com',
    });

    vi.mocked(apiClient.rpc).mockResolvedValue({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useOrganization(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('User has no organization');
  });
});
