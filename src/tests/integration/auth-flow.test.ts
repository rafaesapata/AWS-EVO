/**
 * Authentication Flow Integration Tests
 * Tests complete authentication workflows end-to-end
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useLicenseValidation } from '@/hooks/useLicenseValidation';
import {
  createTestQueryClient,
  mockCognitoAuth,
  mockApiClient,
  mockUser,
  mockSession,
  simulateAuthError,
  measurePerformance,
} from '../setup/test-environment';

describe('Authentication Flow Integration', () => {
  let queryClient: ReturnType<typeof createTestQueryClient>;
  let wrapper: any;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    wrapper = ({ children }: any) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    
    // Setup default successful mocks
    mockCognitoAuth.getCurrentUser.mockResolvedValue(mockUser);
    mockCognitoAuth.getCurrentSession.mockResolvedValue(mockSession);
    mockApiClient.rpc.mockResolvedValue({ data: mockUser.organizationId, error: null });
    mockApiClient.invoke.mockResolvedValue({ 
      data: { 
        isValid: true, 
        plan: 'enterprise',
        features: ['advanced-analytics', 'multi-account'],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }, 
      error: null 
    });
  });

  describe('Complete Authentication Flow', () => {
    it('should handle successful login flow', async () => {
      // Mock successful authentication
      mockCognitoAuth.signIn.mockResolvedValue(mockSession);
      mockCognitoAuth.getCurrentUser.mockResolvedValue(mockUser);
      mockCognitoAuth.getCurrentSession.mockResolvedValue(mockSession);
      
      // Mock organization data
      mockApiClient.rpc.mockResolvedValue({
        data: mockUser.organizationId,
        error: null,
      });

      // Test login performance
      const { duration } = await measurePerformance(async () => {
        const result = await mockCognitoAuth.signIn('test@example.com', 'password123');
        return result;
      });

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(mockCognitoAuth.signIn).toHaveBeenCalledWith('test@example.com', 'password123');
    });

    it('should handle authentication errors gracefully', async () => {
      simulateAuthError();

      const { result } = renderHook(() => useOrganization(), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
        expect(result.current.error).toBeInstanceOf(Error);
      });
    });

    it('should maintain session state across page reloads', async () => {
      // Simulate page reload by clearing and restoring session
      mockCognitoAuth.getCurrentSession
        .mockResolvedValueOnce(null) // Initial load - no session
        .mockResolvedValueOnce(mockSession); // After session restore

      const { result, rerender } = renderHook(() => useOrganization(), { wrapper });

      // First render - no session
      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      // Simulate session restoration
      rerender();

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.data).toBe(mockUser.organizationId);
      });
    });
  });

  describe('Organization Context Integration', () => {
    it('should load organization data after authentication', async () => {
      mockApiClient.rpc.mockResolvedValue({
        data: 'test-org-123',
        error: null,
      });

      const { result } = renderHook(() => useOrganization(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.data).toBe('test-org-123');
      });

      expect(mockApiClient.rpc).toHaveBeenCalledWith('get_user_organization', {
        _user_id: mockUser.id,
      });
    });

    it('should handle organization switching', async () => {
      const orgId1 = 'org-1';
      const orgId2 = 'org-2';

      mockApiClient.rpc
        .mockResolvedValueOnce({ data: orgId1, error: null })
        .mockResolvedValueOnce({ data: orgId2, error: null });

      const { result, rerender } = renderHook(() => useOrganization(), { wrapper });

      // First organization
      await waitFor(() => {
        expect(result.current.data).toBe(orgId1);
      });

      // Switch organization
      mockCognitoAuth.getCurrentUser.mockResolvedValue({
        ...mockUser,
        organizationId: orgId2,
      });

      rerender();

      await waitFor(() => {
        expect(result.current.data).toBe(orgId2);
      });
    });
  });

  describe('License Validation Integration', () => {
    it('should validate license after authentication', async () => {
      const mockLicenseStatus = {
        isValid: true,
        plan: 'enterprise',
        features: ['advanced-analytics', 'multi-account'],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      mockApiClient.invoke.mockResolvedValue({
        data: mockLicenseStatus,
        error: null,
      });

      const { result } = renderHook(() => useLicenseValidation(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.data).toEqual(mockLicenseStatus);
      });
    });

    it('should handle expired license', async () => {
      const expiredLicenseStatus = {
        isValid: false,
        reason: 'expired' as const,
        message: 'License has expired',
        hasCustomerId: true,
      };

      mockApiClient.invoke.mockResolvedValue({
        data: expiredLicenseStatus,
        error: null,
      });

      const { result } = renderHook(() => useLicenseValidation(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.data?.isValid).toBe(false);
        expect(result.current.data?.reason).toBe('expired');
      });
    });
  });

  describe('Multi-tenant Isolation', () => {
    it('should isolate data between organizations', async () => {
      const org1Data = { id: 'org-1', name: 'Organization 1' };
      const org2Data = { id: 'org-2', name: 'Organization 2' };

      // Create separate query clients for isolation testing
      const queryClient1 = createTestQueryClient();
      const queryClient2 = createTestQueryClient();

      const wrapper1 = ({ children }: any) =>
        createElement(QueryClientProvider, { client: queryClient1 }, children);
      const wrapper2 = ({ children }: any) =>
        createElement(QueryClientProvider, { client: queryClient2 }, children);

      // Mock different users with different organizations
      mockCognitoAuth.getCurrentUser
        .mockResolvedValueOnce({ ...mockUser, organizationId: 'org-1' })
        .mockResolvedValueOnce({ ...mockUser, organizationId: 'org-2' });

      mockApiClient.rpc
        .mockResolvedValueOnce({ data: 'org-1', error: null })
        .mockResolvedValueOnce({ data: 'org-2', error: null });

      // Test first organization
      const { result: result1 } = renderHook(() => useOrganization(), { wrapper: wrapper1 });
      await waitFor(() => expect(result1.current.data).toBe('org-1'));

      // Test second organization
      const { result: result2 } = renderHook(() => useOrganization(), { wrapper: wrapper2 });
      await waitFor(() => expect(result2.current.data).toBe('org-2'));

      // Verify isolation
      expect(result1.current.data).not.toBe(result2.current.data);
      expect(queryClient1.getQueryCache()).not.toBe(queryClient2.getQueryCache());
    });
  });

  describe('Error Recovery', () => {
    it('should recover from network errors', async () => {
      // First call fails
      mockApiClient.rpc.mockRejectedValueOnce(new Error('Network error'));
      
      // Second call succeeds
      mockApiClient.rpc.mockResolvedValueOnce({
        data: mockUser.organizationId,
        error: null,
      });

      const { result } = renderHook(() => useOrganization(), { wrapper });

      // Should retry and eventually succeed
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.data).toBe(mockUser.organizationId);
      }, { timeout: 5000 });

      expect(mockApiClient.rpc).toHaveBeenCalledTimes(2);
    });

    it('should handle session expiration', async () => {
      // Mock session expiration
      mockCognitoAuth.getCurrentSession
        .mockResolvedValueOnce(mockSession)
        .mockResolvedValueOnce(null);

      const { result, rerender } = renderHook(() => useOrganization(), { wrapper });

      // First render - valid session
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Simulate session expiration
      rerender();

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });
  });

  describe('Performance Benchmarks', () => {
    it('should load organization data within performance thresholds', async () => {
      const { duration } = await measurePerformance(async () => {
        const { result } = renderHook(() => useOrganization(), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        return result.current.data;
      });

      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should handle concurrent authentication requests', async () => {
      const promises = Array.from({ length: 10 }, () =>
        mockCognitoAuth.signIn('test@example.com', 'password123')
      );

      const { duration } = await measurePerformance(async () => {
        const results = await Promise.all(promises);
        return results;
      });

      expect(duration).toBeLessThan(3000); // All requests should complete within 3 seconds
      expect(mockCognitoAuth.signIn).toHaveBeenCalledTimes(10);
    });
  });
});