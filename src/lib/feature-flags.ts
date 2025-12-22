/**
 * Feature Flags System
 * Dynamic feature toggling with user targeting and gradual rollouts
 */

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { logger } from './logging';
import { metricsCollector } from './metrics-collector';
import { cacheManager } from '../backend/src/lib/redis-cache';

export interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  targetUsers?: string[];
  targetOrganizations?: string[];
  targetRoles?: string[];
  conditions?: FeatureFlagCondition[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface FeatureFlagCondition {
  type: 'user_attribute' | 'organization_attribute' | 'date_range' | 'custom';
  attribute?: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
  value: any;
}

export interface FeatureFlagContext {
  userId?: string;
  organizationId?: string;
  userRole?: string;
  userAttributes?: Record<string, any>;
  organizationAttributes?: Record<string, any>;
  timestamp?: Date;
}

export interface FeatureFlagEvaluation {
  flagKey: string;
  enabled: boolean;
  reason: string;
  variant?: string;
  metadata?: Record<string, any>;
}

/**
 * Feature Flag Manager
 */
export class FeatureFlagManager {
  private flags: Map<string, FeatureFlag> = new Map();
  private cache: Map<string, FeatureFlagEvaluation> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes
  private lastSync = 0;
  private syncInterval = 60 * 1000; // 1 minute

  constructor() {
    this.startPeriodicSync();
  }

  /**
   * Load feature flags from backend
   */
  async loadFlags(): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Try cache first
      const cachedFlags = await cacheManager.get<FeatureFlag[]>('feature_flags', {
        prefix: 'system'
      });

      if (cachedFlags && Array.isArray(cachedFlags)) {
        cachedFlags.forEach(flag => {
          this.flags.set(flag.key, flag);
        });
        
        logger.debug('Feature flags loaded from cache', {
          count: cachedFlags.length
        });
        return;
      }

      // Fetch from API
      const response = await fetch('/api/feature-flags', {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch feature flags: ${response.status}`);
      }

      const flags: FeatureFlag[] = await response.json();
      
      // Update local cache
      flags.forEach(flag => {
        this.flags.set(flag.key, flag);
      });

      // Cache for future use
      await cacheManager.set('feature_flags', flags, {
        prefix: 'system',
        ttl: 300 // 5 minutes
      });

      const duration = Date.now() - startTime;
      
      logger.info('Feature flags loaded successfully', {
        count: flags.length,
        duration
      });

      metricsCollector.record('feature_flags_loaded', flags.length, {
        source: 'api',
        duration: duration.toString()
      });

      this.lastSync = Date.now();

    } catch (error) {
      logger.error('Failed to load feature flags', error as Error);
      
      metricsCollector.record('feature_flags_load_error', 1, {
        errorType: (error as Error).name
      });

      // Use default flags if loading fails
      this.loadDefaultFlags();
    }
  }

  /**
   * Evaluate feature flag for given context
   */
  evaluate(flagKey: string, context: FeatureFlagContext = {}): FeatureFlagEvaluation {
    const cacheKey = this.getCacheKey(flagKey, context);
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    const flag = this.flags.get(flagKey);
    
    if (!flag) {
      const evaluation: FeatureFlagEvaluation = {
        flagKey,
        enabled: false,
        reason: 'Flag not found',
      };
      
      this.cache.set(cacheKey, evaluation);
      return evaluation;
    }

    const evaluation = this.evaluateFlag(flag, context);
    
    // Cache the result
    this.cache.set(cacheKey, evaluation);
    
    // Record metrics
    metricsCollector.record('feature_flag_evaluation', 1, {
      flagKey,
      enabled: evaluation.enabled.toString(),
      reason: evaluation.reason,
      userId: context.userId || 'anonymous',
      organizationId: context.organizationId || 'unknown'
    });

    return evaluation;
  }

  /**
   * Check if feature is enabled
   */
  isEnabled(flagKey: string, context: FeatureFlagContext = {}): boolean {
    return this.evaluate(flagKey, context).enabled;
  }

  /**
   * Get feature flag variant
   */
  getVariant(flagKey: string, context: FeatureFlagContext = {}): string | undefined {
    return this.evaluate(flagKey, context).variant;
  }

  /**
   * Get all enabled features for context
   */
  getEnabledFeatures(context: FeatureFlagContext = {}): string[] {
    const enabled: string[] = [];
    
    for (const flagKey of this.flags.keys()) {
      if (this.isEnabled(flagKey, context)) {
        enabled.push(flagKey);
      }
    }
    
    return enabled;
  }

  /**
   * Evaluate individual flag
   */
  private evaluateFlag(flag: FeatureFlag, context: FeatureFlagContext): FeatureFlagEvaluation {
    // Check if flag is globally disabled
    if (!flag.enabled) {
      return {
        flagKey: flag.key,
        enabled: false,
        reason: 'Flag globally disabled',
      };
    }

    // Check user targeting
    if (flag.targetUsers && context.userId) {
      if (flag.targetUsers.includes(context.userId)) {
        return {
          flagKey: flag.key,
          enabled: true,
          reason: 'User explicitly targeted',
        };
      }
    }

    // Check organization targeting
    if (flag.targetOrganizations && context.organizationId) {
      if (flag.targetOrganizations.includes(context.organizationId)) {
        return {
          flagKey: flag.key,
          enabled: true,
          reason: 'Organization explicitly targeted',
        };
      }
    }

    // Check role targeting
    if (flag.targetRoles && context.userRole) {
      if (flag.targetRoles.includes(context.userRole)) {
        return {
          flagKey: flag.key,
          enabled: true,
          reason: 'Role explicitly targeted',
        };
      }
    }

    // Check conditions
    if (flag.conditions && flag.conditions.length > 0) {
      const conditionResult = this.evaluateConditions(flag.conditions, context);
      if (!conditionResult.passed) {
        return {
          flagKey: flag.key,
          enabled: false,
          reason: `Condition failed: ${conditionResult.reason}`,
        };
      }
    }

    // Check rollout percentage
    if (flag.rolloutPercentage < 100) {
      const hash = this.hashContext(flag.key, context);
      const bucket = hash % 100;
      
      if (bucket >= flag.rolloutPercentage) {
        return {
          flagKey: flag.key,
          enabled: false,
          reason: `Outside rollout percentage (${bucket}% >= ${flag.rolloutPercentage}%)`,
        };
      }
    }

    return {
      flagKey: flag.key,
      enabled: true,
      reason: 'All conditions passed',
      metadata: flag.metadata,
    };
  }

  /**
   * Evaluate conditions
   */
  private evaluateConditions(
    conditions: FeatureFlagCondition[],
    context: FeatureFlagContext
  ): { passed: boolean; reason?: string } {
    for (const condition of conditions) {
      const result = this.evaluateCondition(condition, context);
      if (!result.passed) {
        return result;
      }
    }
    
    return { passed: true };
  }

  /**
   * Evaluate single condition
   */
  private evaluateCondition(
    condition: FeatureFlagCondition,
    context: FeatureFlagContext
  ): { passed: boolean; reason?: string } {
    let actualValue: any;

    switch (condition.type) {
      case 'user_attribute':
        actualValue = context.userAttributes?.[condition.attribute!];
        break;
      case 'organization_attribute':
        actualValue = context.organizationAttributes?.[condition.attribute!];
        break;
      case 'date_range':
        actualValue = context.timestamp || new Date();
        break;
      default:
        return { passed: false, reason: `Unknown condition type: ${condition.type}` };
    }

    const passed = this.compareValues(actualValue, condition.operator, condition.value);
    
    return {
      passed,
      reason: passed ? undefined : `${condition.attribute} ${condition.operator} ${condition.value} (actual: ${actualValue})`
    };
  }

  /**
   * Compare values based on operator
   */
  private compareValues(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'not_equals':
        return actual !== expected;
      case 'contains':
        return String(actual).includes(String(expected));
      case 'greater_than':
        return Number(actual) > Number(expected);
      case 'less_than':
        return Number(actual) < Number(expected);
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'not_in':
        return Array.isArray(expected) && !expected.includes(actual);
      default:
        return false;
    }
  }

  /**
   * Hash context for consistent bucketing
   */
  private hashContext(flagKey: string, context: FeatureFlagContext): number {
    const str = `${flagKey}:${context.userId || ''}:${context.organizationId || ''}`;
    let hash = 0;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash);
  }

  /**
   * Generate cache key
   */
  private getCacheKey(flagKey: string, context: FeatureFlagContext): string {
    return `${flagKey}:${context.userId || 'anon'}:${context.organizationId || 'none'}:${context.userRole || 'none'}`;
  }

  /**
   * Check if cache is valid
   */
  private isCacheValid(evaluation: FeatureFlagEvaluation): boolean {
    // For now, cache is always valid within timeout
    // Could add timestamp-based validation here
    return true;
  }

  /**
   * Get auth token
   */
  private getAuthToken(): string {
    // Implementation depends on your auth system
    return localStorage.getItem('auth_token') || '';
  }

  /**
   * Load default flags
   */
  private loadDefaultFlags(): void {
    const defaultFlags: FeatureFlag[] = [
      {
        key: 'ml_waste_detection',
        name: 'ML Waste Detection',
        description: 'Enable ML-powered waste detection features',
        enabled: true,
        rolloutPercentage: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
      },
      {
        key: 'advanced_security_scan',
        name: 'Advanced Security Scan',
        description: 'Enable advanced security scanning features',
        enabled: true,
        rolloutPercentage: 50,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
      },
      {
        key: 'real_time_monitoring',
        name: 'Real-time Monitoring',
        description: 'Enable real-time monitoring dashboard',
        enabled: false,
        rolloutPercentage: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
      },
    ];

    defaultFlags.forEach(flag => {
      this.flags.set(flag.key, flag);
    });

    logger.info('Default feature flags loaded', {
      count: defaultFlags.length
    });
  }

  /**
   * Start periodic sync
   */
  private startPeriodicSync(): void {
    setInterval(async () => {
      if (Date.now() - this.lastSync > this.syncInterval) {
        await this.loadFlags();
      }
    }, this.syncInterval);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get flag details
   */
  getFlag(flagKey: string): FeatureFlag | undefined {
    return this.flags.get(flagKey);
  }

  /**
   * List all flags
   */
  getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }
}

// Global feature flag manager
export const featureFlagManager = new FeatureFlagManager();

// React Context
const FeatureFlagContext = createContext<{
  manager: FeatureFlagManager;
  context: FeatureFlagContext;
  isEnabled: (flagKey: string) => boolean;
  getVariant: (flagKey: string) => string | undefined;
  evaluate: (flagKey: string) => FeatureFlagEvaluation;
}>({
  manager: featureFlagManager,
  context: {},
  isEnabled: () => false,
  getVariant: () => undefined,
  evaluate: () => ({ flagKey: '', enabled: false, reason: 'Not initialized' }),
});

// Provider component
export const FeatureFlagProvider: React.FC<{
  children: React.ReactNode;
  context?: FeatureFlagContext;
}> = ({ children, context = {} }) => {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    featureFlagManager.loadFlags();
  }, []);

  const isEnabled = useCallback((flagKey: string) => {
    return featureFlagManager.isEnabled(flagKey, context);
  }, [context]);

  const getVariant = useCallback((flagKey: string) => {
    return featureFlagManager.getVariant(flagKey, context);
  }, [context]);

  const evaluate = useCallback((flagKey: string) => {
    return featureFlagManager.evaluate(flagKey, context);
  }, [context]);

  return (
    <FeatureFlagContext.Provider
      value={{
        manager: featureFlagManager,
        context,
        isEnabled,
        getVariant,
        evaluate,
      }}
    >
      {children}
    </FeatureFlagContext.Provider>
  );
};

// Hooks
export const useFeatureFlag = (flagKey: string) => {
  const { isEnabled, getVariant, evaluate } = useContext(FeatureFlagContext);
  
  return {
    isEnabled: isEnabled(flagKey),
    variant: getVariant(flagKey),
    evaluation: evaluate(flagKey),
  };
};

export const useFeatureFlags = () => {
  const { manager, context, isEnabled, getVariant, evaluate } = useContext(FeatureFlagContext);
  
  return {
    manager,
    context,
    isEnabled,
    getVariant,
    evaluate,
    getEnabledFeatures: () => manager.getEnabledFeatures(context),
  };
};

// Component wrapper for feature flags
export const FeatureGate: React.FC<{
  flagKey: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  variant?: string;
}> = ({ flagKey, children, fallback = null, variant }) => {
  const { isEnabled, getVariant } = useFeatureFlag(flagKey);
  
  if (!isEnabled) {
    return <>{fallback}</>;
  }
  
  if (variant && getVariant !== variant) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
};

// HOC for feature flags
export const withFeatureFlag = <P extends object>(
  flagKey: string,
  fallbackComponent?: React.ComponentType<P>
) => {
  return (Component: React.ComponentType<P>) => {
    const WrappedComponent = (props: P) => {
      const { isEnabled } = useFeatureFlag(flagKey);
      
      if (!isEnabled) {
        return fallbackComponent ? <fallbackComponent {...props} /> : null;
      }
      
      return <Component {...props} />;
    };
    
    WrappedComponent.displayName = `withFeatureFlag(${Component.displayName || Component.name})`;
    
    return WrappedComponent;
  };
};

// Predefined feature flags
export const FeatureFlags = {
  ML_WASTE_DETECTION: 'ml_waste_detection',
  ADVANCED_SECURITY_SCAN: 'advanced_security_scan',
  REAL_TIME_MONITORING: 'real_time_monitoring',
  COST_OPTIMIZATION_V2: 'cost_optimization_v2',
  MULTI_REGION_SUPPORT: 'multi_region_support',
  DARK_MODE: 'dark_mode',
  BETA_FEATURES: 'beta_features',
  ADMIN_PANEL_V2: 'admin_panel_v2',
  KNOWLEDGE_BASE_AI: 'knowledge_base_ai',
  AUTOMATED_REMEDIATION: 'automated_remediation',
} as const;

// Utility functions
export const featureFlagUtils = {
  /**
   * Check multiple flags at once
   */
  checkMultiple(flagKeys: string[], context?: FeatureFlagContext): Record<string, boolean> {
    const results: Record<string, boolean> = {};
    
    flagKeys.forEach(key => {
      results[key] = featureFlagManager.isEnabled(key, context);
    });
    
    return results;
  },

  /**
   * Get feature flag configuration for debugging
   */
  getDebugInfo(flagKey: string, context?: FeatureFlagContext) {
    const flag = featureFlagManager.getFlag(flagKey);
    const evaluation = featureFlagManager.evaluate(flagKey, context);
    
    return {
      flag,
      evaluation,
      context,
    };
  },

  /**
   * Bulk enable/disable for testing
   */
  overrideForTesting(overrides: Record<string, boolean>) {
    // This would be implemented for testing environments
    logger.warn('Feature flag overrides applied for testing', overrides);
  },
};

// Initialize feature flags on module load
featureFlagManager.loadFlags();