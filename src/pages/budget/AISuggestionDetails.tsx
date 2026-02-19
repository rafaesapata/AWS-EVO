import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Brain, TrendingDown, Recycle, Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { AISuggestionResponse } from './AISuggestionButton';

export interface AISuggestionDetailsProps {
  suggestion: AISuggestionResponse | null;
  currencySymbol?: string;
}

export function AISuggestionDetails({
  suggestion,
  currencySymbol = '$',
}: AISuggestionDetailsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!suggestion || !suggestion.data_available) return null;

  const fmt = (v: number) =>
    `${currencySymbol}${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <Card className="glass border-primary/20">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            className="flex items-center justify-between w-full px-6 py-4 text-left hover:bg-muted/30 transition-colors rounded-t-lg"
            aria-expanded={open}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <Brain className="h-4 w-4 text-primary" />
              {t('budgetManagement.aiDetailsTitle', 'Detalhes da Sugestão IA')}
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform duration-200',
                open && 'rotate-180',
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 space-y-4">
            {/* Previous month spend */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t('budgetManagement.aiPrevSpend', 'Gasto mês anterior')}
              </span>
              <span className="font-medium tabular-nums">
                {fmt(suggestion.previous_month_spend)}
              </span>
            </div>

            {/* Total proposed savings */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t('budgetManagement.aiTotalSavings', 'Savings propostos')}
              </span>
              <span className="font-medium tabular-nums text-green-600">
                -{fmt(suggestion.total_proposed_savings)}
              </span>
            </div>

            {/* Savings breakdown */}
            <div className="pl-4 space-y-2 border-l-2 border-primary/10">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <TrendingDown className="h-3 w-3" />
                  {t('budgetManagement.aiCostOpt', 'Cost Optimization')}
                </span>
                <span className="tabular-nums">
                  {fmt(suggestion.savings_breakdown.cost_optimization)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Recycle className="h-3 w-3" />
                  {t('budgetManagement.aiWaste', 'Waste Detection')}
                </span>
                <span className="tabular-nums">
                  {fmt(suggestion.savings_breakdown.waste_detection)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Server className="h-3 w-3" />
                  {t('budgetManagement.aiRiSp', 'RI/SP Optimization')}
                </span>
                <span className="tabular-nums">
                  {fmt(suggestion.savings_breakdown.ri_sp_optimization)}
                </span>
              </div>
            </div>

            {/* Realization factor */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t('budgetManagement.aiRealizationFactor', 'Fator de realização')}
              </span>
              <span className="font-medium tabular-nums">
                {pct(suggestion.realization_factor)}
              </span>
            </div>

            {/* Formula */}
            <div className="rounded-md bg-muted/50 px-3 py-2">
              <p className="text-xs text-muted-foreground mb-1">
                {t('budgetManagement.aiFormula', 'Fórmula')}
              </p>
              <p className="text-sm font-mono tabular-nums">{suggestion.calculation}</p>
            </div>

            {/* Suggested amount */}
            <div className="flex items-center justify-between text-sm pt-2 border-t border-primary/10">
              <span className="font-medium">
                {t('budgetManagement.aiSuggestedAmount', 'Valor sugerido')}
              </span>
              <span className="font-semibold text-primary tabular-nums text-base">
                {fmt(suggestion.suggested_amount)}
              </span>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
