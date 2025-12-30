/**
 * Trend Analysis - Cost and security trends over time
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
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
    '7d': '7 Days',
    '30d': '30 Days',
    '90d': '90 Days'
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <CardTitle>{t('executiveDashboard.trendAnalysis', 'Trend Analysis')}</CardTitle>
          </div>
          <div className="flex gap-1">
            {(['7d', '30d', '90d'] as const).map((p) => (
              <Button
                key={p}
                variant={period === p ? 'default' : 'outline'}
                size="sm"
                onClick={() => onPeriodChange(p)}
              >
                {periodLabels[p]}
              </Button>
            ))}
          </div>
        </div>
        <CardDescription>
          {t('executiveDashboard.trendAnalysisDesc', 'Cost and security trends over time')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Cost Trend */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">
              {t('executiveDashboard.costTrend', 'Cost Trend')}
            </h4>
            {costChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={costChartData}>
                  <defs>
                    <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '12px'
                    }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="cost" 
                    stroke="hsl(var(--primary))" 
                    fill="url(#costGradient)"
                    strokeWidth={2}
                    name="Total Cost"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="net" 
                    stroke="#10b981" 
                    fill="url(#netGradient)"
                    strokeWidth={2}
                    name="Net Cost"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                No cost data available
              </div>
            )}
          </div>

          {/* Security Trend */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">
              {t('executiveDashboard.securityTrend', 'Security Score Trend')}
            </h4>
            {securityChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={securityChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    domain={[0, 100]}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '12px'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="score" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    dot={{ fill: '#10b981', strokeWidth: 2 }}
                    name="Security Score"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="findings" 
                    stroke="#ef4444" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: '#ef4444', strokeWidth: 2 }}
                    name="Critical+High Findings"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                No security trend data available
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
