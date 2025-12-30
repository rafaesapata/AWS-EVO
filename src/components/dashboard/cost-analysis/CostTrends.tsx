import { useQuery } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, AlertCircle, DollarSign, Activity } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface Props {
  accountId: string;
  costs: any[];
}

export function CostTrends({ accountId, costs }: Props) {
  // Análise inteligente de tendências
  const analyzeServiceTrends = () => {
    if (!costs || costs.length < 14) return null; // Precisa de pelo menos 2 semanas

    // Dividir em 3 períodos: últimos 7 dias, 7-14 dias atrás, 14-21 dias atrás
    const last7Days = costs.slice(0, 7);
    const prev7Days = costs.slice(7, 14);
    const prev14Days = costs.slice(14, 21);

    const calculatePeriodTotals = (period: any[]) => {
      const totals: Record<string, number> = {};
      period.forEach(cost => {
        if (cost.service_breakdown) {
          Object.entries(cost.service_breakdown).forEach(([service, value]) => {
            totals[service] = (totals[service] || 0) + Math.abs(value as number);
          });
        }
      });
      return totals;
    };

    const last7Totals = calculatePeriodTotals(last7Days);
    const prev7Totals = calculatePeriodTotals(prev7Days);
    const prev14Totals = calculatePeriodTotals(prev14Days);

    // Calcular tendências e insights
    const services = Object.keys({ ...last7Totals, ...prev7Totals, ...prev14Totals });
    
    const trends = services.map(service => {
      const current = last7Totals[service] || 0;
      const previous = prev7Totals[service] || 0;
      const older = prev14Totals[service] || 0;

      // Calcular variação semanal
      let weeklyChange = 0;
      if (previous > 0.10) {
        weeklyChange = ((current - previous) / previous) * 100;
      } else if (current > 0.10) {
        weeklyChange = 100;
      }

      // Calcular tendência de 3 semanas
      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      if (current > previous * 1.1 && previous > older * 1.1) {
        trend = 'increasing';
      } else if (current < previous * 0.9 && previous < older * 0.9) {
        trend = 'decreasing';
      }

      // Calcular custo médio diário
      const avgDailyCost = current / 7;

      return {
        service,
        current,
        previous,
        weeklyChange: Math.max(-200, Math.min(200, weeklyChange)),
        trend,
        avgDailyCost,
        isSignificant: current > 0.50, // Apenas serviços com custo > $0.50/semana
      };
    });

    // Filtrar e ordenar por relevância
    const significantTrends = trends
      .filter(t => t.isSignificant)
      .sort((a, b) => {
        // Priorizar: 1) Tendência crescente, 2) Maior custo, 3) Maior variação
        if (a.trend === 'increasing' && b.trend !== 'increasing') return -1;
        if (b.trend === 'increasing' && a.trend !== 'increasing') return 1;
        if (Math.abs(b.weeklyChange) !== Math.abs(a.weeklyChange)) {
          return Math.abs(b.weeklyChange) - Math.abs(a.weeklyChange);
        }
        return b.current - a.current;
      })
      .slice(0, 5);

    // Gerar insights automáticos
    const insights: string[] = [];
    const increasingServices = significantTrends.filter(t => t.trend === 'increasing');
    const decreasingServices = significantTrends.filter(t => t.trend === 'decreasing');
    
    if (increasingServices.length > 0) {
      const topIncreasing = increasingServices[0];
      insights.push(`${topIncreasing.service} está em tendência de alta há 3 semanas (+${topIncreasing.weeklyChange.toFixed(0)}% esta semana)`);
    }
    
    if (decreasingServices.length > 0) {
      const topDecreasing = decreasingServices[0];
      insights.push(`${topDecreasing.service} está reduzindo custos (${topDecreasing.weeklyChange.toFixed(0)}% esta semana)`);
    }

    const totalCurrent = significantTrends.reduce((sum, t) => sum + t.current, 0);
    const totalPrevious = significantTrends.reduce((sum, t) => sum + t.previous, 0);
    const overallChange = totalPrevious > 0 ? ((totalCurrent - totalPrevious) / totalPrevious) * 100 : 0;

    if (Math.abs(overallChange) > 10) {
      insights.push(`Custo total ${overallChange > 0 ? 'aumentou' : 'diminuiu'} ${Math.abs(overallChange).toFixed(0)}% na última semana`);
    }

    return {
      trends: significantTrends,
      insights,
      overallChange,
    };
  };

  const analysis = analyzeServiceTrends();

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return <TrendingUp className="h-4 w-4 text-orange-500" />;
      case 'decreasing':
        return <TrendingDown className="h-4 w-4 text-green-500" />;
      default:
        return <Activity className="h-4 w-4 text-blue-500" />;
    }
  };

  const getTrendColor = (change: number) => {
    if (change > 20) return 'text-red-600';
    if (change > 10) return 'text-orange-500';
    if (change > 0) return 'text-yellow-600';
    if (change < -20) return 'text-green-600';
    if (change < -10) return 'text-green-500';
    return 'text-muted-foreground';
  };

  const getTrendBadgeVariant = (change: number): "default" | "destructive" | "outline" | "secondary" => {
    if (change > 15) return 'destructive';
    if (change < -15) return 'default';
    return 'outline';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Análise de Tendências</CardTitle>
            <CardDescription>Variação semanal dos principais serviços</CardDescription>
          </div>
          {analysis && (
            <div className="flex items-center gap-2">
              {analysis.overallChange > 0 ? (
                <TrendingUp className="h-5 w-5 text-orange-500" />
              ) : analysis.overallChange < 0 ? (
                <TrendingDown className="h-5 w-5 text-green-500" />
              ) : (
                <Minus className="h-5 w-5 text-muted-foreground" />
              )}
              <Badge variant={analysis.overallChange > 10 ? 'destructive' : 'default'}>
                {analysis.overallChange > 0 ? '+' : ''}{analysis.overallChange.toFixed(1)}%
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {analysis && analysis.trends.length > 0 ? (
            <>
              {analysis.trends.map((item, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getTrendIcon(item.trend)}
                      <span className="font-medium text-sm">
                        {item.service.replace('Amazon ', '').replace('AWS ', '')}
                      </span>
                      <Badge 
                        variant={getTrendBadgeVariant(item.weeklyChange)}
                        className={getTrendColor(item.weeklyChange)}
                      >
                        {item.weeklyChange > 0 ? '+' : ''}{item.weeklyChange.toFixed(1)}%
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">
                        ${item.current.toFixed(2)}/sem
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ${item.avgDailyCost.toFixed(2)}/dia
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress 
                      value={Math.min(Math.abs(item.weeklyChange), 100)} 
                      className="h-2 flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-16 text-right">
                      {item.trend === 'increasing' ? '📈 Alta' : item.trend === 'decreasing' ? '📉 Baixa' : '➡️ Estável'}
                    </span>
                  </div>
                </div>
              ))}

              {analysis.insights.length > 0 && (
                <div className="mt-6 p-4 bg-muted/50 rounded-lg border border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <DollarSign className="h-4 w-4 text-primary" />
                    <h4 className="font-semibold text-sm">Insights da Semana</h4>
                  </div>
                  <ul className="text-sm space-y-2 text-muted-foreground">
                    {analysis.insights.map((insight, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{insight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="font-medium">Dados insuficientes para análise</p>
              <p className="text-sm mt-1">Necessário pelo menos 14 dias de histórico</p>
              <p className="text-xs mt-2">Encontrados: {costs?.length || 0} dias</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
