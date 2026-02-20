import { cn } from '@/lib/utils';
import { BarChart3, LineChart, AreaChart, PieChart, Table2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChartViewType } from '@/hooks/useChartView';

interface ChartViewSwitcherProps {
  currentView: ChartViewType;
  availableViews: ChartViewType[];
  onViewChange: (view: ChartViewType) => void;
  className?: string;
}

const VIEW_ICONS: Record<ChartViewType, React.ComponentType<{ className?: string }>> = {
  bar: BarChart3,
  line: LineChart,
  area: AreaChart,
  pie: PieChart,
  table: Table2,
};

const VIEW_KEYS: Record<ChartViewType, string> = {
  bar: 'chartView.bar',
  line: 'chartView.line',
  area: 'chartView.area',
  pie: 'chartView.pie',
  table: 'chartView.table',
};

const VIEW_FALLBACKS: Record<ChartViewType, string> = {
  bar: 'Barras',
  line: 'Linhas',
  area: 'Área',
  pie: 'Pizza',
  table: 'Tabela',
};

export function ChartViewSwitcher({
  currentView,
  availableViews,
  onViewChange,
  className,
}: ChartViewSwitcherProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-border/50 bg-muted/30',
        className
      )}
      role="radiogroup"
      aria-label={t('chartView.switchLabel', 'Tipo de gráfico')}
    >
      {availableViews.map((view) => {
        const Icon = VIEW_ICONS[view];
        const isActive = currentView === view;

        return (
          <button
            key={view}
            role="radio"
            aria-checked={isActive}
            aria-label={t(VIEW_KEYS[view], VIEW_FALLBACKS[view])}
            title={t(VIEW_KEYS[view], VIEW_FALLBACKS[view])}
            onClick={() => onViewChange(view)}
            className={cn(
              'relative p-1.5 rounded-md transition-all duration-300 ease-out',
              'hover:bg-background/80',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
              isActive
                ? 'bg-background text-primary shadow-sm scale-105'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {isActive && (
              <span
                className="absolute inset-0 rounded-md ring-1 ring-primary/20 animate-in fade-in duration-300"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
