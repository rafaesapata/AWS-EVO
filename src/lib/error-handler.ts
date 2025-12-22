/**
 * Centralized error handling utilities
 * Provides consistent error handling patterns across the application
 */

import { toast } from "sonner";

// Standardized error types
export enum ErrorCode {
  // Authentication & Authorization
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  AUTH_INVALID = 'AUTH_INVALID',
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  TENANT_ISOLATION_VIOLATION = 'TENANT_ISOLATION_VIOLATION',
  
  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Resources
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',
  RESOURCE_LOCKED = 'RESOURCE_LOCKED',
  
  // External Services
  AWS_API_ERROR = 'AWS_API_ERROR',
  AWS_THROTTLING = 'AWS_THROTTLING',
  AWS_CREDENTIALS_INVALID = 'AWS_CREDENTIALS_INVALID',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  
  // System
  DATABASE_ERROR = 'DATABASE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',
  
  // Business Logic
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',
  INVALID_STATE = 'INVALID_STATE',
  OPERATION_NOT_ALLOWED = 'OPERATION_NOT_ALLOWED',
  
  // Generic
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export class AppError extends Error {
  public readonly timestamp: Date;
  public readonly errorId: string;

  constructor(
    message: string,
    public readonly code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    public readonly statusCode: number = 500,
    public readonly severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    public readonly details?: Record<string, unknown>,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'AppError';
    this.timestamp = new Date();
    this.errorId = this.generateErrorId();
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  toJSON(): Record<string, unknown> {
    return {
      errorId: this.errorId,
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      severity: this.severity,
      timestamp: this.timestamp.toISOString(),
      details: this.details,
      stack: this.stack,
      cause: this.cause?.message,
    };
  }
}

export interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  organizationId?: string;
  tenantId?: string;
  requestId?: string;
  sessionId?: string;
  userAgent?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

// Error factory functions for common scenarios
export const ErrorFactory = {
  // Authentication errors
  authRequired: (details?: Record<string, unknown>) => 
    new AppError('Authentication required', ErrorCode.AUTH_REQUIRED, 401, ErrorSeverity.HIGH, details),
  
  authInvalid: (details?: Record<string, unknown>) => 
    new AppError('Invalid authentication credentials', ErrorCode.AUTH_INVALID, 401, ErrorSeverity.HIGH, details),
  
  authExpired: (details?: Record<string, unknown>) => 
    new AppError('Authentication token expired', ErrorCode.AUTH_EXPIRED, 401, ErrorSeverity.MEDIUM, details),
  
  permissionDenied: (resource?: string, action?: string) => 
    new AppError(
      `Permission denied${resource ? ` for ${resource}` : ''}${action ? ` (${action})` : ''}`,
      ErrorCode.PERMISSION_DENIED,
      403,
      ErrorSeverity.HIGH,
      { resource, action }
    ),
  
  // Validation errors
  validationError: (field: string, message: string, value?: unknown) =>
    new AppError(
      `Validation error: ${field} - ${message}`,
      ErrorCode.VALIDATION_ERROR,
      400,
      ErrorSeverity.LOW,
      { field, value }
    ),
  
  missingField: (field: string) =>
    new AppError(
      `Missing required field: ${field}`,
      ErrorCode.MISSING_REQUIRED_FIELD,
      400,
      ErrorSeverity.MEDIUM,
      { field }
    ),
  
  // Resource errors
  notFound: (resource: string, id?: string) =>
    new AppError(
      `${resource} not found${id ? `: ${id}` : ''}`,
      ErrorCode.RESOURCE_NOT_FOUND,
      404,
      ErrorSeverity.LOW,
      { resource, id }
    ),
  
  conflict: (resource: string, reason?: string) =>
    new AppError(
      `Resource conflict: ${resource}${reason ? ` - ${reason}` : ''}`,
      ErrorCode.RESOURCE_CONFLICT,
      409,
      ErrorSeverity.MEDIUM,
      { resource, reason }
    ),
  
  // AWS errors
  awsError: (service: string, operation: string, awsError: Error) =>
    new AppError(
      `AWS ${service} error: ${awsError.message}`,
      ErrorCode.AWS_API_ERROR,
      502,
      ErrorSeverity.HIGH,
      { service, operation, awsErrorCode: (awsError as any).Code },
      awsError
    ),
  
  awsThrottling: (service: string) =>
    new AppError(
      `AWS ${service} throttling - rate limit exceeded`,
      ErrorCode.AWS_THROTTLING,
      429,
      ErrorSeverity.MEDIUM,
      { service }
    ),
  
  // System errors
  databaseError: (operation: string, cause: Error) =>
    new AppError(
      `Database error during ${operation}`,
      ErrorCode.DATABASE_ERROR,
      500,
      ErrorSeverity.CRITICAL,
      { operation },
      cause
    ),
  
  networkError: (url?: string, cause?: Error) =>
    new AppError(
      `Network error${url ? ` accessing ${url}` : ''}`,
      ErrorCode.NETWORK_ERROR,
      502,
      ErrorSeverity.HIGH,
      { url },
      cause
    ),
  
  timeout: (operation: string, timeoutMs: number) =>
    new AppError(
      `Operation timeout: ${operation} (${timeoutMs}ms)`,
      ErrorCode.TIMEOUT_ERROR,
      408,
      ErrorSeverity.HIGH,
      { operation, timeoutMs }
    ),
  
  rateLimit: (limit: number, windowMs: number) =>
    new AppError(
      `Rate limit exceeded: ${limit} requests per ${windowMs}ms`,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      429,
      ErrorSeverity.MEDIUM,
      { limit, windowMs }
    ),
  
  circuitBreakerOpen: (service: string) =>
    new AppError(
      `Circuit breaker open for ${service}`,
      ErrorCode.CIRCUIT_BREAKER_OPEN,
      503,
      ErrorSeverity.HIGH,
      { service }
    ),
  
  // Business logic errors
  businessRule: (rule: string, details?: Record<string, unknown>) =>
    new AppError(
      `Business rule violation: ${rule}`,
      ErrorCode.BUSINESS_RULE_VIOLATION,
      400,
      ErrorSeverity.MEDIUM,
      details
    ),
  
  invalidState: (currentState: string, expectedState: string) =>
    new AppError(
      `Invalid state: expected ${expectedState}, got ${currentState}`,
      ErrorCode.INVALID_STATE,
      400,
      ErrorSeverity.MEDIUM,
      { currentState, expectedState }
    ),
};

export class ErrorHandler {
  private static errorCounts = new Map<string, number>();
  private static lastErrorTime = new Map<string, number>();
  
  /**
   * Handle and display error to user with intelligent deduplication
   */
  static handle(error: unknown, context?: ErrorContext): AppError {
    const appError = this.normalizeError(error);
    const errorKey = `${appError.code}:${appError.message}`;
    
    // Deduplicate similar errors
    const now = Date.now();
    const lastTime = this.lastErrorTime.get(errorKey) || 0;
    const count = this.errorCounts.get(errorKey) || 0;
    
    // Only show toast if it's a new error or enough time has passed
    if (now - lastTime > 5000 || count === 0) {
      const message = this.getErrorMessage(appError);
      const title = this.getErrorTitle(appError, context);

      toast.error(title, {
        description: message,
        duration: this.getToastDuration(appError.severity),
        action: appError.errorId ? {
          label: 'Copy Error ID',
          onClick: () => navigator.clipboard.writeText(appError.errorId),
        } : undefined,
      });
      
      this.errorCounts.set(errorKey, 1);
    } else {
      this.errorCounts.set(errorKey, count + 1);
    }
    
    this.lastErrorTime.set(errorKey, now);

    // Log error for monitoring
    this.logError(appError, context);
    
    return appError;
  }

  /**
   * Convert any error to AppError
   */
  static normalizeError(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }
    
    if (error instanceof Error) {
      // Check for specific error patterns
      if (error.message.includes('JWT') || error.message.includes('token')) {
        return ErrorFactory.authExpired({ originalError: error.message });
      }
      
      if (error.message.includes('Network') || error.message.includes('fetch')) {
        return ErrorFactory.networkError(undefined, error);
      }
      
      if (error.message.includes('permission') || error.message.includes('forbidden')) {
        return ErrorFactory.permissionDenied();
      }
      
      if (error.message.includes('not found')) {
        return ErrorFactory.notFound('Resource');
      }
      
      if (error.message.includes('timeout')) {
        return ErrorFactory.timeout('Operation', 30000);
      }
      
      // AWS specific errors
      if (error.message.includes('ThrottlingException')) {
        return ErrorFactory.awsThrottling('AWS Service');
      }
      
      // Generic error
      return new AppError(
        error.message,
        ErrorCode.UNKNOWN_ERROR,
        500,
        ErrorSeverity.MEDIUM,
        { originalError: error.name },
        error
      );
    }
    
    // Non-Error objects
    return new AppError(
      typeof error === 'string' ? error : 'An unknown error occurred',
      ErrorCode.UNKNOWN_ERROR,
      500,
      ErrorSeverity.MEDIUM,
      { originalError: error }
    );
  }

  private static getToastDuration(severity: ErrorSeverity): number {
    switch (severity) {
      case ErrorSeverity.CRITICAL: return 10000; // 10 seconds
      case ErrorSeverity.HIGH: return 7000;      // 7 seconds
      case ErrorSeverity.MEDIUM: return 5000;    // 5 seconds
      case ErrorSeverity.LOW: return 3000;       // 3 seconds
      default: return 5000;
    }
  }

  /**
   * Handle error silently (log only, no user notification)
   */
  static handleSilent(error: unknown, context?: ErrorContext): void {
    console.error('Silent error:', error, 'Context:', context);
    this.logError(error, context);
  }

  /**
   * Extract user-friendly error message
   */
  static getErrorMessage(error: AppError): string {
    // Use predefined user-friendly messages based on error code
    const userFriendlyMessages: Record<ErrorCode, string> = {
      [ErrorCode.AUTH_REQUIRED]: 'Você precisa estar autenticado para acessar este recurso.',
      [ErrorCode.AUTH_INVALID]: 'Credenciais inválidas. Verifique seu login.',
      [ErrorCode.AUTH_EXPIRED]: 'Sua sessão expirou. Por favor, faça login novamente.',
      [ErrorCode.PERMISSION_DENIED]: 'Você não tem permissão para realizar esta ação.',
      [ErrorCode.TENANT_ISOLATION_VIOLATION]: 'Acesso negado: violação de isolamento de dados.',
      
      [ErrorCode.VALIDATION_ERROR]: 'Dados inválidos fornecidos.',
      [ErrorCode.INVALID_INPUT]: 'Entrada inválida. Verifique os dados fornecidos.',
      [ErrorCode.MISSING_REQUIRED_FIELD]: 'Campo obrigatório não preenchido.',
      
      [ErrorCode.RESOURCE_NOT_FOUND]: 'Recurso não encontrado.',
      [ErrorCode.RESOURCE_CONFLICT]: 'Conflito de recursos. O recurso já existe ou está em uso.',
      [ErrorCode.RESOURCE_LOCKED]: 'Recurso bloqueado. Tente novamente mais tarde.',
      
      [ErrorCode.AWS_API_ERROR]: 'Erro na comunicação com AWS. Tente novamente.',
      [ErrorCode.AWS_THROTTLING]: 'Limite de requisições AWS atingido. Aguarde um momento.',
      [ErrorCode.AWS_CREDENTIALS_INVALID]: 'Credenciais AWS inválidas ou expiradas.',
      [ErrorCode.EXTERNAL_SERVICE_ERROR]: 'Erro em serviço externo. Tente novamente.',
      
      [ErrorCode.DATABASE_ERROR]: 'Erro no banco de dados. Tente novamente.',
      [ErrorCode.NETWORK_ERROR]: 'Erro de conexão. Verifique sua internet.',
      [ErrorCode.TIMEOUT_ERROR]: 'Operação demorou muito para responder. Tente novamente.',
      [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Muitas requisições. Aguarde um momento antes de tentar novamente.',
      [ErrorCode.CIRCUIT_BREAKER_OPEN]: 'Serviço temporariamente indisponível. Tente novamente em alguns minutos.',
      
      [ErrorCode.BUSINESS_RULE_VIOLATION]: 'Operação não permitida pelas regras de negócio.',
      [ErrorCode.INVALID_STATE]: 'Estado inválido para esta operação.',
      [ErrorCode.OPERATION_NOT_ALLOWED]: 'Operação não permitida no estado atual.',
      
      [ErrorCode.INTERNAL_ERROR]: 'Erro interno do sistema. Nossa equipe foi notificada.',
      [ErrorCode.UNKNOWN_ERROR]: 'Ocorreu um erro inesperado. Tente novamente.',
    };

    return userFriendlyMessages[error.code] || error.message;
  }

  /**
   * Get error title based on context and severity
   */
  static getErrorTitle(error: AppError, context?: ErrorContext): string {
    if (context?.action) {
      return `Erro ao ${context.action}`;
    }

    // Severity-based titles
    const severityTitles: Record<ErrorSeverity, string> = {
      [ErrorSeverity.CRITICAL]: '🚨 Erro Crítico',
      [ErrorSeverity.HIGH]: '⚠️ Erro Importante',
      [ErrorSeverity.MEDIUM]: '⚠️ Erro',
      [ErrorSeverity.LOW]: 'ℹ️ Aviso',
    };

    // Code-specific titles
    const codeTitles: Record<ErrorCode, string> = {
      [ErrorCode.AUTH_REQUIRED]: 'Autenticação Necessária',
      [ErrorCode.AUTH_INVALID]: 'Credenciais Inválidas',
      [ErrorCode.AUTH_EXPIRED]: 'Sessão Expirada',
      [ErrorCode.PERMISSION_DENIED]: 'Acesso Negado',
      [ErrorCode.VALIDATION_ERROR]: 'Dados Inválidos',
      [ErrorCode.RESOURCE_NOT_FOUND]: 'Não Encontrado',
      [ErrorCode.AWS_API_ERROR]: 'Erro AWS',
      [ErrorCode.AWS_THROTTLING]: 'Limite AWS Atingido',
      [ErrorCode.NETWORK_ERROR]: 'Erro de Conexão',
      [ErrorCode.DATABASE_ERROR]: 'Erro no Banco',
      [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Limite Excedido',
      [ErrorCode.CIRCUIT_BREAKER_OPEN]: 'Serviço Indisponível',
    };

    return codeTitles[error.code] || severityTitles[error.severity] || 'Erro';
  }

  /**
   * Log error to monitoring service with structured data
   */
  private static logError(error: AppError, context?: ErrorContext): void {
    const errorData = {
      errorId: error.errorId,
      timestamp: error.timestamp.toISOString(),
      severity: error.severity,
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      stack: error.stack,
      cause: error.cause?.message,
      details: error.details,
      context: {
        ...context,
        userAgent: navigator.userAgent,
        url: window.location.href,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        timestamp: new Date().toISOString(),
      },
    };

    // Console logging with appropriate level
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        console.error('🚨 CRITICAL ERROR:', errorData);
        break;
      case ErrorSeverity.HIGH:
        console.error('⚠️ HIGH SEVERITY ERROR:', errorData);
        break;
      case ErrorSeverity.MEDIUM:
        console.warn('⚠️ ERROR:', errorData);
        break;
      case ErrorSeverity.LOW:
        console.info('ℹ️ LOW SEVERITY ERROR:', errorData);
        break;
    }

    // In production, send to error tracking service
    // this.sendToErrorTracking(errorData);
    
    // Store in local storage for debugging (development only)
    if (process.env.NODE_ENV === 'development') {
      this.storeErrorLocally(errorData);
    }
  }

  /**
   * Store error locally for development debugging
   */
  private static storeErrorLocally(errorData: any): void {
    try {
      const errors = JSON.parse(localStorage.getItem('evo_errors') || '[]');
      errors.unshift(errorData);
      
      // Keep only last 50 errors
      if (errors.length > 50) {
        errors.splice(50);
      }
      
      localStorage.setItem('evo_errors', JSON.stringify(errors));
    } catch (e) {
      console.warn('Failed to store error locally:', e);
    }
  }

  /**
   * Get stored errors for debugging
   */
  static getStoredErrors(): any[] {
    try {
      return JSON.parse(localStorage.getItem('evo_errors') || '[]');
    } catch {
      return [];
    }
  }

  /**
   * Clear stored errors
   */
  static clearStoredErrors(): void {
    localStorage.removeItem('evo_errors');
  }

  /**
   * Serialize error for logging
   */
  private static serializeError(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error instanceof AppError && {
          code: error.code,
          statusCode: error.statusCode,
          details: error.details,
        }),
      };
    }

    return { error: String(error) };
  }

  /**
   * Create wrapped async function with error handling
   */
  static wrapAsync<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    context?: ErrorContext
  ): T {
    return (async (...args: Parameters<T>) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.handle(error, context);
        throw error;
      }
    }) as T;
  }

  /**
   * Validate and throw if invalid
   */
  static validate(
    condition: boolean,
    message: string,
    code?: string
  ): asserts condition {
    if (!condition) {
      throw new AppError(message, code || 'VALIDATION_ERROR', 400);
    }
  }

  /**
   * Assert user is authenticated
   */
  static assertAuthenticated(userId: string | null | undefined): asserts userId is string {
    this.validate(!!userId, 'Você precisa estar autenticado', 'AUTH_ERROR');
  }

  /**
   * Assert organization is available
   */
  static assertOrganization(orgId: string | null | undefined): asserts orgId is string {
    this.validate(!!orgId, 'Organização não encontrada', 'ORG_NOT_FOUND');
  }
}

/**
 * Retry utility for transient errors
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Don't retry certain errors
      if (error instanceof AppError && error.statusCode && error.statusCode < 500) {
        throw error;
      }

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }

  throw lastError;
}
