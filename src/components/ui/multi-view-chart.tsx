/**
 * MultiViewChart - Renders data in different chart types with smooth transitions.
 * Supports: bar, line, area, pie, table views.
 * Uses recharts for chart rendering and shadcn Table for table view.
 */

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ChartViewType } from '@/hooks/useChartView';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface ChartDataItem {
  [key: string]: string | number | null | undefined;
}

export interface ChartSeries {
  dataKey: string;
  name?: string;
  color?: string;
  stackId?: string;
  strokeDasharray?: string;
  /** Per-item fill function for dynamic bar colors */
  fillFn?: (item: ChartDataItem, index: number) => string;
}

export interface MultiViewChartProps {
  data: ChartDataItem[];
  series: ChartSeries[];
  view: ChartViewType;
  xAxisKey?: string;
  height?: number;
  currencySymbol?: string;
  formatValue?: (value: number) => string;
  formatTooltip?: (value: number, name: string) => [string, string];
  tooltipStyle?: React.CSSProperties;
  referenceLine?: { y: number; label: string; color?: string };
  gradients?: Record<string, { from: string; to: string; fromOpacity?: number; toOpacity?: number }>;
  /** Pie chart config */
  pieInnerRadius?: number;
  pieOuterRadius?: number;
  piePaddingAngle?: number;
  /** Custom bar radius */
  barRadius?: [number, number, number, number];
  barCategoryGap?: string;
  className?: string;
  /** Table columns override (defaults to xAxisKey + series dataKeys) */
  tableColumns?: { key: string; label: string; align?: 'left' | 'right' | 'center'; format?: (v: any) => string }[];
  /** Y-axis domain */
  yDomain?: [number | 'auto', number | 'auto'];
}

const FALLBACK_COLORS = [
  '#00B2FF', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#64748b',
];

