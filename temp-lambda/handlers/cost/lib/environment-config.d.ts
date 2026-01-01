/**
 * Comprehensive Environment Configuration System
 * Provides type-safe configuration management with validation and hot-reloading
 */
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
export declare class EnvironmentConfigManager {
    private config;
    private sources;
    private validationRules;
    private watchers;
    private changeListeners;
    constructor();
    /**
     * Initialize default configuration sources
     */
    private initializeDefaultSources;
    /**
     * Initialize validation rules
     */
    private initializeValidationRules;
    /**
     * Add configuration source
     */
    addSource(source: ConfigSource): void;
    /**
     * Load configuration from all sources
     */
    loadConfig(): Promise<EnvironmentConfig>;
    /**
     * Load configuration from environment variables
     */
    private loadFromEnvironment;
    /**
     * Load configuration from file
     */
    private loadFromFile;
    /**
     * Get default configuration
     */
    private getDefaultConfig;
    /**
     * Validate configuration
     */
    private validateConfig;
    /**
     * Get nested value from object using dot notation
     */
    private getNestedValue;
    /**
     * Deep merge two objects
     */
    private deepMerge;
    /**
     * Get current configuration
     */
    getConfig(): EnvironmentConfig;
    /**
     * Get configuration value by path
     */
    get<T = any>(path: string, defaultValue?: T): T;
    /**
     * Check if feature flag is enabled
     */
    isFeatureEnabled(feature: keyof FeatureFlags): boolean;
    /**
     * Watch for configuration changes
     */
    watchForChanges(): Promise<void>;
    /**
     * Add change listener
     */
    onChange(listener: (config: EnvironmentConfig) => void): void;
    /**
     * Notify change listeners
     */
    private notifyListeners;
    /**
     * Reload configuration
     */
    reloadConfig(): Promise<EnvironmentConfig>;
    /**
     * Generate configuration template
     */
    generateTemplate(environment: Environment): string;
    /**
     * Destroy configuration manager
     */
    destroy(): void;
}
export declare const configManager: EnvironmentConfigManager;
export declare function loadConfig(): Promise<EnvironmentConfig>;
export declare function getConfig(): EnvironmentConfig;
export declare function get<T = any>(path: string, defaultValue?: T): T;
export declare function isFeatureEnabled(feature: keyof FeatureFlags): boolean;
export declare const ENVIRONMENT_CONFIGS: {
    readonly development: {
        readonly features: {
            readonly multiTenant: true;
            readonly advancedSecurity: true;
            readonly realTimeMonitoring: false;
            readonly aiPoweredScans: false;
            readonly autoRemediation: false;
            readonly betaFeatures: true;
            readonly experimentalApi: true;
        };
        readonly monitoring: {
            readonly enabled: true;
            readonly alerts: {
                readonly enabled: false;
            };
            readonly tracing: {
                readonly enabled: false;
            };
        };
    };
    readonly staging: {
        readonly features: {
            readonly multiTenant: true;
            readonly advancedSecurity: true;
            readonly realTimeMonitoring: true;
            readonly aiPoweredScans: true;
            readonly autoRemediation: false;
            readonly betaFeatures: true;
            readonly experimentalApi: false;
        };
        readonly monitoring: {
            readonly enabled: true;
            readonly alerts: {
                readonly enabled: true;
            };
            readonly tracing: {
                readonly enabled: true;
                readonly sampleRate: 0.5;
            };
        };
    };
    readonly production: {
        readonly features: {
            readonly multiTenant: true;
            readonly advancedSecurity: true;
            readonly realTimeMonitoring: true;
            readonly aiPoweredScans: true;
            readonly autoRemediation: true;
            readonly betaFeatures: false;
            readonly experimentalApi: false;
        };
        readonly monitoring: {
            readonly enabled: true;
            readonly alerts: {
                readonly enabled: true;
            };
            readonly tracing: {
                readonly enabled: true;
                readonly sampleRate: 0.1;
            };
        };
    };
};
//# sourceMappingURL=environment-config.d.ts.map