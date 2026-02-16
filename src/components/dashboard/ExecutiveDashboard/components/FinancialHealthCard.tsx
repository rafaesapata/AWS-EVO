/**
 * Financial Health Card - Cost metrics and savings
 * Design aligned with Executive Summary Bar:
 *   - Primary: #00B2FF (light blue)
 *   - Text: #393939 (dark gray)
 *   - Labels: #5F5F5F (medium gray)
 *   - Background: #FFFFFF
 *   - Border: border-gray-200
 */

import { AlertTriangle, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import InfoIcon from './InfoIcon';
import type { FinancialHealth } from '../types';
import { useCloudAccount } from '@/contexts/CloudAccountContext';
import { getCurrencySymbol, getProviderCurrency } from '@/lib/format-cost';
import { CurrencyIndicator } from '@/components/ui/currency-indicator';

interface Props {
  data: FinancialHealth;
}

export default function FinancialHealthCard({ data }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedProvider } = useCloudAccount();
  const sym = getCurrencySymbol(getProviderCurrency(selectedProvider));

  const hasNoCostData = data.mtdCost === 0 && data.ytdCost === 0 && data.budget === 0;

  const getBudgetColor = (utilization: number) => {
    if (utilization >= 90) return 'text-red-500';
    if (utilization >= 75) return 'text-amber-500';
    return 'text-[#00B2FF]';
  };

  const getBudgetBarColor = (utilization: number) => {
    if (utilization >= 90) return 'bg-red-500';
    if (utilization >= 75) return 'bg-amber-500';
    return 'bg-[#00B2FF]';
  };

  return (
    <div className="h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <p className="text-base font-light text-[#5F5F5F] flex items-center gap-1.5">
            {t('executiveDashboard.financialHealth', 'Financial Health')}
            <CurrencyIndicator />
          </p>
          <InfoIcon tooltip={t('executiveDashboard.financialHealthTooltip', 'Overview of your cloud spending and savings opportunities. Data is updated daily via AWS Cost Explorer.')} />
        </div>
      </div>

      <div className="p-6 space-y-5">
        {hasNoCostData ? (
          <div className="text-center py-8 space-y-4">
            <div className="p-6 rounded-2xl bg-white border border-gray-200">
              <DollarSign className="h-14 w-14 text-gray-300 mx-auto mb-4" />
              <h3 className="text-sm font-light text-[#393939] mb-2">
                {t('executiveDashboard.noFinancialData', 'No Cost Data Yet')}
              </h3>
              <p className="text-xs font-light text-[#5F5F5F] max-w-xs mx-auto">
                {t('executiveDashboard.noFinancialDataDesc', 'Cost data will appear once your cloud accounts start reporting usage.')}
              </p>
            </div>
          </div>
        ) : (
        <>
        {/* Cost Summary - 2x2 Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-white border border-gray-200">
            <span className="text-sm font-light text-[#5F5F5F]">
              {t('executiveDashboard.mtdCost', 'MTD Cost')}
            </span>
            <div className="text-[#393939] tabular-nums mt-1" style={{ fontSize: '32px', lineHeight: '1', fontWeight: '300' }}>
              {sym}{data.mtdCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {data.credits > 0 && (
              <span className="text-sm font-light text-[#00B2FF] mt-1 block">
                -{sym}{data.credits.toFixed(2)} {t('executiveDashboard.credits', 'credits')}
              </span>
            )}
          </div>
          <div className="p-4 rounded-xl bg-white border border-gray-200">
            <span className="text-sm font-light text-[#5F5F5F]">
              {t('executiveDashboard.ytdCost', 'YTD Cost')}
            </span>
            <div className="text-[#393939] tabular-nums mt-1" style={{ fontSize: '32px', lineHeight: '1', fontWeight: '300' }}>
              {sym}{data.ytdCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>

        {/* Budget Utilization */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-base font-light text-[#5F5F5F]">
              {t('executiveDashboard.budgetUtilization', 'Budget Utilization')}
            </span>
            <span className={cn('font-light tabular-nums', getBudgetColor(data.budgetUtilization))}>
              {data.budgetUtilization.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 bg-[#E5E5E5] rounded-full overflow-hidden">
            <div 
              className={cn('h-full rounded-full transition-all', getBudgetBarColor(data.budgetUtilization))}
              style={{ width: `${Math.min(100, data.budgetUtilization)}%` }}
            />
          </div>
          <div className="flex justify-between text-sm font-light text-[#5F5F5F]">
            <span>{sym}{data.mtdCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
            <span>{sym}{data.budget.toLocaleString('en-US', { maximumFractionDigits: 0 })} {t('executiveDashboard.budget', 'budget')}</span>
          </div>
        </div>

        {/* Top Services */}
        {data.topServices.length > 0 && (
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <span className="text-base font-light text-[#5F5F5F]">
              {t('executiveDashboard.topServices', 'Top Services')}
            </span>
            <div className="space-y-2.5">
              {data.topServices.map((service) => (
                <div key={service.service} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="font-light text-[#5F5F5F] truncate">{service.service}</span>
                    <span className="font-light text-[#393939] tabular-nums">
                      {sym}{service.cost.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="h-2 bg-[#E5E5E5] rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all bg-[#00B2FF]"
                      style={{ width: `${service.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Savings Breakdown */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <span className="text-base font-light text-[#5F5F5F]">
            {t('executiveDashboard.savingsOpportunities', 'Savings Opportunities')}
          </span>
          
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate('/cost-optimization')}
              className="p-3 rounded-xl bg-white border border-gray-200 text-left transition-all duration-200 hover:border-[#00B2FF]/40 hover:shadow-md hover:bg-[#00B2FF]/5 cursor-pointer group"
            >
              <div className="text-xl font-light text-[#393939] tabular-nums group-hover:text-[#00B2FF] transition-colors duration-200">
                {sym}{data.savings.costRecommendations.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <span className="text-xs font-light text-[#5F5F5F] group-hover:text-[#00B2FF]/70 transition-colors duration-200">
                {t('executiveDashboard.costOptimizations', 'Cost Optimizations')}
              </span>
            </button>
            <button
              onClick={() => navigate('/ri-savings-plans')}
              className="p-3 rounded-xl bg-white border border-gray-200 text-left transition-all duration-200 hover:border-[#00B2FF]/40 hover:shadow-md hover:bg-[#00B2FF]/5 cursor-pointer group"
            >
              <div className="text-xl font-light text-[#393939] tabular-nums group-hover:text-[#00B2FF] transition-colors duration-200">
                {sym}{data.savings.riSpRecommendations.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <span className="text-xs font-light text-[#5F5F5F] group-hover:text-[#00B2FF]/70 transition-colors duration-200">
                {t('executiveDashboard.riSavingsPlans', 'RI/Savings Plans')}
              </span>
            </button>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-[#00B2FF]/10 border border-[#00B2FF]/20">
            <span className="text-sm font-light text-[#393939]">
              {t('executiveDashboard.totalPotential', 'Total Potential')}
            </span>
            <div className="text-right">
              <div className="text-[#00B2FF] tabular-nums" style={{ fontSize: '28px', lineHeight: '1', fontWeight: '300' }}>
                {sym}{data.savings.potential.toLocaleString('en-US', { maximumFractionDigits: 0 })}{t('executiveDashboard.perMonth', '/mo')}
              </div>
              <span className="text-sm font-light text-[#5F5F5F] tabular-nums">
                {sym}{(data.savings.potential * 12).toLocaleString('en-US', { maximumFractionDigits: 0 })}{t('executiveDashboard.perYear', '/year')}
              </span>
            </div>
          </div>

          <p className="text-xs font-light text-[#5F5F5F] flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>{t('executiveDashboard.estimatedValuesWarning', 'Estimated values based on current usage patterns')}</span>
          </p>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
