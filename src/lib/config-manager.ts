/**
 * Dynamic Configuration Manager
 * Allows runtime configuration of intervals and other settings
 */

export interface SystemConfig {
  intervals: {
    autoRefresh: number;
    globalRefresh: number;
    licenseValidation: number;
    backgroundJobRefresh: number;
    realtimeReconnect: number;
  };
  retry: {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
  };
  performance: {
    maxConcurrentQueries: number;
    queryBatchSize: number;
    rateLimitMs: number;
  };
  monitoring: {
    healthCheckInterval: number;
    metricsEnabled: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
}

const DEFAULT_CONFIG: SystemConfig = {
  intervals: {
    autoRefresh: 5 * 60 * 1000, // 5 minutes
    globalRefresh: 5 * 60 * 1000, // 5 minutes
    licenseValidation: 24 * 60 * 60 * 1000, // 24 hours
    backgroundJobRefresh: 5000, // 5 seconds
    realtimeReconnect: 30000, // 30 seconds
  },
  retry: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
  },
  performance: {
    maxConcurrentQueries: 5,
    queryBatchSize: 3,
    rateLimitMs: 2000,
  },
  monitoring: {
    healthCheckInterval: 60000, // 1 minute
    metricsEnabled: true,
    logLevel: 'info',
  },
};

class ConfigManager {
  private static instance: ConfigManager;
  private config: SystemConfig;
  private listeners: Map<string, Set<(config: SystemConfig) => void>> = new Map();

  private constructor() {
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): SystemConfig {
    try {
      const stored = localStorage.getItem('evo-system-config');
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch (error) {
      console.warn('Failed to load config from localStorage:', error);
    }
    return DEFAULT_CONFIG;
  }

  private saveConfig(): void {
    try {
      localStorage.setItem('evo-system-config', JSON.stringify(this.config));
    } catch (error) {
      console.error('Failed to save config to localStorage:', error);
    }
  }

  getConfig(): Readonly<SystemConfig> {
    return { ...this.config };
  }

  updateConfig(updates: Partial<SystemConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
      intervals: { ...this.config.intervals, ...updates.intervals },
      retry: { ...this.config.retry, ...updates.retry },
      performance: { ...this.config.performance, ...updates.performance },
      monitoring: { ...this.config.monitoring, ...updates.monitoring },
    };
    this.saveConfig();
    this.notifyListeners();
  }

  resetToDefaults(): void {
    this.config = DEFAULT_CONFIG;
    this.saveConfig();
    this.notifyListeners();
  }

  subscribe(key: string, callback: (config: SystemConfig) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(key);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.listeners.delete(key);
        }
      }
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((callbacks) => {
      callbacks.forEach((callback) => {
        try {
          callback(this.config);
        } catch (error) {
          console.error('Config listener error:', error);
        }
      });
    });
  }

  // Convenience getters for common values
  get intervals() {
    return this.config.intervals;
  }

  get retry() {
    return this.config.retry;
  }

  get performance() {
    return this.config.performance;
  }

  get monitoring() {
    return this.config.monitoring;
  }
}

export const configManager = ConfigManager.getInstance();
