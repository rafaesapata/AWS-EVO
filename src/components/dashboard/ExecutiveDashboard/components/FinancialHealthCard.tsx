/**
 * Financial Health Card - Cost metrics and savings
 * Clean Light Design with color palette:
 *   - Primary: #003C7D (dark blue)
 *   - Secondary: #008CFF (light blue)
 *   - Success: #10B981 (green)
 *   - Background: #FFFFFF / #F9FAFB
 *   - Text: #1F2937 (dark gray)
 */

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { FinancialHealth } from '../types';

interface Props {
  data: FinancialHealth;
}

export default function FinancialHealthCard({ data }: Props) {
  const { t } = useTranslation();

  const getBudgetColor = (utilization: number) => {
    if (utilization >= 90) return 'text-red-600';
    if (utilization >= 75) return 'text-amber-600';
    return 'text-[#1F2937]';
  };

  const getBudgetBarColor = (utilization: number) => {
    if (utilization >= 90) return 'bg-red-500';
    if (utilization >= 75) return 'bg-amber-500';
    return 'bg-[#003C7D]';
  };

  return (
    <div className="h-full bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-xl font-light text-[#1F2937]">
          {t('executiveDashboard.financialHealth', 'Financial Health')}
        </h3>
        <p className="text-sm font-light text-gray-500 mt-0.5">
          {t('executiveDashboard.financialHealthDesc', 'Cost overview and savings opportunities')}
        </p>
      </div>

      <div className="p-6 space-y-5">
        {/* Cost Summary - 2x2 Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-[#F9FAFB] border border-gray-100">
            <span className="text-sm font-light text-gray-500">
              {t('executiveDashboard.mtdCost', 'MTD Cost')}
            </span>
            <div className="text-3xl font-light text-[#1F2937] tabular-nums mt-1">
              ${data.mtdCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {data.credits > 0 && (
              <span className="text-xs text-[#10B981] font-medium mt-1 block">
                -${data.credits.toFixed(2)} {t('executiveDashboard.credits', 'credits')}
              </span>
            )}
          </div>
          <div className="p-4 rounded-xl bg-[#F9FAFB] border border-gray-100">
            <span className="text-sm font-light text-gray-500">
              {t('executiveDashboard.ytdCost', 'YTD Cost')}
            </span>
            <div className="text-3xl font-light text-[#1F2937] tabular-nums mt-1">
              ${data.ytdCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>

        {/* Budget Utilization */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-base font-medium text-[#1F2937]">
              {t('executiveDashboard.budgetUtilization', 'Budget Utilization')}
            </span>
            <span className={cn('font-semibold tabular-nums', getBudgetColor(data.budgetUtilization))}>
              {data.budgetUtilization.toFixed(1)}%
            </span>
          </div>
          <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={cn('h-full rounded-full transition-all', getBudgetBarColor(data.budgetUtilization))}
              style={{ width: `${Math.min(100, data.budgetUtilization)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>${data.mtdCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
            <span>${data.budget.toLocaleString('en-US', { maximumFractionDigits: 0 })} {t('executiveDashboard.budget', 'budget')}</span>
          </div>
        </div>

        {/* Top Services */}
        {data.topServices.length > 0 && (
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <span className="text-base font-medium text-[#1F2937]">
              {t('executiveDashboard.topServices', 'Top Services')}
            </span>
            <div className="space-y-2.5">
              {data.topServices.map((service) => (
                <div key={service.service} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 truncate">{service.service}</span>
                    <span className="font-medium text-[#1F2937] tabular-nums">
                      ${service.cost.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all bg-[#60A5FA]"
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
          <span className="text-base font-medium text-[#1F2937]">
            {t('executiveDashboard.savingsOpportunities', 'Savings Opportunities')}
          </span>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-[#F9FAFB] border border-gray-100">
              <div className="text-xl font-light text-[#1F2937] tabular-nums">
                ${data.savings.costRecommendations.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <span className="text-xs text-gray-500">
                {t('executiveDashboard.costOptimizations', 'Cost Optimizations')}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-[#F9FAFB] border border-gray-100">
              <div className="text-xl font-light text-[#1F2937] tabular-nums">
                ${data.savings.riSpRecommendations.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <span className="text-xs text-gray-500">
                {t('executiveDashboard.riSavingsPlans', 'RI/Savings Plans')}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-[#10B981]/10 border border-[#10B981]/20">
            <span className="text-sm font-medium text-[#1F2937]">
              {t('executiveDashboard.totalPotential', 'Total Potential')}
            </span>
            <div className="text-right">
              <div className="text-2xl font-light text-[#10B981] tabular-nums">
                ${data.savings.potential.toLocaleString('en-US', { maximumFractionDigits: 0 })}{t('executiveDashboard.perMonth', '/mo')}
              </div>
              <span className="text-xs text-gray-500 tabular-nums">
                ${(data.savings.potential * 12).toLocaleString('en-US', { maximumFractionDigits: 0 })}{t('executiveDashboard.perYear', '/year')}
              </span>
            </div>
          </div>

          <p className="text-xs text-gray-400 flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>{t('executiveDashboard.estimatedValuesWarning', 'Estimated values based on current usage patterns')}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
