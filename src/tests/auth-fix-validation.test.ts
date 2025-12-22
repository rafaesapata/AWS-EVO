/**
 * Teste de validação das correções de autenticação
 * Verifica se o erro "Maximum call stack size exceeded" foi corrigido
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cognitoAuth } from '@/integrations/aws/cognito-client-simple';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock fetch
global.fetch = vi.fn();

describe('Auth System - Stack Overflow Fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  it('should not cause stack overflow with invalid credentials', async () => {
    const startTime = Date.now();
    
    await expect(cognitoAuth.signIn('invalid-user', 'invalid-password')).rejects.toThrow();
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Should fail quickly (< 1 second) without stack overflow
    expect(duration).toBeLessThan(1000);
    
    try {
      await cognitoAuth.signIn('invalid-user', 'invalid-password');
    } catch (error: any) {
      expect(error.message).toContain('Credenciais inválidas');
      expect(error.message).not.toContain('Maximum call stack');
    }
  });

  it('should successfully authenticate with valid fallback credentials', async () => {
    const result = await cognitoAuth.signIn('admin-user', 'AdminPass123!');
    
    expect(result).toBeDefined();
    expect('user' in result).toBe(true);
    
    if ('user' in result) {
      expect(result.user.email).toContain('admin-user');
      expect(result.accessToken).toBeDefined();
      expect(result.idToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    }
  });

  it('should handle multiple rapid login attempts without recursion', async () => {
    const promises = Array.from({ length: 5 }, async () => {
      try {
        await cognitoAuth.signIn('invalid-user', 'invalid-password');
        return null; // Should not reach here
      } catch (error) {
        return error;
      }
    });
    
    const results = await Promise.all(promises);
    
    // All should fail with proper error messages, not stack overflow
    results.forEach(result => {
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toContain('Credenciais inválidas');
      expect((result as Error).message).not.toContain('Maximum call stack');
    });
  });

  it('should properly validate token expiration', async () => {
    // Mock an expired token
    const expiredSession = {
      user: { id: 'test', email: 'test@test.com', attributes: {} },
      accessToken: 'header.eyJleHAiOjE2MDAwMDAwMDB9.signature', // Expired timestamp
      idToken: 'header.eyJleHAiOjE2MDAwMDAwMDB9.signature',
      refreshToken: 'refresh-token'
    };
    
    localStorageMock.getItem.mockReturnValue(JSON.stringify(expiredSession));
    
    const user = await cognitoAuth.getCurrentUser();
    expect(user).toBeNull();
    
    // Should have cleared the expired session
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('evo-auth');
  });

  it('should generate valid mock tokens', async () => {
    const result = await cognitoAuth.signIn('admin-user', 'AdminPass123!');
    
    if ('user' in result) {
      const token = result.accessToken;
      const parts = token.split('.');
      
      expect(parts).toHaveLength(3); // JWT format: header.payload.signature
      
      // Decode payload
      const payload = JSON.parse(atob(parts[1]));
      expect(payload.sub).toBe('admin-user-id');
      expect(payload.email).toContain('admin-user');
      expect(payload.exp).toBeGreaterThan(Date.now() / 1000);
    }
  });
});