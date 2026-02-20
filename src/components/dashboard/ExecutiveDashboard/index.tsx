/**
 * Executive Dashboard v2.3 - Clean Light Theme Design with Granular Skeleton Loading
 * Structure: Beginning (Current State) → Middle (Risks/Waste) → End (Actions)
 * Design: Light background (#F9FAFB), #003C7D accent, white cards with subtle shadows
 * Color Palette:
 *   - Primary: #003C7D (dark blue)
 *   - Secondary: #008CFF (light blue)
 *   - Success: #10B981 (green)
 *   - Background: #FFFFFF / #F9FAFB
 *   - Text: #1F2937 (dark gray)
 * 
 * Features:
 *   - Granular skeleton loading per section
 *   - Progressive data loading
 *   - Suspense-like boundaries for each card
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, TrendingDown, Shield, Zap, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { useExecutiveDashboard } from '@/hooks/useExecutiveDashboard';
import { useExecutiveTrends } from '@/hooks/useExecutiveTrends';
import { useTVDashboard } from '@/contexts/TVDashboardContext';
import { useOrganization } from '@/hooks/useOrganization';
import DashboardAlerts from '../DashboardAlerts';

import { useCloudAccount } from '@/contexts/CloudAccountContext';
import { useCurrency } from '@/hooks/useCurrency';

// Components
import ExecutiveSummaryBar from './components/ExecutiveSummaryBar';
import FinancialHealthCard from './components/FinancialHealthCard';
import SecurityPostureCard from './components/SecurityPostureCard';
import OperationsCenterCard from './components/OperationsCenterCard';
import AICommandCenter from './components/AICommandCenter';
import TrendAnalysis from './components/TrendAnalysis';

// Granular Skeletons
import {
  ExecutiveSummaryBarSkeleton,
  TrendAnalysisSkeleton,
  FinancialHealthCardSkeleton,
  SecurityPostureCardSkeleton,
  OperationsCenterCardSkeleton,
  AICommandCenterSkeleton,
  QuickActionsSummarySkeleton,
  SectionHeaderSkeleton,
} from './components/Skeletons';

// Section Loader for progressive loading
import { SectionLoader, CardLoader } from './components/SectionLoader';

// Hook for tracking section loading states
import { useExecutiveDashboardSections } from '@/hooks/useExecutiveDashboardSections';

// Section Header Component - Clean Light Design
function SectionHeader({ 
  title, 
  description, 
  icon: Icon 
}: { 
  title: string; 
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-start gap-3 mb-3">
      {Icon && (
        <div className="p-2 bg-[#003C7D]/10 rounded-xl">
          <Icon className="h-4 w-4 text-[#003C7D]" />
        </div>
      )}
      <div>
        <h2 className="text-xl font-light text-[#1F2937]">{title}</h2>
        <p className="text-xs font-light text-gray-500">{description}</p>
      </div>
    </div>
  );
}

export default function ExecutiveDashboardV2() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { isTVMode } = useTVDashboard();
  const { data: organizationId } = useOrganization();
  const [trendPeriod, setTrendPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const { 
    data, 
    isLoading, 
    isError, 
    error, 
    refresh,
    isFetching
  } = useExecutiveDashboard({
    includeInsights: true
  });

  // Separate query for trends - changes period without reloading entire dashboard
  const {
    data: trendsData,
    isFetching: isTrendsFetching
  } = useExecutiveTrends({ trendPeriod });

  // Track which sections have valid data for progressive loading
  const sectionStates = useExecutiveDashboardSections(data, isLoading);

  // Loading state - Now uses granular skeletons
  if (isLoading) {
    return <DashboardSkeletonGranular />;
  }

  // Error state
  if (isError) {
    return (
      <ErrorState 
        error={error}
        type="server"
        title={t('executiveDashboard.title', 'Dashboard Indisponível')}
        message={t('executiveDashboard.description', 'Não foi possível carregar os dados do dashboard executivo.')}
        onRetry={refresh}
        showReload={true}
        showDetails={true}
      />
    );
  }

  if (!data) return null;

  // Calculate risk indicators
  const hasSecurityRisks = (data.security?.findings?.critical || 0) > 0 || (data.security?.findings?.high || 0) > 0;
  const hasFinancialWaste = (data.financial?.savings?.potential || 0) > 0;
  const hasOperationalIssues = (data.operations?.endpoints?.down || 0) > 0 || (data.operations?.alerts?.count?.critical || 0) > 0;

  // Format current date based on locale
  const currentDate = new Date().toLocaleDateString(i18n.language === 'pt' ? 'pt-BR' : 'en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  // Capitalize first letter
  const formattedDate = currentDate.charAt(0).toUpperCase() + currentDate.slice(1);

  return (
    <div data-executive-dashboard className="bg-[#F1F3F7] dark:bg-transparent -m-3 p-3 space-y-6">
      {/* Greeting Header with Refresh Button */}
      <div className="flex items-start justify-between">
        <div className="space-y-0.5">
          <h1 className="text-3xl font-light text-[#1F2937]">
            {t('executiveDashboard.greeting', 'Olá, confira a visão geral da sua infraestrutura')}
          </h1>
          <p className="text-sm text-gray-500">{formattedDate}</p>
        </div>
        
        {/* Refresh Button - Top Right */}
        {!isTVMode && (
          <Button 
            onClick={refresh}
            disabled={isFetching}
            className="rounded-xl font-medium shadow-sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? t('executiveDashboard.updating', 'Updating...') : t('executiveDashboard.refresh', 'Refresh')}
          </Button>
        )}
      </div>

      {/* Alerts Section */}
      {organizationId && (
        <DashboardAlerts organizationId={organizationId} />
      )}

      {/* SECTION 1: Current Infrastructure State */}
      <section className="space-y-4">
        {/* Simple title without icon - matching Figma */}
        <h2 className="text-xl font-light text-[#393939]">
          {t('executiveDashboard.sections.currentState', 'Visão Executiva')}
        </h2>
        
        <CardLoader
          isLoading={!sectionStates.summary && isFetching}
          skeleton={<ExecutiveSummaryBarSkeleton />}
        >
          <ExecutiveSummaryBar data={data.summary} />
        </CardLoader>

        <CardLoader
          isLoading={!sectionStates.trends && isFetching}
          skeleton={<TrendAnalysisSkeleton />}
        >
          {(trendsData || data.trends) && (
            <TrendAnalysis 
              data={(trendsData || data.trends)!}
              period={trendPeriod}
              onPeriodChange={setTrendPeriod}
              isLoading={isTrendsFetching}
            />
          )}
        </CardLoader>
      </section>

      {/* SECTION 2: Risks and Waste */}
      <section className="space-y-4">
        <SectionHeader 
          title={t('executiveDashboard.sections.risksWaste', 'Riscos e Oportunidades')}
          description={t('executiveDashboard.sections.risksWasteDesc', 'Onde estão os problemas e desperdícios')}
          icon={TrendingDown}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="relative">
            {hasFinancialWaste && (
              <div className="absolute -top-2 -right-2 z-10">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                  {t('executiveDashboard.attentionNeeded', 'Atenção')}
                </span>
              </div>
            )}
            <CardLoader
              isLoading={!sectionStates.financial && isFetching}
              skeleton={<FinancialHealthCardSkeleton />}
            >
              <FinancialHealthCard data={data.financial} />
            </CardLoader>
          </div>

          <div className="relative">
            {hasSecurityRisks && (
              <div className="absolute -top-2 -right-2 z-10">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                  {data.security?.findings?.critical || 0} {t('executiveDashboard.critical', 'Críticos')}
                </span>
              </div>
            )}
            <CardLoader
              isLoading={!sectionStates.security && isFetching}
              skeleton={<SecurityPostureCardSkeleton />}
            >
              <SecurityPostureCard data={data.security} />
            </CardLoader>
          </div>
        </div>
      </section>

      {/* SECTION 3: Operations & Recommended Actions - Side by Side */}
      <section className="space-y-4">
        <SectionHeader 
          title={t('executiveDashboard.sections.actions', 'Operações e Ações Recomendadas')}
          description={t('executiveDashboard.sections.actionsDesc', 'Status operacional e o que pode ser feito agora')}
          icon={Zap}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="relative h-full">
            {hasOperationalIssues && (
              <div className="absolute -top-2 -right-2 z-10">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                  {(data.operations?.endpoints?.down || 0) + (data.operations?.alerts?.count?.critical || 0)} {t('executiveDashboard.issues', 'Problemas')}
                </span>
              </div>
            )}
            <CardLoader
              isLoading={!sectionStates.operations && isFetching}
              skeleton={<OperationsCenterCardSkeleton />}
              className="h-full"
            >
              <OperationsCenterCard data={data.operations} />
            </CardLoader>
          </div>

          <div className="h-full">
            <CardLoader
              isLoading={!sectionStates.insights && isFetching}
              skeleton={<AICommandCenterSkeleton />}
              className="h-full"
            >
              <AICommandCenter 
                insights={data.insights}
                onRefresh={refresh}
                isLoading={isFetching}
              />
            </CardLoader>
          </div>
        </div>

        <QuickActionsSummary 
          data={data}
          hasSecurityRisks={hasSecurityRisks}
          hasFinancialWaste={hasFinancialWaste}
          hasOperationalIssues={hasOperationalIssues}
        />
      </section>

      {/* Metadata Footer */}
      <div className="text-xs text-gray-400 text-center pt-4 border-t border-gray-200">
        <p>
          {t('executiveDashboard.dataFreshness', 'Data freshness')}: 
          {' '}{t('executiveDashboard.totalCost', 'Costs')}: {data.metadata.dataFreshness.costs ? new Date(data.metadata.dataFreshness.costs).toLocaleDateString() : 'N/A'} | 
          {' '}{t('executiveDashboard.securityPosture', 'Security')}: {data.metadata.dataFreshness.security ? new Date(data.metadata.dataFreshness.security).toLocaleString() : 'N/A'} | 
          {' '}{t('executiveDashboard.endpointStatus', 'Endpoints')}: {data.metadata.dataFreshness.endpoints ? new Date(data.metadata.dataFreshness.endpoints).toLocaleString() : 'N/A'}
        </p>
      </div>
    </div>
  );
}

