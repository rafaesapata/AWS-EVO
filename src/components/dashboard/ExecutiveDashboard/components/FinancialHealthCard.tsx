/**
 * Financial Health Card - Cost metrics and savings
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { DollarSign, TrendingUp, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { FinancialHealth } from '../types';

interface Props {
  data: FinancialHealth;
}

export default function FinancialHealthCard({ data }: Props) {
  const { t } = useTranslation();

  const getBudgetColor = (utilization: number) => {
    if (utilization >= 90) return 'text-red-500';
    if (utilization >= 75) return 'text-yellow-500';
    return 'text-green-500';
  };

  return (
    <Card className="h-full card-hover-lift card-shine">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary icon-bounce" />
          <CardTitle className="text-base">{t('executiveDashboard.financialHealth', 'Financial Health')}</CardTitle>
        </div>
        <CardDescription className="text-xs">
          {t('executiveDashboard.financialHealthDesc', 'Cost overview and savings opportunities')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cost Summary */}
        <div className="grid grid-cols-2 gap-3 animate-stagger">
          <div className="space-y-0.5">
            <span className="text-xs text-muted-foreground">
              {t('executiveDashboard.mtdCost', 'MTD Cost')}
            </span>
            <div className="text-lg font-bold tabular-nums">
              ${data.mtdCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {data.credits > 0 && (
              <span className="text-[10px] text-green-500">
                -${data.credits.toFixed(2)} credits
              </span>
            )}
          </div>
          <div className="space-y-0.5">
            <span className="text-xs text-muted-foreground">
              {t('executiveDashboard.ytdCost', 'YTD Cost')}
            </span>
            <div className="text-lg font-bold tabular-nums">
              ${data.ytdCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>

        {/* Budget Utilization */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">
              {t('executiveDashboard.budgetUtilization', 'Budget Utilization')}
            </span>
            <span className={cn('font-medium tabular-nums', getBudgetColor(data.budgetUtilization))}>
              {data.budgetUtilization.toFixed(1)}%
            </span>
          </div>
          <Progress 
            value={Math.min(100, data.budgetUtilization)} 
            className="h-1.5 progress-shimmer"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>${data.mtdCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
            <span>${data.budget.toLocaleString('en-US', { maximumFractionDigits: 0 })} budget</span>
          </div>
        </div>

        {/* Top Services */}
        {data.topServices.length > 0 && (
          <div className="space-y-3">
            <span className="text-sm font-medium">
              {t('executiveDashboard.topServices', 'Top Services')}
            </span>
            <div className="space-y-2 animate-stagger">
              {data.topServices.map((service) => (
                <div key={service.service} className="flex items-center gap-2 transition-transform hover:translate-x-1">
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="truncate">{service.service}</span>
                      <span className="font-medium tabular-nums">
                        ${service.cost.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <Progress value={service.percentage} className="h-1.5 progress-shimmer" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Savings Breakdown */}
        <div className="border-t pt-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-green-500 icon-bounce" />
            <span className="text-xs font-medium">
              {t('executiveDashboard.savingsOpportunities', 'Savings Opportunities')}
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-2 animate-stagger">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 transition-all hover:scale-[1.02] hover:shadow-md">
              <div className="text-base font-bold text-blue-500 tabular-nums">
                ${data.savings.costRecommendations.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {t('executiveDashboard.costOptimizations', 'Cost Optimizations')}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 transition-all hover:scale-[1.02] hover:shadow-md glow-success">
              <div className="text-base font-bold text-green-500 tabular-nums">
                ${data.savings.riSpRecommendations.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {t('executiveDashboard.riSavingsPlans', 'RI/Savings Plans')}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg bg-green-500/5 border border-green-500/20 glow-success transition-all hover:scale-[1.01]">
            <span className="text-xs font-medium">
              {t('executiveDashboard.totalPotential', 'Total Potential')}
            </span>
            <div className="text-right">
              <div className="text-base font-bold text-green-500 tabular-nums">
                ${data.savings.potential.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                ${(data.savings.potential * 12).toLocaleString('en-US', { maximumFractionDigits: 0 })}/year
              </span>
            </div>
          </div>

          <p className="text-[10px] text-amber-600 flex items-start gap-1 alert-pulse">
            <AlertTriangle className="h-2.5 w-2.5 mt-0.5 flex-shrink-0" />
            <span>{t('executiveDashboard.estimatedValuesWarning', 'Estimated values based on current usage patterns')}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
