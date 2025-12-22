/**
 * Unit Tests for Validation Library
 * Tests input sanitization and validation functions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { sanitizeString, validateEmail, validateAwsAccountId } from '../../../backend/src/lib/validation';

describe('Validation Library', () => {
  describe('sanitizeString', () => {
    it('should remove dangerous characters', () => {
      const input = '<script>alert("xss")</script>';
      const result = sanitizeString(input);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).not.toContain('script');
    });

    it('should preserve safe characters', () => {
      const input = 'Hello World 123';
      const result = sanitizeString(input);
      expect(result).toBe(input);
    });

    it('should handle empty strings', () => {
      expect(sanitizeString('')).toBe('');
    });

    it('should handle null and undefined', () => {
      expect(sanitizeString(null as any)).toBe('');
      expect(sanitizeString(undefined as any)).toBe('');
    });

    it('should be idempotent', () => {
      const input = 'Test<script>alert(1)</script>';
      const once = sanitizeString(input);
      const twice = sanitizeString(once);
      expect(once).toBe(twice);
    });
  });

  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'admin+tag@company.org',
      ];

      validEmails.forEach(email => {
        expect(validateEmail(email)).toBe(true);
      });
    });

    it('should reject invalid email addresses', () => {
      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user..name@domain.com',
        'user@domain',
      ];

      invalidEmails.forEach(email => {
        expect(validateEmail(email)).toBe(false);
      });
    });
  });

  describe('validateAwsAccountId', () => {
    it('should validate correct AWS account IDs', () => {
      expect(validateAwsAccountId('123456789012')).toBe(true);
      expect(validateAwsAccountId('000000000000')).toBe(true);
    });

    it('should reject invalid AWS account IDs', () => {
      expect(validateAwsAccountId('12345678901')).toBe(false); // Too short
      expect(validateAwsAccountId('1234567890123')).toBe(false); // Too long
      expect(validateAwsAccountId('12345678901a')).toBe(false); // Contains letter
      expect(validateAwsAccountId('')).toBe(false); // Empty
    });
  });
});