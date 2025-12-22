/**
 * Error Recovery Mechanisms
 * Provides automatic and manual error recovery strategies
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorHandler, AppError, ErrorCode } from './error-handler';
import { circuitBreakerRegistry } from './circuit-breaker';

export interface RecoveryStrategy {
  name: string;
  canRecover: (error: AppError) => boolean;
  recover: (error: AppError, context?: any) => Promise<boolean>;
  maxAttempts?: number;
  delayMs?: number;
}

export interface RecoveryContext {
  component?: string;
  operation?: string;
  data?: any;
  retryCount?: number;
}

/**
 * Error Recovery Manager
 */
export class ErrorRecoveryManager {
  private strategies: Map<string, RecoveryStrategy> = new Map();
  private recoveryAttempts: Map<string, number> = new Map();

  constructor() {
    this.setupDefaultStrategies();
  }

  private setupDefaultStrategies(): void {
    // Network error recovery
    this.addStrategy({
      name: 'network-retry',
      canRecover: (error) => error.code === ErrorCode.NETWORK_ERROR,
      recover: async (error, context) => {
        // Wait for network to be available
        if (!navigator.onLine) {
          await this.waitForNetwork();
        }
        
        // Reset circuit breakers for network-related services
        circuitBreakerRegistry.reset();
        
        return true;
      },
      maxAttempts: 3,
      delayMs: 2000,
    });

    // Authentication error recovery
    this.addStrategy({
      name: 'auth-refresh',
      canRecover: (error) => error.code === ErrorCode.AUTH_EXPIRED,
      recover: async (error, context) => {
        try {
          // Attempt to refresh authentication
          const { cognitoAuth } = await import('@/integrations/aws/cognito-client-simple');
          const session = await cognitoAuth.getCurrentSession();
          
          if (!session) {
            // Redirect to login if refresh fails
            window.location.href = '/auth';
            return false;
          }
          
          return true;
        } catch (err) {
          console.error('Auth refresh failed:', err);
          return false;
        }
      },
      maxAttempts: 1,
      delayMs: 1000,
    });

    // AWS throttling recovery
    this.addStrategy({
      name: 'aws-throttling',
      canRecover: (error) => error.code === ErrorCode.AWS_THROTTLING,
      recover: async (error, context) => {
        // Exponential backoff for AWS throttling
        const attempt = this.getAttemptCount(error.errorId);
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return true;
      },
      maxAttempts: 5,
      delayMs: 1000,
    });

    // Circuit breaker recovery
    this.addStrategy({
      name: 'circuit-breaker',
      canRecover: (error) => error.code === ErrorCode.CIRCUIT_BREAKER_OPEN,
      recover: async (error, context) => {
        // Wait for circuit breaker recovery timeout
        await new Promise(resolve => setTimeout(resolve, 30000));
        return true;
      },
      maxAttempts: 2,
      delayMs: 30000,
    });

    // Database connection recovery
    this.addStrategy({
      name: 'database-reconnect',
      canRecover: (error) => error.code === ErrorCode.DATABASE_ERROR,
      recover: async (error, context) => {
        try {
          // Test database connection
          const { checkDatabaseHealth } = await import('./database');
          const health = await checkDatabaseHealth();
          
          return health.healthy;
        } catch (err) {
          return false;
        }
      },
      maxAttempts: 3,
      delayMs: 5000,
    });
  }

