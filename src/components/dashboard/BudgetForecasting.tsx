import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { TrendingUp, DollarSign, AlertCircle } from "lucide-react";
import { useChartView } from "@/hooks/useChartView";
import { ChartViewSwitcher } from "@/components/ui/chart-view-switcher";
import { MultiViewChart } from "@/components/ui/multi-view-chart";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useTVDashboard } from "@/contexts/TVDashboardContext";
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
import { useOrganization } from "@/hooks/useOrganization";

export function BudgetForecasting() {
  const { isTVMode } = useTVDashboard();
  const [isGenerating, setIsGenerating] = useState(false);
  const queryClient = useQueryClient();
  
  // Use global account context for multi-account isolation
  const { selectedAccountId } = useCloudAccount();
  const { getAccountFilter } = useAccountFilter();
  const { data: organizationId } = useOrganization();
  const { view, changeView, availableViews } = useChartView({ defaultView: 'line', storageKey: 'budget-forecasting', availableViews: ['line', 'bar', 'area', 'table'] });

  // Load latest saved forecast from database - ISOLATED BY ACCOUNT
  const { data: savedForecast } = useQuery({
    queryKey: ['budget-forecast-saved', 'org', organizationId, 'account', selectedAccountId],
    enabled: !!organizationId && (isTVMode || !!selectedAccountId),
    queryFn: async () => {
      const filters: any = { 
        organization_id: organizationId,
        ...(!isTVMode ? getAccountFilter() : {}) // Multi-cloud compatible
      };
      
      const response = await apiClient.select('budget_forecasts', {
        eq: filters,
        order: { column: 'generated_at', ascending: false },
        limit: 1
      });
      
      return response.data?.[0];
    },
  });

  // Generate new forecast via edge function
  const { data: generatedForecast, refetch } = useQuery({
    queryKey: ['budget-forecast-generate'],
    queryFn: async () => {
      const data = await apiClient.lambda('budget-forecast', {
        body: { months: 3 }
      });
      
      
      return data;
    },
    enabled: false,
  });

  // Use generated forecast if available, otherwise use saved forecast
  const forecastData = generatedForecast || (savedForecast ? {
    success: true,
    historical_days: savedForecast.historical_days,
    forecast_months: savedForecast.forecast_months,
    potential_monthly_savings: savedForecast.potential_monthly_savings,
    forecast: savedForecast.forecast_data,
    insights: savedForecast.insights,
    recommendations: savedForecast.recommendations
  } : null);

  const generateForecast = async () => {
    setIsGenerating(true);
    toast.info("Gerando previsão de custos com AI...");
    
    try {
      const result = await refetch();
      
      if (result.error) {
        throw result.error;
      }
      
      if (result.data?.error) {
        throw new Error(result.data.error);
      }
      
      // Invalidate saved forecast to refetch from database
      queryClient.invalidateQueries({ queryKey: ['budget-forecast-saved'] });
      
      toast.success("Previsão gerada e salva com sucesso!");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      toast.error("Erro ao gerar previsão", {
        description: errorMessage
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const chartData = forecastData?.forecast?.map((f: any) => ({
    month: new Date(f.month).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
    cost: f.projected_cost,
    lower: f.lower_bound,
    upper: f.upper_bound
  })) || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Budget Forecasting (AI)
            </CardTitle>
            <CardDescription>
              Previsão de custos AWS usando Machine Learning
            </CardDescription>
          </div>
          {!isTVMode && (
            <Button
              onClick={generateForecast}
              disabled={isGenerating}
              className="bg-gradient-primary"
            >
              {isGenerating ? "Gerando..." : "Gerar Previsão"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!forecastData ? (
          <div className="text-center p-12 text-muted-foreground">
            <TrendingUp className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <h3 className="font-semibold mb-2">Previsão de Custos com IA</h3>
            <p className="text-sm mb-4">
              Use Machine Learning para prever seus custos AWS nos próximos meses
            </p>
            <p className="text-xs">
              Baseado em tendências históricas, sazonalidade e recomendações pendentes
            </p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Dados Históricos</div>
                  <div className="text-2xl font-semibold">{forecastData.historical_days} dias</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Período da Previsão</div>
                  <div className="text-2xl font-semibold">{forecastData.forecast_months} meses</div>
                </CardContent>
              </Card>

              <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                <CardContent className="pt-6">
                  <div className="text-sm text-green-800 dark:text-green-400">Economia Potencial/Mês</div>
                  <div className="text-2xl font-semibold text-green-600 dark:text-green-400">
                    ${Number(forecastData.potential_monthly_savings || 0).toLocaleString('en-US', { 
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2 
                    })}
                  </div>
                  <p className="text-xs text-green-700 dark:text-green-500 mt-1">
                    Baseado em {savedForecast ? 'análise salva' : 'recomendações atuais'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Forecast Chart */}
            {chartData.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Projeção de Custos (3 Meses)</h3>
                  <ChartViewSwitcher currentView={view} availableViews={availableViews} onViewChange={changeView} />
                </div>
                <MultiViewChart
                  data={chartData}
                  series={[
                    { dataKey: 'cost', name: 'Custo Projetado', color: '#0D96FF' },
                    { dataKey: 'lower', name: 'Limite Inferior', color: '#82ca9d', strokeDasharray: '5 5' },
                    { dataKey: 'upper', name: 'Limite Superior', color: '#ff7c7c', strokeDasharray: '5 5' },
                  ]}
                  view={view}
                  xAxisKey="month"
                  height={300}
                  formatValue={(v) => `$${v.toLocaleString()}`}
                  formatTooltip={(value, name) => [`$${value.toLocaleString()}`, name]}
                />
              </div>
            )}

            {/* AI Insights */}
            {forecastData.insights && forecastData.insights.length > 0 && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-blue-900 mb-2">Insights da IA</h4>
                    <ul className="space-y-1">
                      {forecastData.insights.map((insight: string, idx: number) => (
                        <li key={idx} className="text-sm text-blue-800">• {insight}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Recommendations */}
            {forecastData.recommendations && forecastData.recommendations.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3">Recomendações para Reduzir Projeção</h3>
                <div className="space-y-2">
                  {forecastData.recommendations.map((rec: string, idx: number) => (
                    <div key={idx} className="p-3 border rounded-lg flex items-start gap-2">
                      <DollarSign className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Forecast Details Table */}
            {forecastData.forecast && forecastData.forecast.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3">Detalhamento da Previsão</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-3">Mês</th>
                        <th className="text-right p-3">Custo Projetado</th>
                        <th className="text-center p-3">Confiança</th>
                        <th className="text-right p-3">Intervalo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forecastData.forecast.map((f: any, idx: number) => (
                        <tr key={idx} className="border-t">
                          <td className="p-3 font-medium">
                            {new Date(f.month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                          </td>
                          <td className="p-3 text-right font-semibold">
                            ${f.projected_cost.toLocaleString()}
                          </td>
                          <td className="p-3 text-center">
                            <Badge variant={f.confidence_level === 'high' ? 'default' : 'secondary'}>
                              {f.confidence_level}
                            </Badge>
                          </td>
                          <td className="p-3 text-right text-xs text-muted-foreground">
                            ${f.lower_bound.toLocaleString()} - ${f.upper_bound.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
