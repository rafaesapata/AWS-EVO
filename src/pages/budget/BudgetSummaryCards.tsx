import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Percent } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface BudgetSummaryCardsProps {
  budgetAmount: number;
  mtdSpend: number;
  utilizationPercentage: number;
  currencySymbol?: string;
  loading?: boolean;
}

function getUtilizationColor(pct: number): string {
  if (pct > 100) return 'text-red-500';
  if (pct >= 80) return 'text-amber-500';
  return 'text-green-600';
}

export function BudgetSummaryCards({
  budgetAmount,
  mtdSpend,
  utilizationPercentage,
  currencySymbol = '$',
  loading = false,
}: BudgetSummaryCardsProps) {
  const { t } = useTranslation();
  const isOverBudget = utilizationPercentage > 100;

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {/* Orçamento Atual */}
      <Card className="glass border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            {t('budgetManagement.currentBudget', 'Orçamento Atual')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <div className="text-2xl font-semibold tabular-nums">
              {currencySymbol}
              {budgetAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gasto MTD */}
      <Card className="glass border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            {t('budgetManagement.mtdSpend', 'Gasto MTD')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <div className="space-y-1">
              <div className="text-2xl font-semibold tabular-nums">
                {currencySymbol}
                {mtdSpend.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <div className="flex items-center gap-1 text-xs">
                {isOverBudget ? (
                  <TrendingUp className="h-3 w-3 text-red-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-green-500" />
                )}
                <span className={getUtilizationColor(utilizationPercentage)}>
                  {Math.round(utilizationPercentage)}% {t('budgetManagement.ofBudget', 'do orçamento')}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Utilização % */}
      <Card className="glass border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Percent className="h-4 w-4" />
            {t('budgetManagement.utilization', 'Utilização')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <div className={cn('text-2xl font-semibold tabular-nums', getUtilizationColor(utilizationPercentage))}>
              {Math.round(utilizationPercentage)}%
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