  addStrategy(strategy: RecoveryStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  removeStrategy(name: string): void {
    this.strategies.delete(name);
  }

  async attemptRecovery(
    error: AppError,
    context?: RecoveryContext
  ): Promise<{ recovered: boolean; strategy?: string }> {
    const errorKey = error.errorId;
    const currentAttempts = this.recoveryAttempts.get(errorKey) || 0;

    // Find applicable recovery strategy
    for (const [name, strategy] of this.strategies) {
      if (strategy.canRecover(error)) {
        const maxAttempts = strategy.maxAttempts || 3;
        
        if (currentAttempts >= maxAttempts) {
          console.warn(`Max recovery attempts reached for strategy: ${name}`);
          continue;
        }

        try {
          console.log(`Attempting recovery with strategy: ${name} (attempt ${currentAttempts + 1})`);
          
          this.recoveryAttempts.set(errorKey, currentAttempts + 1);
          
          const recovered = await strategy.recover(error, context);
          
          if (recovered) {
            console.log(`Recovery successful with strategy: ${name}`);
            this.recoveryAttempts.delete(errorKey);
            return { recovered: true, strategy: name };
          }
        } catch (recoveryError) {
          console.error(`Recovery strategy ${name} failed:`, recoveryError);
        }
      }
    }

    return { recovered: false };
  }

  private getAttemptCount(errorId: string): number {
    return this.recoveryAttempts.get(errorId) || 0;
  }

  private async waitForNetwork(): Promise<void> {
    return new Promise((resolve) => {
      if (navigator.onLine) {
        resolve();
        return;
      }

      const handleOnline = () => {
        window.removeEventListener('online', handleOnline);
        resolve();
      };

      window.addEventListener('online', handleOnline);
    });
  }

  clearAttempts(errorId?: string): void {
    if (errorId) {
      this.recoveryAttempts.delete(errorId);
    } else {
      this.recoveryAttempts.clear();
    }
  }
}

// Global recovery manager instance
export const errorRecoveryManager = new ErrorRecoveryManager();

/**
 * Hook for automatic error recovery
 */
export function useErrorRecovery(
  operation: () => Promise<any>,
  options: {
    enabled?: boolean;
    context?: RecoveryContext;
    onRecoveryAttempt?: (error: AppError, strategy: string) => void;
    onRecoverySuccess?: (error: AppError, strategy: string) => void;
    onRecoveryFailed?: (error: AppError) => void;
  } = {}
) {
  const {
    enabled = true,
    context,
    onRecoveryAttempt,
    onRecoverySuccess,
    onRecoveryFailed,
  } = options;

  const [isRecovering, setIsRecovering] = useState(false);
  const [lastError, setLastError] = useState<AppError | null>(null);

  const executeWithRecovery = useCallback(async () => {
    try {
      const result = await operation();
      setLastError(null);
      return result;
    } catch (error) {
      const appError = ErrorHandler.normalizeError(error);
      setLastError(appError);

      if (!enabled) {
        throw appError;
      }

      setIsRecovering(true);

      try {
        const { recovered, strategy } = await errorRecoveryManager.attemptRecovery(
          appError,
          context
        );

        if (recovered && strategy) {
          onRecoveryAttempt?.(appError, strategy);
          
          // Retry the operation after recovery
          const retryResult = await operation();
          
          onRecoverySuccess?.(appError, strategy);
          setLastError(null);
          return retryResult;
        } else {
          onRecoveryFailed?.(appError);
          throw appError;
        }
      } finally {
        setIsRecovering(false);
      }
    }
  }, [operation, enabled, context, onRecoveryAttempt, onRecoverySuccess, onRecoveryFailed]);

  return {
    executeWithRecovery,
    isRecovering,
    lastError,
  };
}

/**
 * Hook for manual error recovery actions
 */
export function useManualRecovery() {
  const queryClient = useQueryClient();

  const retryOperation = useCallback(async (
    operation: () => Promise<any>,
    context?: RecoveryContext
  ) => {
    try {
      return await operation();
    } catch (error) {
      const appError = ErrorHandler.normalizeError(error);
      
      const { recovered } = await errorRecoveryManager.attemptRecovery(
        appError,
        context
      );

      if (recovered) {
        return await operation();
      }

      throw appError;
    }
  }, []);

  const refreshData = useCallback((queryKey?: string[]) => {
    if (queryKey) {
      queryClient.invalidateQueries({ queryKey });
    } else {
      queryClient.invalidateQueries();
    }
  }, [queryClient]);

  const resetErrorState = useCallback(() => {
    errorRecoveryManager.clearAttempts();
    circuitBreakerRegistry.reset();
  }, []);

  const forceReconnect = useCallback(async () => {
    // Reset all circuit breakers
    circuitBreakerRegistry.reset();
    
    // Clear all query caches
    queryClient.clear();
    
    // Test critical connections
    try {
      const { cognitoAuth } = await import('@/integrations/aws/cognito-client-simple');
      await cognitoAuth.getCurrentSession();
      
      const { checkDatabaseHealth } = await import('./database');
      await checkDatabaseHealth();
      
      return true;
    } catch (error) {
      console.error('Force reconnect failed:', error);
      return false;
    }
  }, [queryClient]);

  return {
    retryOperation,
    refreshData,
    resetErrorState,
    forceReconnect,
  };
}

/**
 * Hook for network status monitoring
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        // Trigger recovery actions when coming back online
        errorRecoveryManager.clearAttempts();
        setWasOffline(false);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline]);

  return {
    isOnline,
    wasOffline,
  };
}

/**
 * Hook for application health monitoring
 */
export function useHealthCheck(
  healthCheckFn: () => Promise<boolean>,
  options: {
    interval?: number;
    enabled?: boolean;
    onHealthChange?: (isHealthy: boolean) => void;
  } = {}
) {
  const {
    interval = 60000, // 1 minute
    enabled = true,
    onHealthChange,
  } = options;

  const [isHealthy, setIsHealthy] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout>();

  const performHealthCheck = useCallback(async () => {
    try {
      const healthy = await healthCheckFn();
      
      if (healthy !== isHealthy) {
        setIsHealthy(healthy);
        onHealthChange?.(healthy);
      }
      
      setLastCheck(new Date());
      return healthy;
    } catch (error) {
      console.error('Health check failed:', error);
      
      if (isHealthy) {
        setIsHealthy(false);
        onHealthChange?.(false);
      }
      
      return false;
    }
  }, [healthCheckFn, isHealthy, onHealthChange]);

  useEffect(() => {
    if (!enabled) return;

    // Initial health check
    performHealthCheck();

    // Set up periodic health checks
    intervalRef.current = setInterval(performHealthCheck, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, interval, performHealthCheck]);

  return {
    isHealthy,
    lastCheck,
    performHealthCheck,
  };
}

/**
 * Component for displaying recovery status
 */
export function RecoveryStatus({
  error,
  isRecovering,
  onRetry,
  onDismiss,
}: {
  error: AppError | null;
  isRecovering: boolean;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  if (!error) return null;

  return (
    <div className="fixed bottom-4 right-4 max-w-md p-4 bg-destructive/10 border border-destructive/20 rounded-lg shadow-lg">
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          {isRecovering ? (
            <div className="animate-spin h-5 w-5 border-2 border-destructive border-t-transparent rounded-full" />
          ) : (
            <div className="h-5 w-5 bg-destructive rounded-full" />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-destructive">
            {isRecovering ? 'Tentando recuperar...' : 'Erro detectado'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {error.message}
          </p>
          
          {!isRecovering && (
            <div className="flex space-x-2 mt-3">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="text-xs bg-destructive text-destructive-foreground px-2 py-1 rounded hover:bg-destructive/90"
                >
                  Tentar Novamente
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Dispensar
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}