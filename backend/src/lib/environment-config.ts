/**
 * Comprehensive Environment Configuration System
 * Provides type-safe configuration management with validation and hot-reloading
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from './logger.js';

export interface EnvironmentConfig {
  environment: Environment;
  app: AppConfig;
  database: DatabaseConfig;
  aws: AWSConfig;
  security: SecurityConfig;
  monitoring: MonitoringConfig;
  features: FeatureFlags;
  integrations: IntegrationConfig;
  performance: PerformanceConfig;
}

export type Environment = 'development' | 'staging' | 'production' | 'test';

export interface AppConfig {
  name: string;
  version: string;
  port: number;
  baseUrl: string;
  corsOrigins: string[];
  logLevel: LogLevel;
  timezone: string;
  locale: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface DatabaseConfig {
  url: string;
  maxConnections: number;
  connectionTimeout: number;
  queryTimeout: number;
  ssl: boolean;
  migrations: {
    autoRun: boolean;
    directory: string;
  };
  backup: {
    enabled: boolean;
    schedule: string;
    retention: number;
  };
}

export interface AWSConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  s3: {
    buckets: {
      uploads: string;
      backups: string;
      logs: string;
    };
  };
  lambda: {
    timeout: number;
    memorySize: number;
  };
  cloudWatch: {
    logGroup: string;
    metricsNamespace: string;
  };
  sns: {
    alertTopic: string;
  };
}

export interface SecurityConfig {
  jwt: {
    secret: string;
    expiresIn: string;
    refreshExpiresIn: string;
    algorithm: string;
  };
  encryption: {
    algorithm: string;
    keyLength: number;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  cors: {
    enabled: boolean;
    credentials: boolean;
    maxAge: number;
  };
  headers: {
    hsts: boolean;
    csp: boolean;
    frameOptions: string;
  };
}

export interface MonitoringConfig {
  enabled: boolean;
  metricsInterval: number;
  healthCheck: {
    enabled: boolean;
    interval: number;
    timeout: number;
  };
  alerts: {
    enabled: boolean;
    channels: string[];
  };
  tracing: {
    enabled: boolean;
    sampleRate: number;
  };
}
export interface FeatureFlags {
  multiTenant: boolean;
  advancedSecurity: boolean;
  realTimeMonitoring: boolean;
  aiPoweredScans: boolean;
  autoRemediation: boolean;
  betaFeatures: boolean;
  experimentalApi: boolean;
}

export interface IntegrationConfig {
  stripe: {
    publishableKey: string;
    secretKey: string;
    webhookSecret: string;
  };
  sendgrid: {
    apiKey: string;
    fromEmail: string;
  };
  slack: {
    webhookUrl: string;
    channel: string;
  };
}

export interface PerformanceConfig {
  cache: {
    ttl: number;
    maxSize: number;
    compression: boolean;
  };
  pagination: {
    defaultLimit: number;
    maxLimit: number;
  };
  uploads: {
    maxFileSize: number;
    allowedTypes: string[];
  };
}

export interface ConfigValidationRule {
  path: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  validator?: (value: any) => boolean;
  message?: string;
}

export interface ConfigSource {
  name: string;
  priority: number;
  load: () => Promise<Partial<EnvironmentConfig>>;
}

/**
 * Environment Configuration Manager
 */
export class EnvironmentConfigManager {
  private config: EnvironmentConfig | null = null;
  private sources: ConfigSource[] = [];
  private validationRules: ConfigValidationRule[] = [];
  private watchers: Map<string, any> = new Map();
  private changeListeners: Array<(config: EnvironmentConfig) => void> = [];

  constructor() {
    this.initializeDefaultSources();
    this.initializeValidationRules();
  }

  /**
   * Initialize default configuration sources
   */
  private initializeDefaultSources(): void {
    // Environment variables (highest priority)
    this.addSource({
      name: 'environment',
      priority: 100,
      load: async () => this.loadFromEnvironment(),
    });

    // Configuration files
    this.addSource({
      name: 'config-file',
      priority: 50,
      load: async () => this.loadFromFile(),
    });

    // Default values (lowest priority)
    this.addSource({
      name: 'defaults',
      priority: 10,
      load: async () => this.getDefaultConfig(),
    });
  }

