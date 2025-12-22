/**
 * AWS Secrets Manager Integration
 * Manages application secrets and credentials securely
 */

import { SecretsManagerClient, GetSecretValueCommand, CreateSecretCommand, UpdateSecretCommand } from '@aws-sdk/client-secrets-manager';

interface AppSecrets {
  // AWS Credentials for services
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_SESSION_TOKEN?: string;
  
  // Bedrock Configuration
  BEDROCK_REGION?: string;
  BEDROCK_MODEL_ID?: string;
  BEDROCK_CLAUDE_MODEL_ID?: string;
  
  // Database Configuration
  DATABASE_URL?: string;
  DATABASE_PASSWORD?: string;
  
  // API Keys
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  
  // Application Configuration
  JWT_SECRET?: string;
  ENCRYPTION_KEY?: string;
  
  // External Services
  STRIPE_SECRET_KEY?: string;
  SENDGRID_API_KEY?: string;
  
  // Environment specific
  NODE_ENV?: string;
  LOG_LEVEL?: string;
}

class SecretsManager {
  private client: SecretsManagerClient;
  private cache: Map<string, { value: any; expiry: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  constructor(region: string = 'us-east-1') {
    this.client = new SecretsManagerClient({ region });
  }

  /**
   * Get secret value from AWS Secrets Manager
   */
  async getSecret(secretName: string): Promise<any> {
    // Check cache first
    const cached = this.cache.get(secretName);
    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }

    try {
      const command = new GetSecretValueCommand({
        SecretId: secretName,
      });

      const response = await this.client.send(command);
      
      let secretValue;
      if (response.SecretString) {
        try {
          secretValue = JSON.parse(response.SecretString);
        } catch {
          secretValue = response.SecretString;
        }
      } else if (response.SecretBinary) {
        secretValue = Buffer.from(response.SecretBinary).toString('utf-8');
      }

      // Cache the result
      this.cache.set(secretName, {
        value: secretValue,
        expiry: Date.now() + this.CACHE_TTL
      });

      return secretValue;
    } catch (error: any) {
      console.error(`Failed to get secret ${secretName}:`, error.message);
      
      // In development, try to get from environment variables
      if (process.env.NODE_ENV === 'development') {
        const envValue = process.env[secretName];
        if (envValue) {
          try {
            return JSON.parse(envValue);
          } catch {
            return envValue;
          }
        }
      }
      
      throw error;
    }
  }

  /**
   * Create or update a secret in AWS Secrets Manager
   */
  async setSecret(secretName: string, secretValue: any, description?: string): Promise<void> {
    const secretString = typeof secretValue === 'string' 
      ? secretValue 
      : JSON.stringify(secretValue);

    try {
      // Try to update existing secret first
      const updateCommand = new UpdateSecretCommand({
        SecretId: secretName,
        SecretString: secretString,
        Description: description,
      });

      await this.client.send(updateCommand);
      console.log(`Secret ${secretName} updated successfully`);
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        // Secret doesn't exist, create it
        try {
          const createCommand = new CreateSecretCommand({
            Name: secretName,
            SecretString: secretString,
            Description: description || `EVO UDS Application Secret: ${secretName}`,
          });

          await this.client.send(createCommand);
          console.log(`Secret ${secretName} created successfully`);
        } catch (createError: any) {
          console.error(`Failed to create secret ${secretName}:`, createError.message);
          throw createError;
        }
      } else {
        console.error(`Failed to update secret ${secretName}:`, error.message);
        throw error;
      }
    }

