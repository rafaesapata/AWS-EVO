import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { History, TrendingDown, TrendingUp, Activity, AlertTriangle, Eye } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface AnomalyHistoryViewProps {
  organizationId: string;
  onViewScan?: (scanId: string) => void;
}

export const AnomalyHistoryView = ({ organizationId, onViewScan }: AnomalyHistoryViewProps) => {
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  const { data: detectionHistory, isLoading } = useQuery({
    queryKey: ['anomaly-detection-history', organizationId, selectedPeriod],
    queryFn: async () => {
      const query = apiClient.select(tableName, {
        select: '*',
        eq: filters,
        order: { column: 'created_at', ascending: false }
      });

      // Filter by period
      if (selectedPeriod !== 'all') {
        const daysAgo = selectedPeriod === '7d' ? 7 : selectedPeriod === '30d' ? 30 : 90;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
        query.gte('scan_date', cutoffDate.toISOString());
      }

      const response = await apiClient.select('anomaly_history', {
        eq: { organization_id: organizationId },
        order: { column: 'detected_at', ascending: false },
        limit: 50
      });
      const data = response.data;
      const error = response.error;

      
      return data || [];
    }
  });

  // Prepare chart data
  const chartData = detectionHistory?.slice().reverse().map(scan => ({
    date: format(new Date(scan.scan_date), 'dd/MM', { locale: ptBR }),
    fullDate: format(new Date(scan.scan_date), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
    total: scan.total_anomalies,
    critical: scan.critical_count,
    high: scan.high_count,
    medium: scan.medium_count,
    low: scan.low_count,
    costImpact: Number(scan.total_cost_impact) || 0
  })) || [];

  // Calculate trends
  const latestScan = detectionHistory?.[0];
  const previousScan = detectionHistory?.[1];
  
  const totalTrend = latestScan && previousScan 
    ? latestScan.total_anomalies - previousScan.total_anomalies 
    : 0;
  
  const criticalTrend = latestScan && previousScan 
    ? latestScan.critical_count - previousScan.critical_count 
    : 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Detecções
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico de Detecções de Anomalias
            </CardTitle>
            <CardDescription>
              Evolução das anomalias detectadas ao longo do tempo
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {(['7d', '30d', '90d', 'all'] as const).map((period) => (
              <Button
                key={period}
                variant={selectedPeriod === period ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedPeriod(period)}
              >
                {period === '7d' && '7 dias'}
                {period === '30d' && '30 dias'}
                {period === '90d' && '90 dias'}
                {period === 'all' && 'Todos'}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Trend Summary */}
        {latestScan && previousScan && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total de Anomalias</p>
                    <p className="text-2xl font-bold">{latestScan.total_anomalies}</p>
                  </div>
                  <div className={`flex items-center gap-1 ${totalTrend < 0 ? 'text-green-500' : totalTrend > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {totalTrend < 0 ? (
                      <TrendingDown className="h-5 w-5" />
                    ) : totalTrend > 0 ? (
                      <TrendingUp className="h-5 w-5" />
                    ) : null}
                    <span className="font-semibold">{Math.abs(totalTrend)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Anomalias Críticas</p>
                    <p className="text-2xl font-bold">{latestScan.critical_count}</p>
                  </div>
                  <div className={`flex items-center gap-1 ${criticalTrend < 0 ? 'text-green-500' : criticalTrend > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {criticalTrend < 0 ? (
                      <TrendingDown className="h-5 w-5" />
                    ) : criticalTrend > 0 ? (
                      <TrendingUp className="h-5 w-5" />
                    ) : null}
                    <span className="font-semibold">{Math.abs(criticalTrend)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div>
                  <p className="text-sm text-muted-foreground">Impacto de Custo</p>
                  <p className="text-2xl font-bold">${Number(latestScan.total_cost_impact || 0).toFixed(2)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Charts */}
        {chartData.length > 0 ? (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-4">Evolução das Anomalias</h4>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorCritical" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorHigh" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(label) => {
                      const item = chartData.find(d => d.date === label);
                      return item?.fullDate || label;
                    }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="critical" stroke="#ef4444" fillOpacity={1} fill="url(#colorCritical)" name="Críticas" />
                  <Area type="monotone" dataKey="high" stroke="#f97316" fillOpacity={1} fill="url(#colorHigh)" name="Altas" />
                  <Area type="monotone" dataKey="total" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorTotal)" name="Total" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-4">Impacto de Custo</h4>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(label) => {
                      const item = chartData.find(d => d.date === label);
                      return item?.fullDate || label;
                    }}
                    formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Impacto']}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="costImpact" stroke="#10b981" strokeWidth={2} name="Custo Extra" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhuma detecção encontrada no período selecionado</p>
          </div>
        )}

        {/* Detection List */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Detecções Recentes</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {detectionHistory?.map((scan) => (
              <Card key={scan.id} className="hover:bg-accent/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-primary" />
                        <span className="font-medium">
                          {format(new Date(scan.scan_date), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
                          {scan.critical_count} Críticas
                        </Badge>
                        <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">
                          {scan.high_count} Altas
                        </Badge>
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                          {scan.medium_count} Médias
                        </Badge>
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                          {scan.low_count} Baixas
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
                        <span>Custo: {scan.cost_anomalies_count}</span>
                        <span>Uso: {scan.usage_anomalies_count}</span>
                        <span>Performance: {scan.performance_anomalies_count}</span>
                        <span>Multi-dimensional: {scan.multi_dimensional_count}</span>
                      </div>
                      {scan.execution_time_seconds && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Tempo de execução: {Math.round(scan.execution_time_seconds)}s
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="secondary" className="text-lg font-bold">
                        {scan.total_anomalies}
                      </Badge>
                      <Badge variant="outline" className="text-green-600">
                        ${Number(scan.total_cost_impact || 0).toFixed(2)}
                      </Badge>
                      {onViewScan && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onViewScan(scan.id)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Ver Detalhes
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};