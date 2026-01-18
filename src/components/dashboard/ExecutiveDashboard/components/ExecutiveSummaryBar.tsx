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

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-[#10B981]';
    if (score >= 60) return 'text-[#1F2937]';
    return 'text-red-600';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-[#10B981]/10 border-[#10B981]/20';
    if (score >= 60) return 'bg-white border-gray-200';
    return 'bg-red-50 border-red-200';
  };

  const budgetPercentage = Math.min(100, data.budgetUtilization);
  const getBudgetColor = () => {
    if (budgetPercentage >= 90) return 'bg-red-500';
    if (budgetPercentage >= 75) return 'bg-amber-500';
    return 'bg-[#003C7D]';
  };

  const totalAlerts = data.activeAlerts.critical + data.activeAlerts.high + data.activeAlerts.medium;

  return (
    <div className="space-y-6">
      {/* Performance Metrics - 2x2 Grid matching Figma exactly */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Health Score Card - with Donut Chart */}
        <div className={cn(
          'relative overflow-hidden rounded-2xl border p-5 transition-all hover:shadow-lg bg-white',
          data.overallScore >= 80 ? 'border-[#10B981]/20' : 
          data.overallScore >= 60 ? 'border-gray-200' : 'border-red-200'
        )}>
          {/* Info Icon */}
          <div className="absolute top-5 right-5">
            <InfoIcon tooltip={t('executiveDashboard.healthScoreTooltip', 'Overall health score based on security, compliance, and operational metrics')} />
          </div>
          
          {/* Label - 16px Light */}
          <p className="text-base font-light text-[#5F5F5F] mb-3">
            {t('executiveDashboard.healthScore', 'Health Score')}
          </p>
          
          {/* Donut Chart - centered */}
          <div className="flex justify-center my-4">
            <DonutChart 
              value={data.overallScore} 
              max={100}
              size={110}
              strokeWidth={6}
              color={data.overallScore >= 80 ? '#5EB10B' : data.overallScore >= 60 ? '#00B2FF' : '#EF4444'}
            />
          </div>
          
          {/* Description Text - 12px Light */}
          <p className="text-xs font-light text-[#5F5F5F] text-center mb-2">
            {t('executiveDashboard.healthScoreDescription', 'Análise completa de segurança e conformidade')}
          </p>
          
          {/* CTA - 12px Light */}
          <div className="text-center mt-2">
            <CardCTA 
              text={t('executiveDashboard.optimizeHealth', 'Otimizar saúde →')}
              href="/security-scan"
              align="center"
            />
          </div>
        </div>

        {/* Uptime SLA Card */}
        <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:shadow-lg">
          {/* Info Icon */}
          <div className="absolute top-5 right-5">
            <InfoIcon tooltip={t('executiveDashboard.uptimeSLATooltip', 'Service Level Agreement uptime percentage')} />
          </div>
          
          {/* Label - 16px Light */}
          <p className="text-base font-light text-[#5F5F5F] mb-3">
            {t('executiveDashboard.uptimeSLA', 'Uptime SLA')}
          </p>
          
          {/* Value - 35px Extra Light */}
          <p className={cn(
            'font-extralight tabular-nums mb-2',
            data.uptimeSLA >= 99.9 ? 'text-[#5EB10B]' : 
            data.uptimeSLA >= 99 ? 'text-[#393939]' : 'text-red-600'
          )}
          style={{ fontSize: '35px', lineHeight: '1.2' }}>
            {data.uptimeSLA.toFixed(2)}%
          </p>
          
          {/* Target - 14px Light */}
          <span className="text-sm font-light text-[#5F5F5F]">
            {t('executiveDashboard.target', 'Meta')}: 99.9%
          </span>
        </div>

        {/* MTD Spend Card */}
        <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:shadow-lg">
          {/* Info Icon */}
          <div className="absolute top-5 right-5">
            <InfoIcon tooltip={t('executiveDashboard.mtdSpendTooltip', 'Month-to-date spending and budget utilization')} />
          </div>
          
          {/* Label - 16px Light */}
          <p className="text-base font-light text-[#5F5F5F] mb-3">
            {t('executiveDashboard.mtdSpend', 'MTD Spend')}
          </p>
          
          {/* Value with Budget Percentage - 35px Extra Light */}
          <div className="flex items-baseline justify-between mb-2">
            <p className="font-extralight text-[#00B2FF] tabular-nums" style={{ fontSize: '35px', lineHeight: '1.2' }}>
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
          
          {/* Budget Progress - 8px height, 15px radius */}
          <div className="space-y-2 mt-4">
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

        {/* Savings Potential Card */}
        <div className="relative overflow-hidden rounded-2xl border border-[#5EB10B]/20 bg-[#5EB10B]/5 p-5 transition-all hover:shadow-lg">
          {/* Info Icon */}
          <div className="absolute top-5 right-5">
            <InfoIcon tooltip={t('executiveDashboard.savingsPotentialTooltip', 'Estimated monthly and annual savings opportunities')} />
          </div>
          
          {/* Label - 16px Light */}
          <p className="text-base font-light text-[#5F5F5F] mb-3">
            {t('executiveDashboard.savingsPotential', 'Savings Potential')}
          </p>
          
          {/* Annual Value (highlighted) - 35px Extra Light */}
          <div className="flex items-baseline gap-1 mb-1">
            <p className="font-extralight text-[#5EB10B] tabular-nums" style={{ fontSize: '35px', lineHeight: '1.2' }}>
              ${(data.potentialSavings * 12).toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
            <span className="text-xl font-extralight text-[#5EB10B]">/ano</span>
          </div>
          
          {/* Monthly Value - 16px Extra Light */}
          <p className="text-base font-extralight text-[#5F5F5F] mb-4">
            ${data.potentialSavings.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mês
          </p>
          
          {/* CTA - 12px Light, right aligned */}
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
          'relative rounded-2xl border p-5 transition-all',
          data.activeAlerts.critical > 0 
            ? 'bg-red-50 border-red-200' 
            : 'bg-amber-50 border-amber-200'
        )}>
          {/* Info Icon */}
          <div className="absolute top-5 right-5">
            <InfoIcon tooltip={t('executiveDashboard.activeAlertsTooltip', 'Critical and high priority alerts requiring attention')} />
          </div>
          
          <div className="flex items-center justify-between">
            {/* Title - 16px Light, centered */}
            <div className="flex-1 text-center">
              <p className="text-base font-light text-[#393939]">
                {t('executiveDashboard.activeAlerts', 'Alertas Ativos')}
              </p>
            </div>
          </div>
          
          {/* Alert Counts - Horizontal Grid, centered */}
          <div className="flex items-center justify-center gap-12 mt-4 mb-3">
            {data.activeAlerts.medium > 0 && (
              <div className="text-center">
                <p className="font-extralight text-gray-600 tabular-nums mb-1" style={{ fontSize: '25px', lineHeight: '1.2' }}>
                  {data.activeAlerts.medium}
                </p>
                <span className="font-light text-gray-600 uppercase tracking-wide" style={{ fontSize: '11px' }}>
                  {t('executiveDashboard.alertMedium', 'MÉDIO')}
                </span>
              </div>
            )}
            {data.activeAlerts.high > 0 && (
              <div className="text-center">
                <p className="font-extralight text-amber-600 tabular-nums mb-1" style={{ fontSize: '25px', lineHeight: '1.2' }}>
                  {data.activeAlerts.high}
                </p>
                <span className="font-light text-amber-600 uppercase tracking-wide" style={{ fontSize: '11px' }}>
                  {t('executiveDashboard.alertHigh', 'ALTO')}
                </span>
              </div>
            )}
            {data.activeAlerts.critical > 0 && (
              <div className="text-center">
                <p className="font-extralight text-red-600 tabular-nums mb-1" style={{ fontSize: '25px', lineHeight: '1.2' }}>
                  {data.activeAlerts.critical}
                </p>
                <span className="font-light text-red-600 uppercase tracking-wide" style={{ fontSize: '11px' }}>
                  {t('executiveDashboard.alertCritical', 'CRÍTICO')}
                </span>
              </div>
            )}
          </div>
          
          {/* CTA - 12px Light, right aligned */}
          <div className="text-right">
            <CardCTA 
              text={t('executiveDashboard.viewAlerts', 'Ver alertas →')}
              href="/intelligent-alerts"
              align="right"
            />
          </div>
        </div>
      )}
    </div>
  );
}
