/**
 * Executive Dashboard v2.0 - Redesigned
 * Single API call, modular components, improved UX
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { useExecutiveDashboard } from '@/hooks/useExecutiveDashboard';
import { useTVDashboard } from '@/contexts/TVDashboardContext';
import { useOrganization } from '@/hooks/useOrganization';
import DashboardAlerts from '../DashboardAlerts';

// Components
import ExecutiveSummaryBar from './components/ExecutiveSummaryBar';
import FinancialHealthCard from './components/FinancialHealthCard';
import SecurityPostureCard from './components/SecurityPostureCard';
import OperationsCenterCard from './components/OperationsCenterCard';
import AICommandCenter from './components/AICommandCenter';
import TrendAnalysis from './components/TrendAnalysis';

export default function ExecutiveDashboardV2() {
  const { t } = useTranslation();
  const { isTVMode } = useTVDashboard();
  const { data: organizationId } = useOrganization();
  const [trendPeriod, setTrendPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const { 
    data, 
    isLoading, 
    isError, 
    error, 
    refresh,
    dataUpdatedAt,
    isFetching
  } = useExecutiveDashboard({
    trendPeriod,
    includeInsights: true,
    includeTrends: true
  });

  // Loading state
  if (isLoading) {
    return <DashboardSkeleton />;
  }

  // Error state
  if (isError) {
    return (
      <ErrorState 
        error={error}
        type="server"
        title="Dashboard Indisponível"
        message="Não foi possível carregar os dados do dashboard executivo. Nossos servidores podem estar temporariamente indisponíveis."
        onRetry={refresh}
        showReload={true}
        showDetails={true}
      />
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Alerts Section */}
      {organizationId && (
        <DashboardAlerts organizationId={organizationId} />
      )}

      {/* Header Card - Padrão Visual */}
      <Card className="glass border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-primary" />
                Dashboard Executivo
              </CardTitle>
              <CardDescription>
                Visão consolidada de segurança, custos e compliance da sua infraestrutura AWS
              </CardDescription>
            </div>
            {!isTVMode && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {t('common.lastUpdated', 'Última atualização')}: {new Date(dataUpdatedAt).toLocaleTimeString()}
                </span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={refresh}
                  disabled={isFetching}
                  className="glass"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                  {isFetching ? 'Atualizando...' : 'Atualizar'}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Executive Summary Bar */}
      <ExecutiveSummaryBar data={data.summary} />

      {/* Main Grid - 2 columns */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Financial Health */}
        <FinancialHealthCard data={data.financial} />

        {/* Security Posture */}
        <SecurityPostureCard data={data.security} />
      </div>

      {/* Secondary Grid - 2 columns */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Operations Center */}
        <OperationsCenterCard data={data.operations} />

        {/* AI Command Center */}
        <AICommandCenter 
          insights={data.insights}
          onRefresh={refresh}
          isLoading={isFetching}
        />
      </div>

      {/* Trend Analysis - Full width */}
      {data.trends && (
        <TrendAnalysis 
          data={data.trends}
          period={trendPeriod}
          onPeriodChange={setTrendPeriod}
        />
      )}

      {/* Metadata Footer */}
      <div className="text-[10px] text-muted-foreground text-center pt-3 border-t">
        <p>
          {t('executiveDashboard.dataFreshness', 'Data freshness')}: 
          {' '}Costs: {data.metadata.dataFreshness.costs ? new Date(data.metadata.dataFreshness.costs).toLocaleDateString() : 'N/A'} | 
          {' '}Security: {data.metadata.dataFreshness.security ? new Date(data.metadata.dataFreshness.security).toLocaleString() : 'N/A'} | 
          {' '}Endpoints: {data.metadata.dataFreshness.endpoints ? new Date(data.metadata.dataFreshness.endpoints).toLocaleString() : 'N/A'}
        </p>
      </div>
    </div>
  );
}

// Skeleton Loading
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
      </div>

      {/* Summary Bar Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>

      {/* Cards Skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>

      <Skeleton className="h-64" />
    </div>
  );
}

// Re-export for backwards compatibility
export { ExecutiveDashboardV2 as ExecutiveDashboard };
