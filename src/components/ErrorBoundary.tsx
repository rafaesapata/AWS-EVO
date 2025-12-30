/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the component tree and displays fallback UI
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { ErrorHandler, AppError, ErrorCode, ErrorSeverity } from '@/lib/error-handler';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDetails?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error
    const appError = new AppError(
      error.message,
      ErrorCode.INTERNAL_ERROR,
      500,
      ErrorSeverity.CRITICAL,
      {
        componentStack: errorInfo.componentStack,
        errorBoundary: true,
      },
      error
    );

    const handledError = ErrorHandler.handle(appError, {
      component: 'ErrorBoundary',
      action: 'capturar erro não tratado',
    });

    this.setState({
      error,
      errorInfo,
      errorId: handledError.errorId,
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleReportBug = () => {
    const { error, errorId } = this.state;
    const subject = encodeURIComponent(`Bug Report - Error ID: ${errorId}`);
    const body = encodeURIComponent(`
Error ID: ${errorId}
Error Message: ${error?.message}
URL: ${window.location.href}
User Agent: ${navigator.userAgent}
Timestamp: ${new Date().toISOString()}

Please describe what you were doing when this error occurred:

    `);
    
    window.open(`mailto:support@evo.ai?subject=${subject}&body=${body}`);
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle className="text-xl">Oops! Algo deu errado</CardTitle>
              <CardDescription>
                Ocorreu um erro inesperado. Nossa equipe foi notificada automaticamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {this.state.errorId && (
                <div className="rounded-md bg-muted p-3">
                  <p className="text-sm text-muted-foreground">
                    ID do Erro: <code className="font-mono">{this.state.errorId}</code>
                  </p>
                </div>
              )}

              {this.props.showDetails && this.state.error && (
                <details className="rounded-md bg-muted p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Detalhes técnicos
                  </summary>
                  <div className="mt-2 space-y-2">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Erro:</p>
                      <code className="text-xs">{this.state.error.message}</code>
                    </div>
                    {this.state.error.stack && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Stack Trace:</p>
                        <pre className="text-xs overflow-auto max-h-32">
                          {this.state.error.stack}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              )}

              <div className="flex flex-col gap-2">
                <Button onClick={this.handleRetry} className="w-full">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Tentar Novamente
                </Button>
                
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={this.handleGoHome}
                    className="flex-1"
                  >
                    <Home className="mr-2 h-4 w-4" />
                    Início
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    onClick={this.handleReportBug}
                    className="flex-1"
                  >
                    <Bug className="mr-2 h-4 w-4" />
                    Reportar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook-based error boundary for functional components
 */
export function useErrorHandler() {
  return (error: Error, errorInfo?: { componentStack?: string }) => {
    const appError = new AppError(
      error.message,
      ErrorCode.INTERNAL_ERROR,
      500,
      ErrorSeverity.HIGH,
      errorInfo,
      error
    );

    ErrorHandler.handle(appError, {
      component: 'useErrorHandler',
      action: 'capturar erro em hook',
    });
  };
}

/**
 * Higher-order component to wrap components with error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

/**
 * Async error boundary for handling promise rejections
 */
export class AsyncErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidMount() {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', this.handlePromiseRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('unhandledrejection', this.handlePromiseRejection);
  }

  handlePromiseRejection = (event: PromiseRejectionEvent) => {
    const error = event.reason instanceof Error 
      ? event.reason 
      : new Error(String(event.reason));

    const appError = new AppError(
      error.message,
      ErrorCode.INTERNAL_ERROR,
      500,
      ErrorSeverity.HIGH,
      {
        unhandledPromiseRejection: true,
        reason: event.reason,
      },
      error
    );

    const handledError = ErrorHandler.handle(appError, {
      component: 'AsyncErrorBoundary',
      action: 'capturar promise rejection',
    });

    this.setState({
      hasError: true,
      error,
      errorInfo: null,
      errorId: handledError.errorId,
    });

    // Prevent the default browser behavior
    event.preventDefault();
  };

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const appError = new AppError(
      error.message,
      ErrorCode.INTERNAL_ERROR,
      500,
      ErrorSeverity.CRITICAL,
      {
        componentStack: errorInfo.componentStack,
        asyncErrorBoundary: true,
      },
      error
    );

    const handledError = ErrorHandler.handle(appError, {
      component: 'AsyncErrorBoundary',
      action: 'capturar erro assíncrono',
    });

    this.setState({
      error,
      errorInfo,
      errorId: handledError.errorId,
    });

    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <ErrorBoundary {...this.props}>
          {this.props.children}
        </ErrorBoundary>
      );
    }

    return this.props.children;
  }
}