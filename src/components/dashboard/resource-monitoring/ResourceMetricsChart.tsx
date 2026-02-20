import { useMemo, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useChartView } from "@/hooks/useChartView";
import { ChartViewSwitcher } from "@/components/ui/chart-view-switcher";
import { MultiViewChart } from "@/components/ui/multi-view-chart";
import { MetricsPeriod, PERIOD_CONFIG } from "./MetricsPeriodSelector";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

// Métricas que devem ser exibidas como inteiros (contadores)
const COUNT_METRICS = new Set([
  'Invocations', 'Errors', 'Throttles', 'ConcurrentExecutions',
  'Count', '4XXError', '5XXError',
  'RequestCount', 'HTTPCode_Target_2XX_Count', 'HTTPCode_Target_3XX_Count',
  'HTTPCode_Target_4XX_Count', 'HTTPCode_Target_5XX_Count',
  'HTTPCode_ELB_2XX_Count', 'HTTPCode_ELB_3XX_Count',
  'HTTPCode_ELB_4XX_Count', 'HTTPCode_ELB_5XX_Count',
  'Requests', 'BytesDownloaded', 'BytesUploaded',
  'AllowedRequests', 'BlockedRequests', 'CountedRequests', 'PassedRequests',
  'NewFlowCount', 'ProcessedBytes', 'ProcessedPackets',
  'DatabaseConnections', 'ActiveFlowCount'
]);

interface Metric {
  metric_name: string;
  metric_value: number;
  metric_unit: string;
  timestamp: string;
}

interface ResourceMetricsChartProps {
  metrics: Metric[];
  metricName: string;
  period: MetricsPeriod;
  resourceName?: string;
  height?: number;
}

interface ChartDataPoint {
  timestamp: string;
  timestampMs: number;
  value: number;
  displayTime: string;
}

// Formatar valor da métrica baseado no tipo
const formatMetricValue = (metricName: string, value: number): string => {
  if (COUNT_METRICS.has(metricName)) {
    return Math.round(value).toLocaleString();
  }
  return value.toFixed(2);
};

// Parse timestamp de forma robusta
const parseTimestamp = (timestamp: string): number => {
  try {
    // Try ISO format first
    const date = parseISO(timestamp);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
    // Fallback to Date constructor
    return new Date(timestamp).getTime();
  } catch {
    return 0;
  }
};

// Configuração de agregação por período
const AGGREGATION_CONFIG: Record<MetricsPeriod, { intervalMs: number; formatString: string }> = {
  '3h': { intervalMs: 5 * 60 * 1000, formatString: 'HH:mm' },      // 5 minutos
  '24h': { intervalMs: 30 * 60 * 1000, formatString: 'HH:mm' },    // 30 minutos  
  '7d': { intervalMs: 2 * 60 * 60 * 1000, formatString: 'dd/MM HH:mm' } // 2 horas
};

// Agregar dados para períodos - CORRIGIDO para não colapsar em 1 ponto
const aggregateData = (
  data: Array<{ timestampMs: number; value: number }>,
  period: MetricsPeriod,
  metricName: string
): ChartDataPoint[] => {
  if (data.length === 0) return [];
  
  const useSum = COUNT_METRICS.has(metricName);
  const { intervalMs, formatString } = AGGREGATION_CONFIG[period];
  
  // Agrupar por intervalo de tempo
  const buckets = new Map<number, number[]>();
  
  for (const item of data) {
    if (item.timestampMs <= 0 || isNaN(item.timestampMs)) continue;
    
    const bucketKey = Math.floor(item.timestampMs / intervalMs) * intervalMs;
    
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, []);
    }
    buckets.get(bucketKey)!.push(item.value);
  }
  
  // Converter buckets para array ordenado
  const result: ChartDataPoint[] = [];
  
  const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
  
  for (const [timestamp, values] of sortedBuckets) {
    if (values.length === 0) continue;
    
    const aggregatedValue = useSum 
      ? values.reduce((a, b) => a + b, 0)
      : values.reduce((a, b) => a + b, 0) / values.length;
    
    const date = new Date(timestamp);
    
    result.push({
      timestamp: date.toISOString(),
      timestampMs: timestamp,
      value: aggregatedValue,
      displayTime: format(date, formatString, { locale: ptBR })
    });
  }
  
  return result;
};

