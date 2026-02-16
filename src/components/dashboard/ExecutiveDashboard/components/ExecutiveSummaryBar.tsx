/**
 * Executive Summary Bar - Top-level KPIs
 * Aligned with Figma Design: Performance Metrics Section
 * Updated to match Figma design exactly
 * 
 * Layout: 
 * - Left column: Health Score (large card with donut)
 * - Right column: 2x2 grid with SLA, Gasto MTD, Alertas, Economia
 */

import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { ExecutiveSummary } from '../types';
import DonutChart from './DonutChart';
import InfoIcon from './InfoIcon';
import CardCTA from './CardCTA';
import { useCloudAccount } from '@/contexts/CloudAccountContext';
import { getCurrencySymbol, getProviderCurrency } from '@/lib/format-cost';
import { CurrencyIndicator } from '@/components/ui/currency-indicator';

interface Props {
  data: ExecutiveSummary;
}

export default function ExecutiveSummaryBar({ data }: Props) {
  const { t } = useTranslation();
  const { selectedProvider } = useCloudAccount();
  const sym = getCurrencySymbol(getProviderCurrency(selectedProvider));

  const budgetPercentage = Math.min(100, data.budgetUtilization);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
        {/* Left Column: Health Score - Large Card */}
        <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-base font-light text-[#5F5F5F]">
              {t('executiveDashboard.healthScore', 'Score de Saúde')}
            </p>
            <InfoIcon tooltip={t('executiveDashboard.healthScoreTooltip')} />
          </div>
          
          <div className="flex justify-center my-6">
            <DonutChart 
              value={data.overallScore} 
              max={100}
              size={160}
              strokeWidth={8}
              color="#00B2FF"
            />
          </div>
          
          <div className="text-center mt-4">
            <CardCTA 
              textKey="executiveDashboard.optimizeHealthCTA"
              fallback="Ver como otimizar saúde"
              href="/security-scans"
              align="center"
            />
          </div>
        </div>

        {/* Right Column: 2x2 Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card: SLA de Uptime */}
          <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-base font-light text-[#5F5F5F]">
                {t('executiveDashboard.uptimeSLA', 'SLA de Uptime')}
              </p>
              <InfoIcon tooltip={t('executiveDashboard.uptimeSLATooltip')} />
            </div>
            
            {data.uptimeSLA > 0 ? (
              <>
                <p 
                  className={cn(
                    'tabular-nums mb-3',
                    data.uptimeSLA >= 99.9 ? 'text-[#00B2FF]' : 
                    data.uptimeSLA >= 99 ? 'text-[#393939]' : 'text-red-500'
                  )}
                  style={{ fontSize: '42px', lineHeight: '1', fontWeight: '300' }}
                >
                  {data.uptimeSLA.toFixed(2)}%
                </p>
                
                <p className="text-sm font-light text-[#5F5F5F]">
                  {t('executiveDashboard.target', 'Meta')}: 99.9%
                </p>
              </>
            ) : (
              <>
                <p 
                  className="text-[#393939]/40 tabular-nums mb-3"
                  style={{ fontSize: '42px', lineHeight: '1', fontWeight: '300' }}
                >
                  —
                </p>
                <p className="text-sm font-light text-[#5F5F5F]">
                  {t('executiveDashboard.noEndpoints', 'No endpoints monitored')}
                </p>
              </>
            )}
          </div>

          {/* Card: Gasto MTD */}
          <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-base font-light text-[#5F5F5F] flex items-center gap-1.5">
                {t('executiveDashboard.mtdSpend', 'Gasto MTD')}
                <CurrencyIndicator />
              </p>
              <InfoIcon tooltip={t('executiveDashboard.mtdSpendTooltip')} />
            </div>
            
            <p 
              className="text-[#393939] tabular-nums mb-3" 
              style={{ fontSize: '42px', lineHeight: '1', fontWeight: '300' }}
            >
              {sym}{data.mtdSpend.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
            
            {/* Budget bar with label and percentage on same line */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-light text-[#00B2FF]">
                  {t('executiveDashboard.budget', 'Orçamento')}
                </span>
                <span className={cn(
                  'font-light tabular-nums',
                  budgetPercentage >= 90 ? 'text-red-500' : 
                  budgetPercentage >= 75 ? 'text-amber-500' : 'text-[#00B2FF]'
                )}>
                  {budgetPercentage.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 bg-[#E5E5E5] rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-500"
                  style={{ 
                    width: `${budgetPercentage}%`,
                    backgroundColor: budgetPercentage >= 90 ? '#EF4444' : 
                                   budgetPercentage >= 75 ? '#F59E0B' : '#00B2FF'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Card: Alertas Ativos */}
          <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-base font-light text-[#5F5F5F]">
                {t('executiveDashboard.activeAlerts', 'Alertas Ativos')}
              </p>
              <InfoIcon tooltip={t('executiveDashboard.activeAlertsTooltip')} />
            </div>
            
            {/* Alert counts in row with labels */}
            <div className="flex items-start gap-8 mb-3">
              {/* Medium */}
              <div className="text-center">
                <p 
                  className="text-[#6B7280] tabular-nums" 
                  style={{ fontSize: '32px', lineHeight: '1', fontWeight: '300' }}
                >
                  {data.activeAlerts.medium}
                </p>
                <span className="text-xs font-medium text-[#6B7280] uppercase tracking-wide">
                  {t('executiveDashboard.alertMedium', 'Médio')}
                </span>
              </div>
              
              {/* High */}
              <div className="text-center">
                <p 
                  className="text-[#F59E0B] tabular-nums" 
                  style={{ fontSize: '32px', lineHeight: '1', fontWeight: '300' }}
                >
                  {data.activeAlerts.high}
                </p>
                <span className="text-xs font-medium text-[#F59E0B] uppercase tracking-wide">
                  {t('executiveDashboard.alertHigh', 'Alto')}
                </span>
              </div>
              
              {/* Critical */}
              <div className="text-center">
                <p 
                  className="text-[#EF4444] tabular-nums" 
                  style={{ fontSize: '32px', lineHeight: '1', fontWeight: '300' }}
                >
                  {data.activeAlerts.critical}
                </p>
                <span className="text-xs font-medium text-[#EF4444] uppercase tracking-wide">
                  {t('executiveDashboard.alertCritical', 'Crítico')}
                </span>
              </div>
            </div>

          </div>

          {/* Card: Potencial de Economia */}
          <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-base font-light text-[#5F5F5F]">
                {t('executiveDashboard.savingsPotential', 'Potencial de Economia')}
              </p>
              <InfoIcon tooltip={t('executiveDashboard.savingsPotentialTooltip')} />
            </div>
            
            <div className="flex items-baseline gap-1 mb-1">
              <p 
                className="text-[#393939] tabular-nums" 
                style={{ fontSize: '42px', lineHeight: '1', fontWeight: '300' }}
              >
                {sym}{(data.potentialSavings * 12).toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </p>
              <span className="text-xl font-light text-[#393939]">/ano</span>
            </div>
            
            <p className="text-base font-light text-[#5F5F5F] mb-4">
              {sym}{data.potentialSavings.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mês
            </p>
            
            <div className="text-right">
              <CardCTA 
                textKey="executiveDashboard.optimizeCostCTA"
                fallback="Ver como otimizar custo"
                href="/cost-optimization"
                align="right"
              />
            </div>
          </div>
        </div>
      </div>
  );
}
