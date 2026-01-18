/**
 * Executive Summary Bar - Top-level KPIs
 * Aligned with Figma Design: Performance Metrics Section
 * Updated to match Figma design (909Nysrfi4pKGgKOkD5Csn)
 * 
 * Design Reference: Figma Frame "Performance Metrics"
 * Layout: 2x2 grid on mobile, 4 columns on desktop
 * Cards: White background, subtle shadow, rounded corners
 * 
 * Key Features:
 * - Donut chart for Health Score
 * - Info icons in top-right corner
 * - CTAs for actions
 * - Lighter typography (200-300 weights)
 */

import { 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  Activity,
  DollarSign,
  PiggyBank,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { ExecutiveSummary } from '../types';
import DonutChart from './DonutChart';
import InfoIcon from './InfoIcon';
import CardCTA from './CardCTA';

interface Props {
  data: ExecutiveSummary;
}

export default function ExecutiveSummaryBar({ data }: Props) {
  const { t } = useTranslation();

  const budgetPercentage = Math.min(100, data.budgetUtilization);
  const totalAlerts = data.activeAlerts.critical + data.activeAlerts.high + data.activeAlerts.medium;

  return (
    <div className="space-y-4">
      {/* 4 Cards in a single row - exactly as Figma */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Health Score */}
        <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 transition-all hover:shadow-md shadow-sm">
          <div className="absolute top-4 right-4">
            <InfoIcon tooltip={t('executiveDashboard.healthScoreTooltip')} />
          </div>
          
          <p className="text-base font-light text-[#5F5F5F] mb-2">
            {t('executiveDashboard.healthScore', 'Score de Saúde')}
          </p>
          
          <div className="flex justify-center my-3">
            <DonutChart 
              value={data.overallScore} 
              max={100}
              size={110}
              strokeWidth={6}
              color={data.overallScore >= 80 ? '#5EB10B' : data.overallScore >= 60 ? '#00B2FF' : '#EF4444'}
            />
          </div>
          
          <p className="text-xs font-light text-[#5F5F5F] text-center mb-1.5">
            {t('executiveDashboard.healthScoreDescription', 'Análise completa de segurança e conformidade')}
          </p>
          
          <div className="text-center mt-1.5">
            <CardCTA 
              text={t('executiveDashboard.optimizeHealth', 'Otimizar saúde →')}
              href="/security-scan"
              align="center"
            />
          </div>
        </div>

        {/* Card 2: Uptime SLA */}
        <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 transition-all hover:shadow-md shadow-sm">
          <div className="absolute top-4 right-4">
            <InfoIcon tooltip={t('executiveDashboard.uptimeSLATooltip')} />
          </div>
          
          <p className="text-base font-light text-[#5F5F5F] mb-2">
            {t('executiveDashboard.uptimeSLA', 'SLA de Uptime')}
          </p>
          
          <p 
            className={cn(
              'font-extralight tabular-nums mb-1.5',
              data.uptimeSLA >= 99.9 ? 'text-[#5EB10B]' : 
              data.uptimeSLA >= 99 ? 'text-[#393939]' : 'text-red-600'
            )}
            style={{ fontSize: '35px', lineHeight: '1.2', fontWeight: '200' }}
          >
            {data.uptimeSLA.toFixed(2)}%
          </p>
          
          <span className="text-sm font-light text-[#5F5F5F]">
            {t('executiveDashboard.target', 'Meta')}: 99.9%
          </span>
        </div>

        {/* Card 3: MTD Spend */}
        <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 transition-all hover:shadow-md shadow-sm">
          <div className="absolute top-4 right-4">
            <InfoIcon tooltip={t('executiveDashboard.mtdSpendTooltip')} />
          </div>
          
          <p className="text-base font-light text-[#5F5F5F] mb-2">
            {t('executiveDashboard.mtdSpend', 'Gasto MTD')}
          </p>
          
          <div className="flex items-baseline justify-between mb-1.5">
            <p 
              className="font-extralight text-[#00B2FF] tabular-nums" 
              style={{ fontSize: '35px', lineHeight: '1.2', fontWeight: '200' }}
            >
              ${data.mtdSpend.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
            <span className={cn(
              'text-base font-light tabular-nums',
              budgetPercentage >= 90 ? 'text-red-600' : 
              budgetPercentage >= 75 ? 'text-amber-600' : 'text-[#5F5F5F]'
            )}>
              ({budgetPercentage.toFixed(0)}%)
            </span>
          </div>
          
          <div className="space-y-1.5 mt-3">
            <div className="h-2 bg-[#E9E9E9] rounded-full overflow-hidden">
              <div 
                className={cn('h-full rounded-full transition-all duration-500')}
                style={{ 
                  width: `${budgetPercentage}%`,
                  backgroundColor: budgetPercentage >= 90 ? '#EF4444' : 
                                 budgetPercentage >= 75 ? '#F59E0B' : '#00B2FF'
                }}
              />
            </div>
            <div className="flex justify-start">
              <span className="text-xs font-light text-[#00B2FF]">
                {t('executiveDashboard.budget', 'Orçamento')}
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Savings Potential */}
        <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 transition-all hover:shadow-md shadow-sm">
          <div className="absolute top-4 right-4">
            <InfoIcon tooltip={t('executiveDashboard.savingsPotentialTooltip')} />
          </div>
          
          <p className="text-base font-light text-[#5F5F5F] mb-2">
            {t('executiveDashboard.savingsPotential', 'Potencial de Economia')}
          </p>
          
          <div className="flex items-baseline gap-1 mb-0.5">
            <p 
              className="font-extralight text-[#5EB10B] tabular-nums" 
              style={{ fontSize: '35px', lineHeight: '1.2', fontWeight: '200' }}
            >
              ${(data.potentialSavings * 12).toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
            <span className="text-xl font-extralight text-[#5EB10B]">/ano</span>
          </div>
          
          <p className="text-base font-extralight text-[#5F5F5F] mb-3">
            ${data.potentialSavings.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mês
          </p>
          
          <div className="text-right">
            <CardCTA 
              text={t('executiveDashboard.increaseEconomy', 'Aumentar economia →')}
              href="/cost-optimization"
              align="right"
            />
          </div>
        </div>
      </div>

      {/* Active Alerts Banner - Only shown when there are alerts */}
      {totalAlerts > 0 && (
        <div className={cn(
          'relative rounded-2xl border p-3 transition-all shadow-sm',
          data.activeAlerts.critical > 0 
            ? 'bg-white border-red-100' 
            : 'bg-white border-amber-100'
        )}>
          {/* Info Icon */}
          <div className="absolute top-3 right-3">
            <InfoIcon tooltip={t('executiveDashboard.activeAlertsTooltip', 'Critical and high priority alerts requiring attention')} />
          </div>
          
          {/* Title and Alert Counts in single row */}
          <div className="flex items-center justify-between gap-6">
            {/* Title - 16px Light */}
            <p className="text-base font-light text-[#393939]">
              {t('executiveDashboard.activeAlerts', 'Alertas Ativos')}
            </p>
            
            {/* Alert Counts - Horizontal, compact */}
            <div className="flex items-center gap-8">
              {data.activeAlerts.medium > 0 && (
                <div className="text-center">
                  <p className="font-extralight text-gray-600 tabular-nums" style={{ fontSize: '20px', lineHeight: '1.2' }}>
                    {data.activeAlerts.medium}
                  </p>
                  <span className="font-light text-gray-600 uppercase tracking-wide" style={{ fontSize: '10px' }}>
                    {t('executiveDashboard.alertMedium', 'MÉDIO')}
                  </span>
                </div>
              )}
              {data.activeAlerts.high > 0 && (
                <div className="text-center">
                  <p className="font-extralight text-amber-600 tabular-nums" style={{ fontSize: '20px', lineHeight: '1.2' }}>
                    {data.activeAlerts.high}
                  </p>
                  <span className="font-light text-amber-600 uppercase tracking-wide" style={{ fontSize: '10px' }}>
                    {t('executiveDashboard.alertHigh', 'ALTO')}
                  </span>
                </div>
              )}
              {data.activeAlerts.critical > 0 && (
                <div className="text-center">
                  <p className="font-extralight text-red-600 tabular-nums" style={{ fontSize: '20px', lineHeight: '1.2' }}>
                    {data.activeAlerts.critical}
                  </p>
                  <span className="font-light text-red-600 uppercase tracking-wide" style={{ fontSize: '10px' }}>
                    {t('executiveDashboard.alertCritical', 'CRÍTICO')}
                  </span>
                </div>
              )}
            </div>
            
            {/* CTA - 12px Light */}
            <div>
              <CardCTA 
                text={t('executiveDashboard.viewAlerts', 'Ver alertas →')}
                href="/intelligent-alerts"
                align="right"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
