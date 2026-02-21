import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/aws/api-client";
import { useOrganization } from "@/hooks/useOrganization";
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
import { useDemoAwareQuery } from "@/hooks/useDemoAwareQuery";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from "recharts";
import { TrendingUp, AlertTriangle, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateBR } from "@/lib/utils";
import { useCurrency } from "@/hooks/useCurrency";
import { CurrencyIndicator } from "@/components/ui/currency-indicator";

// Constants
const HISTORY_DAYS = 90;
const FORECAST_DAYS = 30;
const MIN_DAYS_FOR_FORECAST = 7;
const CACHE_TIME_MS = 60 * 60 * 1000; // 1 hour
const CONFIDENCE_Z_SCORE = 1.96; // 95% confidence interval

interface Props {
  accountId: string; // Kept for backwards compatibility, but we use context
}

export function CostForecast({ accountId }: Props) {
  // Get user's organization to ensure proper cache isolation
  const { data: organizationId } = useOrganization();
  
  // Use global account context for multi-account isolation
  const { selectedAccountId, selectedProvider } = useCloudAccount();
  const { getAccountFilter } = useAccountFilter();
  const { shouldEnableAccountQuery } = useDemoAwareQuery();
  const { sym, convert } = useCurrency();
  
  // Use context account instead of prop for consistency
  const effectiveAccountId = selectedAccountId || accountId;

  const { data: historicalCosts, isLoading: loadingHistory } = useQuery({
    queryKey: ['daily-costs-history', organizationId, effectiveAccountId, selectedProvider],
    enabled: shouldEnableAccountQuery() && effectiveAccountId !== 'all',
    staleTime: Infinity, // Manter cache até invalidação manual
    gcTime: 60 * 60 * 1000, // Garbage collection após 1 hora
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      // Don't retry aborted/cancelled requests
      if (error instanceof Error) {
        const msg = error.message || '';
        if (msg.includes('Failed to fetch') || msg.includes('aborted') || msg.includes('cancelled')) {
          return false;
        }
      }
      return failureCount < 2;
    },
    queryFn: async () => {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const startDateStr = ninetyDaysAgo.toISOString().split('T')[0];
      const endDateStr = new Date().toISOString().split('T')[0];

      console.log('CostForecast: Fetching with params:', {
        organizationId,
        effectiveAccountId,
        selectedProvider,
        startDateStr
      });

      // Use fetch-daily-costs Lambda which handles both AWS and Azure properly
      // For Azure, it reads from DB (azure-fetch-costs syncs data separately)
      const lambdaResponse = await apiClient.invoke<any>('fetch-daily-costs', {
        body: {
          accountId: effectiveAccountId,
          startDate: startDateStr,
          endDate: endDateStr,
          granularity: 'DAILY',
          incremental: true
        }
      });
      
      console.log('CostForecast: API response:', lambdaResponse);
      
      let rawData: any[] = [];
      
      if (lambdaResponse.error) {
        const errorMsg = typeof lambdaResponse.error === 'string' ? lambdaResponse.error : (lambdaResponse.error as any)?.message || '';
        if (errorMsg.includes('Failed to fetch') || errorMsg.includes('aborted') || errorMsg.includes('cancelled')) {
          console.log('CostForecast: Request was aborted/cancelled, returning empty array');
          return [];
        }
        console.warn('CostForecast: Lambda error, falling back to direct query:', lambdaResponse.error);
        // Fallback to direct DB query
        const accountFilter = getAccountFilter();
        const response = await apiClient.select('daily_costs', {
          select: '*',
          eq: { organization_id: organizationId, ...accountFilter },
          gte: { date: startDateStr },
          order: { column: 'date', ascending: true },
          limit: 10000
        });
        rawData = response.data || [];
      } else {
        // Extract costs from Lambda response
        const data = lambdaResponse.data;
        rawData = data?.costs || data?.dailyCosts || data?.data?.dailyCosts || [];
      }
      
      // Azure: if DB is empty, trigger sync and re-read
      if (rawData.length === 0 && selectedProvider === 'AZURE') {
        console.log('CostForecast: No Azure costs, triggering sync...');
        try {
          const syncResult = await apiClient.invoke<any>('azure-fetch-costs', {
            body: { credentialId: effectiveAccountId, startDate: startDateStr, endDate: endDateStr, granularity: 'DAILY' },
            timeoutMs: 120000,
          });
          const savedCount = syncResult.data?.summary?.savedCount || 0;
          const rowCount = syncResult.data?.summary?.recordCount || 0;
          console.log('CostForecast: Azure sync savedCount:', savedCount, 'rowCount:', rowCount);
          if (syncResult.data?.debug) {
            console.log('CostForecast: Azure debug:', JSON.stringify(syncResult.data.debug, null, 2));
          }
          if (!syncResult.error && savedCount > 0) {
            // Re-read from DB after sync
            const retryResponse = await apiClient.invoke<any>('fetch-daily-costs', {
              body: { accountId: effectiveAccountId, startDate: startDateStr, endDate: endDateStr, granularity: 'DAILY', incremental: true }
            });
            if (!retryResponse.error) {
              const retryData = retryResponse.data;
              rawData = retryData?.costs || retryData?.dailyCosts || retryData?.data?.dailyCosts || [];
              console.log('CostForecast: After Azure sync, got', rawData.length, 'records');
            }
          } else if (!syncResult.error && savedCount === 0 && rowCount > 0) {
            // DB save failed but API returned data - use direct costs
            const directCosts = syncResult.data?.costs || [];
            if (directCosts.length > 0) {
              rawData = directCosts.map((c: any) => ({
                id: `azure-${c.date}-${c.service}`,
                date: c.date,
                service: c.service,
                cost: c.cost,
                currency: c.currency || 'BRL',
                cloud_provider: 'AZURE',
              }));
              console.log('CostForecast: Using', rawData.length, 'direct costs from API');
            }
          }
        } catch (err) {
          console.warn('CostForecast: Azure sync failed:', err);
        }
      }
      
      console.log('CostForecast: Raw data received:', rawData.length, 'records');
      
      // Transform raw data (per service) into aggregated format (per date)
      // Raw schema: { id, organization_id, account_id, date, service, cost, usage, currency }
      // Expected format: { cost_date, total_cost }
      const dateMap = new Map<string, { cost_date: string; total_cost: number }>();
      
      for (const row of rawData) {
        const dateValue = row.date || row.cost_date;
        if (!dateValue) continue;
        
        let dateStr: string;
        try {
          if (typeof dateValue === 'string') {
            dateStr = dateValue.split('T')[0];
          } else if (dateValue instanceof Date) {
            dateStr = dateValue.toISOString().split('T')[0];
          } else {
            const parsed = new Date(dateValue);
            if (isNaN(parsed.getTime())) continue;
            dateStr = parsed.toISOString().split('T')[0];
          }
        } catch {
          continue;
        }
        
        if (!dateMap.has(dateStr)) {
          dateMap.set(dateStr, { cost_date: dateStr, total_cost: 0 });
        }
        
        const entry = dateMap.get(dateStr)!;
        const rawCost = typeof row.cost === 'number' ? row.cost : parseFloat(String(row.cost || '0'));
        entry.total_cost += isNaN(rawCost) ? 0 : rawCost;
      }
      
      const aggregatedData = Array.from(dateMap.values()).sort((a, b) => 
        a.cost_date.localeCompare(b.cost_date)
      );
      
      console.log(`CostForecast: Fetched ${rawData.length} raw records, aggregated to ${aggregatedData.length} days`);
      if (aggregatedData.length > 0) {
        console.log(`CostForecast: First day: ${aggregatedData[0].cost_date} = $${aggregatedData[0].total_cost.toFixed(2)}`);
        console.log(`CostForecast: Last day: ${aggregatedData[aggregatedData.length-1].cost_date} = $${aggregatedData[aggregatedData.length-1].total_cost.toFixed(2)}`);
        const total = aggregatedData.reduce((s, d) => s + d.total_cost, 0);
        console.log(`CostForecast: Total cost: $${total.toFixed(2)}, Avg: $${(total/aggregatedData.length).toFixed(2)}`);
      }
      return aggregatedData;
    }
  });

  // Gerar previsão local baseada em dados históricos
  const forecasts = useMemo(() => {
    if (!historicalCosts || historicalCosts.length < 7) return null;
    const costs = historicalCosts.map(c => c.total_cost);
    const n = costs.length;
    const avgCost = costs.reduce((a, b) => a + b, 0) / n;
    
    // Calcular tendência
    let sumXY = 0, sumX = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumXY += i * costs[i];
      sumX += i;
      sumX2 += i * i;
    }
    const slope = (n * sumXY - sumX * costs.reduce((a, b) => a + b, 0)) / (n * sumX2 - sumX * sumX);
    
    // Calcular desvio padrão
    const variance = costs.reduce((sum, cost) => {
      const diff = cost - avgCost;
      return sum + diff * diff;
    }, 0) / n;
    const stdDev = Math.sqrt(variance);
    const confidence = 1.96 * stdDev;
    
    // Gerar previsões
    const predictions = [];
    for (let i = 1; i <= 30; i++) {
      const forecastDate = new Date();
      forecastDate.setDate(forecastDate.getDate() + i);
      // Usar apenas 'i' para dias futuros, não 'n + i'
      // Isso projeta a partir do último ponto conhecido
      const predictedCost = Math.max(0, avgCost + slope * i);
      
      predictions.push({
        forecast_date: forecastDate.toISOString().split('T')[0],
        predicted_cost: predictedCost,
        confidence_interval_low: Math.max(0, predictedCost - confidence),
        confidence_interval_high: predictedCost + confidence
      });
    }
    
    return predictions;
  }, [historicalCosts]);

  if (effectiveAccountId === 'all') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Previsão de Custos</CardTitle>
          <CardDescription>Selecione uma conta específica para ver previsões</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (loadingHistory) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Combinar dados históricos e previsões
  const { chartData, avgDailyCost, predictedMonthlyCost, growthRate } = useMemo(() => {
    const data = [
      ...(historicalCosts?.slice(-30).map(c => ({
        date: formatDateBR(c.cost_date, { day: '2-digit', month: '2-digit' }),
        actual: c.total_cost,
        predicted: null,
        low: null,
        high: null
      })) || []),
      ...(forecasts?.map(f => ({
        date: new Date(f.forecast_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        actual: null,
        predicted: f.predicted_cost,
        low: f.confidence_interval_low,
        high: f.confidence_interval_high
      })) || [])
    ];

    const avg = historicalCosts && historicalCosts.length > 0 
      ? historicalCosts.reduce((sum, c) => sum + (c.total_cost || 0), 0) / historicalCosts.length
      : 0;
    const predicted = forecasts?.reduce((sum, f) => sum + (f.predicted_cost || 0), 0) || 0;
    const growth = avg > 0 
      ? ((predicted - (avg * 30)) / (avg * 30)) * 100 
      : 0;

    return { chartData: data, avgDailyCost: avg, predictedMonthlyCost: predicted, growthRate: growth };
  }, [historicalCosts, forecasts]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Previsão de Custos (30 dias)
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground">
                    <Info className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 text-sm" side="top">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Como é calculado?</h4>
                    <p className="text-muted-foreground">
                      <strong>Previsão ML com Regressão Linear:</strong> Analisa 90 dias de histórico para prever os próximos 30 dias.
                    </p>
                    <div className="bg-muted p-2 rounded text-xs font-mono">
                      Média + (Tendência × Dias futuros)
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li>• Média diária: {sym}{convert(avgDailyCost ?? 0).toFixed(2)}</li>
                      <li>• Dados analisados: {historicalCosts?.length || 0} dias</li>
                      <li>• Previsão: Soma de 30 dias futuros</li>
                    </ul>
                    <div className="border-t pt-2 mt-2">
                      <p className="text-xs text-muted-foreground">
                        💡 A "Projeção do Mês" no Dashboard usa metodologia diferente 
                        (extrapolação linear do mês atual), por isso os valores podem diferir.
                      </p>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </CardTitle>
            <CardDescription>
              Baseado em padrões históricos e tendências
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold"><CurrencyIndicator className="mr-1" />{sym}{convert(predictedMonthlyCost).toFixed(2)}</div>
            <Badge variant={growthRate > 10 ? "destructive" : "default"}>
              {growthRate > 0 ? '+' : ''}{growthRate.toFixed(1)}% vs atual
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis 
                tick={{ fontSize: 11 }}
                tickFormatter={(value) => `${sym}${convert(value).toFixed(0)}`}
              />
              <Tooltip 
                formatter={(value: any) => `${sym}${convert(Number(value)).toFixed(2)}`}
                labelStyle={{ color: '#000' }}
              />
              <Legend />
              
              {/* Intervalo de confiança */}
              <Area
                type="monotone"
                dataKey="high"
                stackId="1"
                stroke="none"
                fill="hsl(var(--primary))"
                fillOpacity={0.1}
                name="Intervalo Superior"
              />
              <Area
                type="monotone"
                dataKey="low"
                stackId="1"
                stroke="none"
                fill="hsl(var(--primary))"
                fillOpacity={0.1}
                name="Intervalo Inferior"
              />
              
              {/* Custos reais */}
              <Line
                type="monotone"
                dataKey="actual"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Custo Real"
              />
              
              {/* Previsão */}
              <Line
                type="monotone"
                dataKey="predicted"
                stroke="hsl(var(--destructive))"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 3 }}
                name="Previsão"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Dados históricos insuficientes para gerar previsão</p>
            <p className="text-sm">Necessário pelo menos 7 dias de histórico</p>
            <p className="text-xs mt-2">Encontrados: {historicalCosts?.length || 0} dias</p>
            {historicalCosts && historicalCosts.length > 0 && (
              <p className="text-xs mt-1">
                Total acumulado: {sym}{convert(historicalCosts.reduce((s, c) => s + (c.total_cost || 0), 0)).toFixed(2)}
              </p>
            )}
          </div>
        )}

        {forecasts && forecasts.length > 0 && (
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-semibold mb-2">Insights da Previsão</h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• Próximos 7 dias: {sym}{convert(forecasts.slice(0, 7).reduce((s, f) => s + f.predicted_cost, 0)).toFixed(2)}</li>
              <li>• Próximos 30 dias: {sym}{convert(predictedMonthlyCost).toFixed(2)}</li>
              <li>• Tendência: {growthRate > 5 ? 'Crescimento' : growthRate < -5 ? 'Redução' : 'Estável'}</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
