import { useQuery } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface Props {
  accountId: string;
  costs: any[];
}

export function CostTrends({ accountId, costs }: Props) {
  // Análise local de tendências (sem precisar do banco por enquanto)
  const trends = null;

  // Análise client-side se não houver dados de trends
  const analyzeTopServices = () => {
    if (!costs || costs.length < 2) return [];

    // Dividir em dois períodos: primeira metade vs segunda metade
    const midPoint = Math.floor(costs.length / 2);
    const olderPeriod = costs.slice(midPoint); // Período mais antigo
    const recentPeriod = costs.slice(0, midPoint); // Período mais recente

    const calculatePeriodTotals = (period: any[]) => {
      const totals: Record<string, number> = {};
      period.forEach(cost => {
        if (cost.service_breakdown) {
          Object.entries(cost.service_breakdown).forEach(([service, value]) => {
            if (!totals[service]) {
              totals[service] = 0;
            }
            totals[service] += Math.abs(value as number); // Usar valor absoluto para evitar negativos
          });
        }
      });
      return totals;
    };

    const olderTotals = calculatePeriodTotals(olderPeriod);
    const recentTotals = calculatePeriodTotals(recentPeriod);

    // Calcular crescimento para cada serviço
    const servicesWithGrowth = Object.keys({ ...olderTotals, ...recentTotals })
      .map(service => {
        const olderValue = olderTotals[service] || 0;
        const recentValue = recentTotals[service] || 0;
        
        // Calcular variação percentual de forma segura
        let growth = 0;
        if (olderValue > 0.001) { // Evitar divisão por valores muito próximos de zero
          growth = ((recentValue - olderValue) / olderValue) * 100;
        } else if (recentValue > 0.001) {
          growth = 100; // Se não havia custo antes e agora há, considerar 100% de crescimento
        }

        return {
          service,
          total: recentValue,
          growth: isFinite(growth) ? growth : 0, // Garantir que é um número finito
        };
      })
      .filter(item => item.total > 0.001) // Filtrar serviços com custo insignificante
      .sort((a, b) => Math.abs(b.growth) - Math.abs(a.growth))
      .slice(0, 5);

    return servicesWithGrowth;
  };

  const topGrowingServices = trends?.top_growing_services || analyzeTopServices();

  const getTrendIcon = (direction: string) => {
    switch (direction) {
      case 'increasing':
        return <TrendingUp className="h-4 w-4 text-destructive" />;
      case 'decreasing':
        return <TrendingDown className="h-4 w-4 text-green-500" />;
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTrendColor = (growth: number) => {
    if (growth > 20) return 'text-destructive';
    if (growth > 10) return 'text-orange-500';
    if (growth < -10) return 'text-green-500';
    return 'text-muted-foreground';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Análise de Tendências</CardTitle>
            <CardDescription>Serviços com maior variação de custo</CardDescription>
          </div>
          {trends && (
            <div className="flex items-center gap-2">
              {getTrendIcon(trends.trend_direction)}
              <Badge variant={trends.trend_direction === 'increasing' ? 'destructive' : 'default'}>
                {trends.growth_rate > 0 ? '+' : ''}{trends.growth_rate?.toFixed(1)}%
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {topGrowingServices && topGrowingServices.length > 0 ? (
            topGrowingServices.map((item: any, idx: number) => (
              <div key={idx} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {item.service?.replace('Amazon ', '').replace('AWS ', '')}
                    </span>
                    {item.growth !== undefined && (
                      <Badge 
                        variant="outline" 
                        className={getTrendColor(item.growth)}
                      >
                        {item.growth > 0 ? '+' : ''}{item.growth.toFixed(1)}%
                      </Badge>
                    )}
                  </div>
                  <span className="text-sm font-semibold">
                    ${item.total?.toFixed(2) || '0.00'}
                  </span>
                </div>
                {item.growth !== undefined && (
                  <Progress 
                    value={Math.min(Math.abs(item.growth), 100)} 
                    className="h-2"
                  />
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Dados insuficientes para análise de tendências</p>
            </div>
          )}
        </div>

        {trends?.insights && (
          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-semibold mb-2 text-sm">Insights</h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              {Array.isArray(trends.insights) ? (
                trends.insights.map((insight: string, idx: number) => (
                  <li key={idx}>• {insight}</li>
                ))
              ) : (
                <li>• Monitoramento contínuo ativo</li>
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
