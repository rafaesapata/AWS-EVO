/**
 * Property Test: Token Encryption Round-Trip (Property 3)
 * 
 * Validates Requirements 2.5, 3.1, 3.5:
 * - Refresh tokens are encrypted before storage
 * - Tokens can be decrypted correctly
 * - Encryption uses AES-256-GCM
 * 
 * Property: For any valid refresh_token string, encrypting then decrypting
 * SHALL produce the original token value unchanged.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  encryptToken,
  decryptToken,
  serializeEncryptedToken,
  deserializeEncryptedToken,
  generateEncryptionKey,
  rotateTokenKey,
  EncryptedToken,
} from '../../src/lib/token-encryption.js';

describe('Property 3: Token Encryption Round-Trip', () => {
  beforeAll(() => {
    // Set up test encryption key
    const testKey = generateEncryptionKey();
    process.env.TOKEN_ENCRYPTION_KEY = testKey;
    
    // Set up a second key for rotation tests
    const testKey2 = generateEncryptionKey();
    process.env.TOKEN_ENCRYPTION_KEY_V2 = testKey2;
  });

  describe('Encryption Round-Trip', () => {
    it('should encrypt and decrypt a simple token', () => {
      const originalToken = 'test-refresh-token-12345';
      
      const encrypted = encryptToken(originalToken);
      const decrypted = decryptToken(encrypted);
      
      expect(decrypted).toBe(originalToken);
    });

    it('should encrypt and decrypt a long token', () => {
      // Azure refresh tokens can be quite long
      const originalToken = 'a'.repeat(2000);
      
      const encrypted = encryptToken(originalToken);
      const decrypted = decryptToken(encrypted);
      
      expect(decrypted).toBe(originalToken);
    });

    it('should encrypt and decrypt tokens with special characters', () => {
      const originalToken = 'token-with-special-chars!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
      
      const encrypted = encryptToken(originalToken);
      const decrypted = decryptToken(encrypted);
      
      expect(decrypted).toBe(originalToken);
    });

    it('should encrypt and decrypt tokens with unicode characters', () => {
      const originalToken = 'token-with-unicode-🔐🔑🛡️-日本語-中文';
      
      const encrypted = encryptToken(originalToken);
      const decrypted = decryptToken(encrypted);
      
      expect(decrypted).toBe(originalToken);
    });

    it('should produce different ciphertext for same token (due to random IV)', () => {
      const originalToken = 'same-token-encrypted-twice';
      
      const encrypted1 = encryptToken(originalToken);
      const encrypted2 = encryptToken(originalToken);
      
      // Ciphertext should be different due to random IV
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      
      // But both should decrypt to the same value
      expect(decryptToken(encrypted1)).toBe(originalToken);
      expect(decryptToken(encrypted2)).toBe(originalToken);
    });
  });

  describe('Encrypted Token Structure', () => {
    it('should produce valid encrypted token structure', () => {
      const encrypted = encryptToken('test-token');
      
      expect(encrypted).toHaveProperty('ciphertext');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('tag');
      expect(encrypted).toHaveProperty('keyId');
      
      // All values should be base64 encoded strings
      expect(typeof encrypted.ciphertext).toBe('string');
      expect(typeof encrypted.iv).toBe('string');
      expect(typeof encrypted.tag).toBe('string');
      expect(typeof encrypted.keyId).toBe('string');
      
      // IV should be 12 bytes (16 chars in base64)
      expect(Buffer.from(encrypted.iv, 'base64').length).toBe(12);
      
      // Auth tag should be 16 bytes
      expect(Buffer.from(encrypted.tag, 'base64').length).toBe(16);
    });

    it('should use specified keyId', () => {
      const encrypted = encryptToken('test-token', 'v1');
      expect(encrypted.keyId).toBe('v1');
    });
  });

  describe('Serialization', () => {
    it('should serialize and deserialize encrypted token', () => {
      const originalToken = 'test-token-for-serialization';
      const encrypted = encryptToken(originalToken);
      
      const serialized = serializeEncryptedToken(encrypted);
      const deserialized = deserializeEncryptedToken(serialized);
      
      expect(deserialized.ciphertext).toBe(encrypted.ciphertext);
      expect(deserialized.iv).toBe(encrypted.iv);
      expect(deserialized.tag).toBe(encrypted.tag);
      expect(deserialized.keyId).toBe(encrypted.keyId);
      
      // Should still decrypt correctly
      const decrypted = decryptToken(deserialized);
      expect(decrypted).toBe(originalToken);
    });

    it('should throw on invalid serialized format', () => {
      expect(() => deserializeEncryptedToken('not-json')).toThrow();
      expect(() => deserializeEncryptedToken('{}')).toThrow();
      expect(() => deserializeEncryptedToken('{"ciphertext":"a"}')).toThrow();
    });
  });

  describe('Key Rotation', () => {
    it('should rotate token to new key', () => {
      const originalToken = 'token-to-rotate';
      
      // Encrypt with v1 key
      const encryptedV1 = encryptToken(originalToken, 'v1');
      expect(encryptedV1.keyId).toBe('v1');
      
      // Rotate to v2 key
      const encryptedV2 = rotateTokenKey(encryptedV1, 'v2');
      expect(encryptedV2.keyId).toBe('v2');
      
      // Should decrypt correctly with new key
      const decrypted = decryptToken(encryptedV2);
      expect(decrypted).toBe(originalToken);
    });
  });

  describe('Error Handling', () => {
    it('should throw on empty token', () => {
      expect(() => encryptToken('')).toThrow('Token cannot be empty');
    });

    it('should throw on tampered ciphertext', () => {
      const encrypted = encryptToken('test-token');
      
      // Tamper with ciphertext
      const tamperedCiphertext = Buffer.from(encrypted.ciphertext, 'base64');
      tamperedCiphertext[0] ^= 0xFF; // Flip bits
      encrypted.ciphertext = tamperedCiphertext.toString('base64');
      
      expect(() => decryptToken(encrypted)).toThrow();
    });

    it('should throw on tampered auth tag', () => {
      const encrypted = encryptToken('test-token');
      
      // Tamper with auth tag
      const tamperedTag = Buffer.from(encrypted.tag, 'base64');
      tamperedTag[0] ^= 0xFF;
      encrypted.tag = tamperedTag.toString('base64');
      
      expect(() => decryptToken(encrypted)).toThrow();
    });

    it('should throw on invalid encrypted token structure', () => {
      expect(() => decryptToken(null as any)).toThrow();
      expect(() => decryptToken({} as any)).toThrow();
      expect(() => decryptToken({ ciphertext: 'a' } as any)).toThrow();
    });
  });

  describe('Property-Based Tests', () => {
    // Generate random tokens of various lengths
    const generateRandomToken = (length: number): string => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      let result = '';
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };

    it('should maintain round-trip property for 100 random tokens', () => {
      for (let i = 0; i < 100; i++) {
        const length = Math.floor(Math.random() * 1000) + 1; // 1-1000 chars
        const originalToken = generateRandomToken(length);
        
        const encrypted = encryptToken(originalToken);
        const decrypted = decryptToken(encrypted);
        
        expect(decrypted).toBe(originalToken);
      }
    });

    it('should produce unique ciphertexts for 100 encryptions of same token', () => {
      const token = 'same-token-for-uniqueness-test';
      const ciphertexts = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        const encrypted = encryptToken(token);
        ciphertexts.add(encrypted.ciphertext);
      }
      
      // All ciphertexts should be unique (due to random IV)
      expect(ciphertexts.size).toBe(100);
    });
  });
});
