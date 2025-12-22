/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures and provides fallback mechanisms
 */

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Circuit is open, failing fast
  HALF_OPEN = 'HALF_OPEN' // Testing if service is back
}

export interface CircuitBreakerConfig {
  failureThreshold: number;    // Number of failures before opening
  recoveryTimeout: number;     // Time to wait before trying again (ms)
  monitoringPeriod: number;    // Time window for failure counting (ms)
  expectedErrors?: string[];   // Error types that should trigger circuit
  fallbackFn?: () => Promise<any>; // Fallback function when circuit is open
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  totalRequests: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private totalRequests = 0;
  private nextAttempt = 0;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit should be closed (reset after monitoring period)
    if (this.shouldReset()) {
      this.reset();
    }

    // If circuit is open, fail fast or try fallback
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        console.warn(`🔴 Circuit breaker [${this.name}] is OPEN - failing fast`);
        
        if (this.config.fallbackFn) {
          console.log(`🔄 Using fallback for [${this.name}]`);
          return this.config.fallbackFn();
        }
        
        throw new CircuitBreakerError(`Circuit breaker [${this.name}] is OPEN`);
      } else {
        // Try to transition to half-open
        this.state = CircuitState.HALF_OPEN;
        console.log(`🟡 Circuit breaker [${this.name}] transitioning to HALF_OPEN`);
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

  private onSuccess(): void {
    this.successes++;
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      console.log(`🟢 Circuit breaker [${this.name}] closing after successful test`);
      this.state = CircuitState.CLOSED;
      this.failures = 0; // Reset failure count
    }
  }

  private onFailure(error: unknown): void {
    // Only count expected errors
    if (this.config.expectedErrors && this.config.expectedErrors.length > 0) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isExpectedError = this.config.expectedErrors.some(expectedError =>
        errorMessage.includes(expectedError)
      );
      
      if (!isExpectedError) {
        return; // Don't count this failure
      }
    }

    this.failures++;
    this.lastFailureTime = Date.now();

    console.warn(`⚠️ Circuit breaker [${this.name}] failure ${this.failures}/${this.config.failureThreshold}`);

    if (this.failures >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.config.recoveryTimeout;
      
      console.error(`🔴 Circuit breaker [${this.name}] OPENED after ${this.failures} failures`);
    }
  }

  private shouldReset(): boolean {
    if (!this.lastFailureTime) return false;
    
    return (Date.now() - this.lastFailureTime) > this.config.monitoringPeriod;
  }

  private reset(): void {
    console.log(`🔄 Circuit breaker [${this.name}] resetting after monitoring period`);
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
    };
  }

  // Manual control methods
  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + this.config.recoveryTimeout;
    console.log(`🔴 Circuit breaker [${this.name}] manually OPENED`);
  }

  forceClose(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    console.log(`🟢 Circuit breaker [${this.name}] manually CLOSED`);
  }
}

export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Circuit Breaker Registry - manages multiple circuit breakers
 */
class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  getOrCreate(name: string, config: CircuitBreakerConfig): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, config));
    }
    return this.breakers.get(name)!;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  reset(name?: string): void {
    if (name) {
      const breaker = this.breakers.get(name);
      if (breaker) {
        breaker.forceClose();
      }
    } else {
      // Reset all breakers
      for (const breaker of this.breakers.values()) {
        breaker.forceClose();
      }
    }
  }
}

// Global registry instance
export const circuitBreakerRegistry = new CircuitBreakerRegistry();

/**
 * Predefined circuit breaker configurations
 */
export const CIRCUIT_BREAKER_CONFIGS = {
  // AWS API calls
  AWS_API: {
    failureThreshold: 5,
    recoveryTimeout: 30000, // 30 seconds
    monitoringPeriod: 60000, // 1 minute
    expectedErrors: ['ThrottlingException', 'RequestLimitExceeded', 'ServiceUnavailable'],
  },
  
  // Database operations
  DATABASE: {
    failureThreshold: 3,
    recoveryTimeout: 10000, // 10 seconds
    monitoringPeriod: 30000, // 30 seconds
    expectedErrors: ['Connection', 'Timeout', 'Pool'],
  },
  
  // External API integrations
  EXTERNAL_API: {
    failureThreshold: 3,
    recoveryTimeout: 60000, // 1 minute
    monitoringPeriod: 120000, // 2 minutes
    expectedErrors: ['ECONNREFUSED', 'ETIMEDOUT', '5'],
  },
  
  // AI/ML services
  AI_SERVICE: {
    failureThreshold: 2,
    recoveryTimeout: 120000, // 2 minutes
    monitoringPeriod: 300000, // 5 minutes
    expectedErrors: ['RateLimitExceeded', 'ModelOverloaded', 'ServiceUnavailable'],
  },
} as const;

/**
 * Utility functions for common use cases
 */
export function withCircuitBreaker<T>(
  name: string,
  operation: () => Promise<T>,
  config?: Partial<CircuitBreakerConfig>
): Promise<T> {
  const fullConfig = { ...CIRCUIT_BREAKER_CONFIGS.EXTERNAL_API, ...config };
  const breaker = circuitBreakerRegistry.getOrCreate(name, fullConfig);
  return breaker.execute(operation);
}

/**
 * AWS-specific circuit breaker wrapper
 */
export function withAwsCircuitBreaker<T>(
  serviceName: string,
  operation: () => Promise<T>,
  fallback?: () => Promise<T>
): Promise<T> {
  const config = {
    ...CIRCUIT_BREAKER_CONFIGS.AWS_API,
    fallbackFn: fallback,
  };
  
  const breaker = circuitBreakerRegistry.getOrCreate(`aws-${serviceName}`, config);
  return breaker.execute(operation);
}

/**
 * Database circuit breaker wrapper
 */
export function withDatabaseCircuitBreaker<T>(
  operation: () => Promise<T>,
  fallback?: () => Promise<T>
): Promise<T> {
  const config = {
    ...CIRCUIT_BREAKER_CONFIGS.DATABASE,
    fallbackFn: fallback,
  };
  
  const breaker = circuitBreakerRegistry.getOrCreate('database', config);
  return breaker.execute(operation);
}

/**
 * React hook for circuit breaker stats monitoring
 */
export function useCircuitBreakerStats(name?: string) {
  if (name) {
    const breaker = circuitBreakerRegistry.get(name);
    return breaker?.getStats();
  }
  
  return circuitBreakerRegistry.getAllStats();
}