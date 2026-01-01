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
export declare enum CircuitState {
    CLOSED = "CLOSED",
    OPEN = "OPEN",
    HALF_OPEN = "HALF_OPEN"
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
export declare class CircuitBreaker {
    private name;
    private config;
    private state;
    private failures;
    private successes;
    private totalRequests;
    private lastFailureTime?;
    private lastSuccessTime?;
    private nextAttempt;
    constructor(name: string, config: CircuitBreakerConfig);
    execute<T>(operation: () => Promise<T>): Promise<T>;
    private transitionTo;
    private onSuccess;
    private onFailure;
    private shouldReset;
    private reset;
    getMetrics(): CircuitBreakerMetrics;
    getState(): CircuitState;
    isOpen(): boolean;
    forceOpen(): void;
    forceClose(): void;
}
export declare class CircuitBreakerOpenError extends Error {
    readonly serviceName: string;
    readonly nextAttempt: number;
    constructor(serviceName: string, nextAttempt: number);
}
export declare function getCircuitBreaker(name: string, config: CircuitBreakerConfig): CircuitBreaker;
export declare function getAllCircuitBreakerMetrics(): CircuitBreakerMetrics[];
export declare function resetAllCircuitBreakers(): void;
export declare const AWS_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig;
export declare const SERVICE_CONFIGS: Record<string, CircuitBreakerConfig>;
/**
 * Execute operation with AWS circuit breaker
 */
export declare function withAwsCircuitBreaker<T>(serviceName: string, operation: () => Promise<T>, fallback?: () => Promise<T>): Promise<T>;
/**
 * Decorator for class methods
 */
export declare function CircuitBreakerProtected(serviceName: string): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
/**
 * Check if a service circuit breaker is open
 */
export declare function isServiceCircuitOpen(serviceName: string): boolean;
/**
 * Get service circuit breaker status
 */
export declare function getServiceCircuitStatus(serviceName: string): CircuitBreakerMetrics | null;
//# sourceMappingURL=circuit-breaker.d.ts.map