export function MultiViewChart({
  data,
  series,
  view,
  xAxisKey = 'date',
  height = 250,
  currencySymbol = '$',
  formatValue,
  formatTooltip,
  tooltipStyle,
  referenceLine,
  gradients,
  pieInnerRadius = 50,
  pieOuterRadius = 90,
  piePaddingAngle = 3,
  barRadius = [4, 4, 0, 0],
  barCategoryGap = '20%',
  className,
  tableColumns,
  yDomain,
}: MultiViewChartProps) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Reset animation on view change
  const [animKey, setAnimKey] = useState(0);
  useEffect(() => {
    setMounted(false);
    const raf = requestAnimationFrame(() => {
      setAnimKey((k) => k + 1);
      setMounted(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [view]);

  const defaultFormat = (v: number) =>
    formatValue ? formatValue(v) : `${currencySymbol}${v.toFixed(2)}`;

  const defaultTooltipFormat = (value: number, name: string): [string, string] =>
    formatTooltip ? formatTooltip(value, name) : [defaultFormat(value), name];

  const defaultTooltipStyle: React.CSSProperties = tooltipStyle ?? {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    fontSize: '12px',
  };

  const getColor = (s: ChartSeries, idx: number) =>
    s.color || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];

  // Pie data: aggregate series values
  const pieData = useMemo(() => {
    if (view !== 'pie') return [];
    return series.map((s, idx) => {
      const total = data.reduce((sum, item) => {
        const v = item[s.dataKey];
        return sum + (typeof v === 'number' ? v : 0);
      }, 0);
      return {
        name: s.name || s.dataKey,
        value: total,
        color: getColor(s, idx),
      };
    });
  }, [data, series, view]);

  const axisProps = {
    stroke: 'hsl(var(--muted-foreground))',
    fontSize: 11,
    tickLine: false,
    axisLine: false,
  };

  const renderGradients = () => {
    if (!gradients) return null;
    return (
      <defs>
        {Object.entries(gradients).map(([id, g]) => (
          <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={g.from} stopOpacity={g.fromOpacity ?? 0.2} />
            <stop offset="95%" stopColor={g.to} stopOpacity={g.toOpacity ?? 0} />
          </linearGradient>
        ))}
      </defs>
    );
  };

  const renderRefLine = () => {
    if (!referenceLine) return null;
    return (
      <ReferenceLine
        y={referenceLine.y}
        stroke={referenceLine.color || 'hsl(var(--destructive))'}
        strokeDasharray="5 5"
        strokeWidth={1.5}
        label={{
          value: referenceLine.label,
          position: 'insideTopRight',
          fontSize: 10,
          fill: referenceLine.color || 'hsl(var(--destructive))',
        }}
      />
    );
  };

  if (!data || data.length === 0) {
    return (
      <div
        className={cn('flex items-center justify-center text-muted-foreground text-sm', className)}
        style={{ height }}
      >
        {t('chartView.noData', 'Sem dados disponíveis')}
      </div>
    );
  }

  const wrapperClass = cn(
    'transition-opacity duration-500 ease-out',
    mounted ? 'opacity-100' : 'opacity-0',
    className
  );

  // TABLE VIEW
  if (view === 'table') {
    const cols = tableColumns || [
      { key: xAxisKey, label: t('chartView.date', 'Data'), align: 'left' as const },
      ...series.map((s) => ({
        key: s.dataKey,
        label: s.name || s.dataKey,
        align: 'right' as const,
        format: (v: any) => (typeof v === 'number' ? defaultFormat(v) : String(v ?? '-')),
      })),
    ];

    return (
      <div className={cn(wrapperClass, 'overflow-auto')} style={{ maxHeight: height + 100 }}>
        <Table>
          <TableHeader>
            <TableRow>
              {cols.map((col) => (
                <TableHead key={col.key} className={col.align === 'right' ? 'text-right' : ''}>
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item, idx) => (
              <TableRow key={idx}>
                {cols.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(
                      col.align === 'right' && 'text-right font-mono',
                      col.align === 'center' && 'text-center'
                    )}
                  >
                    {col.format ? col.format(item[col.key]) : String(item[col.key] ?? '-')}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  // PIE VIEW
  if (view === 'pie') {
    return (
      <div className={wrapperClass} key={animKey}>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={pieInnerRadius}
              outerRadius={pieOuterRadius}
              paddingAngle={piePaddingAngle}
              dataKey="value"
              animationBegin={0}
              animationDuration={800}
              animationEasing="ease-out"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={defaultTooltipStyle}
              formatter={(value: number) => [defaultFormat(value), '']}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // BAR VIEW
  if (view === 'bar') {
    return (
      <div className={wrapperClass} key={animKey}>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} barCategoryGap={barCategoryGap}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey={xAxisKey} {...axisProps} />
            <YAxis {...axisProps} tickFormatter={(v) => defaultFormat(v)} domain={yDomain} />
            <Tooltip contentStyle={defaultTooltipStyle} formatter={defaultTooltipFormat} />
            <Legend />
            {renderRefLine()}
            {series.map((s, idx) =>
              s.fillFn ? (
                <Bar
                  key={s.dataKey}
                  dataKey={s.dataKey}
                  name={s.name || s.dataKey}
                  stackId={s.stackId}
                  radius={barRadius}
                  animationBegin={0}
                  animationDuration={800}
                  animationEasing="ease-out"
                >
                  {data.map((item, i) => (
                    <Cell key={`cell-${i}`} fill={s.fillFn!(item, i)} />
                  ))}
                </Bar>
              ) : (
                <Bar
                  key={s.dataKey}
                  dataKey={s.dataKey}
                  name={s.name || s.dataKey}
                  fill={getColor(s, idx)}
                  stackId={s.stackId}
                  radius={barRadius}
                  animationBegin={0}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              )
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // LINE VIEW
  if (view === 'line') {
    return (
      <div className={wrapperClass} key={animKey}>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey={xAxisKey} {...axisProps} />
            <YAxis {...axisProps} tickFormatter={(v) => defaultFormat(v)} domain={yDomain} />
            <Tooltip contentStyle={defaultTooltipStyle} formatter={defaultTooltipFormat} />
            <Legend />
            {renderRefLine()}
            {series.map((s, idx) => (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.name || s.dataKey}
                stroke={getColor(s, idx)}
                strokeWidth={2}
                strokeDasharray={s.strokeDasharray}
                dot={{ fill: getColor(s, idx), strokeWidth: 2, r: 3 }}
                animationBegin={0}
                animationDuration={800}
                animationEasing="ease-out"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // AREA VIEW (default)
  return (
    <div className={wrapperClass} key={animKey}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data}>
          {renderGradients()}
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey={xAxisKey} {...axisProps} />
          <YAxis {...axisProps} tickFormatter={(v) => defaultFormat(v)} domain={yDomain} />
          <Tooltip contentStyle={defaultTooltipStyle} formatter={defaultTooltipFormat} />
          <Legend />
          {renderRefLine()}
          {series.map((s, idx) => {
            const color = getColor(s, idx);
            const gradientId = gradients && Object.keys(gradients).find((k) => gradients[k].from === color);
            return (
              <Area
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.name || s.dataKey}
                stroke={color}
                fill={gradientId ? `url(#${gradientId})` : color}
                fillOpacity={gradientId ? 1 : 0.1}
                strokeWidth={2}
                stackId={s.stackId}
                dot={{ fill: color, strokeWidth: 2, r: 3 }}
                animationBegin={0}
                animationDuration={800}
                animationEasing="ease-out"
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
