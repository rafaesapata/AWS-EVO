import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { History, TrendingDown, TrendingUp, Shield, Eye } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface SecurityAnalysisHistoryProps {
  organizationId: string;
  accountId?: string;
  onViewScan?: (scanId: string) => void;
}

export const SecurityAnalysisHistory = ({ organizationId, accountId, onViewScan }: SecurityAnalysisHistoryProps) => {
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  const { data: scanHistory, isLoading } = useQuery({
    queryKey: ['security-analysis-history', organizationId, accountId, selectedPeriod],
    enabled: !!organizationId,
    queryFn: async () => {
      // Calculate cutoff date if needed
      let cutoffDate: string | null = null;
      if (selectedPeriod !== 'all') {
        const daysAgo = selectedPeriod === '7d' ? 7 : selectedPeriod === '30d' ? 30 : 90;
        const date = new Date();
        date.setDate(date.getDate() - daysAgo);
        cutoffDate = date.toISOString();
      }

      // Execute query - use security_scans table (the actual table name)
      const result = await apiClient.select('security_scans', {
        select: '*',
        eq: { organization_id: organizationId },
        order: { created_at: 'desc' },
        limit: 50
      });
      
      if (result.error) throw new Error(getErrorMessage(result.error));
      
      // Apply client-side filters for accountId and date
      // Map fields from actual schema to expected format
      let filtered = (result.data || []).map((scan: any) => ({
        ...scan,
        scan_date: scan.started_at || scan.created_at,
        total_findings: scan.findings_count || 0,
        findings_summary: scan.results || {},
      })) as any[];
      
      if (accountId) {
        filtered = filtered.filter((s: any) => s.aws_account_id === accountId);
      }
      if (cutoffDate) {
        filtered = filtered.filter((s: any) => (s.scan_date || s.created_at) >= cutoffDate);
      }
      
      return filtered;
    }
  });

  // Prepare chart data
  const chartData = scanHistory?.slice().reverse().map(scan => {
    // Calculate security score based on findings
    // Formula: 100 - (critical*10 + high*5 + medium*2 + low*0.5), min 0
    const critical = scan.critical_count || 0;
    const high = scan.high_count || 0;
    const medium = scan.medium_count || 0;
    const low = scan.low_count || 0;
    const penalty = (critical * 10) + (high * 5) + (medium * 2) + (low * 0.5);
    const calculatedScore = Math.max(0, Math.round(100 - penalty));
    
    return {
      date: format(new Date(scan.scan_date), 'dd/MM', { locale: ptBR }),
      fullDate: format(new Date(scan.scan_date), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
      total: scan.total_findings,
      critical,
      high,
      medium,
      low,
      score: (scan.findings_summary as any)?.overall_score || calculatedScore
    };
  }) || [];

  // Calculate trends
  const latestScan = scanHistory?.[0];
  const previousScan = scanHistory?.[1];
  
  const totalTrend = latestScan && previousScan 
    ? latestScan.total_findings - previousScan.total_findings 
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
            Histórico de Análises de Segurança
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary icon-pulse" />
              Histórico de Análises de Segurança AWS
            </CardTitle>
            <CardDescription>
              Evolução das vulnerabilidades ao longo do tempo
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {(['7d', '30d', '90d', 'all'] as const).map((period) => (
              <Button
                key={period}
                variant={selectedPeriod === period ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedPeriod(period)}
                className={selectedPeriod !== period ? 'glass' : 'hover-glow'}
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
          <div className="grid grid-cols-2 gap-4 mb-6 animate-stagger">
            <Card className="glass border-primary/20 card-hover-lift">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total de Vulnerabilidades</p>
                    <p className="text-2xl font-bold tabular-nums">{latestScan.total_findings}</p>
                  </div>
                  <div className={`flex items-center gap-1 ${totalTrend < 0 ? 'text-green-500' : totalTrend > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {totalTrend < 0 ? (
                      <TrendingDown className="h-5 w-5 icon-bounce" />
                    ) : totalTrend > 0 ? (
                      <TrendingUp className="h-5 w-5 icon-pulse" />
                    ) : null}
                    <span className="font-semibold tabular-nums">{Math.abs(totalTrend)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className={`glass border-primary/20 card-hover-lift ${latestScan.critical_count > 0 ? 'glow-danger' : ''}`}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Vulnerabilidades Críticas</p>
                    <p className="text-2xl font-bold tabular-nums">{latestScan.critical_count}</p>
                  </div>
                  <div className={`flex items-center gap-1 ${criticalTrend < 0 ? 'text-green-500' : criticalTrend > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {criticalTrend < 0 ? (
                      <TrendingDown className="h-5 w-5 icon-bounce" />
                    ) : criticalTrend > 0 ? (
                      <TrendingUp className="h-5 w-5 icon-pulse" />
                    ) : null}
                    <span className="font-semibold tabular-nums">{Math.abs(criticalTrend)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Chart */}
        {chartData.length > 0 ? (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-4">Evolução das Vulnerabilidades</h4>
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
              <h4 className="text-sm font-medium mb-4">Score de Segurança</h4>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip 
                    labelFormatter={(label) => {
                      const item = chartData.find(d => d.date === label);
                      return item?.fullDate || label;
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="score" stroke="#10b981" strokeWidth={2} name="Score Geral" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhuma análise encontrada no período selecionado</p>
          </div>
        )}

        {/* Scan List */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Análises Recentes</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto animate-stagger">
            {scanHistory?.map((scan) => (
              <Card key={scan.id} className="glass border-primary/20 hover:bg-accent/50 transition-all hover:translate-x-1 card-hover-lift">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="h-4 w-4 text-primary icon-pulse" />
                        <span className="font-medium">
                          {format(new Date(scan.scan_date), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="outline" className={`bg-red-500/10 text-red-500 border-red-500/20 ${scan.critical_count > 0 ? 'alert-pulse' : ''}`}>
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
                      {scan.execution_time_seconds && (
                        <p className="text-xs text-muted-foreground mt-2 tabular-nums">
                          Tempo de execução: {Math.round(scan.execution_time_seconds)}s
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="secondary" className="text-lg font-bold tabular-nums">
                        {scan.total_findings}
                      </Badge>
                      {onViewScan && (scan.findings_summary as any)?.scan_id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onViewScan((scan.findings_summary as any).scan_id)}
                          className="hover-glow"
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
