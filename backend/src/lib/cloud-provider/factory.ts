/**
 * Cloud Provider Factory
 * 
 * Factory pattern implementation for creating cloud provider instances.
 * This allows the platform to work with multiple cloud providers through
 * a unified interface without modifying existing code.
 */

import type {
  CloudProviderType,
  ICloudProvider,
  AWSCredentialFields,
  AzureCredentialFields,
  AzureServicePrincipalCredentials,
  GCPCredentialFields,
  ProviderFactoryConfig,
} from '../../types/cloud';
import { CloudProviderError } from '../../types/cloud';
import { AWSProvider } from './aws-provider';
import { AzureProvider } from './azure-provider';
import { resolveClientSecret } from '../azure-helpers.js';
import { logger } from '../logging.js';

import { createHash } from 'crypto';

/**
 * Cloud Provider Factory
 * 
 * Creates and manages cloud provider instances based on credential type.
 * Implements the Factory pattern to abstract provider instantiation.
 */
export class CloudProviderFactory {
  private static instances: Map<string, { provider: ICloudProvider; createdAt: number }> = new Map();
  private static readonly MAX_CACHE_SIZE = 50;
  private static readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

  /**
   * Hash credentials for safe cache key generation (never store secrets in keys)
   */
  private static hashCredentials(credentials: Record<string, any>): string {
    return createHash('sha256').update(JSON.stringify(credentials)).digest('hex').substring(0, 16);
  }

