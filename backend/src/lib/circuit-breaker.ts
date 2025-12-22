/**
 * Circuit Breaker Pattern for Backend Lambda Functions
 * Prevents cascading failures in AWS service calls
 */

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
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private lastFailureTime?: number;
  private nextAttempt = 0;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.shouldReset()) {
      this.reset();
    }

    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        console.warn(`🔴 Circuit breaker [${this.name}] is OPEN`);
        
        if (this.config.fallbackFn) {
          return this.config.fallbackFn();
        }
        
        throw new Error(`Circuit breaker [${this.name}] is OPEN`);
      } else {
        this.state = CircuitState.HALF_OPEN;
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
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED;
      this.failures = 0;
    }
  }

  private onFailure(error: unknown): void {
    if (this.config.expectedErrors && this.config.expectedErrors.length > 0) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isExpectedError = this.config.expectedErrors.some(expectedError =>
        errorMessage.includes(expectedError)
      );
      
      if (!isExpectedError) {
        return;
      }
    }

    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.config.recoveryTimeout;
      console.error(`🔴 Circuit breaker [${this.name}] OPENED`);
    }
  }

  private shouldReset(): boolean {
    if (!this.lastFailureTime) return false;
    return (Date.now() - this.lastFailureTime) > this.config.monitoringPeriod;
  }

  private reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
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

// AWS-specific configurations
export const AWS_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeout: 30000,
  monitoringPeriod: 60000,
  expectedErrors: ['ThrottlingException', 'RequestLimitExceeded', 'ServiceUnavailable', 'TooManyRequestsException'],
};

export async function withAwsCircuitBreaker<T>(
  serviceName: string,
  operation: () => Promise<T>,
  fallback?: () => Promise<T>
): Promise<T> {
  const config = {
    ...AWS_CIRCUIT_BREAKER_CONFIG,
    fallbackFn: fallback,
  };
  
  const breaker = getCircuitBreaker(`aws-${serviceName}`, config);
  return breaker.execute(operation);
}