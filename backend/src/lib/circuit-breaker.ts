/**
 * Circuit Breaker Pattern for Backend Lambda Functions
 * Prevents cascading failures in AWS service calls
 * 
 * Features:
 * - Per-service circuit breakers
 * - Automatic recovery with half-open state
 * - Configurable thresholds and timeouts
 * - Metrics and logging
 * - Fallback support
 */

import { logger } from './logging.js';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  expectedErrors?: string[];
  fallbackFn?: () => Promise<any>;
  onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;
}

export interface CircuitBreakerMetrics {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  totalRequests: number;
  failureRate: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private totalRequests = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private nextAttempt = 0;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.totalRequests++;
    
    if (this.shouldReset()) {
      this.reset();
    }

    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        logger.warn(`Circuit breaker [${this.name}] is OPEN`, {
          nextAttempt: new Date(this.nextAttempt).toISOString(),
          failures: this.failures,
        });
        
        if (this.config.fallbackFn) {
          return this.config.fallbackFn();
        }
        
        throw new CircuitBreakerOpenError(this.name, this.nextAttempt);
      } else {
        this.transitionTo(CircuitState.HALF_OPEN);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    
    if (this.config.onStateChange) {
      this.config.onStateChange(this.name, oldState, newState);
    }
    
    logger.info(`Circuit breaker [${this.name}] state change`, {
      from: oldState,
      to: newState,
    });
  }

  private onSuccess(): void {
    this.successes++;
    this.lastSuccessTime = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.CLOSED);
      this.failures = 0;
      logger.info(`Circuit breaker [${this.name}] recovered`);
    }
  }

  private onFailure(error: unknown): void {
    // Check if this is an expected error that should trip the breaker
    if (this.config.expectedErrors && this.config.expectedErrors.length > 0) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : '';
      
      const isExpectedError = this.config.expectedErrors.some(expectedError =>
        errorMessage.includes(expectedError) || errorName.includes(expectedError)
      );
      
      if (!isExpectedError) {
        return;
      }
    }

    this.failures++;
    this.lastFailureTime = Date.now();

    logger.warn(`Circuit breaker [${this.name}] failure`, {
      failures: this.failures,
      threshold: this.config.failureThreshold,
      error: error instanceof Error ? error.message : String(error),
    });

    if (this.failures >= this.config.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
      this.nextAttempt = Date.now() + this.config.recoveryTimeout;
      
      logger.error(`Circuit breaker [${this.name}] OPENED`, {
        failures: this.failures,
        recoveryTimeout: this.config.recoveryTimeout,
        nextAttempt: new Date(this.nextAttempt).toISOString(),
      });
    }
  }

  private shouldReset(): boolean {
    if (!this.lastFailureTime) return false;
    return (Date.now() - this.lastFailureTime) > this.config.monitoringPeriod;
  }

  private reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.failures = 0;
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      failureRate: this.totalRequests > 0 
        ? (this.failures / this.totalRequests) * 100 
        : 0,
    };
  }

  getState(): CircuitState {
    return this.state;
  }

  isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }

  forceOpen(): void {
    this.transitionTo(CircuitState.OPEN);
    this.nextAttempt = Date.now() + this.config.recoveryTimeout;
  }

  forceClose(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.failures = 0;
  }
}

// Custom error for circuit breaker open state
export class CircuitBreakerOpenError extends Error {
  constructor(
    public readonly serviceName: string,
    public readonly nextAttempt: number
  ) {
    super(`Circuit breaker [${serviceName}] is OPEN. Retry after ${new Date(nextAttempt).toISOString()}`);
    this.name = 'CircuitBreakerOpenError';
  }
}

// Global registry for Lambda environment
const circuitBreakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string, config: CircuitBreakerConfig): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker(name, config));
  }
  return circuitBreakers.get(name)!;
}

// Get all circuit breaker metrics
export function getAllCircuitBreakerMetrics(): CircuitBreakerMetrics[] {
  return Array.from(circuitBreakers.values()).map(cb => cb.getMetrics());
}

