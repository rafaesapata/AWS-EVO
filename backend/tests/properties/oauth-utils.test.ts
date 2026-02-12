/**
 * Property Tests: OAuth Utilities
 * 
 * Property 1: State Parameter Uniqueness
 * Validates Requirements 1.3, 2.1
 * For any set of OAuth initiations, all generated state parameters SHALL be
 * unique and have at least 256 bits of entropy.
 * 
 * Property 2: PKCE Code Challenge Correctness
 * Validates Requirements 1.2, 2.4, 8.1
 * For any code_verifier of at least 43 characters, the code_challenge SHALL
 * equal the base64url-encoded SHA256 hash of the code_verifier.
 */

import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';
import {
  generateState,
  generatePKCE,
  verifyPKCE,
  buildAuthorizationUrl,
  isStateValid,
  calculateStateExpiration,
  isRedirectUriAllowed,
} from '../../src/lib/oauth-utils.js';

describe('Property 1: State Parameter Uniqueness', () => {
  describe('Entropy', () => {
    it('should generate state with at least 256 bits of entropy', () => {
      const state = generateState();
      
      // Base64url encoding: 4 chars = 3 bytes = 24 bits
      // 256 bits = 32 bytes = ~43 chars in base64url
      // Our implementation uses 32 bytes = 256 bits
      const stateBytes = Buffer.from(state, 'base64url');
      expect(stateBytes.length).toBeGreaterThanOrEqual(32);
    });

    it('should generate URL-safe state', () => {
      const state = generateState();
      
      // Should only contain URL-safe characters
      expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('Uniqueness', () => {
    it('should generate unique states for 1000 calls', () => {
      const states = new Set<string>();
      
      for (let i = 0; i < 1000; i++) {
        const state = generateState();
        states.add(state);
      }
      
      // All states should be unique
      expect(states.size).toBe(1000);
    });

    it('should generate states with high randomness', () => {
      const states: string[] = [];
      
      for (let i = 0; i < 100; i++) {
        states.push(generateState());
      }
      
      // Check that states don't share common prefixes (would indicate weak randomness)
      const prefixes = new Set(states.map(s => s.substring(0, 4)));
      expect(prefixes.size).toBeGreaterThan(90); // At least 90% unique prefixes
    });
  });
});

describe('Property 2: PKCE Code Challenge Correctness', () => {
  describe('Code Verifier Generation', () => {
    it('should generate code_verifier with at least 43 characters', () => {
      const { codeVerifier } = generatePKCE();
      
      // RFC 7636 requires 43-128 characters
      expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(codeVerifier.length).toBeLessThanOrEqual(128);
    });

    it('should generate URL-safe code_verifier', () => {
      const { codeVerifier } = generatePKCE();
      
      // Should only contain unreserved characters per RFC 7636
      expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('Code Challenge Calculation', () => {
    it('should calculate code_challenge as SHA256 of code_verifier', () => {
      const { codeVerifier, codeChallenge } = generatePKCE();
      
      // Manually calculate expected challenge
      const hash = crypto.createHash('sha256');
      hash.update(codeVerifier);
      const expectedChallenge = hash.digest('base64url');
      
      expect(codeChallenge).toBe(expectedChallenge);
    });

    it('should verify PKCE correctly', () => {
      const { codeVerifier, codeChallenge } = generatePKCE();
      
      expect(verifyPKCE(codeVerifier, codeChallenge)).toBe(true);
    });

    it('should reject incorrect code_verifier', () => {
      const { codeChallenge } = generatePKCE();
      const wrongVerifier = 'wrong-verifier-that-does-not-match';
      
      expect(verifyPKCE(wrongVerifier, codeChallenge)).toBe(false);
    });

    it('should reject tampered code_challenge', () => {
      const { codeVerifier, codeChallenge } = generatePKCE();
      const tamperedChallenge = codeChallenge.slice(0, -1) + 'X';
      
      expect(verifyPKCE(codeVerifier, tamperedChallenge)).toBe(false);
    });
  });

  describe('Property-Based Tests', () => {
    it('should maintain PKCE correctness for 100 generations', () => {
      for (let i = 0; i < 100; i++) {
        const { codeVerifier, codeChallenge } = generatePKCE();
        
        // Property: challenge = base64url(sha256(verifier))
        const hash = crypto.createHash('sha256');
        hash.update(codeVerifier);
        const expectedChallenge = hash.digest('base64url');
        
        expect(codeChallenge).toBe(expectedChallenge);
        expect(verifyPKCE(codeVerifier, codeChallenge)).toBe(true);
      }
    });

    it('should generate unique PKCE values for 100 calls', () => {
      const verifiers = new Set<string>();
      const challenges = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        const { codeVerifier, codeChallenge } = generatePKCE();
        verifiers.add(codeVerifier);
        challenges.add(codeChallenge);
      }
      
      // All values should be unique
      expect(verifiers.size).toBe(100);
      expect(challenges.size).toBe(100);
    });
  });
});

describe('Authorization URL Building', () => {
  const config = {
    clientId: 'test-client-id',
    redirectUri: 'https://example.com/callback',
  };

  it('should build valid authorization URL', () => {
    const state = generateState();
    const { codeChallenge } = generatePKCE();
    
    const url = buildAuthorizationUrl(config, state, codeChallenge);
    
    expect(url).toContain('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    expect(url).toContain(`client_id=${config.clientId}`);
    expect(url).toContain(`redirect_uri=${encodeURIComponent(config.redirectUri)}`);
    expect(url).toContain(`state=${state}`);
    expect(url).toContain(`code_challenge=${codeChallenge}`);
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('response_type=code');
  });

  it('should use specified tenant ID', () => {
    const configWithTenant = {
      ...config,
      tenantId: 'specific-tenant-id',
    };
    
    const url = buildAuthorizationUrl(configWithTenant, 'state', 'challenge');
    
    expect(url).toContain('https://login.microsoftonline.com/specific-tenant-id/oauth2/v2.0/authorize');
  });

  it('should include default scopes', () => {
    const url = buildAuthorizationUrl(config, 'state', 'challenge');
    
    expect(url).toContain('scope=');
    expect(url).toContain('management.azure.com');
    expect(url).toContain('offline_access');
  });

  it('should include custom scopes', () => {
    const customScopes = ['custom.scope.one', 'custom.scope.two'];
    const url = buildAuthorizationUrl(config, 'state', 'challenge', customScopes);
    
    expect(url).toContain('custom.scope.one');
    expect(url).toContain('custom.scope.two');
  });
});

describe('State Expiration', () => {
  it('should validate non-expired state', () => {
    const createdAt = new Date();
    
    expect(isStateValid(createdAt, 10)).toBe(true);
  });

  it('should invalidate expired state', () => {
    const createdAt = new Date(Date.now() - 11 * 60 * 1000); // 11 minutes ago
    
    expect(isStateValid(createdAt, 10)).toBe(false);
  });

  it('should validate state at exactly max age', () => {
    const createdAt = new Date(Date.now() - 10 * 60 * 1000); // Exactly 10 minutes ago
    
    expect(isStateValid(createdAt, 10)).toBe(true);
  });

  it('should calculate correct expiration time', () => {
    const before = Date.now();
    const expiration = calculateStateExpiration(10);
    const after = Date.now();
    
    const expectedMin = before + 10 * 60 * 1000;
    const expectedMax = after + 10 * 60 * 1000;
    
    expect(expiration.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(expiration.getTime()).toBeLessThanOrEqual(expectedMax);
  });
});

describe('Redirect URI Validation', () => {
  const allowedUris = [
    'https://evo.nuevacore.com/azure/callback',
    'http://localhost:5173/azure/callback',
  ];

  it('should allow whitelisted URIs', () => {
    expect(isRedirectUriAllowed('https://evo.nuevacore.com/azure/callback', allowedUris)).toBe(true);
    expect(isRedirectUriAllowed('http://localhost:5173/azure/callback', allowedUris)).toBe(true);
  });

  it('should reject non-whitelisted URIs', () => {
    expect(isRedirectUriAllowed('https://evil.com/callback', allowedUris)).toBe(false);
    expect(isRedirectUriAllowed('https://evo.nuevacore.com/other/callback', allowedUris)).toBe(false);
  });

  it('should reject similar but different URIs', () => {
    // Trailing slash difference
    expect(isRedirectUriAllowed('https://evo.nuevacore.com/azure/callback/', allowedUris)).toBe(false);
    
    // Protocol difference
    expect(isRedirectUriAllowed('http://evo.nuevacore.com/azure/callback', allowedUris)).toBe(false);
    
    // Case difference
    expect(isRedirectUriAllowed('https://EVO.NUEVACORE.COM/azure/callback', allowedUris)).toBe(false);
  });
});
