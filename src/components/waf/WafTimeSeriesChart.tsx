import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Legend } from "recharts";
import { TrendingUp } from "lucide-react";

interface TimeSeriesData {
  timestamp: string;
  blocked: number;
  allowed: number;
  total: number;
}

interface WafTimeSeriesChartProps {
  data: TimeSeriesData[];
  isLoading: boolean;
}

export function WafTimeSeriesChart({ data, isLoading }: WafTimeSeriesChartProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState("24h");

  const formatXAxis = (timestamp: string) => {
    const date = new Date(timestamp);
    if (period === "24h") {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <Card className="glass border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              {t('waf.timeSeries')}
            </CardTitle>
            <CardDescription>{t('waf.timeSeriesDesc')}</CardDescription>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">24 {t('common.hours')}</SelectItem>
              <SelectItem value="7d">7 {t('common.days')}</SelectItem>
              <SelectItem value="30d">30 {t('common.days')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
            <TrendingUp className="h-12 w-12 mb-4 opacity-50" />
            <p>{t('waf.noTimeSeriesData')}</p>
          </div>
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="timestamp" 
                  tickFormatter={formatXAxis}
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  labelFormatter={(label) => new Date(label).toLocaleString()}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="blocked" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  dot={false}
                  name={t('waf.blocked')}
                />
                <Line 
                  type="monotone" 
                  dataKey="allowed" 
                  stroke="#22c55e" 
                  strokeWidth={2}
                  dot={false}
                  name={t('waf.allowed')}
                />
                <Line 
                  type="monotone" 
                  dataKey="total" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={false}
                  name={t('waf.total')}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
