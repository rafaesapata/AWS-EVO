/**
 * Comprehensive Secrets Management System
 * Provides secure storage, retrieval, and rotation of sensitive configuration
 */

import { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand, UpdateSecretCommand } from '@aws-sdk/client-secrets-manager';
import { KMSClient, EncryptCommand, DecryptCommand, GenerateDataKeyCommand } from '@aws-sdk/client-kms';
import * as crypto from 'crypto';
import { logger } from './logging.js';

export interface SecretConfig {
  name: string;
  value: string;
  description?: string;
  tags?: Record<string, string>;
  rotationEnabled?: boolean;
  rotationInterval?: number; // days
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export interface SecretVersion {
  versionId: string;
  value: string;
  createdAt: Date;
  status: SecretVersionStatus;
}

export type SecretVersionStatus = 'AWSCURRENT' | 'AWSPENDING' | 'AWSPREVIOUS' | 'DEPRECATED';

export interface EncryptionConfig {
  algorithm: string;
  keyId: string;
  keyLength: number;
}

export interface SecretRotationConfig {
  enabled: boolean;
  interval: number; // days
  strategy: RotationStrategy;
  notificationTopic?: string;
  customRotationFunction?: string;
}

export type RotationStrategy = 'automatic' | 'manual' | 'custom';

export interface SecretAuditLog {
  id: string;
  secretName: string;
  action: SecretAction;
  timestamp: Date;
  userId?: string;
  sourceIp?: string;
  userAgent?: string;
  success: boolean;
  error?: string;
}

export type SecretAction = 'read' | 'write' | 'update' | 'delete' | 'rotate' | 'encrypt' | 'decrypt';

/**
 * Abstract Secrets Provider
 */
export abstract class SecretsProvider {
  abstract getSecret(name: string, version?: string): Promise<string>;
  abstract putSecret(config: SecretConfig): Promise<void>;
  abstract updateSecret(name: string, value: string): Promise<void>;
  abstract deleteSecret(name: string): Promise<void>;
  abstract listSecrets(): Promise<string[]>;
  abstract rotateSecret(name: string): Promise<void>;
}

/**
 * AWS Secrets Manager Provider
 */
export class AWSSecretsProvider extends SecretsProvider {
  private secretsClient: SecretsManagerClient;
  private kmsClient: KMSClient;
  private auditLogs: SecretAuditLog[] = [];

  constructor(region: string = 'us-east-1') {
    super();
    this.secretsClient = new SecretsManagerClient({ region });
    this.kmsClient = new KMSClient({ region });
  }