    // Clear cache for this secret
    this.cache.delete(secretName);
  }

  /**
   * Get all application secrets
   */
  async getAppSecrets(): Promise<AppSecrets> {
    const secretName = `evo-uds/${process.env.NODE_ENV || 'development'}/app-secrets`;
    
    try {
      return await this.getSecret(secretName);
    } catch (error) {
      console.warn('Failed to get app secrets from Secrets Manager, using environment variables');
      
      // Fallback to environment variables
      return {
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
        AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN,
        BEDROCK_REGION: process.env.BEDROCK_REGION || 'us-east-1',
        BEDROCK_MODEL_ID: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0',
        BEDROCK_CLAUDE_MODEL_ID: process.env.BEDROCK_CLAUDE_MODEL_ID || 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        DATABASE_URL: process.env.DATABASE_URL,
        NODE_ENV: process.env.NODE_ENV || 'development',
        LOG_LEVEL: process.env.LOG_LEVEL || 'info',
      };
    }
  }

  /**
   * Initialize application with secrets
   */
  async initializeApp(): Promise<AppSecrets> {
    console.log('🔐 Initializing application secrets...');
    
    try {
      const secrets = await this.getAppSecrets();
      
      // Set environment variables from secrets (for compatibility)
      Object.entries(secrets).forEach(([key, value]) => {
        if (value && !process.env[key]) {
          process.env[key] = value;
        }
      });
      
      console.log('✅ Application secrets loaded successfully');
      return secrets;
    } catch (error: any) {
      console.error('❌ Failed to initialize application secrets:', error.message);
      throw error;
    }
  }

  /**
   * Deploy secrets from .env file to Secrets Manager
   */
  async deploySecretsFromEnv(envFilePath: string = '.env'): Promise<void> {
    console.log('🚀 Deploying secrets to AWS Secrets Manager...');
    
    try {
      // Read .env file
      const fs = await import('fs');
      const path = await import('path');
      
      const envPath = path.resolve(envFilePath);
      
      if (!fs.existsSync(envPath)) {
        throw new Error(`Environment file not found: ${envPath}`);
      }
      
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const envVars: Record<string, string> = {};
      
      // Parse .env file
      envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').replace(/^["']|["']$/g, '');
            envVars[key.trim()] = value;
          }
        }
      });
      
      // Filter relevant secrets
      const appSecrets: AppSecrets = {};
      const relevantKeys = [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY', 
        'AWS_SESSION_TOKEN',
        'BEDROCK_REGION',
        'BEDROCK_MODEL_ID',
        'BEDROCK_CLAUDE_MODEL_ID',
        'DATABASE_URL',
        'DATABASE_PASSWORD',
        'OPENAI_API_KEY',
        'ANTHROPIC_API_KEY',
        'JWT_SECRET',
        'ENCRYPTION_KEY',
        'STRIPE_SECRET_KEY',
        'SENDGRID_API_KEY',
        'NODE_ENV',
        'LOG_LEVEL'
      ];
      
      relevantKeys.forEach(key => {
        if (envVars[key]) {
          appSecrets[key as keyof AppSecrets] = envVars[key];
        }
      });
      
      // Deploy to Secrets Manager
      const secretName = `evo-uds/${process.env.NODE_ENV || 'development'}/app-secrets`;
      await this.setSecret(
        secretName, 
        appSecrets, 
        `EVO UDS Application Secrets for ${process.env.NODE_ENV || 'development'} environment`
      );
      
      console.log(`✅ Successfully deployed ${Object.keys(appSecrets).length} secrets to ${secretName}`);
      console.log('📋 Deployed secrets:', Object.keys(appSecrets).join(', '));
      
    } catch (error: any) {
      console.error('❌ Failed to deploy secrets:', error.message);
      throw error;
    }
  }

  /**
   * Clear secrets cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('🧹 Secrets cache cleared');
  }
}

// Global instance
export const secretsManager = new SecretsManager();

// Helper function to initialize app secrets
export const initializeAppSecrets = async (): Promise<AppSecrets> => {
  return await secretsManager.initializeApp();
};

// Helper function to deploy secrets
export const deploySecrets = async (envFilePath?: string): Promise<void> => {
  return await secretsManager.deploySecretsFromEnv(envFilePath);
};

export default secretsManager;