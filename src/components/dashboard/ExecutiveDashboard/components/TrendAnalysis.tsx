/**
 * Trend Analysis - Cost and security trends over time
 * Design aligned with Executive Summary Bar:
 *   - Primary: #00B2FF (light blue)
 *   - Text: #393939 (dark gray)
 *   - Labels: #5F5F5F (medium gray)
 *   - Background: #FFFFFF
 *   - Border: border-gray-200
 * Charts: Dynamic color bars based on cost value (blue → yellow → orange → red)
 */

import { useTranslation } from 'react-i18next';
import { CalendarSearch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Line,
  Cell
} from 'recharts';
import type { TrendData } from '../types';
import { useCloudAccount } from '@/contexts/CloudAccountContext';
import { getCurrencySymbol, getProviderCurrency } from '@/lib/format-cost';
import { CurrencyIndicator } from '@/components/ui/currency-indicator';

interface Props {
  data: TrendData;
  period: '7d' | '30d' | '90d';
  onPeriodChange: (period: '7d' | '30d' | '90d') => void;
  isLoading?: boolean;
}

// Get color based on cost value relative to min/max
const getCostColor = (cost: number, minCost: number, maxCost: number): string => {
  if (maxCost === minCost) return '#00B2FF'; // Blue if all values are the same
  
  const range = maxCost - minCost;
  const normalizedValue = (cost - minCost) / range;
  
  // Blue (low) → Yellow → Orange → Red (high)
  if (normalizedValue <= 0.25) {
    return '#00B2FF'; // Blue
  } else if (normalizedValue <= 0.5) {
    return '#FBBF24'; // Yellow
  } else if (normalizedValue <= 0.75) {
    return '#F97316'; // Orange
  } else {
    return '#EF4444'; // Red
  }
};

export default function TrendAnalysis({ data, period, onPeriodChange, isLoading }: Props) {
  const { t } = useTranslation();
  const { selectedProvider } = useCloudAccount();
  const sym = getCurrencySymbol(getProviderCurrency(selectedProvider));

  const periodLabels = {
    '7d': t('executiveDashboard.period7d', '7 dias'),
    '30d': t('executiveDashboard.period30d', '30 dias'),
    '90d': t('executiveDashboard.period90d', '90 dias')
  };

  // Format date for display (MON, TUE, WED style for 7d)
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (period === '7d') {
      return date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Prepare cost chart data with colors
  const costValues = data.cost.map(item => item.cost);
  const minCost = Math.min(...costValues);
  const maxCost = Math.max(...costValues);
  
  const costChartData = data.cost.map(item => ({
    ...item,
    date: formatDate(item.date),
    fill: getCostColor(item.cost, minCost, maxCost)
  }));

  // Prepare security chart data
  const securityChartData = data.security.map(item => ({
    ...item,
    date: formatDate(item.date)
  }));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <p className="text-base font-light text-[#5F5F5F]">
            {t('executiveDashboard.trendAnalysis', 'Trend Analysis')}
          </p>
          
          {/* Pill-style Navigation Tabs */}
          <div className="flex items-center gap-1 p-1 bg-white border border-gray-200 rounded-xl">
            {/* Calendar Icon */}
            <div className="px-3 py-2">
              <CalendarSearch className="h-5 w-5 text-[#5F5F5F]" />
            </div>
            {(['7d', '30d', '90d'] as const).map((p) => (
              <button
                key={p}
                onClick={() => onPeriodChange(p)}
                className={`px-4 py-2 text-sm font-light rounded-lg transition-all ${
                  period === p 
                    ? 'bg-white text-[#00B2FF] border-2 border-[#00B2FF] shadow-sm' 
                    : 'text-[#5F5F5F] hover:text-[#00B2FF] hover:bg-white border-2 border-transparent'
                }`}
              >
                {periodLabels[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`p-6 transition-opacity duration-300 ${isLoading ? 'opacity-50' : 'opacity-100'}`}>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Cost Trend - Bar Chart with dynamic colors */}
          <div className="space-y-4">
            <p className="text-base font-light text-[#5F5F5F] flex items-center gap-1.5">
              {t('executiveDashboard.costTrend', 'Cost Trend')}
              <CurrencyIndicator />
            </p>
            {costChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={costChartData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#5F5F5F"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#5F5F5F"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${sym}${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E5E5E5',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#393939',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    formatter={(value: number | undefined) => value !== undefined ? [`${sym}${value.toFixed(2)}`, 'Cost'] : ['N/A', 'Cost']}
                    labelStyle={{ color: '#5F5F5F', fontWeight: 300 }}
                  />
                  <Bar 
                    dataKey="cost" 
                    radius={[6, 6, 0, 0]}
                    name="Total Cost"
                  >
                    {costChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-[#5F5F5F] text-sm font-light bg-white border border-gray-200 rounded-xl">
                {t('executiveDashboard.noCostData', 'No cost data available')}
              </div>
            )}
          </div>

          {/* Security Trend - Line Chart */}
          <div className="space-y-4">
            <p className="text-base font-light text-[#5F5F5F]">
              {t('executiveDashboard.securityTrend', 'Security Score Trend')}
            </p>
            {securityChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={securityChartData}>
                  <defs>
                    <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00B2FF" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#00B2FF" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="findingsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#5F5F5F"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#5F5F5F"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E5E5E5',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#393939',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    labelStyle={{ color: '#5F5F5F', fontWeight: 300 }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="score" 
                    stroke="#00B2FF" 
                    fill="url(#scoreGradient)"
                    strokeWidth={2}
                    dot={{ fill: '#00B2FF', strokeWidth: 2, r: 4 }}
                    name="Security Score"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="findings" 
                    stroke="#EF4444" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: '#EF4444', strokeWidth: 2, r: 3 }}
                    name="Critical+High Findings"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-[#5F5F5F] text-sm font-light bg-white border border-gray-200 rounded-xl">
                {t('executiveDashboard.noSecurityTrendData', 'No security trend data available')}
              </div>
            )}
          </div>
        </div>

        {/* Activity Highlight - Large Percentage */}
        {data.cost.length > 1 && (
          <div className="mt-6 p-5 rounded-2xl bg-[#00B2FF]/5 border border-[#00B2FF]/20">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-light text-[#5F5F5F]">{t('executiveDashboard.periodActivity', 'Period Activity')}</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-[#00B2FF] tabular-nums" style={{ fontSize: '48px', lineHeight: '1', fontWeight: '300' }}>
                    {sym}{Math.round(data.cost.reduce((sum, d) => sum + d.cost, 0)).toLocaleString('en-US')}
                  </span>
                  <span className="text-sm font-light text-[#5F5F5F]">{t('executiveDashboard.totalPeriodCost', 'total in period')}</span>
                </div>
              </div>
              {data.cost.length >= 2 && (() => {
                const midpoint = Math.floor(data.cost.length / 2);
                const firstHalf = data.cost.slice(0, midpoint).reduce((s, d) => s + d.cost, 0);
                const secondHalf = data.cost.slice(midpoint).reduce((s, d) => s + d.cost, 0);
                const change = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;
                return change !== 0 ? (
                  <div className="text-right">
                    <div className={cn('flex items-center gap-1', change > 0 ? 'text-red-500' : 'text-[#00B2FF]')}>
                      <span className="text-sm font-light">{change > 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%</span>
                      <span className="text-xs font-light text-[#5F5F5F]">{t('executiveDashboard.vsLastPeriod', 'vs last period')}</span>
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
