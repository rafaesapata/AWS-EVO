import { Progress } from '@/components/ui/progress';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface BudgetProgressBarProps {
  utilizationPercentage: number;
}

function getBarColor(pct: number): string {
  if (pct > 100) return 'bg-red-500';
  if (pct >= 80) return 'bg-amber-500';
  return 'bg-green-500';
}

function getLabelColor(pct: number): string {
  if (pct > 100) return 'text-red-500';
  if (pct >= 80) return 'text-amber-500';
  return 'text-green-600';
}

export function BudgetProgressBar({ utilizationPercentage }: BudgetProgressBarProps) {
  const { t } = useTranslation();
  const capped = Math.min(100, utilizationPercentage);
  const rounded = Math.round(utilizationPercentage);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {t('budgetManagement.budgetUsage', 'Uso do orçamento')}
        </span>
        <span className={cn('font-semibold tabular-nums', getLabelColor(utilizationPercentage))}>
          {rounded}%
        </span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn('h-full rounded-full transition-all duration-700', getBarColor(utilizationPercentage))}
          style={{ width: `${capped}%` }}
          role="progressbar"
          aria-valuenow={rounded}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('budgetManagement.budgetUsage', 'Uso do orçamento')}
        />
      </div>
      {utilizationPercentage > 100 && (
        <p className="text-xs text-red-500 font-medium">
          {t('budgetManagement.overBudgetWarning', 'Acima do orçamento!')}
        </p>
      )}
    </div>
  );
}
