/**
 * Property Test: Provider Routing Correctness (Property 4)
 * 
 * Validates Requirements 3.2, 8.4, 8.5
 * 
 * This test ensures that the CloudProviderFactory correctly routes
 * to the appropriate provider based on credential type.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CloudProviderFactory,
  AWSProvider,
  AzureProvider,
  detectProvider,
} from '../../src/lib/cloud-provider/index.js';
import type {
  AWSCredentialFields,
  AzureCredentialFields,
  CloudProviderType,
} from '../../src/types/cloud.js';
import { CloudProviderError } from '../../src/types/cloud.js';

describe('Property 4: Provider Routing Correctness', () => {
  beforeEach(() => {
    // Clear cache before each test
    CloudProviderFactory.clearCache();
  });

  afterEach(() => {
    CloudProviderFactory.clearCache();
  });

  describe('Provider Detection', () => {
    it('should detect AWS credentials with access keys', () => {
      const awsCreds: AWSCredentialFields = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };

      const detected = detectProvider(awsCreds);
      expect(detected).toBe('AWS');
    });

    it('should detect AWS credentials with role ARN', () => {
      const awsCreds: AWSCredentialFields = {
        roleArn: 'arn:aws:iam::123456789012:role/MyRole',
        externalId: 'external-id-123',
      };

      const detected = detectProvider(awsCreds);
      expect(detected).toBe('AWS');
    });

    it('should detect Azure credentials', () => {
      const azureCreds: AzureCredentialFields = {
        tenantId: 'tenant-id-123',
        clientId: 'client-id-456',
        clientSecret: 'client-secret-789',
        subscriptionId: 'subscription-id-abc',
      };

      const detected = detectProvider(azureCreds);
      expect(detected).toBe('AZURE');
    });

    it('should throw error for unrecognized credentials', () => {
      const invalidCreds = {
        someField: 'value',
        anotherField: 'value2',
      };

      expect(() => detectProvider(invalidCreds as any)).toThrow(CloudProviderError);
    });
  });

  describe('Provider Factory', () => {
    it('should return AWSProvider for AWS credentials', () => {
      const awsCreds: AWSCredentialFields = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };

      const provider = CloudProviderFactory.getProvider({
        provider: 'AWS',
        organizationId: 'org-123',
        credentials: awsCreds,
      });

      expect(provider).toBeInstanceOf(AWSProvider);
      expect(provider.providerType).toBe('AWS');
    });

    it('should return AzureProvider for Azure credentials', () => {
      const azureCreds: AzureCredentialFields = {
        tenantId: 'tenant-id-123',
        clientId: 'client-id-456',
        clientSecret: 'client-secret-789',
        subscriptionId: 'subscription-id-abc',
      };

      const provider = CloudProviderFactory.getProvider({
        provider: 'AZURE',
        organizationId: 'org-123',
        credentials: azureCreds,
      });

      expect(provider).toBeInstanceOf(AzureProvider);
      expect(provider.providerType).toBe('AZURE');
    });

    it('should throw error for GCP (not implemented)', () => {
      const gcpCreds = {
        projectId: 'my-project',
        serviceAccountKey: '{}',
      };

      expect(() => CloudProviderFactory.getProvider({
        provider: 'GCP',
        organizationId: 'org-123',
        credentials: gcpCreds,
      })).toThrow(CloudProviderError);
    });

    it('should throw error for unknown provider', () => {
      expect(() => CloudProviderFactory.getProvider({
        provider: 'UNKNOWN' as CloudProviderType,
        organizationId: 'org-123',
        credentials: {},
      })).toThrow(CloudProviderError);
    });
  });

  describe('Provider Caching', () => {
    it('should cache provider instances', () => {
      const awsCreds: AWSCredentialFields = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };

      const provider1 = CloudProviderFactory.getProvider({
        provider: 'AWS',
        organizationId: 'org-123',
        credentials: awsCreds,
      });

      const provider2 = CloudProviderFactory.getProvider({
        provider: 'AWS',
        organizationId: 'org-123',
        credentials: awsCreds,
      });

      // Should return the same cached instance
      expect(provider1).toBe(provider2);
    });

    it('should create different instances for different organizations', () => {
      const awsCreds: AWSCredentialFields = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };

      const provider1 = CloudProviderFactory.getProvider({
        provider: 'AWS',
        organizationId: 'org-123',
        credentials: awsCreds,
      });

      const provider2 = CloudProviderFactory.getProvider({
        provider: 'AWS',
        organizationId: 'org-456',
        credentials: awsCreds,
      });

      // Should be different instances for different organizations
      expect(provider1).not.toBe(provider2);
    });

    it('should create different instances for different credentials', () => {
      const awsCreds1: AWSCredentialFields = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE1',
        secretAccessKey: 'secret1',
      };

      const awsCreds2: AWSCredentialFields = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE2',
        secretAccessKey: 'secret2',
      };

      const provider1 = CloudProviderFactory.getProvider({
        provider: 'AWS',
        organizationId: 'org-123',
        credentials: awsCreds1,
      });

      const provider2 = CloudProviderFactory.getProvider({
        provider: 'AWS',
        organizationId: 'org-123',
        credentials: awsCreds2,
      });

      // Should be different instances for different credentials
      expect(provider1).not.toBe(provider2);
    });

    it('should clear cache correctly', () => {
      const awsCreds: AWSCredentialFields = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };

      const provider1 = CloudProviderFactory.getProvider({
        provider: 'AWS',
        organizationId: 'org-123',
        credentials: awsCreds,
      });

      CloudProviderFactory.clearCache();

      const provider2 = CloudProviderFactory.getProvider({
        provider: 'AWS',
        organizationId: 'org-123',
        credentials: awsCreds,
      });

      // Should be different instances after cache clear
      expect(provider1).not.toBe(provider2);
    });

    it('should invalidate specific provider correctly', () => {
      const awsCreds: AWSCredentialFields = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };

      const azureCreds: AzureCredentialFields = {
        tenantId: 'tenant-id-123',
        clientId: 'client-id-456',
        clientSecret: 'client-secret-789',
        subscriptionId: 'subscription-id-abc',
      };

      const awsProvider1 = CloudProviderFactory.getProvider({
        provider: 'AWS',
        organizationId: 'org-123',
        credentials: awsCreds,
      });

      const azureProvider1 = CloudProviderFactory.getProvider({
        provider: 'AZURE',
        organizationId: 'org-123',
        credentials: azureCreds,
      });

      // Invalidate only AWS provider for org-123
      CloudProviderFactory.invalidateProvider('AWS', 'org-123');

      const awsProvider2 = CloudProviderFactory.getProvider({
        provider: 'AWS',
        organizationId: 'org-123',
        credentials: awsCreds,
      });

      const azureProvider2 = CloudProviderFactory.getProvider({
        provider: 'AZURE',
        organizationId: 'org-123',
        credentials: azureCreds,
      });

      // AWS should be new instance
      expect(awsProvider1).not.toBe(awsProvider2);
      // Azure should be same cached instance
      expect(azureProvider1).toBe(azureProvider2);
    });
  });

  describe('Supported Providers', () => {
    it('should return correct list of supported providers', () => {
      const supported = CloudProviderFactory.getSupportedProviders();
      
      expect(supported).toContain('AWS');
      expect(supported).toContain('AZURE');
      expect(supported).not.toContain('GCP'); // Not yet implemented
    });

    it('should correctly check if provider is supported', () => {
      expect(CloudProviderFactory.isProviderSupported('AWS')).toBe(true);
      expect(CloudProviderFactory.isProviderSupported('AZURE')).toBe(true);
      expect(CloudProviderFactory.isProviderSupported('GCP')).toBe(false);
    });
  });

  describe('Database Credential Conversion', () => {
    it('should create AWS provider from database record', async () => {
      const dbRecord = {
        provider: 'AWS' as CloudProviderType,
        access_key_id: 'AKIAIOSFODNN7EXAMPLE',
        secret_access_key: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        role_arn: null,
        external_id: null,
        session_token: null,
        tenant_id: null,
        client_id: null,
        client_secret: null,
        subscription_id: null,
      };

      const provider = await CloudProviderFactory.fromDatabaseCredential(dbRecord, 'org-123');
      
      expect(provider).toBeInstanceOf(AWSProvider);
      expect(provider.providerType).toBe('AWS');
    });

    it('should create AWS provider from database record with role ARN', async () => {
      const dbRecord = {
        provider: 'AWS' as CloudProviderType,
        access_key_id: null,
        secret_access_key: null,
        role_arn: 'arn:aws:iam::123456789012:role/MyRole',
        external_id: 'external-id-123',
        session_token: null,
        tenant_id: null,
        client_id: null,
        client_secret: null,
        subscription_id: null,
      };

      const provider = await CloudProviderFactory.fromDatabaseCredential(dbRecord, 'org-123');
      
      expect(provider).toBeInstanceOf(AWSProvider);
      expect(provider.providerType).toBe('AWS');
    });

    it('should create Azure provider from database record', async () => {
      const dbRecord = {
        provider: 'AZURE' as CloudProviderType,
        access_key_id: null,
        secret_access_key: null,
        role_arn: null,
        external_id: null,
        session_token: null,
        tenant_id: 'tenant-id-123',
        client_id: 'client-id-456',
        client_secret: 'client-secret-789',
        subscription_id: 'subscription-id-abc',
      };

      const provider = await CloudProviderFactory.fromDatabaseCredential(dbRecord, 'org-123');
      
      expect(provider).toBeInstanceOf(AzureProvider);
      expect(provider.providerType).toBe('AZURE');
    });

    it('should throw error for Azure record with missing fields', async () => {
      const dbRecord = {
        provider: 'AZURE' as CloudProviderType,
        access_key_id: null,
        secret_access_key: null,
        role_arn: null,
        external_id: null,
        session_token: null,
        tenant_id: 'tenant-id-123',
        client_id: null, // Missing required field
        client_secret: 'client-secret-789',
        subscription_id: 'subscription-id-abc',
      };

      await expect(CloudProviderFactory.fromDatabaseCredential(dbRecord, 'org-123'))
        .rejects.toThrow(CloudProviderError);
    });
  });

  describe('Provider Interface Compliance', () => {
    it('AWS provider should implement all ICloudProvider methods', () => {
      const awsCreds: AWSCredentialFields = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };

      const provider = CloudProviderFactory.getProvider({
        provider: 'AWS',
        organizationId: 'org-123',
        credentials: awsCreds,
      });

      // Check all required methods exist
      expect(typeof provider.validateCredentials).toBe('function');
      expect(typeof provider.listResources).toBe('function');
      expect(typeof provider.getCosts).toBe('function');
      expect(typeof provider.runSecurityScan).toBe('function');
      expect(typeof provider.getActivityLogs).toBe('function');
      expect(provider.providerType).toBe('AWS');
    });

    it('Azure provider should implement all ICloudProvider methods', () => {
      const azureCreds: AzureCredentialFields = {
        tenantId: 'tenant-id-123',
        clientId: 'client-id-456',
        clientSecret: 'client-secret-789',
        subscriptionId: 'subscription-id-abc',
      };

      const provider = CloudProviderFactory.getProvider({
        provider: 'AZURE',
        organizationId: 'org-123',
        credentials: azureCreds,
      });

      // Check all required methods exist
      expect(typeof provider.validateCredentials).toBe('function');
      expect(typeof provider.listResources).toBe('function');
      expect(typeof provider.getCosts).toBe('function');
      expect(typeof provider.runSecurityScan).toBe('function');
      expect(typeof provider.getActivityLogs).toBe('function');
      expect(provider.providerType).toBe('AZURE');
    });
  });
});
