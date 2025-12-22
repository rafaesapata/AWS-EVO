import { describe, it, expect, vi } from 'vitest';
import { debounce, validateRoleArn, extractAccountIdFromArn, validateCloudFormationAccount } from '../wizardValidation';
import { apiClient } from '@/integrations/aws/api-client';

vi.mock('@/integrations/aws/api-client');

describe('wizardValidation', () => {
  describe('validateRoleArn', () => {
    it('should validate correct ARN format', () => {
      const result = validateRoleArn('arn:aws:iam::123456789012:role/EVOPlatformRole');
      expect(result.isValid).toBe(true);
    });

    it('should validate ARN with path', () => {
      const result = validateRoleArn('arn:aws:iam::123456789012:role/custom/path/EVOPlatformRole');
      expect(result.isValid).toBe(true);
    });

    it('should reject empty ARN', () => {
      const result = validateRoleArn('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Role ARN is required');
    });

    it('should reject invalid ARN format', () => {
      const result = validateRoleArn('invalid-arn');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid Role ARN format');
    });

    it('should reject ARN with wrong account ID length', () => {
      const result = validateRoleArn('arn:aws:iam::12345:role/EVOPlatformRole');
      expect(result.isValid).toBe(false);
    });
  });

  describe('extractAccountIdFromArn', () => {
    it('should extract account ID from valid ARN', () => {
      const accountId = extractAccountIdFromArn('arn:aws:iam::123456789012:role/EVOPlatformRole');
      expect(accountId).toBe('123456789012');
    });

    it('should extract account ID from ARN with path', () => {
      const accountId = extractAccountIdFromArn('arn:aws:iam::987654321098:role/path/to/Role');
      expect(accountId).toBe('987654321098');
    });

    it('should return null for invalid ARN', () => {
      const accountId = extractAccountIdFromArn('invalid-arn');
      expect(accountId).toBeNull();
    });

    it('should return null for empty string', () => {
      const accountId = extractAccountIdFromArn('');
      expect(accountId).toBeNull();
    });
  });

  describe('validateCloudFormationAccount', () => {
    it('should validate CloudFormation account successfully', async () => {
      vi.mocked(apiClient.invoke).mockResolvedValueOnce({
        data: { isValid: true, accountId: '123456789012' },
        error: null,
      });

      const result = await validateCloudFormationAccount('test-account-id');
      
      expect(result.isValid).toBe(true);
      expect(result.accountDetails?.accountId).toBe('123456789012');
    });

    it('should handle validation errors', async () => {
      vi.mocked(apiClient.invoke).mockResolvedValueOnce({
        data: { isValid: false, error: 'Failed to assume role' },
        error: null,
      });

      const result = await validateCloudFormationAccount('test-account-id');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Failed to assume role');
    });

    it('should handle network errors', async () => {
      vi.mocked(apiClient.invoke).mockResolvedValueOnce({
        data: null,
        error: { message: 'Network error' },
      });

      const result = await validateCloudFormationAccount('test-account-id');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('debounce', () => {
    it('should debounce function calls', async () => {
      const mockFn = vi.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn('arg1');
      debouncedFn('arg2');
      debouncedFn('arg3');

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith('arg3');
    });
  });
});
