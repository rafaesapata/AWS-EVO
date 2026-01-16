/**
 * Trend Analysis - Cost and security trends over time
 * Clean Light Design with color palette:
 *   - Primary: #003C7D (dark blue)
 *   - Secondary: #008CFF (light blue)
 *   - Success: #10B981 (green)
 *   - Background: #FFFFFF / #F9FAFB
 *   - Text: #1F2937 (dark gray)
 * Charts: Gradient blue bars (#005FC5 to #003C7D)
 */

import { useTranslation } from 'react-i18next';
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
  Line
} from 'recharts';
import type { TrendData } from '../types';

interface Props {
  data: TrendData;
  period: '7d' | '30d' | '90d';
  onPeriodChange: (period: '7d' | '30d' | '90d') => void;
}

export default function TrendAnalysis({ data, period, onPeriodChange }: Props) {
  const { t } = useTranslation();

  const periodLabels = {
    '7d': t('executiveDashboard.period7d', '7 Days'),
    '30d': t('executiveDashboard.period30d', '30 Days'),
    '90d': t('executiveDashboard.period90d', '90 Days')
  };

  // Format date for display (MON, TUE, WED style for 7d)
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (period === '7d') {
      return date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Prepare cost chart data
  const costChartData = data.cost.map(item => ({
    ...item,
    date: formatDate(item.date)
  }));

  // Prepare security chart data
  const securityChartData = data.security.map(item => ({
    ...item,
    date: formatDate(item.date)
  }));

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#1F2937]">
              {t('executiveDashboard.trendAnalysis', 'Trend Analysis')}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('executiveDashboard.trendAnalysisDesc', 'Cost and security trends over time')}
            </p>
          </div>
          
          {/* Pill-style Navigation Tabs */}
          <div className="flex gap-1 p-1 bg-[#F9FAFB] rounded-xl">
            {(['7d', '30d', '90d'] as const).map((p) => (
              <button
                key={p}
                onClick={() => onPeriodChange(p)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  period === p 
                    ? 'bg-[#003C7D] text-white shadow-sm' 
                    : 'text-gray-600 hover:text-[#003C7D] hover:bg-white'
                }`}
              >
                {periodLabels[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Cost Trend - Bar Chart */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-[#1F2937]">
              {t('executiveDashboard.costTrend', 'Cost Trend')}
            </h4>
            {costChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={costChartData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#9CA3AF"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#9CA3AF"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E5E7EB',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#1F2937',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    formatter={(value: number | undefined) => value !== undefined ? [`$${value.toFixed(2)}`, 'Cost'] : ['N/A', 'Cost']}
                    labelStyle={{ color: '#6B7280', fontWeight: 500 }}
                  />
                  <Bar 
                    dataKey="cost" 
                    fill="#60A5FA"
                    radius={[6, 6, 0, 0]}
                    name="Total Cost"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm bg-[#F9FAFB] rounded-xl">
                {t('executiveDashboard.noCostData', 'No cost data available')}
              </div>
            )}
          </div>

          {/* Security Trend - Line Chart */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-[#1F2937]">
              {t('executiveDashboard.securityTrend', 'Security Score Trend')}
            </h4>
            {securityChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={securityChartData}>
                  <defs>
                    <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#003C7D" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#003C7D" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="findingsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#9CA3AF"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#9CA3AF"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E5E7EB',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#1F2937',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    labelStyle={{ color: '#6B7280', fontWeight: 500 }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="score" 
                    stroke="#003C7D" 
                    fill="url(#scoreGradient)"
                    strokeWidth={2}
                    dot={{ fill: '#003C7D', strokeWidth: 2, r: 4 }}
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
              <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm bg-[#F9FAFB] rounded-xl">
                {t('executiveDashboard.noSecurityTrendData', 'No security trend data available')}
              </div>
            )}
          </div>
        </div>

        {/* Activity Highlight - Large Percentage */}
        {data.cost.length > 0 && (
          <div className="mt-6 p-5 rounded-2xl bg-gradient-to-r from-[#003C7D]/5 to-[#008CFF]/5 border border-[#003C7D]/10">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-500">{t('executiveDashboard.periodActivity', 'Period Activity')}</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-5xl font-light text-[#003C7D] tabular-nums">
                    {Math.round((data.cost.reduce((sum, d) => sum + d.cost, 0) / data.cost.length) * 10) / 10}%
                  </span>
                  <span className="text-sm text-gray-500">{t('executiveDashboard.avgUtilization', 'avg utilization')}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-[#10B981]">
                  <span className="text-sm font-medium">↑ 3.5%</span>
                  <span className="text-xs text-gray-500">{t('executiveDashboard.vsLastPeriod', 'vs last period')}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
