import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layout } from "@/components/Layout";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useOrganization } from "@/hooks/useOrganization";
import { 
  Activity, 
  Globe, 
  CheckCircle, 
  XCircle, 
  Clock,
  AlertTriangle,
  RefreshCw,
  BarChart3,
  Zap,
  ShieldCheck,
  Bell,
  CheckCheck,
  Eye
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, AreaChart, Area, BarChart, Bar } from "recharts";
import { CreateEndpointDialog } from "@/components/endpoint-monitoring/CreateEndpointDialog";

interface MonitoredEndpoint {
  id: string;
  organization_id: string;
  name: string;
  url: string;
  timeout: number;
  is_active: boolean;
  alert_on_failure: boolean;
  monitor_ssl: boolean;
  ssl_alert_days: number;
  ssl_expiry_date: string | null;
  ssl_issuer: string | null;
  ssl_valid: boolean | null;
  last_status: string | null;
  last_checked_at: string | null;
  last_response_time: number | null;
  created_at: string;
  check_history?: EndpointCheckHistory[];
}

interface EndpointCheckHistory {
  id: string;
  endpoint_id: string;
  status: string;
  status_code: number | null;
  response_time: number;
  error: string | null;
  checked_at: string;
}

interface Alert {
  id: string;
  organization_id: string;
  severity: string;
  title: string;
  message: string;
  metadata: any;
  triggered_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

export default function EndpointMonitoring() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { data: organizationId } = useOrganization();
  const queryClient = useQueryClient();