// Reset all circuit breakers (for testing)
export function resetAllCircuitBreakers(): void {
  circuitBreakers.forEach(cb => cb.forceClose());
}

// ============================================================================
// AWS-SPECIFIC CONFIGURATIONS
// ============================================================================

export const AWS_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeout: 30000, // 30 seconds
  monitoringPeriod: 60000, // 1 minute
  expectedErrors: [
    'ThrottlingException',
    'RequestLimitExceeded',
    'ServiceUnavailable',
    'TooManyRequestsException',
    'ProvisionedThroughputExceededException',
    'InternalServiceError',
    'ServiceException',
  ],
};

// Service-specific configurations
export const SERVICE_CONFIGS: Record<string, CircuitBreakerConfig> = {
  'cost-explorer': {
    ...AWS_CIRCUIT_BREAKER_CONFIG,
    failureThreshold: 3,
    recoveryTimeout: 60000, // Cost Explorer has strict rate limits
  },
  'security-hub': {
    ...AWS_CIRCUIT_BREAKER_CONFIG,
    failureThreshold: 5,
    recoveryTimeout: 30000,
  },
  'guardduty': {
    ...AWS_CIRCUIT_BREAKER_CONFIG,
    failureThreshold: 5,
    recoveryTimeout: 30000,
  },
  'cloudtrail': {
    ...AWS_CIRCUIT_BREAKER_CONFIG,
    failureThreshold: 5,
    recoveryTimeout: 30000,
  },
  'iam': {
    ...AWS_CIRCUIT_BREAKER_CONFIG,
    failureThreshold: 10, // IAM is more resilient
    recoveryTimeout: 15000,
  },
  's3': {
    ...AWS_CIRCUIT_BREAKER_CONFIG,
    failureThreshold: 10,
    recoveryTimeout: 15000,
  },
  'cognito': {
    ...AWS_CIRCUIT_BREAKER_CONFIG,
    failureThreshold: 5,
    recoveryTimeout: 30000,
  },
  'ses': {
    ...AWS_CIRCUIT_BREAKER_CONFIG,
    failureThreshold: 5,
    recoveryTimeout: 30000,
  },
  'sns': {
    ...AWS_CIRCUIT_BREAKER_CONFIG,
    failureThreshold: 5,
    recoveryTimeout: 30000,
  },
  'bedrock': {
    ...AWS_CIRCUIT_BREAKER_CONFIG,
    failureThreshold: 3,
    recoveryTimeout: 60000, // Bedrock can be slow
  },
};

/**
 * Execute operation with AWS circuit breaker
 */
export async function withAwsCircuitBreaker<T>(
  serviceName: string,
  operation: () => Promise<T>,
  fallback?: () => Promise<T>
): Promise<T> {
  const config = SERVICE_CONFIGS[serviceName] || {
    ...AWS_CIRCUIT_BREAKER_CONFIG,
    fallbackFn: fallback,
  };
  
  if (fallback) {
    config.fallbackFn = fallback;
  }
  
  const breaker = getCircuitBreaker(`aws-${serviceName}`, config);
  return breaker.execute(operation);
}

/**
 * Decorator for class methods
 */
export function CircuitBreakerProtected(serviceName: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return withAwsCircuitBreaker(serviceName, () => 
        originalMethod.apply(this, args)
      );
    };

    return descriptor;
  };
}

/**
 * Check if a service circuit breaker is open
 */
export function isServiceCircuitOpen(serviceName: string): boolean {
  const breaker = circuitBreakers.get(`aws-${serviceName}`);
  return breaker?.isOpen() || false;
}

/**
 * Get service circuit breaker status
 */
export function getServiceCircuitStatus(serviceName: string): CircuitBreakerMetrics | null {
  const breaker = circuitBreakers.get(`aws-${serviceName}`);
  return breaker?.getMetrics() || null;
}