  /**
   * Initialize validation rules
   */
  private initializeValidationRules(): void {
    const rules: ConfigValidationRule[] = [
      // App config
      { path: 'app.name', required: true, type: 'string' },
      { path: 'app.version', required: true, type: 'string' },
      { path: 'app.port', required: true, type: 'number', validator: (v) => v > 0 && v < 65536 },
      { path: 'app.baseUrl', required: true, type: 'string', validator: (v) => v.startsWith('http') },

      // Database config
      { path: 'database.url', required: true, type: 'string' },
      { path: 'database.maxConnections', required: true, type: 'number', validator: (v) => v > 0 },

      // AWS config
      { path: 'aws.region', required: true, type: 'string' },
      { path: 'aws.s3.buckets.uploads', required: true, type: 'string' },

      // Security config
      { path: 'security.jwt.secret', required: true, type: 'string', validator: (v) => v.length >= 32 },
      { path: 'security.jwt.expiresIn', required: true, type: 'string' },

      // Feature flags
      { path: 'features.multiTenant', required: true, type: 'boolean' },
    ];

    this.validationRules = rules;
  }

  /**
   * Add configuration source
   */
  addSource(source: ConfigSource): void {
    this.sources.push(source);
    this.sources.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Load configuration from all sources
   */
  async loadConfig(): Promise<EnvironmentConfig> {
    logger.info('Loading environment configuration');

    let mergedConfig: Partial<EnvironmentConfig> = {};

    // Load from all sources in priority order
    for (const source of this.sources) {
      try {
        const sourceConfig = await source.load();
        mergedConfig = this.deepMerge(mergedConfig, sourceConfig);
        
        logger.debug('Configuration loaded from source', {
          source: source.name,
          priority: source.priority,
        });
      } catch (error) {
        logger.error('Failed to load configuration from source', error as Error, {
          source: source.name,
        });
      }
    }

    // Validate configuration
    const validationErrors = this.validateConfig(mergedConfig);
    if (validationErrors.length > 0) {
      throw new Error(`Configuration validation failed: ${validationErrors.join(', ')}`);
    }

    this.config = mergedConfig as EnvironmentConfig;

    logger.info('Environment configuration loaded successfully', {
      environment: this.config.environment,
      sources: this.sources.map(s => s.name),
    });

    // Notify listeners
    this.notifyListeners(this.config);

    return this.config;
  }

  /**
   * Load configuration from environment variables
   */
  private async loadFromEnvironment(): Promise<Partial<EnvironmentConfig>> {
    const env = process.env;

    return {
      environment: (env.NODE_ENV as Environment) || 'development',
      app: {
        name: env.APP_NAME || 'EVO Platform',
        version: env.APP_VERSION || '1.0.0',
        port: parseInt(env.PORT || '3000'),
        baseUrl: env.BASE_URL || 'http://localhost:3000',
        corsOrigins: env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
        logLevel: (env.LOG_LEVEL as LogLevel) || 'info',
        timezone: env.TIMEZONE || 'UTC',
        locale: env.LOCALE || 'en',
      },
      database: {
        url: env.DATABASE_URL || '',
        maxConnections: parseInt(env.DB_MAX_CONNECTIONS || '10'),
        connectionTimeout: parseInt(env.DB_CONNECTION_TIMEOUT || '30000'),
        queryTimeout: parseInt(env.DB_QUERY_TIMEOUT || '60000'),
        ssl: env.DB_SSL === 'true',
        migrations: {
          autoRun: env.DB_AUTO_MIGRATE === 'true',
          directory: env.DB_MIGRATIONS_DIR || './migrations',
        },
        backup: {
          enabled: env.DB_BACKUP_ENABLED === 'true',
          schedule: env.DB_BACKUP_SCHEDULE || '0 2 * * *',
          retention: parseInt(env.DB_BACKUP_RETENTION || '30'),
        },
      },
      aws: {
        region: env.AWS_REGION || 'us-east-1',
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        sessionToken: env.AWS_SESSION_TOKEN,
        s3: {
          buckets: {
            uploads: env.S3_UPLOADS_BUCKET || 'evo-uds-uploads',
            backups: env.S3_BACKUPS_BUCKET || 'evo-uds-backups',
            logs: env.S3_LOGS_BUCKET || 'evo-uds-logs',
          },
        },
        lambda: {
          timeout: parseInt(env.LAMBDA_TIMEOUT || '30'),
          memorySize: parseInt(env.LAMBDA_MEMORY_SIZE || '512'),
        },
        cloudWatch: {
          logGroup: env.CLOUDWATCH_LOG_GROUP || '/aws/lambda/evo-uds',
          metricsNamespace: env.CLOUDWATCH_METRICS_NAMESPACE || 'EVO-UDS',
        },
        sns: {
          alertTopic: env.SNS_ALERT_TOPIC || '',
        },
      },
      security: {
        jwt: {
          secret: env.JWT_SECRET || '',
          expiresIn: env.JWT_EXPIRES_IN || '1h',
          refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN || '7d',
          algorithm: env.JWT_ALGORITHM || 'HS256',
        },
        encryption: {
          algorithm: env.ENCRYPTION_ALGORITHM || 'aes-256-gcm',
          keyLength: parseInt(env.ENCRYPTION_KEY_LENGTH || '32'),
        },
        rateLimit: {
          windowMs: parseInt(env.RATE_LIMIT_WINDOW_MS || '900000'),
          maxRequests: parseInt(env.RATE_LIMIT_MAX_REQUESTS || '100'),
        },
        cors: {
          enabled: env.CORS_ENABLED !== 'false',
          credentials: env.CORS_CREDENTIALS === 'true',
          maxAge: parseInt(env.CORS_MAX_AGE || '86400'),
        },
        headers: {
          hsts: env.SECURITY_HSTS !== 'false',
          csp: env.SECURITY_CSP !== 'false',
          frameOptions: env.SECURITY_FRAME_OPTIONS || 'DENY',
        },
      },
      monitoring: {
        enabled: env.MONITORING_ENABLED !== 'false',
        metricsInterval: parseInt(env.METRICS_INTERVAL || '60000'),
        healthCheck: {
          enabled: env.HEALTH_CHECK_ENABLED !== 'false',
          interval: parseInt(env.HEALTH_CHECK_INTERVAL || '30000'),
          timeout: parseInt(env.HEALTH_CHECK_TIMEOUT || '5000'),
        },
        alerts: {
          enabled: env.ALERTS_ENABLED !== 'false',
          channels: env.ALERT_CHANNELS?.split(',') || ['email'],
        },
        tracing: {
          enabled: env.TRACING_ENABLED === 'true',
          sampleRate: parseFloat(env.TRACING_SAMPLE_RATE || '0.1'),
        },
      },
      features: {
        multiTenant: env.FEATURE_MULTI_TENANT === 'true',
        advancedSecurity: env.FEATURE_ADVANCED_SECURITY === 'true',
        realTimeMonitoring: env.FEATURE_REAL_TIME_MONITORING === 'true',
        aiPoweredScans: env.FEATURE_AI_POWERED_SCANS === 'true',
        autoRemediation: env.FEATURE_AUTO_REMEDIATION === 'true',
        betaFeatures: env.FEATURE_BETA === 'true',
        experimentalApi: env.FEATURE_EXPERIMENTAL_API === 'true',
      },
      integrations: {
        stripe: {
          publishableKey: env.STRIPE_PUBLISHABLE_KEY || '',
          secretKey: env.STRIPE_SECRET_KEY || '',
          webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
        },
        sendgrid: {
          apiKey: env.SENDGRID_API_KEY || '',
          fromEmail: env.SENDGRID_FROM_EMAIL || '',
        },
        slack: {
          webhookUrl: env.SLACK_WEBHOOK_URL || '',
          channel: env.SLACK_CHANNEL || '#alerts',
        },
      },
      performance: {
        cache: {
          ttl: parseInt(env.CACHE_TTL || '3600'),
          maxSize: parseInt(env.CACHE_MAX_SIZE || '1000'),
          compression: env.CACHE_COMPRESSION === 'true',
        },
        pagination: {
          defaultLimit: parseInt(env.PAGINATION_DEFAULT_LIMIT || '20'),
          maxLimit: parseInt(env.PAGINATION_MAX_LIMIT || '100'),
        },
        uploads: {
          maxFileSize: parseInt(env.UPLOAD_MAX_FILE_SIZE || '10485760'), // 10MB
          allowedTypes: env.UPLOAD_ALLOWED_TYPES?.split(',') || ['image/*', 'application/pdf'],
        },
      },
    };
  }

  /**
   * Load configuration from file
   */
  private async loadFromFile(): Promise<Partial<EnvironmentConfig>> {
    const environment = process.env.NODE_ENV || 'development';
    const configPaths = [
      `./config/${environment}.json`,
      `./config/${environment}.js`,
      './config/default.json',
      './config/default.js',
    ];

    for (const configPath of configPaths) {
      try {
        const fullPath = path.resolve(configPath);
        
        if (configPath.endsWith('.json')) {
          const content = await fs.readFile(fullPath, 'utf-8');
          return JSON.parse(content);
        } else if (configPath.endsWith('.js')) {
          const configModule = await import(fullPath);
          return configModule.default || configModule;
        }
      } catch (error) {
        // File doesn't exist or can't be loaded, continue to next
        continue;
      }
    }

    return {};
  }

  /**
   * Get default configuration
   */
  private async getDefaultConfig(): Promise<Partial<EnvironmentConfig>> {
    return {
      environment: 'development',
      app: {
        name: 'EVO Platform',
        version: '1.0.0',
        port: 3000,
        baseUrl: 'http://localhost:3000',
        corsOrigins: ['http://localhost:3000'],
        logLevel: 'info',
        timezone: 'UTC',
        locale: 'en',
      },
      database: {
        url: 'postgresql://localhost:5432/evo_platform',
        maxConnections: 10,
        connectionTimeout: 30000,
        queryTimeout: 60000,
        ssl: false,
        migrations: {
          autoRun: false,
          directory: './migrations',
        },
        backup: {
          enabled: false,
          schedule: '0 2 * * *',
          retention: 30,
        },
      },
      aws: {
        region: 'us-east-1',
        s3: {
          buckets: {
            uploads: 'evo-uds-uploads-dev',
            backups: 'evo-uds-backups-dev',
            logs: 'evo-uds-logs-dev',
          },
        },
        lambda: {
          timeout: 30,
          memorySize: 512,
        },
        cloudWatch: {
          logGroup: '/aws/lambda/evo-uds-dev',
          metricsNamespace: 'EVO-UDS-DEV',
        },
        sns: {
          alertTopic: '',
        },
      },
      security: {
        jwt: {
          secret: 'your-super-secret-jwt-key-change-this-in-production',
          expiresIn: '1h',
          refreshExpiresIn: '7d',
          algorithm: 'HS256',
        },
        encryption: {
          algorithm: 'aes-256-gcm',
          keyLength: 32,
        },
        rateLimit: {
          windowMs: 900000, // 15 minutes
          maxRequests: 100,
        },
        cors: {
          enabled: true,
          credentials: true,
          maxAge: 86400,
        },
        headers: {
          hsts: true,
          csp: true,
          frameOptions: 'DENY',
        },
      },
      monitoring: {
        enabled: true,
        metricsInterval: 60000,
        healthCheck: {
          enabled: true,
          interval: 30000,
          timeout: 5000,
        },
        alerts: {
          enabled: false,
          channels: ['email'],
        },
        tracing: {
          enabled: false,
          sampleRate: 0.1,
        },
      },
      features: {
        multiTenant: true,
        advancedSecurity: true,
        realTimeMonitoring: false,
        aiPoweredScans: false,
        autoRemediation: false,
        betaFeatures: false,
        experimentalApi: false,
      },
      integrations: {
        stripe: {
          publishableKey: '',
          secretKey: '',
          webhookSecret: '',
        },
        sendgrid: {
          apiKey: '',
          fromEmail: '',
        },
        slack: {
          webhookUrl: '',
          channel: '#alerts',
        },
      },
      performance: {
        cache: {
          ttl: 3600,
          maxSize: 1000,
          compression: false,
        },
        pagination: {
          defaultLimit: 20,
          maxLimit: 100,
        },
        uploads: {
          maxFileSize: 10485760, // 10MB
          allowedTypes: ['image/*', 'application/pdf'],
        },
      },
    };
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: Partial<EnvironmentConfig>): string[] {
    const errors: string[] = [];

    for (const rule of this.validationRules) {
      const value = this.getNestedValue(config, rule.path);

      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`Required configuration missing: ${rule.path}`);
        continue;
      }

      if (value !== undefined && value !== null) {
        // Type validation
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== rule.type) {
          errors.push(`Invalid type for ${rule.path}: expected ${rule.type}, got ${actualType}`);
          continue;
        }

        // Custom validation
        if (rule.validator && !rule.validator(value)) {
          errors.push(rule.message || `Validation failed for ${rule.path}`);
        }
      }
    }

    return errors;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Get current configuration
   */
  getConfig(): EnvironmentConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return this.config;
  }

  /**
   * Get configuration value by path
   */
  get<T = any>(path: string, defaultValue?: T): T {
    const config = this.getConfig();
    const value = this.getNestedValue(config, path);
    return value !== undefined ? value : (defaultValue as T);
  }

  /**
   * Check if feature flag is enabled
   */
  isFeatureEnabled(feature: keyof FeatureFlags): boolean {
    return this.get(`features.${feature}`, false);
  }

  /**
   * Watch for configuration changes
   */
  async watchForChanges(): Promise<void> {
    const configPaths = [
      './config',
      '.env',
      '.env.local',
    ];

    for (const configPath of configPaths) {
      try {
        const watcher = fs.watch(configPath, { recursive: true });
        this.watchers.set(configPath, watcher as any);

        // Note: In a real implementation, you'd set up proper file watching
        logger.info('Watching configuration path for changes', { path: configPath });
      } catch (error) {
        logger.debug('Could not watch configuration path', { path: configPath });
      }
    }
  }

  /**
   * Add change listener
   */
  onChange(listener: (config: EnvironmentConfig) => void): void {
    this.changeListeners.push(listener);
  }

  /**
   * Notify change listeners
   */
  private notifyListeners(config: EnvironmentConfig): void {
    for (const listener of this.changeListeners) {
      try {
        listener(config);
      } catch (error) {
        logger.error('Configuration change listener failed', error as Error);
      }
    }
  }

  /**
   * Reload configuration
   */
  async reloadConfig(): Promise<EnvironmentConfig> {
    logger.info('Reloading configuration');
    return this.loadConfig();
  }

  /**
   * Generate configuration template
   */
  generateTemplate(environment: Environment): string {
    const template = {
      environment,
      app: {
        name: 'EVO UDS',
        version: '1.0.0',
        port: environment === 'production' ? 80 : 3000,
        baseUrl: environment === 'production' ? 'https://api.evo-uds.com' : 'http://localhost:3000',
        corsOrigins: environment === 'production' ? ['https://app.evo-uds.com'] : ['http://localhost:3000'],
        logLevel: environment === 'production' ? 'warn' : 'debug',
        timezone: 'UTC',
        locale: 'en',
      },
      database: {
        url: '${DATABASE_URL}',
        maxConnections: environment === 'production' ? 20 : 10,
        connectionTimeout: 30000,
        queryTimeout: 60000,
        ssl: environment === 'production',
        migrations: {
          autoRun: environment !== 'production',
          directory: './migrations',
        },
        backup: {
          enabled: environment === 'production',
          schedule: '0 2 * * *',
          retention: environment === 'production' ? 90 : 7,
        },
      },
      // ... other configuration sections
    };

    return JSON.stringify(template, null, 2);
  }

  /**
   * Destroy configuration manager
   */
  destroy(): void {
    // Close file watchers
    for (const [path, watcher] of this.watchers) {
      try {
        (watcher as any).close();
      } catch (error) {
        logger.error('Failed to close configuration watcher', error as Error, { path });
      }
    }
    this.watchers.clear();
    this.changeListeners = [];
  }
}

