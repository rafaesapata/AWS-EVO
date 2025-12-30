import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { History, TrendingDown, TrendingUp, Shield, Eye } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface WellArchitectedHistoryProps {
  organizationId: string;
  onViewScan?: (scanId: string) => void;
}

export const WellArchitectedHistory = ({ organizationId, onViewScan }: WellArchitectedHistoryProps) => {
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  const { data: scanHistory, isLoading } = useQuery({
    queryKey: ['well-architected-history', organizationId, selectedPeriod],
    queryFn: async () => {
      const response = await apiClient.select('well_architected_history', {
        eq: { organization_id: organizationId },
        order: { column: 'scan_date', ascending: false },
        limit: 50
      });
      
      if (response.error) throw response.error;
      return response.data || [];
    }
  });

  // Prepare chart data
  const chartData = scanHistory?.slice().reverse().map(scan => ({
    date: format(new Date(scan.scan_date), 'dd/MM', { locale: ptBR }),
    fullDate: format(new Date(scan.scan_date), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
    overallScore: scan.overall_score,
    opsExcellence: scan.operational_excellence_score,
    security: scan.security_score,
    reliability: scan.reliability_score,
    performance: scan.performance_efficiency_score,
    cost: scan.cost_optimization_score,
    sustainability: scan.sustainability_score,
    critical: scan.critical_issues,
    high: scan.high_issues
  })) || [];

  // Calculate trends
  const latestScan = scanHistory?.[0];
  const previousScan = scanHistory?.[1];
  
  const scoreTrend = latestScan && previousScan 
    ? latestScan.overall_score - previousScan.overall_score 
    : 0;
  
  const criticalTrend = latestScan && previousScan 
    ? latestScan.critical_issues - previousScan.critical_issues 
    : 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico Well-Architected
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
              Histórico de Análises Well-Architected
            </CardTitle>
            <CardDescription>
              Evolução dos scores ao longo do tempo
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
                    <p className="text-sm text-muted-foreground">Score Geral</p>
                    <p className="text-2xl font-bold tabular-nums">{latestScan.overall_score.toFixed(1)}</p>
                  </div>
                  <div className={`flex items-center gap-1 ${scoreTrend > 0 ? 'text-green-500' : scoreTrend < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {scoreTrend > 0 ? (
                      <TrendingUp className="h-5 w-5 icon-bounce" />
                    ) : scoreTrend < 0 ? (
                      <TrendingDown className="h-5 w-5 icon-pulse" />
                    ) : null}
                    <span className="font-semibold tabular-nums">{Math.abs(scoreTrend).toFixed(1)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className={`glass border-primary/20 card-hover-lift ${latestScan.critical_issues > 0 ? 'glow-danger' : ''}`}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Issues Críticos</p>
                    <p className="text-2xl font-bold tabular-nums">{latestScan.critical_issues}</p>
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

        {/* Charts */}
        {chartData.length > 0 ? (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-4">Evolução do Score Geral</h4>
              <ResponsiveContainer width="100%" height={250}>
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
                  <Line type="monotone" dataKey="overallScore" stroke="#10b981" strokeWidth={2} name="Score Geral" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-4">Score por Pilar</h4>
              <ResponsiveContainer width="100%" height={300}>
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
                  <Line type="monotone" dataKey="opsExcellence" stroke="#3b82f6" strokeWidth={2} name="Excelência Operacional" />
                  <Line type="monotone" dataKey="security" stroke="#ef4444" strokeWidth={2} name="Segurança" />
                  <Line type="monotone" dataKey="reliability" stroke="#f59e0b" strokeWidth={2} name="Confiabilidade" />
                  <Line type="monotone" dataKey="performance" stroke="#8b5cf6" strokeWidth={2} name="Performance" />
                  <Line type="monotone" dataKey="cost" stroke="#10b981" strokeWidth={2} name="Custos" />
                  <Line type="monotone" dataKey="sustainability" stroke="#06b6d4" strokeWidth={2} name="Sustentabilidade" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-4">Evolução dos Issues</h4>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorCriticalWA" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorHighWA" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
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
                  <Area type="monotone" dataKey="critical" stroke="#ef4444" fillOpacity={1} fill="url(#colorCriticalWA)" name="Críticos" />
                  <Area type="monotone" dataKey="high" stroke="#f97316" fillOpacity={1} fill="url(#colorHighWA)" name="Altos" />
                </AreaChart>
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
                      <div className="flex gap-2 flex-wrap mb-2">
                        <Badge variant="outline" className={`bg-green-500/10 text-green-500 border-green-500/20 ${scan.overall_score >= 80 ? 'glow-success' : ''}`}>
                          Score: <span className="tabular-nums">{scan.overall_score.toFixed(1)}</span>
                        </Badge>
                        <Badge variant="outline" className={`bg-red-500/10 text-red-500 border-red-500/20 ${scan.critical_issues > 0 ? 'alert-pulse' : ''}`}>
                          <span className="tabular-nums">{scan.critical_issues}</span> Críticos
                        </Badge>
                        <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">
                          <span className="tabular-nums">{scan.high_issues}</span> Altos
                        </Badge>
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                          <span className="tabular-nums">{scan.medium_issues}</span> Médios
                        </Badge>
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                          <span className="tabular-nums">{scan.low_issues}</span> Baixos
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p className="tabular-nums">Checks: {scan.checks_passed} aprovados / {scan.checks_failed} reprovados</p>
                        {scan.execution_time_seconds && (
                          <p className="tabular-nums">Tempo de execução: {Math.round(scan.execution_time_seconds)}s</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="secondary" className="text-lg font-bold tabular-nums">
                        {scan.total_checks}
                      </Badge>
                      {onViewScan && scan.scan_id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onViewScan(scan.scan_id!)}
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