// Quick Actions Summary Component - Clean Light Design
function QuickActionsSummary({ 
  data, 
  hasSecurityRisks, 
  hasFinancialWaste, 
  hasOperationalIssues 
}: { 
  data: any;
  hasSecurityRisks: boolean;
  hasFinancialWaste: boolean;
  hasOperationalIssues: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedProvider } = useCloudAccount();
  const { sym, convert } = useCurrency();
  
  const actions = [];
  
  if (hasSecurityRisks) {
    actions.push({
      priority: 'critical',
      title: t('executiveDashboard.actions.reviewSecurity', 'Revisar Findings de Segurança'),
      description: `${data.security?.findings?.critical || 0} ${t('executiveDashboard.criticals', 'críticos')}, ${data.security?.findings?.high || 0} ${t('executiveDashboard.high', 'altos')}`,
      href: '/security-posture'
    });
  }
  
  if (hasOperationalIssues && data.operations?.endpoints?.down > 0) {
    actions.push({
      priority: 'critical',
      title: t('executiveDashboard.actions.checkEndpoints', 'Verificar Endpoints Offline'),
      description: `${data.operations?.endpoints?.down} endpoints ${t('executiveDashboard.down', 'offline')}`,
      href: '/endpoint-monitoring'
    });
  }
  
  if (hasFinancialWaste) {
    actions.push({
      priority: 'high',
      title: t('executiveDashboard.actions.optimizeCosts', 'Otimizar Custos'),
      description: `${sym}${convert(data.financial?.savings?.potential || 0).toLocaleString()} ${t('executiveDashboard.potentialSavings', 'em economia potencial')}`,
      href: '/cost-optimization'
    });
  }

  if (actions.length === 0) {
    return (
      <div className="bg-[#10B981]/10 border border-[#10B981]/20 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#10B981]/20 rounded-xl">
            <Shield className="h-5 w-5 text-[#10B981]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1F2937]">
              {t('executiveDashboard.allGood', 'Tudo em ordem!')}
            </p>
            <p className="text-xs text-gray-500">
              {t('executiveDashboard.noImmediateActions', 'Não há ações críticas pendentes no momento.')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleActionClick = (href: string) => {
    navigate(href);
  };

  return (
    <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100">
      <h3 className="text-base font-light text-[#1F2937] mb-3">
        {t('executiveDashboard.priorityActions', 'Ações Prioritárias')}
      </h3>
      <div className="space-y-2">
        {actions.map((action, index) => (
          <button 
            key={index}
            onClick={() => handleActionClick(action.href)}
            className="w-full flex items-center justify-between p-3.5 rounded-xl border border-gray-100 bg-[#F9FAFB] hover:border-[#003C7D]/30 hover:bg-[#003C7D]/5 transition-all group text-left"
          >
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${
                action.priority === 'critical' ? 'bg-red-500' : 'bg-amber-500'
              }`} />
              <div>
                <p className="text-sm font-medium text-[#1F2937] group-hover:text-[#003C7D]">
                  {action.title}
                </p>
                <p className="text-xs text-gray-500">
                  {action.description}
                </p>
              </div>
            </div>
            <span className="text-gray-400 group-hover:text-[#003C7D]">→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Granular Skeleton Loading - Uses specific skeletons for each section
function DashboardSkeletonGranular() {
  const { t, i18n } = useTranslation();
  
  // Format current date based on locale
  const currentDate = new Date().toLocaleDateString(i18n.language === 'pt' ? 'pt-BR' : 'en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  const formattedDate = currentDate.charAt(0).toUpperCase() + currentDate.slice(1);

  return (
    <div data-executive-dashboard className="bg-[#F1F3F7] dark:bg-transparent -m-3 p-3 space-y-6">
      {/* Header - Shows immediately */}
      <div className="flex items-start justify-between">
        <div className="space-y-0.5">
          <h1 className="text-3xl font-light text-[#1F2937]">
            {t('executiveDashboard.greeting', 'Olá, confira a visão geral da sua infraestrutura')}
          </h1>
          <p className="text-sm text-gray-500">{formattedDate}</p>
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      {/* SECTION 1: Current Infrastructure State */}
      <section className="space-y-4">
        <h2 className="text-xl font-light text-[#393939]">
          {t('executiveDashboard.sections.currentState', 'Visão Executiva')}
        </h2>
        <ExecutiveSummaryBarSkeleton />
        <TrendAnalysisSkeleton />
      </section>

      {/* SECTION 2: Risks and Waste */}
      <section className="space-y-4">
        <SectionHeaderSkeleton />
        <div className="grid gap-6 lg:grid-cols-2">
          <FinancialHealthCardSkeleton />
          <SecurityPostureCardSkeleton />
        </div>
      </section>

      {/* SECTION 3: Operations & Recommended Actions */}
      <section className="space-y-4">
        <SectionHeaderSkeleton />
        <div className="grid gap-6 lg:grid-cols-2">
          <OperationsCenterCardSkeleton />
          <AICommandCenterSkeleton />
        </div>
        <QuickActionsSummarySkeleton />
      </section>

      {/* Metadata Footer Skeleton */}
      <div className="text-center pt-4 border-t border-gray-200">
        <Skeleton className="h-4 w-96 mx-auto" />
      </div>
    </div>
  );
}

// Legacy Skeleton Loading - Kept for backwards compatibility
function DashboardSkeleton() {
  return (
    <div className="bg-[#F1F3F7] dark:bg-transparent -m-3 p-3 space-y-8">
      <section className="space-y-4">
        <div className="flex items-start gap-3 mb-4">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div>
            <Skeleton className="h-6 w-48 mb-1" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </section>

      <section className="space-y-4">
        <div className="flex items-start gap-3 mb-4">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div>
            <Skeleton className="h-6 w-48 mb-1" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </section>

      <section className="space-y-4">
        <div className="flex items-start gap-3 mb-4">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div>
            <Skeleton className="h-6 w-48 mb-1" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </section>
    </div>
  );
}

// Re-export for backwards compatibility
export { ExecutiveDashboardV2 as ExecutiveDashboard };

// Export skeletons for use in other components
export {
  ExecutiveSummaryBarSkeleton,
  TrendAnalysisSkeleton,
  FinancialHealthCardSkeleton,
  SecurityPostureCardSkeleton,
  OperationsCenterCardSkeleton,
  AICommandCenterSkeleton,
  QuickActionsSummarySkeleton,
} from './components/Skeletons';

// Export section loader utilities
export { SectionLoader, CardLoader } from './components/SectionLoader';