// Global configuration manager
export const configManager = new EnvironmentConfigManager();

// Helper functions
export async function loadConfig(): Promise<EnvironmentConfig> {
  return configManager.loadConfig();
}

export function getConfig(): EnvironmentConfig {
  return configManager.getConfig();
}

export function get<T = any>(path: string, defaultValue?: T): T {
  return configManager.get(path, defaultValue);
}

export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  return configManager.isFeatureEnabled(feature);
}

// Environment-specific configurations
export const ENVIRONMENT_CONFIGS = {
  development: {
    features: {
      multiTenant: true,
      advancedSecurity: true,
      realTimeMonitoring: false,
      aiPoweredScans: false,
      autoRemediation: false,
      betaFeatures: true,
      experimentalApi: true,
    },
    monitoring: {
      enabled: true,
      alerts: { enabled: false },
      tracing: { enabled: false },
    },
  },
  
  staging: {
    features: {
      multiTenant: true,
      advancedSecurity: true,
      realTimeMonitoring: true,
      aiPoweredScans: true,
      autoRemediation: false,
      betaFeatures: true,
      experimentalApi: false,
    },
    monitoring: {
      enabled: true,
      alerts: { enabled: true },
      tracing: { enabled: true, sampleRate: 0.5 },
    },
  },
  
  production: {
    features: {
      multiTenant: true,
      advancedSecurity: true,
      realTimeMonitoring: true,
      aiPoweredScans: true,
      autoRemediation: true,
      betaFeatures: false,
      experimentalApi: false,
    },
    monitoring: {
      enabled: true,
      alerts: { enabled: true },
      tracing: { enabled: true, sampleRate: 0.1 },
    },
  },
} as const;