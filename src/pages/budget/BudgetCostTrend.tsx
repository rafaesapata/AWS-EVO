import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, CalendarSearch } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import { useExecutiveTrends } from '@/hooks/useExecutiveTrends';
import { ChartViewSwitcher } from '@/components/ui/chart-view-switcher';
import { MultiViewChart } from '@/components/ui/multi-view-chart';
import { useChartView } from '@/hooks/useChartView';
import { useCurrency } from '@/hooks/useCurrency';

export interface BudgetCostTrendProps {
  currencySymbol?: string;
  budgetAmount?: number;
}

const getCostColor = (cost: number, min: number, max: number): string => {
  if (max === min) return '#00B2FF';
  const n = (cost - min) / (max - min);
  if (n <= 0.25) return '#00B2FF';
  if (n <= 0.5) return '#FBBF24';
  if (n <= 0.75) return '#F97316';
  return '#EF4444';
};

export function BudgetCostTrend({
  currencySymbol = '$',
  budgetAmount,
}: BudgetCostTrendProps) {
  const { t } = useTranslation();
  const { convert } = useCurrency();
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const { view, changeView, availableViews } = useChartView({
    defaultView: 'bar',
    availableViews: ['bar', 'line', 'area', 'pie', 'table'],
    storageKey: 'budget-cost-trend',
  });

  const { data, isFetching } = useExecutiveTrends({ trendPeriod: period });

  const periodLabels = {
    '7d': t('executiveDashboard.period7d', '7 dias'),
    '30d': t('executiveDashboard.period30d', '30 dias'),
    '90d': t('executiveDashboard.period90d', '90 dias'),
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (period === '7d') {
      return date.toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase();
    }
    return date.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' });
  };

  const costData = data?.cost ?? [];

  // Fill missing days with $0 to show the full period
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const filledData = (() => {
    const dataMap = new Map(costData.map((d) => [d.date, d]));
    const result: typeof costData = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      result.push(dataMap.get(key) ?? { date: key, cost: 0, credits: 0, net: 0 });
    }
    return result;
  })();

  const costValues = filledData.map((d) => d.cost).filter((c) => c > 0);
  const minCost = costValues.length > 0 ? Math.min(...costValues) : 0;
  const maxCost = costValues.length > 0 ? Math.max(...costValues) : 0;

  const chartData = filledData.map((item) => ({
    ...item,
    date: formatDate(item.date),
    fill: item.cost === 0 ? '#E5E5E5' : getCostColor(item.cost, minCost, maxCost),
  }));

  // Daily budget line (monthly budget / days in current month)
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyBudget = budgetAmount && budgetAmount > 0 ? budgetAmount / daysInMonth : undefined;

  return (
    <Card className="glass border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              {t('budgetManagement.costTrend', 'Tendência de Custos')}
            </CardTitle>
            <ChartViewSwitcher currentView={view} availableViews={availableViews} onViewChange={changeView} />
          </div>
          <div className="flex items-center gap-1 p-1 border border-border rounded-lg">
            <CalendarSearch className="h-4 w-4 text-muted-foreground mx-1" />
            {(['7d', '30d', '90d'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  'px-3 py-1 text-xs rounded-md transition-all',
                  period === p
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {periodLabels[p]}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isFetching && chartData.length === 0 ? (
          <Skeleton className="h-[250px] w-full" />
        ) : chartData.length > 0 ? (
          <MultiViewChart
            data={chartData}
            series={[{
              dataKey: 'cost',
              name: t('budgetManagement.dailyCost', 'Custo diário'),
              color: '#00B2FF',
              fillFn: (item) => (item.fill as string) || '#00B2FF',
            }]}
            view={view}
            xAxisKey="date"
            height={250}
            currencySymbol={currencySymbol}
            barRadius={[4, 4, 0, 0]}
            referenceLine={dailyBudget ? {
              y: dailyBudget,
              label: `${t('budgetManagement.dailyBudgetLine', 'Orçamento/dia')}: ${currencySymbol}${convert(dailyBudget).toFixed(0)}`,
              color: 'hsl(var(--destructive))',
            } : undefined}
          />
        ) : (
          <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
            {t('budgetManagement.noCostData', 'Sem dados de custo disponíveis')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
