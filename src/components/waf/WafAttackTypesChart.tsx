import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { ShieldAlert } from "lucide-react";

interface AttackType {
  type: string;
  count: number;
}

interface WafAttackTypesChartProps {
  attackTypes: AttackType[];
  isLoading: boolean;
}

const COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
];

const formatAttackType = (type: string) => {
  if (!type) return 'Unknown';
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
};

export function WafAttackTypesChart({ attackTypes, isLoading }: WafAttackTypesChartProps) {
  const { t } = useTranslation();

  const chartData = attackTypes.map((item, index) => ({
    name: formatAttackType(item.type),
    value: item.count,
    color: COLORS[index % COLORS.length],
  }));

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card className="glass border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-primary" />
          {t('waf.attackTypes')}
        </CardTitle>
        <CardDescription>{t('waf.attackTypesDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-[300px]">
            <Skeleton className="h-[200px] w-[200px] rounded-full" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
            <ShieldAlert className="h-12 w-12 mb-4 opacity-50" />
            <p>{t('waf.noAttackTypes')}</p>
          </div>
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [value.toLocaleString(), t('waf.count')]}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        
        {/* Legend */}
        {chartData.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {chartData.slice(0, 6).map((item, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate">{item.name}</span>
                <span className="text-muted-foreground ml-auto">
                  {item.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
