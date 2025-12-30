/**
 * Intelligent Cache Invalidation System
 * Manages cache dependencies and automatic invalidation patterns
 */

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';

export interface CacheInvalidationRule {
  pattern: string | RegExp;
  dependencies: string[];
  conditions?: (queryKey: string[], data?: unknown) => boolean;
  delay?: number; // Delay invalidation in ms
}

export interface CacheTag {
  name: string;
  dependencies: string[];
  ttl?: number; // Time to live in ms
}

/**
 * Cache Invalidation Manager
 * Handles intelligent cache invalidation based on data relationships
 */
export class CacheInvalidationManager {
  private rules: Map<string, CacheInvalidationRule> = new Map();
  private tags: Map<string, CacheTag> = new Map();
  private pendingInvalidations: Map<string, NodeJS.Timeout> = new Map();

  constructor(private queryClient: any) {
    this.setupDefaultRules();
  }

  /**
   * Setup default invalidation rules for common patterns
   */
  private setupDefaultRules(): void {
    // AWS Account changes invalidate related data
    this.addRule('aws-account-change', {
      pattern: /^aws-accounts/,
      dependencies: [
        'security-scans',
        'findings',
        'cost-data',
        'metrics',
        'compliance',
        'resource-inventory',
      ],
    });

    // Security scan completion invalidates findings and posture
    this.addRule('security-scan-complete', {
      pattern: /^security-scans/,
      dependencies: [
        'findings',
        'security-posture',
        'compliance-status',
        'risk-assessment',
      ],
      conditions: (queryKey, data: any) => {
        return data?.status === 'completed';
      },
    });

    // Finding updates invalidate aggregated data
    this.addRule('finding-update', {
      pattern: /^findings/,
      dependencies: [
        'security-posture',
        'compliance-status',
        'dashboard-metrics',
        'risk-summary',
      ],
    });

    // Cost data changes invalidate forecasts and budgets
    this.addRule('cost-data-update', {
      pattern: /^cost-data/,
      dependencies: [
        'cost-forecast',
        'budget-status',
        'waste-detection',
        'cost-optimization',
        'dashboard-costs',
      ],
    });

    // User/organization changes invalidate permissions and settings
    this.addRule('user-org-change', {
      pattern: /^(user|organization)/,
      dependencies: [
        'permissions',
        'settings',
        'preferences',
        'audit-logs',
      ],
    });

    // Resource inventory changes invalidate related metrics
    this.addRule('resource-inventory-update', {
      pattern: /^resource-inventory/,
      dependencies: [
        'metrics',
        'cost-allocation',
        'compliance-resources',
        'security-resources',
      ],
    });
  }

  /**
   * Add a new invalidation rule
   */
  addRule(name: string, rule: CacheInvalidationRule): void {
    this.rules.set(name, rule);
  }

  /**
   * Remove an invalidation rule
   */
  removeRule(name: string): void {
    this.rules.delete(name);
  }

  /**
   * Add a cache tag for grouping related queries
   */
  addTag(name: string, tag: CacheTag): void {
    this.tags.set(name, tag);
  }

  /**
   * Invalidate cache based on a trigger query key
   */
  invalidateByTrigger(triggerQueryKey: string[], data?: unknown): void {
    console.log('🔄 Cache invalidation triggered by:', triggerQueryKey);

    for (const [ruleName, rule] of this.rules) {
      const matches = this.matchesPattern(triggerQueryKey, rule.pattern);
      
      if (matches) {
        // Check conditions if specified
        if (rule.conditions && !rule.conditions(triggerQueryKey, data)) {
          continue;
        }

        console.log(`📋 Applying invalidation rule: ${ruleName}`);
        
        // Invalidate dependencies
        for (const dependency of rule.dependencies) {
          this.scheduleInvalidation(dependency, rule.delay || 0);
        }
      }
    }
  }

  /**
   * Invalidate cache by tag
   */
  invalidateByTag(tagName: string): void {
    const tag = this.tags.get(tagName);
    if (!tag) {
      console.warn(`Cache tag not found: ${tagName}`);
      return;
    }

    console.log(`🏷️ Invalidating cache by tag: ${tagName}`);
    
    for (const dependency of tag.dependencies) {
      this.scheduleInvalidation(dependency, 0);
    }
  }

  /**
   * Schedule cache invalidation with optional delay
   */
  private scheduleInvalidation(pattern: string, delay: number): void {
    const key = `invalidate-${pattern}`;
    
    // Clear existing timeout if any
    const existingTimeout = this.pendingInvalidations.get(key);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Schedule new invalidation
    const timeout = setTimeout(() => {
      this.executeInvalidation(pattern);
      this.pendingInvalidations.delete(key);
    }, delay);

    this.pendingInvalidations.set(key, timeout);
  }

  /**
   * Execute cache invalidation for a pattern
   */
  private executeInvalidation(pattern: string): void {
    console.log(`🗑️ Invalidating cache pattern: ${pattern}`);
    
    this.queryClient.invalidateQueries({
      predicate: (query: any) => {
        const queryKey = query.queryKey;
        if (!Array.isArray(queryKey)) return false;
        
        return this.matchesPattern(queryKey, pattern);
      },
    });
  }