  /**
   * Evict expired entries and enforce max cache size
   */
  private static evictStaleEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.instances.entries()) {
      if (now - entry.createdAt > this.CACHE_TTL_MS) {
        this.instances.delete(key);
      }
    }
    // If still over limit, remove oldest entries
    if (this.instances.size > this.MAX_CACHE_SIZE) {
      const entries = [...this.instances.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
      const toRemove = entries.slice(0, entries.length - this.MAX_CACHE_SIZE);
      for (const [key] of toRemove) {
        this.instances.delete(key);
      }
    }
  }

  /**
   * Get a cloud provider instance based on configuration
   */
  static getProvider(config: ProviderFactoryConfig): ICloudProvider {
    const { provider, organizationId, credentials } = config;
    
    // Create a safe cache key using hashed credentials
    const credHash = this.hashCredentials(credentials as Record<string, any>);
    const cacheKey = `${provider}-${organizationId}-${credHash}`;
    
    // Evict stale entries periodically
    this.evictStaleEntries();
    
    // Check if we have a valid cached instance
    const cached = this.instances.get(cacheKey);
    if (cached && (Date.now() - cached.createdAt < this.CACHE_TTL_MS)) {
      logger.debug('Returning cached provider instance', { provider, organizationId });
      return cached.provider;
    }

    logger.info('Creating new provider instance', { provider, organizationId });

    let providerInstance: ICloudProvider;

    switch (provider) {
      case 'AWS':
        providerInstance = new AWSProvider(
          organizationId,
          credentials as AWSCredentialFields
        );
        break;

      case 'AZURE':
        // Cast to AzureServicePrincipalCredentials - factory assumes Service Principal auth
        const azureCreds = credentials as AzureCredentialFields;
        if (!azureCreds.tenantId || !azureCreds.clientId || !azureCreds.clientSecret) {
          throw new CloudProviderError(
            'Azure Service Principal credentials are incomplete',
            'AZURE',
            'INVALID_CREDENTIALS',
            400
          );
        }
        providerInstance = new AzureProvider(
          organizationId,
          {
            tenantId: azureCreds.tenantId,
            clientId: azureCreds.clientId,
            clientSecret: azureCreds.clientSecret,
            subscriptionId: azureCreds.subscriptionId,
            subscriptionName: azureCreds.subscriptionName,
          }
        );
        break;

      case 'GCP':
        throw new CloudProviderError(
          'GCP provider is not yet implemented',
          'GCP',
          'NOT_IMPLEMENTED',
          501
        );

      default:
        throw new CloudProviderError(
          `Unknown provider type: ${provider}`,
          provider as CloudProviderType,
          'INVALID_PROVIDER',
          400
        );
    }

    // Cache the instance with TTL
    this.instances.set(cacheKey, { provider: providerInstance, createdAt: Date.now() });

    return providerInstance;
  }

  /**
   * Detect provider type from credentials
   * 
   * @param credentials Credential object to analyze
   * @returns Detected CloudProviderType
   * @throws CloudProviderError if credentials format is not recognized
   */
  static detectProviderFromCredentials(
    credentials: AWSCredentialFields | AzureCredentialFields | GCPCredentialFields
  ): CloudProviderType {
    // Check for Azure credentials
    if ('tenantId' in credentials && 'clientId' in credentials && 'subscriptionId' in credentials) {
      return 'AZURE';
    }

    // Check for AWS credentials
    if ('accessKeyId' in credentials || 'roleArn' in credentials) {
      return 'AWS';
    }

    // Check for GCP credentials
    if ('projectId' in credentials && 'serviceAccountKey' in credentials) {
      return 'GCP';
    }

    throw new CloudProviderError(
      'Unable to detect provider from credentials format',
      'AWS', // Default for error
      'INVALID_CREDENTIALS_FORMAT',
      400
    );
  }

  /**
   * Create provider from database credential record
   * 
   * @param credentialRecord Database credential record with provider info
   * @param organizationId Organization ID for the provider
   * @returns ICloudProvider instance
   */
  static async fromDatabaseCredential(
    credentialRecord: {
      provider: CloudProviderType;
      // AWS fields
      access_key_id?: string | null;
      secret_access_key?: string | null;
      role_arn?: string | null;
      external_id?: string | null;
      session_token?: string | null;
      // Azure fields
      tenant_id?: string | null;
      client_id?: string | null;
      client_secret?: string | null;
      subscription_id?: string | null;
    },
    organizationId: string
  ): Promise<ICloudProvider> {
    const { provider } = credentialRecord;

    if (provider === 'AWS') {
      const awsCredentials: AWSCredentialFields = {};
      
      if (credentialRecord.access_key_id) {
        awsCredentials.accessKeyId = credentialRecord.access_key_id;
      }
      if (credentialRecord.secret_access_key) {
        awsCredentials.secretAccessKey = credentialRecord.secret_access_key;
      }
      if (credentialRecord.role_arn) {
        awsCredentials.roleArn = credentialRecord.role_arn;
      }
      if (credentialRecord.external_id) {
        awsCredentials.externalId = credentialRecord.external_id;
      }
      if (credentialRecord.session_token) {
        awsCredentials.sessionToken = credentialRecord.session_token;
      }

      return this.getProvider({
        provider: 'AWS',
        organizationId,
        credentials: awsCredentials,
      });
    }

    if (provider === 'AZURE') {
      const resolvedSecret = await resolveClientSecret({
        client_id: credentialRecord.client_id ?? null,
        client_secret: credentialRecord.client_secret ?? null,
      });
      if (!credentialRecord.tenant_id || !credentialRecord.client_id || 
          !resolvedSecret || !credentialRecord.subscription_id) {
        throw new CloudProviderError(
          'Missing required Azure credential fields',
          'AZURE',
          'INVALID_CREDENTIALS',
          400
        );
      }

      const azureCredentials: AzureCredentialFields = {
        tenantId: credentialRecord.tenant_id,
        clientId: credentialRecord.client_id,
        clientSecret: resolvedSecret,
        subscriptionId: credentialRecord.subscription_id,
      };

      return this.getProvider({
        provider: 'AZURE',
        organizationId,
        credentials: azureCredentials,
      });
    }

    throw new CloudProviderError(
      `Provider ${provider} is not supported`,
      provider,
      'NOT_SUPPORTED',
      400
    );
  }

  /**
   * Clear cached provider instances
   * Useful for testing or when credentials are updated
   */
  static clearCache(): void {
    this.instances.clear();
    logger.info('Provider cache cleared');
  }

  /**
   * Remove a specific provider from cache
   * 
   * @param provider Provider type
   * @param organizationId Organization ID
   */
  static invalidateProvider(provider: CloudProviderType, organizationId: string): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.instances.keys()) {
      if (key.startsWith(`${provider}-${organizationId}`)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.instances.delete(key);
    }

    logger.info('Provider cache invalidated', { provider, organizationId, keysRemoved: keysToDelete.length });
  }

  /**
   * Get all supported provider types
   */
  static getSupportedProviders(): CloudProviderType[] {
    return ['AWS', 'AZURE'];
  }

  /**
   * Check if a provider type is supported
   */
  static isProviderSupported(provider: CloudProviderType): boolean {
    return this.getSupportedProviders().includes(provider);
  }
}

// Export singleton-like access
export const getCloudProvider = CloudProviderFactory.getProvider.bind(CloudProviderFactory);
export const detectProvider = CloudProviderFactory.detectProviderFromCredentials.bind(CloudProviderFactory);