export const ResourceMetricsChart = ({ 
  metrics, 
  metricName, 
  period,
  resourceName,
  height = 300 
}: ResourceMetricsChartProps) => {
  const { view, changeView, availableViews } = useChartView({
    defaultView: 'area',
    storageKey: `resource-metrics-${metricName}`,
    availableViews: ['area', 'line', 'bar', 'table'],
  });
  // Filtrar todas as métricas disponíveis para esta métrica específica
  const allMetricsForName = useMemo(() => 
    metrics.filter(m => m.metric_name === metricName),
    [metrics, metricName]
  );

  // Processar dados do gráfico com filtragem por período
  const chartData = useMemo(() => {
    const now = Date.now();
    const periodHours = PERIOD_CONFIG[period].hours;
    const cutoffTime = now - (periodHours * 60 * 60 * 1000);

    // Filtrar e parsear métricas
    const filteredMetrics: Array<{ timestampMs: number; value: number }> = [];
    
    for (const m of allMetricsForName) {
      const timestampMs = parseTimestamp(m.timestamp);
      
      // Validar timestamp
      if (timestampMs <= 0 || isNaN(timestampMs)) continue;
      
      // Filtrar por período
      if (timestampMs < cutoffTime) continue;
      
      // Validar valor
      const value = Number(m.metric_value);
      if (isNaN(value)) continue;
      
      filteredMetrics.push({ timestampMs, value });
    }

    // Ordenar por timestamp antes de agregar
    filteredMetrics.sort((a, b) => a.timestampMs - b.timestampMs);

    // Agregar dados
    return aggregateData(filteredMetrics, period, metricName);
  }, [allMetricsForName, period, metricName]);

  const unit = allMetricsForName[0]?.metric_unit || '';
  const isCountMetric = COUNT_METRICS.has(metricName);
  
  // Verificar se há dados históricos mas não no período selecionado
  const hasHistoricalData = allMetricsForName.length > 0;
  
  // Encontrar o datapoint mais recente
  const latestDatapoint = useMemo(() => {
    if (allMetricsForName.length === 0) return null;
    
    let latest = allMetricsForName[0];
    let latestTime = parseTimestamp(latest.timestamp);
    
    for (const m of allMetricsForName) {
      const time = parseTimestamp(m.timestamp);
      if (time > latestTime) {
        latest = m;
        latestTime = time;
      }
    }
    
    return latest;
  }, [allMetricsForName]);

  // Calcular valor estatístico para exibição
  const getDisplayValue = useCallback(() => {
    if (chartData.length === 0) return null;
    return chartData[chartData.length - 1]?.value || 0;
  }, [chartData]);

  // Estado vazio
  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">{metricName}</CardTitle>
              <CardDescription>
                {PERIOD_CONFIG[period].label}
              </CardDescription>
            </div>
            {latestDatapoint && (
              <div className="text-right">
                <p className="text-xl font-semibold text-muted-foreground">
                  {isCountMetric 
                    ? Math.round(Number(latestDatapoint.metric_value)).toLocaleString()
                    : Number(latestDatapoint.metric_value).toFixed(2)
                  }
                </p>
                <p className="text-xs text-muted-foreground">{unit} (último)</p>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="h-[200px] flex flex-col items-center justify-center">
          <p className="text-muted-foreground text-sm text-center">
            {hasHistoricalData 
              ? `Sem atividade ${PERIOD_CONFIG[period].label.toLowerCase()}`
              : 'Sem dados disponíveis'
            }
          </p>
          {latestDatapoint && (
            <p className="text-xs text-muted-foreground mt-2">
              Último registro: {format(parseISO(latestDatapoint.timestamp), "dd/MM HH:mm", { locale: ptBR })}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const latestValue = getDisplayValue() || 0;
  const dataPointCount = chartData.length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">{metricName}</CardTitle>
            <CardDescription>
              {resourceName ? `${resourceName} • ` : ''}{PERIOD_CONFIG[period].label} • {dataPointCount} pontos
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <ChartViewSwitcher currentView={view} availableViews={availableViews} onViewChange={changeView} />
            <div className="text-right">
              <p className="text-2xl font-semibold">
                {formatMetricValue(metricName, latestValue)}
              </p>
              <p className="text-xs text-muted-foreground">{unit}</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <MultiViewChart
          data={chartData}
          series={[{ dataKey: 'value', name: metricName, color: 'hsl(var(--primary))' }]}
          view={view}
          xAxisKey="displayTime"
          height={height}
          currencySymbol=""
          formatValue={(v) => `${formatMetricValue(metricName, v)} ${unit}`}
          formatTooltip={(value) => [`${formatMetricValue(metricName, value)} ${unit}`, metricName]}
          gradients={{
            'metric-gradient': {
              from: 'hsl(var(--primary))',
              to: 'hsl(var(--primary))',
              fromOpacity: 0.3,
              toOpacity: 0,
            },
          }}
        />
      </CardContent>
    </Card>
  );
};

export default ResourceMetricsChart;
