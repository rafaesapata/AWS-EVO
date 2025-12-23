/**
 * Dashboard Error Fallback
 * Displayed when the dashboard encounters an error
 */

import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';

interface DashboardErrorFallbackProps {
  error?: Error;
  resetErrorBoundary?: () => void;
}

export function DashboardErrorFallback({ error, resetErrorBoundary }: DashboardErrorFallbackProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle>{t('errors.dashboardError', 'Erro no Dashboard')}</CardTitle>
          <CardDescription>
            {t('errors.dashboardErrorDescription', 'Ocorreu um erro ao carregar o dashboard. Tente novamente.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {import.meta.env.DEV && error && (
            <pre className="p-4 bg-muted rounded text-xs overflow-auto max-w-full max-h-32">
              {error.message}
            </pre>
          )}
          <div className="flex gap-4 justify-center">
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('actions.refresh', 'Atualizar')}
            </Button>
            {resetErrorBoundary && (
              <Button variant="outline" onClick={resetErrorBoundary}>
                {t('actions.tryAgain', 'Tentar Novamente')}
              </Button>
            )}
            <Button variant="ghost" onClick={() => window.location.href = '/'}>
              <Home className="h-4 w-4 mr-2" />
              {t('actions.home', 'Início')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default DashboardErrorFallback;
