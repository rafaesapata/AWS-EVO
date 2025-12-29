import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/aws/api-client";
import { History, TrendingDown, TrendingUp, FileText, Eye, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface CloudTrailAnalysis {
  id: string;
  organization_id: string;
  aws_account_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  hours_back: number;
  max_results: number;
  events_processed: number | null;
  events_saved: number | null;
  critical_count: number | null;
  high_count: number | null;
  medium_count: number | null;
  low_count: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface CloudTrailAnalysisHistoryProps {
  organizationId: string;
  accountId?: string;
  onViewAnalysis?: (analysisId: string) => void;
}

export const CloudTrailAnalysisHistory = ({ organizationId, accountId, onViewAnalysis }: CloudTrailAnalysisHistoryProps) => {
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  const { data: analysisHistory, isLoading } = useQuery({
    queryKey: ['cloudtrail-analysis-history', organizationId, accountId, selectedPeriod],
    enabled: !!organizationId,
    staleTime: 10 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data as CloudTrailAnalysis[] | undefined;
      const hasRunning = data?.some(a => a.status === 'running' || a.status === 'pending');
      return hasRunning ? 5000 : false;
    },
    queryFn: async () => {
      let cutoffDate: string | null = null;
      if (selectedPeriod !== 'all') {
        const daysAgo = selectedPeriod === '7d' ? 7 : selectedPeriod === '30d' ? 30 : 90;
        const date = new Date();
        date.setDate(date.getDate() - daysAgo);
        cutoffDate = date.toISOString();
      }

      const filters: Record<string, any> = { organization_id: organizationId };
      if (accountId) filters.aws_account_id = accountId;

      const response = await apiClient.select<CloudTrailAnalysis>('cloudtrail_analyses', {
        eq: filters,
        order: { column: 'created_at', ascending: false },
        limit: 100
      });
      
      if (response.error) return [];
      let data = response.data || [];
      
      if (cutoffDate) {
        data = data.filter((a) => a.created_at >= cutoffDate!);
      }
      
      return data;
    }
  });

  const completedAnalyses = analysisHistory?.filter(a => a.status === 'completed') || [];
  
  const chartData = completedAnalyses.slice().reverse().map((analysis) => ({
    date: format(new Date(analysis.created_at), 'dd/MM', { locale: ptBR }),
    fullDate: format(new Date(analysis.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
    total: analysis.events_processed || 0,
    critical: analysis.critical_count || 0,
    high: analysis.high_count || 0,
    medium: analysis.medium_count || 0,
    low: analysis.low_count || 0,
  }));

  const latestAnalysis = completedAnalyses[0];
  const previousAnalysis = completedAnalyses[1];
  const criticalTrend = latestAnalysis && previousAnalysis 
    ? (latestAnalysis.critical_count || 0) - (previousAnalysis.critical_count || 0) 
    : 0;
  const highTrend = latestAnalysis && previousAnalysis 
    ? (latestAnalysis.high_count || 0) - (previousAnalysis.high_count || 0) 
    : 0;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running': return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default: return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Concluído</Badge>;
      case 'failed': return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">Falhou</Badge>;
      case 'running': return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">Executando</Badge>;
      default: return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Pendente</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Análises
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
              Histórico de Análises CloudTrail
            </CardTitle>
            <CardDescription>Evolução dos eventos de segurança ao longo do tempo</CardDescription>
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
        {latestAnalysis && previousAnalysis && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Eventos Críticos</p>
                    <p className="text-2xl font-bold text-red-500">{latestAnalysis.critical_count || 0}</p>
                  </div>
                  <div className={`flex items-center gap-1 ${criticalTrend < 0 ? 'text-green-500' : criticalTrend > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {criticalTrend < 0 ? <TrendingDown className="h-5 w-5" /> : criticalTrend > 0 ? <TrendingUp className="h-5 w-5" /> : null}
                    <span className="font-semibold">{Math.abs(criticalTrend)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Eventos de Alto Risco</p>
                    <p className="text-2xl font-bold text-orange-500">{latestAnalysis.high_count || 0}</p>
                  </div>
                  <div className={`flex items-center gap-1 ${highTrend < 0 ? 'text-green-500' : highTrend > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {highTrend < 0 ? <TrendingDown className="h-5 w-5" /> : highTrend > 0 ? <TrendingUp className="h-5 w-5" /> : null}
                    <span className="font-semibold">{Math.abs(highTrend)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {chartData.length > 0 ? (
          <div>
            <h4 className="text-sm font-medium mb-4">Evolução dos Eventos de Risco</h4>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorCriticalCT" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorHighCT" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorMediumCT" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#eab308" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#eab308" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip labelFormatter={(label) => chartData.find(d => d.date === label)?.fullDate || label} />
                <Legend />
                <Area type="monotone" dataKey="critical" stroke="#ef4444" fillOpacity={1} fill="url(#colorCriticalCT)" name="Críticos" />
                <Area type="monotone" dataKey="high" stroke="#f97316" fillOpacity={1} fill="url(#colorHighCT)" name="Altos" />
                <Area type="monotone" dataKey="medium" stroke="#eab308" fillOpacity={1} fill="url(#colorMediumCT)" name="Médios" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhuma análise encontrada no período selecionado</p>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Análises Recentes</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {analysisHistory?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma análise realizada ainda</p>
            ) : (
              analysisHistory?.map((analysis) => (
                <Card key={analysis.id} className="hover:bg-accent/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getStatusIcon(analysis.status)}
                          <span className="font-medium">
                            {format(new Date(analysis.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                          {getStatusBadge(analysis.status)}
                        </div>
                        {analysis.status === 'completed' && (
                          <div className="flex gap-2 flex-wrap">
                            <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
                              {analysis.critical_count || 0} Críticos
                            </Badge>
                            <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">
                              {analysis.high_count || 0} Altos
                            </Badge>
                            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                              {analysis.medium_count || 0} Médios
                            </Badge>
                            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                              {analysis.low_count || 0} Baixos
                            </Badge>
                          </div>
                        )}
                        {analysis.status === 'failed' && analysis.error_message && (
                          <p className="text-sm text-red-500 mt-1">{analysis.error_message}</p>
                        )}
                        {analysis.status === 'running' && (
                          <p className="text-sm text-muted-foreground mt-1">Análise em andamento...</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {analysis.status === 'completed' && (
                          <Badge variant="secondary" className="text-lg font-bold">
                            {analysis.events_processed || 0} eventos
                          </Badge>
                        )}
                        {onViewAnalysis && analysis.status === 'completed' && (
                          <Button size="sm" variant="ghost" onClick={() => onViewAnalysis(analysis.id)}>
                            <Eye className="h-4 w-4 mr-1" />
                            Ver Detalhes
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
