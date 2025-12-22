/**
 * Application Configuration
 * Centralized configuration management
 */

export const APP_CONFIG = {
  // Application Info
  name: 'EVO AWS Platform',
  version: '1.0.0',
  buildDate: '2025-11-18',
  environment: import.meta.env.MODE,
  
  // Feature Flags
  features: {
    mfa: true,
    impersonation: true,
    aiInsights: true,
    advancedAnalytics: true,
    costOptimization: true,
    securityScanning: true,
    endpointMonitoring: true,
    wellArchitected: true,
  },
  
  // Performance Settings
  performance: {
    cacheTimeout: 5 * 60 * 1000, // 5 minutes
    autoRefreshInterval: 30 * 1000, // 30 seconds
    maxRetries: 3,
    requestTimeout: 30000, // 30 seconds
  },
  
  // Security Settings
  security: {
    sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
    mfaRequired: false, // Optional MFA
    passwordMinLength: 8,
    maxLoginAttempts: 5,
  },
  
  // UI Settings
  ui: {
    itemsPerPage: 10,
    defaultTheme: 'system', // 'light' | 'dark' | 'system'
    defaultLanguage: 'pt', // 'pt' | 'en' | 'es'
  },
} as const;

export type AppConfig = typeof APP_CONFIG;