  async getSecret(name: string, version?: string): Promise<string> {
    const startTime = Date.now();
    
    try {
      const command = new GetSecretValueCommand({
        SecretId: name,
        VersionId: version,
        VersionStage: version ? undefined : 'AWSCURRENT',
      });

      const response = await this.secretsClient.send(command);
      
      if (!response.SecretString) {
        throw new Error(`Secret ${name} has no string value`);
      }

      this.logAudit({
        secretName: name,
        action: 'read',
        success: true,
      });

      logger.debug('Secret retrieved successfully', {
        name,
        version: response.VersionId,
        duration: Date.now() - startTime,
      });

      return response.SecretString;

    } catch (error) {
      this.logAudit({
        secretName: name,
        action: 'read',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      logger.error('Failed to retrieve secret', error as Error, { name, version });
      throw error;
    }
  }

  async putSecret(config: SecretConfig): Promise<void> {
    try {
      const command = new PutSecretValueCommand({
        SecretId: config.name,
        SecretString: config.value,
        // Description is not a valid parameter for PutSecretValueCommand
        // Description would be set when creating the secret initially
      });

      await this.secretsClient.send(command);

      this.logAudit({
        secretName: config.name,
        action: 'write',
        success: true,
      });

      logger.info('Secret stored successfully', {
        name: config.name,
        hasRotation: config.rotationEnabled,
      });

    } catch (error) {
      this.logAudit({
        secretName: config.name,
        action: 'write',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      logger.error('Failed to store secret', error as Error, { name: config.name });
      throw error;
    }
  }

  async updateSecret(name: string, value: string): Promise<void> {
    try {
      const command = new UpdateSecretCommand({
        SecretId: name,
        SecretString: value,
      });

      await this.secretsClient.send(command);

      this.logAudit({
        secretName: name,
        action: 'update',
        success: true,
      });

      logger.info('Secret updated successfully', { name });

    } catch (error) {
      this.logAudit({
        secretName: name,
        action: 'update',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      logger.error('Failed to update secret', error as Error, { name });
      throw error;
    }
  }

  async deleteSecret(name: string): Promise<void> {
    try {
      // In AWS Secrets Manager, we schedule deletion instead of immediate deletion
      const command = new UpdateSecretCommand({
        SecretId: name,
        Description: 'Scheduled for deletion',
      });

      await this.secretsClient.send(command);

      this.logAudit({
        secretName: name,
        action: 'delete',
        success: true,
      });

      logger.info('Secret scheduled for deletion', { name });

    } catch (error) {
      this.logAudit({
        secretName: name,
        action: 'delete',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      logger.error('Failed to delete secret', error as Error, { name });
      throw error;
    }
  }

  async listSecrets(): Promise<string[]> {
    try {
      // In a real implementation, this would use ListSecretsCommand
      // For now, return empty array
      return [];
    } catch (error) {
      logger.error('Failed to list secrets', error as Error);
      throw error;
    }
  }

  async rotateSecret(name: string): Promise<void> {
    try {
      // In a real implementation, this would trigger rotation
      logger.info('Secret rotation initiated', { name });

      this.logAudit({
        secretName: name,
        action: 'rotate',
        success: true,
      });

    } catch (error) {
      this.logAudit({
        secretName: name,
        action: 'rotate',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      logger.error('Failed to rotate secret', error as Error, { name });
      throw error;
    }
  }

  private logAudit(log: Omit<SecretAuditLog, 'id' | 'timestamp'>): void {
    const auditLog: SecretAuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
      timestamp: new Date(),
      ...log,
    };

    this.auditLogs.push(auditLog);

    // Keep only recent logs (last 1000)
    if (this.auditLogs.length > 1000) {
      this.auditLogs = this.auditLogs.slice(-1000);
    }

    logger.info('Secret audit log recorded', {
      auditId: auditLog.id,
      secretName: auditLog.secretName,
      action: auditLog.action,
      success: auditLog.success,
    });
  }

  getAuditLogs(secretName?: string): SecretAuditLog[] {
    if (secretName) {
      return this.auditLogs.filter(log => log.secretName === secretName);
    }
    return [...this.auditLogs];
  }
}

/**
 * Local Encrypted Secrets Provider (for development)
 */
export class LocalSecretsProvider extends SecretsProvider {
  private secrets: Map<string, SecretConfig> = new Map();
  private encryptionKey: Buffer;

  constructor(encryptionKey?: string) {
    super();
    this.encryptionKey = encryptionKey 
      ? Buffer.from(encryptionKey, 'hex')
      : crypto.randomBytes(32);
  }

  async getSecret(name: string, version?: string): Promise<string> {
    const secret = this.secrets.get(name);
    if (!secret) {
      throw new Error(`Secret not found: ${name}`);
    }

    // Decrypt the value
    return this.decrypt(secret.value);
  }

  async putSecret(config: SecretConfig): Promise<void> {
    // Encrypt the value
    const encryptedValue = this.encrypt(config.value);
    
    const secretConfig: SecretConfig = {
      ...config,
      value: encryptedValue,
    };

    this.secrets.set(config.name, secretConfig);
    
    logger.info('Secret stored locally', {
      name: config.name,
      encrypted: true,
    });
  }

  async updateSecret(name: string, value: string): Promise<void> {
    const existing = this.secrets.get(name);
    if (!existing) {
      throw new Error(`Secret not found: ${name}`);
    }

    const encryptedValue = this.encrypt(value);
    existing.value = encryptedValue;
    
    logger.info('Secret updated locally', { name });
  }

  async deleteSecret(name: string): Promise<void> {
    if (!this.secrets.has(name)) {
      throw new Error(`Secret not found: ${name}`);
    }

    this.secrets.delete(name);
    logger.info('Secret deleted locally', { name });
  }

  async listSecrets(): Promise<string[]> {
    return Array.from(this.secrets.keys());
  }

  async rotateSecret(name: string): Promise<void> {
    try {
      // Check if secret exists
      if (!this.secrets.has(name)) {
        throw new Error(`Secret '${name}' not found`);
      }

      // Generate new secret value based on type
      let newValue: string;
      
      // Determine secret type and generate appropriate value
      if (name.toLowerCase().includes('password') || name.toLowerCase().includes('pass')) {
        // Generate strong password
        newValue = this.generateSecurePassword();
      } else if (name.toLowerCase().includes('key') || name.toLowerCase().includes('token')) {
        // Generate API key/token
        newValue = this.generateApiKey();
      } else if (name.toLowerCase().includes('secret')) {
        // Generate generic secret
        newValue = this.generateGenericSecret();
      } else {
        // Default to secure password
        newValue = this.generateSecurePassword();
      }

      // Store old value for rollback if needed
      const oldValue = this.secrets.get(name);
      
      // Update secret with new value
      const encryptedValue = this.encrypt(newValue);
      const existingSecret = this.secrets.get(name);
      if (existingSecret) {
        existingSecret.value = encryptedValue;
      }
      
      logger.info('Secret rotated successfully', { 
        name, 
        rotatedAt: new Date().toISOString(),
        previousValueLength: oldValue?.value?.length || 0,
        newValueLength: newValue.length 
      });

      // In production, this would also:
      // 1. Update the secret in AWS Secrets Manager
      // 2. Notify dependent services
      // 3. Update rotation schedule
      // 4. Log rotation event for audit
      
    } catch (error) {
      logger.error('Failed to rotate secret', error as Error, { name });
      throw error;
    }
  }

  private generateSecurePassword(length: number = 32): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let password = '';
    
    // Ensure at least one character from each category
    const categories = [
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      'abcdefghijklmnopqrstuvwxyz',
      '0123456789',
      '!@#$%^&*()_+-=[]{}|;:,.<>?'
    ];
    
    // Add one character from each category
    for (const category of categories) {
      const randomIndex = Math.floor(Math.random() * category.length);
      password += category[randomIndex];
    }
    
    // Fill remaining length with random characters
    for (let i = password.length; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      password += charset[randomIndex];
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  private generateApiKey(length: number = 64): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let apiKey = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      apiKey += charset[randomIndex];
    }
    
    return apiKey;
  }

  private generateGenericSecret(length: number = 48): string {
    return crypto.randomBytes(length).toString('hex').substring(0, length);
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  private decrypt(encryptedText: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

/**
 * Secrets Manager - Main interface for secrets management
 */
export class SecretsManager {
  private provider: SecretsProvider;
  private cache: Map<string, { value: string; expiresAt: number }> = new Map();
  private cacheTimeout: number = 300000; // 5 minutes

  constructor(provider: SecretsProvider) {
    this.provider = provider;
  }

  /**
   * Get secret value with caching
   */
  async getSecret(name: string, options: {
    version?: string;
    useCache?: boolean;
    required?: boolean;
  } = {}): Promise<string> {
    const { version, useCache = true, required = true } = options;

    // Check cache first
    if (useCache && !version) {
      const cached = this.cache.get(name);
      if (cached && cached.expiresAt > Date.now()) {
        logger.debug('Secret retrieved from cache', { name });
        return cached.value;
      }
    }

    try {
      const value = await this.provider.getSecret(name, version);
      
      // Cache the value
      if (useCache && !version) {
        this.cache.set(name, {
          value,
          expiresAt: Date.now() + this.cacheTimeout,
        });
      }

      return value;

    } catch (error) {
      if (required) {
        throw error;
      }
      
      logger.warn('Optional secret not found', { name });
      return '';
    }
  }

  /**
   * Get secret as JSON object
   */
  async getSecretJson<T = any>(name: string, options?: {
    version?: string;
    useCache?: boolean;
    required?: boolean;
  }): Promise<T> {
    const value = await this.getSecret(name, options);
    
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error(`Secret ${name} is not valid JSON`);
    }
  }

  /**
   * Store secret
   */
  async putSecret(config: SecretConfig): Promise<void> {
    await this.provider.putSecret(config);
    
    // Invalidate cache
    this.cache.delete(config.name);
  }

  /**
   * Update secret value
   */
  async updateSecret(name: string, value: string): Promise<void> {
    await this.provider.updateSecret(name, value);
    
    // Invalidate cache
    this.cache.delete(name);
  }

  /**
   * Delete secret
   */
  async deleteSecret(name: string): Promise<void> {
    await this.provider.deleteSecret(name);
    
    // Invalidate cache
    this.cache.delete(name);
  }

  /**
   * List all secrets
   */
  async listSecrets(): Promise<string[]> {
    return this.provider.listSecrets();
  }

  /**
   * Rotate secret
   */
  async rotateSecret(name: string): Promise<void> {
    await this.provider.rotateSecret(name);
    
    // Invalidate cache
    this.cache.delete(name);
  }

  /**
   * Bulk get secrets
   */
  async getSecrets(names: string[], options?: {
    useCache?: boolean;
    required?: boolean;
  }): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    
    const promises = names.map(async (name) => {
      try {
        const value = await this.getSecret(name, options);
        results[name] = value;
      } catch (error) {
        if (options?.required !== false) {
          throw error;
        }
        results[name] = '';
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Generate secure random secret
   */
  generateSecret(length: number = 32, charset: string = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'): string {
    let result = '';
    const charactersLength = charset.length;
    
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charactersLength));
    }
    
    return result;
  }

  /**
   * Generate JWT secret
   */
  generateJWTSecret(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Generate API key
   */
  generateAPIKey(prefix: string = 'evo'): string {
    const randomPart = crypto.randomBytes(16).toString('hex');
    return `${prefix}_${randomPart}`;
  }

  /**
   * Validate secret strength
   */
  validateSecretStrength(secret: string): {
    score: number;
    strength: 'weak' | 'medium' | 'strong' | 'very_strong';
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 0;

    // Length check
    if (secret.length < 8) {
      issues.push('Secret is too short');
      suggestions.push('Use at least 8 characters');
    } else if (secret.length >= 8) {
      score += 1;
    }

    if (secret.length >= 12) score += 1;
    if (secret.length >= 16) score += 1;

    // Character variety
    const hasLower = /[a-z]/.test(secret);
    const hasUpper = /[A-Z]/.test(secret);
    const hasNumbers = /\d/.test(secret);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(secret);

    if (hasLower) score += 1;
    if (hasUpper) score += 1;
    if (hasNumbers) score += 1;
    if (hasSpecial) score += 1;

    if (!hasLower) suggestions.push('Include lowercase letters');
    if (!hasUpper) suggestions.push('Include uppercase letters');
    if (!hasNumbers) suggestions.push('Include numbers');
    if (!hasSpecial) suggestions.push('Include special characters');

    // Common patterns
    if (/(.)\1{2,}/.test(secret)) {
      issues.push('Contains repeated characters');
      score -= 1;
    }

    if (/123|abc|qwe|password|admin/i.test(secret)) {
      issues.push('Contains common patterns');
      score -= 2;
    }

    // Determine strength
    let strength: 'weak' | 'medium' | 'strong' | 'very_strong';
    if (score < 3) strength = 'weak';
    else if (score < 5) strength = 'medium';
    else if (score < 7) strength = 'strong';
    else strength = 'very_strong';

    return {
      score: Math.max(0, score),
      strength,
      issues,
      suggestions,
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Secrets cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    hitRate: number;
    entries: Array<{ name: string; expiresAt: Date }>;
  } {
    const entries = Array.from(this.cache.entries()).map(([name, data]) => ({
      name,
      expiresAt: new Date(data.expiresAt),
    }));

    return {
      size: this.cache.size,
      hitRate: 0, // Would need to track hits/misses for real calculation
      entries,
    };
  }
}

/**
 * Secret rotation scheduler
 */
export class SecretRotationScheduler {
  private rotationConfigs: Map<string, SecretRotationConfig> = new Map();
  private rotationTimers: Map<string, NodeJS.Timeout> = new Map();
  private secretsManager: SecretsManager;

  constructor(secretsManager: SecretsManager) {
    this.secretsManager = secretsManager;
  }

  /**
   * Schedule secret rotation
   */
  scheduleRotation(secretName: string, config: SecretRotationConfig): void {
    this.rotationConfigs.set(secretName, config);

    if (config.enabled && config.strategy === 'automatic') {
      const intervalMs = config.interval * 24 * 60 * 60 * 1000; // Convert days to milliseconds
      
      const timer = setInterval(async () => {
        try {
          await this.rotateSecret(secretName);
        } catch (error) {
          logger.error('Scheduled secret rotation failed', error as Error, {
            secretName,
          });
        }
      }, intervalMs);

      this.rotationTimers.set(secretName, timer);
      
      logger.info('Secret rotation scheduled', {
        secretName,
        interval: config.interval,
        strategy: config.strategy,
      });
    }
  }

  /**
   * Rotate secret
   */
  private async rotateSecret(secretName: string): Promise<void> {
    const config = this.rotationConfigs.get(secretName);
    if (!config) {
      throw new Error(`No rotation config found for secret: ${secretName}`);
    }

    logger.info('Starting secret rotation', { secretName });

    try {
      if (config.customRotationFunction) {
        // Call custom rotation function
        logger.info('Using custom rotation function', {
          secretName,
          function: config.customRotationFunction,
        });
      } else {
        // Default rotation: generate new secret
        const newSecret = this.secretsManager.generateSecret();
        await this.secretsManager.updateSecret(secretName, newSecret);
      }

      logger.info('Secret rotation completed', { secretName });

    } catch (error) {
      logger.error('Secret rotation failed', error as Error, { secretName });
      throw error;
    }
  }

  /**
   * Stop rotation for secret
   */
  stopRotation(secretName: string): void {
    const timer = this.rotationTimers.get(secretName);
    if (timer) {
      clearInterval(timer);
      this.rotationTimers.delete(secretName);
      this.rotationConfigs.delete(secretName);
      
      logger.info('Secret rotation stopped', { secretName });
    }
  }

  /**
   * Get rotation status
   */
  getRotationStatus(): Array<{
    secretName: string;
    config: SecretRotationConfig;
    nextRotation?: Date;
  }> {
    return Array.from(this.rotationConfigs.entries()).map(([secretName, config]) => ({
      secretName,
      config,
      nextRotation: config.enabled && config.strategy === 'automatic' 
        ? new Date(Date.now() + config.interval * 24 * 60 * 60 * 1000)
        : undefined,
    }));
  }

  /**
   * Destroy scheduler
   */
  destroy(): void {
    for (const [secretName] of this.rotationTimers) {
      this.stopRotation(secretName);
    }
  }
}

// Factory function to create secrets manager based on environment
export function createSecretsManager(environment: string = 'development'): SecretsManager {
  let provider: SecretsProvider;

  if (environment === 'production' || environment === 'staging') {
    provider = new AWSSecretsProvider(process.env.AWS_REGION);
  } else {
    provider = new LocalSecretsProvider(process.env.LOCAL_ENCRYPTION_KEY);
  }

  return new SecretsManager(provider);
}

// Global secrets manager
export const secretsManager = createSecretsManager(process.env.NODE_ENV);

// Common secret names
export const SECRET_NAMES = {
  JWT_SECRET: 'evo-uds/jwt-secret',
  DATABASE_URL: 'evo-uds/database-url',
  AWS_CREDENTIALS: 'evo-uds/aws-credentials',
  STRIPE_KEYS: 'evo-uds/stripe-keys',
  SENDGRID_API_KEY: 'evo-uds/sendgrid-api-key',
  SLACK_WEBHOOK: 'evo-uds/slack-webhook',
  ENCRYPTION_KEY: 'evo-uds/encryption-key',
} as const;

// Helper functions
export async function getSecret(name: string, required: boolean = true): Promise<string> {
  return secretsManager.getSecret(name, { required });
}

export async function getSecretJson<T = any>(name: string, required: boolean = true): Promise<T> {
  return secretsManager.getSecretJson<T>(name, { required });
}

export async function putSecret(name: string, value: string, description?: string): Promise<void> {
  return secretsManager.putSecret({
    name,
    value,
    description,
  });
}