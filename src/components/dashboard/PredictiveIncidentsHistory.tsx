import { useQuery } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Calendar, TrendingUp, TrendingDown, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface PredictiveIncidentsHistoryProps {
  organizationId: string;
  onViewScan?: (scanId: string) => void;
}

export function PredictiveIncidentsHistory({ organizationId, onViewScan }: PredictiveIncidentsHistoryProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<string>("30d");

  const { data: history, isLoading } = useQuery({
    queryKey: ['predictive-incidents-history', organizationId, selectedPeriod],
    queryFn: async () => {
      let query = apiClient.select(tableName, {
        select: '*',
        eq: filters,
        order: { column: 'created_at', ascending: false }
      });

      // Apply time filter
      if (selectedPeriod !== 'all') {
        const days = parseInt(selectedPeriod);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        query = query.gte('scan_date', cutoffDate.toISOString());
      }

      const response = await apiClient.select('predictive_incidents', {
        eq: { organization_id: organizationId },
        order: { column: 'scan_date', ascending: false },
        limit: 50
      });
      const data = response.data;
      const error = response.error;
      
      return data || [];
    },
  });

  // Prepare chart data
  const chartData = history?.map(scan => ({
    date: format(new Date(scan.scan_date), 'dd/MM'),
    total: scan.total_predictions,
    critical: scan.critical_count,
    high: scan.high_risk_count,
  })).reverse() || [];

  // Calculate trends
  const latestScan = history?.[0];
  const previousScan = history?.[1];
  
  const totalTrend = latestScan && previousScan 
    ? ((latestScan.total_predictions - previousScan.total_predictions) / (previousScan.total_predictions || 1)) * 100
    : 0;
    
  const criticalTrend = latestScan && previousScan
    ? ((latestScan.critical_count - previousScan.critical_count) / (previousScan.critical_count || 1)) * 100
    : 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium text-muted-foreground">Nenhum histórico de predição encontrado</p>
          <p className="text-sm text-muted-foreground mt-2">Execute uma predição para começar a acompanhar o histórico</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Histórico de Predições</h3>
          <p className="text-sm text-muted-foreground">
            Acompanhe a evolução das predições de incidentes ao longo do tempo
          </p>
        </div>
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Selecionar período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="90d">Últimos 90 dias</SelectItem>
            <SelectItem value="all">Todo o período</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Trend Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total de Incidentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">{latestScan?.total_predictions || 0}</span>
              {totalTrend !== 0 && (
                <Badge variant={totalTrend > 0 ? "destructive" : "default"}>
                  {totalTrend > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                  {Math.abs(totalTrend).toFixed(1)}%
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">vs. predição anterior</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Incidentes Críticos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold text-destructive">{latestScan?.critical_count || 0}</span>
              {criticalTrend !== 0 && (
                <Badge variant={criticalTrend > 0 ? "destructive" : "default"}>
                  {criticalTrend > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                  {Math.abs(criticalTrend).toFixed(1)}%
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">vs. predição anterior</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Alto Risco</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold text-amber-600">{latestScan?.high_risk_count || 0}</span>
              <Clock className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">predições de alto risco</p>
          </CardContent>
        </Card>
      </div>

      {/* Trend Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evolução de Incidentes</CardTitle>
            <CardDescription>Total de incidentes previstos ao longo do tempo</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} name="Total" />
                <Line type="monotone" dataKey="critical" stroke="hsl(var(--destructive))" strokeWidth={2} name="Críticos" />
                <Line type="monotone" dataKey="high" stroke="hsl(var(--warning))" strokeWidth={2} name="Alto Risco" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Taxa de Execução</CardTitle>
            <CardDescription>Tempo de execução das predições</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={history?.map(scan => ({
                date: format(new Date(scan.scan_date), 'dd/MM'),
                time: scan.execution_time_seconds || 0
              })).reverse() || []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Area type="monotone" dataKey="time" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} name="Tempo (s)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Scan List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Predições Recentes</CardTitle>
          <CardDescription>Histórico detalhado de todas as execuções de predição</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {history.map((scan) => (
              <div 
                key={scan.id}
                className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {format(new Date(scan.scan_date), "dd/MM/yyyy 'às' HH:mm")}
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="outline" className="bg-background">
                      {scan.total_predictions} predições
                    </Badge>
                    {scan.critical_count > 0 && (
                      <Badge variant="destructive">
                        {scan.critical_count} críticos
                      </Badge>
                    )}
                    {scan.high_risk_count > 0 && (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-600/20">
                        {scan.high_risk_count} alto risco
                      </Badge>
                    )}
                    {scan.execution_time_seconds && (
                      <Badge variant="outline">
                        <Clock className="h-3 w-3 mr-1" />
                        {scan.execution_time_seconds}s
                      </Badge>
                    )}
                  </div>

                  {scan.message && (
                    <p className="text-xs text-muted-foreground mt-2">{scan.message}</p>
                  )}
                </div>

                {onViewScan && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => onViewScan(scan.id)}
                  >
                    Ver Detalhes
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}