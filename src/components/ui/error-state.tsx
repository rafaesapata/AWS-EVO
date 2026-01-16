/**
 * Error State Component
 * Reusable error display with friendly UI
 */

import { RefreshCw, ServerCrash, AlertTriangle, WifiOff, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export type ErrorType = 'server' | 'network' | 'database' | 'generic';

interface ErrorStateProps {
  error?: Error | null;
  type?: ErrorType;
  title?: string;
  message?: string;
  onRetry?: () => void;
  showReload?: boolean;
  showDetails?: boolean;
  className?: string;
}

const errorConfig = {
  server: {
    icon: ServerCrash,
    title: 'Erro no Servidor',
    message: 'Nossos servidores estão temporariamente indisponíveis. Por favor, tente novamente em alguns instantes.',
    color: 'text-destructive'
  },
  network: {
    icon: WifiOff,
    title: 'Erro de Conexão',
    message: 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet.',
    color: 'text-orange-500'
  },
  database: {
    icon: Database,
    title: 'Erro no Banco de Dados',
    message: 'Não foi possível acessar os dados. Tente novamente em alguns instantes.',
    color: 'text-blue-500'
  },
  generic: {
    icon: AlertTriangle,
    title: 'Ops! Algo deu errado',
    message: 'Ocorreu um erro inesperado. Por favor, tente novamente.',
    color: 'text-yellow-500'
  }
};

export function ErrorState({
  error,
  type = 'generic',
  title,
  message,
  onRetry,
  showReload = true,
  showDetails = true,
  className = ''
}: ErrorStateProps) {
  const config = errorConfig[type];
  const Icon = config.icon;
  
  const displayTitle = title || config.title;
  const displayMessage = message || config.message;

  return (
    <div className={`flex items-center justify-center min-h-[400px] p-8 ${className}`}>
      <Card className="max-w-2xl w-full bg-white border border-red-200 shadow-sm">
        <CardContent className="pt-12 pb-12">
          <div className="flex flex-col items-center text-center space-y-6">
            {/* Animated Error Icon */}
            <div className="relative">
              <div className="absolute inset-0 bg-destructive/10 rounded-full blur-2xl animate-pulse" />
              <div className="relative bg-gradient-to-br from-destructive/20 to-destructive/5 p-8 rounded-full">
                <Icon 
                  className={`h-24 w-24 ${config.color} animate-bounce`} 
                  style={{ animationDuration: '2s' }} 
                />
              </div>
            </div>

            {/* Error Message */}
            <div className="space-y-3">
              <h3 className="text-2xl font-semibold text-foreground">
                {displayTitle}
              </h3>
              <p className="text-muted-foreground max-w-md">
                {displayMessage}
              </p>
              
              {/* Technical Details (collapsible) */}
              {showDetails && error && (
                <details className="mt-4 text-left">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Detalhes técnicos
                  </summary>
                  <div className="mt-2 p-4 bg-muted/50 rounded-lg text-xs font-mono text-destructive break-all">
                    {error.message || 'Erro desconhecido'}
                    {error.stack && (
                      <pre className="mt-2 text-[10px] opacity-70 overflow-x-auto">
                        {error.stack.split('\n').slice(0, 5).join('\n')}
                      </pre>
                    )}
                  </div>
                </details>
              )}
            </div>

            {/* Action Buttons */}
            {(onRetry || showReload) && (
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                {onRetry && (
                  <Button 
                    onClick={onRetry} 
                    size="lg"
                    className="gap-2"
                  >
                    <RefreshCw className="h-5 w-5" />
                    Tentar Novamente
                  </Button>
                )}
                {showReload && (
                  <Button 
                    variant="outline" 
                    size="lg"
                    onClick={() => window.location.reload()}
                    className="gap-2"
                  >
                    Recarregar Página
                  </Button>
                )}
              </div>
            )}

            {/* Help Text */}
            <p className="text-xs text-muted-foreground pt-4">
              Se o problema persistir, entre em contato com o suporte técnico
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Compact version for inline errors
export function ErrorStateCompact({
  error,
  onRetry,
  message = 'Erro ao carregar dados'
}: {
  error?: Error | null;
  onRetry?: () => void;
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-4">
      <div className="flex items-center gap-3 text-destructive">
        <AlertTriangle className="h-6 w-6" />
        <p className="font-medium">{message}</p>
      </div>
      
      {error && (
        <p className="text-sm text-muted-foreground max-w-md text-center">
          {error.message}
        </p>
      )}
      
      {onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Tentar Novamente
        </Button>
      )}
    </div>
  );
}
