/**
 * Executive Summary Bar - Top-level KPIs
 * Clean Light Design with color palette:
 *   - Primary: #003C7D (dark blue)
 *   - Secondary: #008CFF (light blue)
 *   - Success: #10B981 (green)
 *   - Background: #FFFFFF / #F9FAFB
 *   - Text: #1F2937 (dark gray)
 */

import { 
  TrendingUp, 
  TrendingDown,
  AlertTriangle 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { ExecutiveSummary } from '../types';

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
    <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100">
      <h2 className="text-base font-semibold text-[#1F2937] mb-5">
        {t('executiveDashboard.summary', 'Resumo Executivo')}
      </h2>
      
      {/* 2x2 Grid Layout for Performance Metrics style */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Overall Health Score */}
        <div className={cn('p-4 rounded-2xl border', getScoreBg(data.overallScore))}>
          <p className="text-sm font-medium text-gray-500 mb-2">
            {t('executiveDashboard.healthScore', 'Health Score')}
          </p>
          <div className="flex items-baseline gap-1">
            <span className={cn('text-4xl font-light tabular-nums', getScoreColor(data.overallScore))}>
              {data.overallScore}
            </span>
            <span className="text-sm text-gray-400">{t('executiveDashboard.outOf100', '/100')}</span>
          </div>
          {data.scoreChange !== 0 && (
            <div className={cn(
              'flex items-center gap-1 mt-2 text-xs font-medium',
              data.scoreChange > 0 ? 'text-[#10B981]' : 'text-red-600'
            )}>
              {data.scoreChange > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {data.scoreChange > 0 ? '+' : ''}{data.scoreChange}% {t('executiveDashboard.vsLastPeriod', 'vs last period')}
            </div>
          )}
        </div>

        {/* MTD Spend */}
        <div className="p-4 rounded-2xl bg-white border border-gray-200">
          <p className="text-sm font-medium text-gray-500 mb-2">
            {t('executiveDashboard.mtdSpend', 'MTD Spend')}
          </p>
          <p className="text-4xl font-light text-[#1F2937] tabular-nums">
            ${data.mtdSpend.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </p>
          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">{t('executiveDashboard.budget', 'Budget')}</span>
              <span className={cn('font-medium tabular-nums', budgetPercentage >= 90 ? 'text-red-600' : 'text-[#1F2937]')}>
                {budgetPercentage.toFixed(0)}%
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className={cn('h-full rounded-full transition-all', getBudgetColor())}
                style={{ width: `${budgetPercentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Potential Savings */}
        <div className="p-4 rounded-2xl bg-[#10B981]/10 border border-[#10B981]/20">
          <p className="text-sm font-medium text-gray-500 mb-2">
            {t('executiveDashboard.savingsPotential', 'Savings Potential')}
          </p>
          <p className="text-4xl font-light text-[#10B981] tabular-nums">
            ${data.potentialSavings.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </p>
          <span className="text-xs text-gray-500 mt-2 block">{t('executiveDashboard.perMonth', '/month')}</span>
        </div>

        {/* Uptime SLA */}
        <div className="p-4 rounded-2xl bg-white border border-gray-200">
          <p className="text-sm font-medium text-gray-500 mb-2">
            {t('executiveDashboard.uptimeSLA', 'Uptime SLA')}
          </p>
          <p className={cn(
            'text-4xl font-light tabular-nums',
            data.uptimeSLA >= 99.9 ? 'text-[#10B981]' : 
            data.uptimeSLA >= 99 ? 'text-[#1F2937]' : 'text-red-600'
          )}>
            {data.uptimeSLA.toFixed(2)}%
          </p>
          <span className="text-xs text-gray-500 mt-2 block">{t('executiveDashboard.target', 'Target')}: 99.9%</span>
        </div>
      </div>

      {/* Active Alerts - Separate row */}
      {totalAlerts > 0 && (
        <div className={cn(
          'mt-4 p-4 rounded-2xl border',
          data.activeAlerts.critical > 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className={cn(
                'h-5 w-5',
                data.activeAlerts.critical > 0 ? 'text-red-600' : 'text-amber-600'
              )} />
              <span className="text-sm font-medium text-[#1F2937]">
                {t('executiveDashboard.activeAlerts', 'Active Alerts')}
              </span>
            </div>
            <div className="flex items-center gap-4">
              {data.activeAlerts.critical > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-2xl font-light text-red-600 tabular-nums">{data.activeAlerts.critical}</span>
                  <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">{t('executiveDashboard.alertCritical', 'CRITICAL')}</span>
                </div>
              )}
              {data.activeAlerts.high > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xl font-light text-amber-600 tabular-nums">{data.activeAlerts.high}</span>
                  <span className="text-xs font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">{t('executiveDashboard.alertHigh', 'HIGH')}</span>
                </div>
              )}
              {data.activeAlerts.medium > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-lg font-light text-gray-600 tabular-nums">{data.activeAlerts.medium}</span>
                  <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">{t('executiveDashboard.alertMedium', 'MEDIUM')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