  // Get monitored endpoints
  const { data: endpoints, isLoading, refetch } = useQuery({
    queryKey: ['monitored-endpoints', organizationId],
    enabled: !!organizationId,
    staleTime: 1 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.post<MonitoredEndpoint[]>('/api/functions/monitored-endpoints', {});

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data || [];
    },
  });

  // Get alerts
  const { data: alerts, isLoading: alertsLoading, refetch: refetchAlerts } = useQuery({
    queryKey: ['endpoint-alerts', organizationId],
    enabled: !!organizationId,
    staleTime: 1 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.post<Alert[]>('/api/functions/alerts', {});

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data || [];
    },
  });

  // Mutation for acknowledging/resolving alerts
  const alertMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'acknowledge' | 'resolve' }) => {
      const response = await apiClient.post('/api/functions/alerts', { id, action });
      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['endpoint-alerts'] });
      toast({
        title: "Alerta atualizado",
        description: "O status do alerta foi atualizado com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleRefresh = async () => {
    try {
      await Promise.all([refetch(), refetchAlerts()]);
      toast({
        title: "Dados atualizados",
        description: "O monitoramento de endpoints foi atualizado.",
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar os dados.",
        variant: "destructive"
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'degraded': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'unhealthy': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy': return <Badge className="bg-green-500">Saudável</Badge>;
      case 'degraded': return <Badge variant="secondary">Degradado</Badge>;
      case 'unhealthy': return <Badge variant="destructive">Não Saudável</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSSLBadge = (sslStatus: string) => {
    switch (sslStatus) {
      case 'valid': return <Badge className="bg-green-500">SSL Válido</Badge>;
      case 'expiring': return <Badge variant="secondary">SSL Expirando</Badge>;
      case 'expired': return <Badge variant="destructive">SSL Expirado</Badge>;
      case 'invalid': return <Badge variant="destructive">SSL Inválido</Badge>;
      default: return <Badge variant="outline">SSL Desconhecido</Badge>;
    }
  };

  const getSSLDaysRemaining = (expiryDate: string | null): number | null => {
    if (!expiryDate) return null;
    const expiry = new Date(expiryDate);
    const now = new Date();
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getSSLDaysBadge = (expiryDate: string | null) => {
    const days = getSSLDaysRemaining(expiryDate);
    if (days === null) return null;
    
    if (days <= 0) {
      return (
        <Badge variant="destructive" className="gap-1">
          <ShieldCheck className="h-3 w-3" />
          SSL Expirado
        </Badge>
      );
    } else if (days <= 7) {
      return (
        <Badge variant="destructive" className="gap-1">
          <ShieldCheck className="h-3 w-3" />
          {days} {days === 1 ? 'dia' : 'dias'} restantes
        </Badge>
      );
    } else if (days <= 30) {
      return (
        <Badge variant="secondary" className="gap-1 bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
          <ShieldCheck className="h-3 w-3" />
          {days} dias restantes
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-600 border-green-500/30">
          <ShieldCheck className="h-3 w-3" />
          {days} dias restantes
        </Badge>
      );
    }
  };

  // Calculate summary metrics
  const upCount = endpoints?.filter(e => e.last_status === 'up').length || 0;
  const degradedCount = endpoints?.filter(e => e.last_status === 'degraded').length || 0;
  const downCount = endpoints?.filter(e => e.last_status === 'down').length || 0;
  const totalCount = endpoints?.length || 0;
  const activeCount = endpoints?.filter(e => e.is_active).length || 0;
  const avgResponseTime = endpoints?.length > 0 
    ? endpoints.filter(e => e.last_response_time).reduce((sum, e) => sum + (e.last_response_time || 0), 0) / endpoints.filter(e => e.last_response_time).length 
    : 0;

  // Prepare chart data from check history
  // CORREÇÃO: Ordenar por timestamp e agrupar por minuto para evitar dados bagunçados
  const responseTimeData = (() => {
    if (!endpoints || endpoints.length === 0) return [];
    
    // Coletar todos os checks de todos os endpoints
    const allChecks = endpoints.flatMap(e => 
      (e.check_history || []).map(h => ({
        timestamp: new Date(h.checked_at).getTime(),
        time: new Date(h.checked_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        response_time: h.response_time,
        availability: h.status === 'up' ? 100 : 0
      }))
    );
    
    // Ordenar por timestamp (mais antigo primeiro)
    allChecks.sort((a, b) => a.timestamp - b.timestamp);
    
    // Agrupar por minuto (média de todos os checks no mesmo minuto)
    const groupedByMinute = new Map<string, { response_times: number[], availabilities: number[] }>();
    
    allChecks.forEach(check => {
      const key = check.time;
      if (!groupedByMinute.has(key)) {
        groupedByMinute.set(key, { response_times: [], availabilities: [] });
      }
      groupedByMinute.get(key)!.response_times.push(check.response_time);
      groupedByMinute.get(key)!.availabilities.push(check.availability);
    });
    
    // Calcular médias e criar array final
    const result = Array.from(groupedByMinute.entries()).map(([time, data]) => ({
      time,
      response_time: Math.round(data.response_times.reduce((sum, val) => sum + val, 0) / data.response_times.length),
      availability: Math.round(data.availabilities.reduce((sum, val) => sum + val, 0) / data.availabilities.length)
    }));
    
    // Pegar últimos 50 pontos (mais recentes)
    return result.slice(-50);
  })();

  return (
    <Layout 
      title={t('sidebar.endpoints', 'Monitoramento de Endpoints')} 
      description={t('endpointMonitoring.description', 'Monitoramento em tempo real de APIs, Load Balancers e endpoints críticos')}
      icon={<Activity className="h-4 w-4" />}
    >
      <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
        <CreateEndpointDialog />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Endpoints</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-semibold">{totalCount}</div>
            )}
          </CardContent>
        </Card>

        <Card >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Online</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-semibold text-green-500">{upCount}</div>
            )}
          </CardContent>
        </Card>

        <Card >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Com Problemas</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-semibold text-red-500">{downCount + degradedCount}</div>
            )}
          </CardContent>
        </Card>

        <Card >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tempo de Resposta Médio</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-semibold">{avgResponseTime ? avgResponseTime.toFixed(0) : '-'}ms</div>
            )}
          </CardContent>
        </Card>

        <Card >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ativos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="space-y-2">
                <div className="text-2xl font-semibold">{activeCount}/{totalCount}</div>
                <Progress value={totalCount > 0 ? (activeCount / totalCount) * 100 : 0} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="glass-card-float">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          <TabsTrigger value="metrics">Métricas</TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Response Time Chart */}
            <Card >
              <CardHeader>
                <CardTitle>Tempo de Resposta</CardTitle>
                <CardDescription>Média agregada de todos os endpoints (últimos 50 pontos)</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : responseTimeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={responseTimeData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="time" 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number, name: string) => {
                          if (name === 'Tempo de Resposta (ms)') {
                            return [`${value}ms`, 'Tempo de Resposta'];
                          }
                          return [value, name];
                        }}
                        labelFormatter={(label) => `Horário: ${label}`}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="response_time" 
                        stroke="#3b82f6" 
                        strokeWidth={2}
                        name="Tempo de Resposta (ms)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    {t('endpointMonitoring.noMetricData', 'Nenhum dado de métrica disponível')}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Status Distribution */}
            <Card >
              <CardHeader>
                <CardTitle>Distribuição de Status</CardTitle>
                <CardDescription>Status atual dos endpoints</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        Online
                      </span>
                      <span className="font-medium">{upCount}</span>
                    </div>
                    <Progress value={totalCount > 0 ? (upCount / totalCount) * 100 : 0} className="h-2" />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        Degradados
                      </span>
                      <span className="font-medium">{degradedCount}</span>
                    </div>
                    <Progress value={totalCount > 0 ? (degradedCount / totalCount) * 100 : 0} className="h-2" />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-red-500" />
                        Offline
                      </span>
                      <span className="font-medium">{downCount}</span>
                    </div>
                    <Progress value={totalCount > 0 ? (downCount / totalCount) * 100 : 0} className="h-2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="endpoints" className="space-y-4">
          <Card >
            <CardHeader>
              <CardTitle>Lista de Endpoints</CardTitle>
              <CardDescription>Status detalhado de todos os endpoints monitorados</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : endpoints && endpoints.length > 0 ? (
                <div className="space-y-4">
                  {endpoints.map((endpoint) => (
                    <div key={endpoint.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          {getStatusIcon(endpoint.last_status || 'unknown')}
                          <div className="space-y-1">
                            <h4 className="font-semibold text-sm">{endpoint.name}</h4>
                            <p className="text-sm text-muted-foreground">{endpoint.url}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>Timeout: {endpoint.timeout}ms</span>
                              <span>•</span>
                              <span>{endpoint.is_active ? 'Ativo' : 'Inativo'}</span>
                              {endpoint.last_checked_at && (
                                <>
                                  <span>•</span>
                                  <span>Última verificação: {new Date(endpoint.last_checked_at).toLocaleString('pt-BR')}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right space-y-2 flex flex-col items-end gap-1">
                          {getStatusBadge(endpoint.last_status || 'unknown')}
                          {endpoint.is_active ? (
                            <Badge variant="outline" className="bg-green-500/10 text-green-600">Ativo</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-500/10 text-gray-600">Inativo</Badge>
                          )}
                          {endpoint.monitor_ssl && getSSLDaysBadge(endpoint.ssl_expiry_date)}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Tempo de Resposta:</span>
                          <div className="font-medium">{endpoint.last_response_time ? `${endpoint.last_response_time}ms` : '-'}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Alertas:</span>
                          <div className="font-medium">{endpoint.alert_on_failure ? 'Ativados' : 'Desativados'}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">SSL:</span>
                          <div className="font-medium">
                            {endpoint.monitor_ssl ? (
                              endpoint.ssl_expiry_date ? (
                                <span className={endpoint.ssl_valid ? 'text-green-600' : 'text-red-600'}>
                                  {new Date(endpoint.ssl_expiry_date).toLocaleDateString('pt-BR')}
                                  {endpoint.ssl_issuer && <span className="text-muted-foreground text-xs ml-1">({endpoint.ssl_issuer})</span>}
                                </span>
                              ) : 'Aguardando verificação'
                            ) : 'Não monitorado'}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Criado em:</span>
                          <div className="font-medium">{new Date(endpoint.created_at).toLocaleDateString('pt-BR')}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Globe className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">{t('endpointMonitoring.noEndpointsConfigured', 'Nenhum endpoint configurado')}</h3>
                  <p className="text-muted-foreground mb-4">
                    {t('endpointMonitoring.configureToStart', 'Configure endpoints para começar o monitoramento.')}
                  </p>
                  <CreateEndpointDialog />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4">
          <Card >
            <CardHeader>
              <CardTitle>Métricas Detalhadas</CardTitle>
              <CardDescription>Análise histórica de performance dos endpoints</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[400px] w-full" />
              ) : endpoints && endpoints.length > 0 ? (
                <div className="space-y-6">
                  {/* Response Time per Endpoint */}
                  <div>
                    <h4 className="text-sm font-medium mb-4">Tempo de Resposta por Endpoint</h4>
                    <div className="grid gap-4">
                      {endpoints.map((endpoint) => {
                        const history = endpoint.check_history || [];
                        const chartData = history.map(h => ({
                          time: new Date(h.checked_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                          response_time: h.response_time,
                          status: h.status
                        })).reverse();
                        
                        const avgTime = history.length > 0 
                          ? Math.round(history.reduce((sum, h) => sum + h.response_time, 0) / history.length)
                          : 0;
                        const uptime = history.length > 0
                          ? Math.round((history.filter(h => h.status === 'up').length / history.length) * 100)
                          : 0;
                        
                        return (
                          <div key={endpoint.id} className="border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                {getStatusIcon(endpoint.last_status || 'unknown')}
                                <span className="font-medium">{endpoint.name}</span>
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <span className="text-muted-foreground">Média: <span className="font-medium text-foreground">{avgTime}ms</span></span>
                                <span className="text-muted-foreground">Uptime: <span className={`font-medium ${uptime >= 99 ? 'text-green-600' : uptime >= 95 ? 'text-yellow-600' : 'text-red-600'}`}>{uptime}%</span></span>
                              </div>
                            </div>
                            {chartData.length > 0 ? (
                              <ResponsiveContainer width="100%" height={120}>
                                <AreaChart data={chartData}>
                                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                                  <Tooltip 
                                    contentStyle={{
                                      backgroundColor: 'hsl(var(--card))',
                                      border: '1px solid hsl(var(--border))',
                                      borderRadius: '8px',
                                    }}
                                  />
                                  <Area 
                                    type="monotone" 
                                    dataKey="response_time" 
                                    stroke="#3b82f6" 
                                    fill="#3b82f6" 
                                    fillOpacity={0.2}
                                    name="Tempo (ms)"
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            ) : (
                              <div className="h-[120px] flex items-center justify-center text-muted-foreground text-sm">
                                {t('endpointMonitoring.noHistoryAvailable', 'Nenhum histórico disponível')}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* Summary Stats */}
                  <div className="grid grid-cols-4 gap-4">
                    <Card >
                      <CardContent className="pt-4">
                        <div className="text-2xl font-semibold text-green-600">{upCount}</div>
                        <div className="text-sm text-muted-foreground">Endpoints Online</div>
                      </CardContent>
                    </Card>
                    <Card >
                      <CardContent className="pt-4">
                        <div className="text-2xl font-semibold">{avgResponseTime ? avgResponseTime.toFixed(0) : '-'}ms</div>
                        <div className="text-sm text-muted-foreground">Tempo Médio</div>
                      </CardContent>
                    </Card>
                    <Card >
                      <CardContent className="pt-4">
                        <div className="text-2xl font-semibold text-blue-600">
                          {endpoints.filter(e => e.monitor_ssl && e.ssl_valid).length}/{endpoints.filter(e => e.monitor_ssl).length}
                        </div>
                        <div className="text-sm text-muted-foreground">SSL Válidos</div>
                      </CardContent>
                    </Card>
                    <Card >
                      <CardContent className="pt-4">
                        <div className="text-2xl font-semibold text-yellow-600">
                          {alerts?.filter(a => !a.resolved_at).length || 0}
                        </div>
                        <div className="text-sm text-muted-foreground">Alertas Ativos</div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : (
                <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">{t('endpointMonitoring.noEndpointsConfigured', 'Nenhum endpoint configurado')}</h3>
                    <p>{t('endpointMonitoring.configureToViewMetrics', 'Configure endpoints para visualizar métricas.')}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Alertas de Endpoints
              </CardTitle>
              <CardDescription>Alertas gerados pelo monitoramento de endpoints e SSL</CardDescription>
            </CardHeader>
            <CardContent>
              {alertsLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : alerts && alerts.length > 0 ? (
                <div className="space-y-4">
                  {/* Filter tabs */}
                  <div className="flex gap-2 mb-4">
                    <Badge variant="outline" className="cursor-pointer">
                      Todos ({alerts.length})
                    </Badge>
                    <Badge variant="outline" className="cursor-pointer bg-red-500/10 text-red-600">
                      Ativos ({alerts.filter(a => !a.resolved_at).length})
                    </Badge>
                    <Badge variant="outline" className="cursor-pointer bg-green-500/10 text-green-600">
                      Resolvidos ({alerts.filter(a => a.resolved_at).length})
                    </Badge>
                  </div>
                  
                  {alerts.map((alert) => (
                    <div key={alert.id} className={`border rounded-lg p-4 ${alert.resolved_at ? 'opacity-60' : ''}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          {alert.severity === 'CRITICAL' ? (
                            <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
                          ) : alert.severity === 'HIGH' ? (
                            <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5" />
                          ) : (
                            <Bell className="h-5 w-5 text-yellow-500 mt-0.5" />
                          )}
                          <div className="space-y-1">
                            <h4 className="font-semibold text-sm">{alert.title}</h4>
                            <p className="text-sm text-muted-foreground">{alert.message}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>Disparado: {new Date(alert.triggered_at).toLocaleString('pt-BR')}</span>
                              {alert.acknowledged_at && (
                                <>
                                  <span>•</span>
                                  <span>Reconhecido: {new Date(alert.acknowledged_at).toLocaleString('pt-BR')}</span>
                                </>
                              )}
                              {alert.resolved_at && (
                                <>
                                  <span>•</span>
                                  <span>Resolvido: {new Date(alert.resolved_at).toLocaleString('pt-BR')}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={alert.severity === 'CRITICAL' ? 'destructive' : alert.severity === 'HIGH' ? 'secondary' : 'outline'}
                          >
                            {alert.severity}
                          </Badge>
                          {!alert.resolved_at && (
                            <div className="flex gap-1">
                              {!alert.acknowledged_at && (
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => alertMutation.mutate({ id: alert.id, action: 'acknowledge' })}
                                  disabled={alertMutation.isPending}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  Reconhecer
                                </Button>
                              )}
                              <Button 
                                size="sm" 
                                variant="outline"
                                className="text-green-600"
                                onClick={() => alertMutation.mutate({ id: alert.id, action: 'resolve' })}
                                disabled={alertMutation.isPending}
                              >
                                <CheckCheck className="h-4 w-4 mr-1" />
                                Resolver
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                    <h3 className="text-lg font-semibold mb-2">{t('endpointMonitoring.noAlerts', 'Nenhum alerta')}</h3>
                    <p>{t('endpointMonitoring.allEndpointsNormal', 'Todos os endpoints estão funcionando normalmente.')}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </Layout>
  );
}