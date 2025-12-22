/**
 * Performance and Load Testing
 * Tests system performance under various load conditions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useKnowledgeBaseAI } from '@/hooks/useKnowledgeBaseAI';
import {
  mockCognitoAuth,
  mockApiClient,
  mockBedrockAI,
  mockUser,
  measurePerformance,
  createMockCostData,
} from '../setup/test-environment';

describe('Performance and Load Testing', () => {
  let queryClient: QueryClient;
  let wrapper: any;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    wrapper = ({ children }: any) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
  });

  describe('Authentication Performance', () => {
    it('should handle rapid authentication requests', async () => {
      const requestCount = 50;
      const requests = Array.from({ length: requestCount }, (_, i) =>
        mockCognitoAuth.signIn(`user${i}@example.com`, 'password123')
      );

      const { duration } = await measurePerformance(async () => {
        const results = await Promise.all(requests);
        return results;
      });

      // Should handle 50 concurrent auth requests within 5 seconds
      expect(duration).toBeLessThan(5000);
      expect(mockCognitoAuth.signIn).toHaveBeenCalledTimes(requestCount);
    });

    it('should maintain performance with session validation', async () => {
      const sessionChecks = Array.from({ length: 100 }, () =>
        mockCognitoAuth.getCurrentSession()
      );

      const { duration } = await measurePerformance(async () => {
        const results = await Promise.all(sessionChecks);
        return results;
      });

      // 100 session checks should complete within 2 seconds
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Database Query Performance', () => {
    it('should handle concurrent database queries efficiently', async () => {
      const queryCount = 25;
      const queries = Array.from({ length: queryCount }, (_, i) =>
        mockApiClient.select('test_table', { eq: { id: i } })
      );

      mockApiClient.select.mockResolvedValue({ data: [], error: null });

      const { duration } = await measurePerformance(async () => {
        const results = await Promise.all(queries);
        return results;
      });

      // 25 concurrent queries should complete within 3 seconds
      expect(duration).toBeLessThan(3000);
      expect(mockApiClient.select).toHaveBeenCalledTimes(queryCount);
    });

    it('should handle large dataset queries', async () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        data: `Large data content for item ${i}`.repeat(10),
      }));

      mockApiClient.select.mockResolvedValue({ data: largeDataset, error: null });

      const { duration } = await measurePerformance(async () => {
        const result = await mockApiClient.select('large_table', {});
        return result;
      });

      // Large dataset query should complete within 1 second
      expect(duration).toBeLessThan(1000);
    });

    it('should handle complex queries with multiple joins', async () => {
      const complexQuery = {
        select: 'users.*, organizations.name, aws_accounts.account_name',
        eq: { 'users.active': true },
        order: { column: 'users.created_at', ascending: false },
        limit: 100,
      };

      mockApiClient.select.mockResolvedValue({ data: [], error: null });

      const { duration } = await measurePerformance(async () => {
        const result = await mockApiClient.select('users', complexQuery);
        return result;
      });

      // Complex query should complete within 2 seconds
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('AI Service Performance', () => {
    it('should handle concurrent AI requests', async () => {
      const aiRequests = Array.from({ length: 10 }, (_, i) =>
        mockBedrockAI.generateQuickResponse(`Test prompt ${i}`)
      );

      mockBedrockAI.generateQuickResponse.mockResolvedValue('AI response');

      const { duration } = await measurePerformance(async () => {
        const results = await Promise.all(aiRequests);
        return results;
      });

      // 10 concurrent AI requests should complete within 15 seconds
      expect(duration).toBeLessThan(15000);
      expect(mockBedrockAI.generateQuickResponse).toHaveBeenCalledTimes(10);
    });

    it('should handle large context AI analysis', async () => {
      const largeContext = createMockCostData({
        services: Array.from({ length: 100 }, (_, i) => ({
          name: `Service-${i}`,
          cost: Math.random() * 1000,
          usage: Math.random() * 100,
          recommendations: `Recommendation for service ${i}`.repeat(5),
        })),
      });

      mockBedrockAI.generateCostOptimization.mockResolvedValue('Comprehensive analysis');

      const { duration } = await measurePerformance(async () => {
        const result = await mockBedrockAI.generateCostOptimization(largeContext);
        return result;
      });

      // Large context analysis should complete within 10 seconds
      expect(duration).toBeLessThan(10000);
    });

    it('should maintain performance with sequential AI calls', async () => {
      const { result } = renderHook(() => useKnowledgeBaseAI());

      mockBedrockAI.generateQuickResponse.mockResolvedValue('tag1, tag2, tag3');
      mockBedrockAI.generateAnalysis.mockResolvedValue('Improved content');

      const { duration } = await measurePerformance(async () => {
        // Sequential AI operations
        const tags = await result.current.suggestTags('Test content');
        const improved = await result.current.improveWriting('Test content');
        const summary = await result.current.generateSummary('Test content');
        
        return { tags, improved, summary };
      });

      // Sequential AI operations should complete within 8 seconds
      expect(duration).toBeLessThan(8000);
    });
  });

  describe('React Query Cache Performance', () => {
    it('should handle rapid cache invalidations', async () => {
      const { result } = renderHook(() => useOrganization(), { wrapper });

      // Wait for initial load
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const invalidations = Array.from({ length: 50 }, () =>
        queryClient.invalidateQueries({ queryKey: ['user-organization'] })
      );

      const { duration } = await measurePerformance(async () => {
        await Promise.all(invalidations);
      });

      // 50 cache invalidations should complete within 1 second
      expect(duration).toBeLessThan(1000);
    });

    it('should handle large cache sizes efficiently', async () => {
      // Populate cache with many entries
      const cacheEntries = Array.from({ length: 1000 }, (_, i) => {
        queryClient.setQueryData([`test-query-${i}`], { data: `test-data-${i}` });
      });

      const { duration } = await measurePerformance(async () => {
        // Perform cache operations
        const results = Array.from({ length: 100 }, (_, i) =>
          queryClient.getQueryData([`test-query-${i}`])
        );
        return results;
      });

      // Cache operations should complete within 500ms
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Memory Usage and Cleanup', () => {
    it('should properly clean up resources', async () => {
      const initialMemory = performance.memory?.usedJSHeapSize || 0;

      // Create and destroy many components
      for (let i = 0; i < 100; i++) {
        const { unmount } = renderHook(() => useOrganization(), { wrapper });
        await waitFor(() => {});
        unmount();
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = performance.memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });

    it('should handle component mount/unmount cycles', async () => {
      const mountCycles = 50;

      const { duration } = await measurePerformance(async () => {
        for (let i = 0; i < mountCycles; i++) {
          const { unmount } = renderHook(() => useOrganization(), { wrapper });
          await waitFor(() => {});
          unmount();
        }
      });

      // 50 mount/unmount cycles should complete within 5 seconds
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('Network Simulation', () => {
    it('should handle slow network conditions', async () => {
      // Simulate slow network by adding delay
      mockApiClient.select.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        return { data: [], error: null };
      });

      const { duration } = await measurePerformance(async () => {
        const { result } = renderHook(() => useOrganization(), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true), {
          timeout: 10000,
        });
        return result.current.data;
      });

      // Should handle slow network within reasonable time
      expect(duration).toBeGreaterThan(2000); // At least as long as the delay
      expect(duration).toBeLessThan(5000); // But not too much longer
    });

    it('should handle intermittent network failures', async () => {
      let callCount = 0;
      mockApiClient.rpc.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Network error');
        }
        return { data: mockUser.organizationId, error: null };
      });

      const { duration } = await measurePerformance(async () => {
        const { result } = renderHook(() => useOrganization(), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true), {
          timeout: 10000,
        });
        return result.current.data;
      });

      // Should eventually succeed despite initial failures
      expect(duration).toBeLessThan(8000);
      expect(callCount).toBeGreaterThan(2);
    });
  });

  describe('Stress Testing', () => {
    it('should handle high-frequency user interactions', async () => {
      const interactions = 200;
      const { result } = renderHook(() => useOrganization(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const { duration } = await measurePerformance(async () => {
        // Simulate rapid refetch calls
        const refetches = Array.from({ length: interactions }, () =>
          result.current.refetch()
        );
        await Promise.all(refetches);
      });

      // Should handle 200 rapid interactions within 10 seconds
      expect(duration).toBeLessThan(10000);
    });

    it('should maintain performance under sustained load', async () => {
      const sustainedDuration = 5000; // 5 seconds
      const startTime = Date.now();
      let operationCount = 0;

      // Run operations continuously for 5 seconds
      while (Date.now() - startTime < sustainedDuration) {
        await mockApiClient.select('test_table', { eq: { id: operationCount } });
        operationCount++;
        
        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Should maintain reasonable throughput
      const operationsPerSecond = operationCount / (sustainedDuration / 1000);
      expect(operationsPerSecond).toBeGreaterThan(50); // At least 50 ops/sec
    });
  });

  describe('Resource Limits', () => {
    it('should handle maximum concurrent connections', async () => {
      const maxConnections = 100;
      const connections = Array.from({ length: maxConnections }, (_, i) =>
        mockApiClient.select('connection_test', { eq: { connection_id: i } })
      );

      mockApiClient.select.mockResolvedValue({ data: [], error: null });

      const { duration } = await measurePerformance(async () => {
        const results = await Promise.all(connections);
        return results;
      });

      // Should handle max connections within reasonable time
      expect(duration).toBeLessThan(15000);
      expect(mockApiClient.select).toHaveBeenCalledTimes(maxConnections);
    });

    it('should handle large payload processing', async () => {
      const largePayload = {
        data: Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          content: 'Large content string '.repeat(100),
          metadata: {
            tags: Array.from({ length: 20 }, (_, j) => `tag-${j}`),
            properties: Object.fromEntries(
              Array.from({ length: 50 }, (_, k) => [`prop-${k}`, `value-${k}`])
            ),
          },
        })),
      };

      mockApiClient.insert.mockResolvedValue({ data: { id: 'large-insert' }, error: null });

      const { duration } = await measurePerformance(async () => {
        const result = await mockApiClient.insert('large_table', largePayload);
        return result;
      });

      // Should handle large payload within 3 seconds
      expect(duration).toBeLessThan(3000);
    });
  });

  describe('Performance Regression Detection', () => {
    it('should detect performance regressions in critical paths', async () => {
      const benchmarks = {
        authentication: 1000, // 1 second
        dataLoading: 2000,    // 2 seconds
        aiGeneration: 5000,   // 5 seconds
      };

      // Test authentication performance
      const authDuration = await measurePerformance(async () => {
        await mockCognitoAuth.signIn('test@example.com', 'password123');
      });

      // Test data loading performance
      const dataDuration = await measurePerformance(async () => {
        const { result } = renderHook(() => useOrganization(), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
      });

      // Test AI generation performance
      const aiDuration = await measurePerformance(async () => {
        await mockBedrockAI.generateAnalysis('Test prompt');
      });

      // Check against benchmarks
      expect(authDuration.duration).toBeLessThan(benchmarks.authentication);
      expect(dataDuration.duration).toBeLessThan(benchmarks.dataLoading);
      expect(aiDuration.duration).toBeLessThan(benchmarks.aiGeneration);

      // Log performance metrics for monitoring
      console.log('Performance Metrics:', {
        authentication: `${authDuration.duration}ms`,
        dataLoading: `${dataDuration.duration}ms`,
        aiGeneration: `${aiDuration.duration}ms`,
      });
    });
  });
});