  /**
   * Check if query key matches a pattern
   */
  private matchesPattern(queryKey: unknown[], pattern: string | RegExp): boolean {
    // Filter out null/undefined values and convert to strings
    const stringKeys = queryKey
      .filter((key): key is string | number => key != null)
      .map(key => String(key));
    
    const keyString = stringKeys.join('.');
    
    if (typeof pattern === 'string') {
      return keyString.includes(pattern) || stringKeys.some(key => key.includes(pattern));
    } else {
      return pattern.test(keyString);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    totalQueries: number;
    activeRules: number;
    pendingInvalidations: number;
    tags: number;
  } {
    const cache = this.queryClient.getQueryCache();
    
    return {
      totalQueries: cache.getAll().length,
      activeRules: this.rules.size,
      pendingInvalidations: this.pendingInvalidations.size,
      tags: this.tags.size,
    };
  }

  /**
   * Clear all pending invalidations
   */
  clearPendingInvalidations(): void {
    for (const timeout of this.pendingInvalidations.values()) {
      clearTimeout(timeout);
    }
    this.pendingInvalidations.clear();
  }
}

// Global cache invalidation manager instance
let cacheManager: CacheInvalidationManager | null = null;

/**
 * Hook to use cache invalidation manager
 */
export function useCacheInvalidation() {
  const queryClient = useQueryClient();

  // Initialize manager if not exists
  if (!cacheManager) {
    cacheManager = new CacheInvalidationManager(queryClient);
  }

  const invalidateByTrigger = useCallback((queryKey: string[], data?: unknown) => {
    cacheManager?.invalidateByTrigger(queryKey, data);
  }, []);

  const invalidateByTag = useCallback((tagName: string) => {
    cacheManager?.invalidateByTag(tagName);
  }, []);

  const addRule = useCallback((name: string, rule: CacheInvalidationRule) => {
    cacheManager?.addRule(name, rule);
  }, []);

  const addTag = useCallback((name: string, tag: CacheTag) => {
    cacheManager?.addTag(name, tag);
  }, []);

  return {
    invalidateByTrigger,
    invalidateByTag,
    addRule,
    addTag,
    getCacheStats: () => cacheManager?.getCacheStats(),
  };
}

/**
 * Hook for automatic cache invalidation on data mutations
 */
export function useAutoInvalidation(
  queryKey: string[],
  data?: unknown,
  options: {
    enabled?: boolean;
    delay?: number;
  } = {}
) {
  const { invalidateByTrigger } = useCacheInvalidation();
  const { enabled = true, delay = 0 } = options;

  useEffect(() => {
    if (enabled && data) {
      const timeoutId = setTimeout(() => {
        invalidateByTrigger(queryKey, data);
      }, delay);

      return () => clearTimeout(timeoutId);
    }
  }, [queryKey, data, enabled, delay, invalidateByTrigger]);
}

/**
 * Smart cache invalidation for mutations
 */
export function useSmartMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: {
    invalidationRules?: string[];
    invalidationTags?: string[];
    onSuccess?: (data: TData, variables: TVariables) => void;
    onError?: (error: Error, variables: TVariables) => void;
  } = {}
) {
  const { invalidateByTrigger, invalidateByTag } = useCacheInvalidation();
  const queryClient = useQueryClient();

  return queryClient.useMutation({
    mutationFn,
    onSuccess: (data, variables) => {
      // Trigger rule-based invalidation
      if (options.invalidationRules) {
        for (const rule of options.invalidationRules) {
          invalidateByTrigger([rule], data);
        }
      }

      // Trigger tag-based invalidation
      if (options.invalidationTags) {
        for (const tag of options.invalidationTags) {
          invalidateByTag(tag);
        }
      }

      options.onSuccess?.(data, variables);
    },
    onError: options.onError,
  });
}

/**
 * Predefined cache invalidation patterns
 */
export const CACHE_INVALIDATION_PATTERNS = {
  // Security-related invalidations
  SECURITY_SCAN_COMPLETE: {
    trigger: ['security-scans'],
    invalidates: ['findings', 'security-posture', 'compliance-status'],
  },
  
  // Cost-related invalidations
  COST_DATA_UPDATE: {
    trigger: ['cost-data'],
    invalidates: ['cost-forecast', 'budget-status', 'waste-detection'],
  },
  
  // AWS account changes
  AWS_ACCOUNT_CHANGE: {
    trigger: ['aws-accounts'],
    invalidates: ['security-scans', 'findings', 'cost-data', 'metrics'],
  },
  
  // User/organization changes
  USER_ORG_CHANGE: {
    trigger: ['user', 'organization'],
    invalidates: ['permissions', 'settings', 'preferences'],
  },
} as const;

/**
 * Utility to setup common invalidation patterns
 */
export function setupCommonInvalidationPatterns() {
  const { addRule } = useCacheInvalidation();

  Object.entries(CACHE_INVALIDATION_PATTERNS).forEach(([name, pattern]) => {
    addRule(name.toLowerCase(), {
      pattern: new RegExp(pattern.trigger.join('|')),
      dependencies: pattern.invalidates,
    });
  });
}