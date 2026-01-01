"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SERVICE_CONFIGS = exports.AWS_CIRCUIT_BREAKER_CONFIG = exports.CircuitBreakerOpenError = exports.CircuitBreaker = exports.CircuitState = void 0;
exports.getCircuitBreaker = getCircuitBreaker;
exports.getAllCircuitBreakerMetrics = getAllCircuitBreakerMetrics;
exports.resetAllCircuitBreakers = resetAllCircuitBreakers;
exports.withAwsCircuitBreaker = withAwsCircuitBreaker;
exports.CircuitBreakerProtected = CircuitBreakerProtected;
exports.isServiceCircuitOpen = isServiceCircuitOpen;
exports.getServiceCircuitStatus = getServiceCircuitStatus;
const logging_js_1 = require("./logging.js");
var CircuitState;
(function (CircuitState) {
    CircuitState["CLOSED"] = "CLOSED";
    CircuitState["OPEN"] = "OPEN";
    CircuitState["HALF_OPEN"] = "HALF_OPEN";
})(CircuitState || (exports.CircuitState = CircuitState = {}));
class CircuitBreaker {
    constructor(name, config) {
        this.name = name;
        this.config = config;
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.totalRequests = 0;
        this.nextAttempt = 0;
    }
    async execute(operation) {
        this.totalRequests++;
        if (this.shouldReset()) {
            this.reset();
        }
        if (this.state === CircuitState.OPEN) {
            if (Date.now() < this.nextAttempt) {
                logging_js_1.logger.warn(`Circuit breaker [${this.name}] is OPEN`, {
                    nextAttempt: new Date(this.nextAttempt).toISOString(),
                    failures: this.failures,
                });
                if (this.config.fallbackFn) {
                    return this.config.fallbackFn();
                }
                throw new CircuitBreakerOpenError(this.name, this.nextAttempt);
            }
            else {
                this.transitionTo(CircuitState.HALF_OPEN);
            }
        }
        try {
            const result = await operation();
            this.onSuccess();
            return result;
        }
        catch (error) {
            this.onFailure(error);
            throw error;
        }
    }
    transitionTo(newState) {
        const oldState = this.state;
        this.state = newState;
        if (this.config.onStateChange) {
            this.config.onStateChange(this.name, oldState, newState);
        }
        logging_js_1.logger.info(`Circuit breaker [${this.name}] state change`, {
            from: oldState,
            to: newState,
        });
    }
    onSuccess() {
        this.successes++;
        this.lastSuccessTime = Date.now();
        if (this.state === CircuitState.HALF_OPEN) {
            this.transitionTo(CircuitState.CLOSED);
            this.failures = 0;
            logging_js_1.logger.info(`Circuit breaker [${this.name}] recovered`);
        }
    }
    onFailure(error) {
        // Check if this is an expected error that should trip the breaker
        if (this.config.expectedErrors && this.config.expectedErrors.length > 0) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorName = error instanceof Error ? error.name : '';
            const isExpectedError = this.config.expectedErrors.some(expectedError => errorMessage.includes(expectedError) || errorName.includes(expectedError));
            if (!isExpectedError) {
                return;
            }
        }
        this.failures++;
        this.lastFailureTime = Date.now();
        logging_js_1.logger.warn(`Circuit breaker [${this.name}] failure`, {
            failures: this.failures,
            threshold: this.config.failureThreshold,
            error: error instanceof Error ? error.message : String(error),
        });
        if (this.failures >= this.config.failureThreshold) {
            this.transitionTo(CircuitState.OPEN);
            this.nextAttempt = Date.now() + this.config.recoveryTimeout;
            logging_js_1.logger.error(`Circuit breaker [${this.name}] OPENED`, {
                failures: this.failures,
                recoveryTimeout: this.config.recoveryTimeout,
                nextAttempt: new Date(this.nextAttempt).toISOString(),
            });
        }
    }
    shouldReset() {
        if (!this.lastFailureTime)
            return false;
        return (Date.now() - this.lastFailureTime) > this.config.monitoringPeriod;
    }
    reset() {
        this.transitionTo(CircuitState.CLOSED);
        this.failures = 0;
    }
    getMetrics() {
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
    getState() {
        return this.state;
    }
    isOpen() {
        return this.state === CircuitState.OPEN;
    }
    forceOpen() {
        this.transitionTo(CircuitState.OPEN);
        this.nextAttempt = Date.now() + this.config.recoveryTimeout;
    }
    forceClose() {
        this.transitionTo(CircuitState.CLOSED);
        this.failures = 0;
    }
}
exports.CircuitBreaker = CircuitBreaker;
// Custom error for circuit breaker open state
class CircuitBreakerOpenError extends Error {
    constructor(serviceName, nextAttempt) {
        super(`Circuit breaker [${serviceName}] is OPEN. Retry after ${new Date(nextAttempt).toISOString()}`);
        this.serviceName = serviceName;
        this.nextAttempt = nextAttempt;
        this.name = 'CircuitBreakerOpenError';
    }
}
exports.CircuitBreakerOpenError = CircuitBreakerOpenError;
// Global registry for Lambda environment
const circuitBreakers = new Map();
function getCircuitBreaker(name, config) {
    if (!circuitBreakers.has(name)) {
        circuitBreakers.set(name, new CircuitBreaker(name, config));
    }
    return circuitBreakers.get(name);
}
// Get all circuit breaker metrics
function getAllCircuitBreakerMetrics() {
    return Array.from(circuitBreakers.values()).map(cb => cb.getMetrics());
}
// Reset all circuit breakers (for testing)
function resetAllCircuitBreakers() {
    circuitBreakers.forEach(cb => cb.forceClose());
}
// ============================================================================
// AWS-SPECIFIC CONFIGURATIONS
// ============================================================================
exports.AWS_CIRCUIT_BREAKER_CONFIG = {
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
exports.SERVICE_CONFIGS = {
    'cost-explorer': {
        ...exports.AWS_CIRCUIT_BREAKER_CONFIG,
        failureThreshold: 3,
        recoveryTimeout: 60000, // Cost Explorer has strict rate limits
    },
    'security-hub': {
        ...exports.AWS_CIRCUIT_BREAKER_CONFIG,
        failureThreshold: 5,
        recoveryTimeout: 30000,
    },
    'guardduty': {
        ...exports.AWS_CIRCUIT_BREAKER_CONFIG,
        failureThreshold: 5,
        recoveryTimeout: 30000,
    },
    'cloudtrail': {
        ...exports.AWS_CIRCUIT_BREAKER_CONFIG,
        failureThreshold: 5,
        recoveryTimeout: 30000,
    },
    'iam': {
        ...exports.AWS_CIRCUIT_BREAKER_CONFIG,
        failureThreshold: 10, // IAM is more resilient
        recoveryTimeout: 15000,
    },
    's3': {
        ...exports.AWS_CIRCUIT_BREAKER_CONFIG,
        failureThreshold: 10,
        recoveryTimeout: 15000,
    },
    'cognito': {
        ...exports.AWS_CIRCUIT_BREAKER_CONFIG,
        failureThreshold: 5,
        recoveryTimeout: 30000,
    },
    'ses': {
        ...exports.AWS_CIRCUIT_BREAKER_CONFIG,
        failureThreshold: 5,
        recoveryTimeout: 30000,
    },
    'sns': {
        ...exports.AWS_CIRCUIT_BREAKER_CONFIG,
        failureThreshold: 5,
        recoveryTimeout: 30000,
    },
    'bedrock': {
        ...exports.AWS_CIRCUIT_BREAKER_CONFIG,
        failureThreshold: 3,
        recoveryTimeout: 60000, // Bedrock can be slow
    },
};
/**
 * Execute operation with AWS circuit breaker
 */
async function withAwsCircuitBreaker(serviceName, operation, fallback) {
    const config = exports.SERVICE_CONFIGS[serviceName] || {
        ...exports.AWS_CIRCUIT_BREAKER_CONFIG,
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
function CircuitBreakerProtected(serviceName) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
            return withAwsCircuitBreaker(serviceName, () => originalMethod.apply(this, args));
        };
        return descriptor;
    };
}
/**
 * Check if a service circuit breaker is open
 */
function isServiceCircuitOpen(serviceName) {
    const breaker = circuitBreakers.get(`aws-${serviceName}`);
    return breaker?.isOpen() || false;
}
/**
 * Get service circuit breaker status
 */
function getServiceCircuitStatus(serviceName) {
    const breaker = circuitBreakers.get(`aws-${serviceName}`);
    return breaker?.getMetrics() || null;
}
//# sourceMappingURL=circuit-breaker.js.map