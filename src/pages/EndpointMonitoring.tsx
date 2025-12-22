import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layout } from "@/components/Layout";
import { apiClient } from "@/integrations/aws/api-client";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { 
  Activity, 
  Globe, 
  CheckCircle, 
  XCircle, 
  Clock,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  BarChart3,
  Zap
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar } from "recharts";

interface EndpointHealth {
  id: string;
  endpoint_url: string;
  endpoint_name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  response_time: number;
  uptime_percentage: number;
  last_check: string;
  region: string;
  service_type: 'api_gateway' | 'load_balancer' | 'cloudfront' | 'custom';
  ssl_status: 'valid' | 'expiring' | 'expired' | 'invalid';
  ssl_expiry_date: string | null;
}

interface EndpointMetrics {
  endpoint_id: string;
  timestamp: string;
  response_time: number;
  status_code: number;
  availability: boolean;
  error_rate: number;
}

export default function EndpointMonitoring() {
  const { toast } = useToast();
  const { selectedAccountId } = useAwsAccount();
  const { data: organizationId } = useOrganization();
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');

  // Get endpoint health data
  const { data: endpoints, isLoading, refetch } = useQuery({
    queryKey: ['endpoint-health', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 1 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.select('endpoint_health', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId
        },
        order: { last_check: 'desc' }
      });

      if (response.error) {
        throw new Error(response.error);
      }

      return response.data || [];
    },
  });

  // Get endpoint metrics for charts
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['endpoint-metrics', organizationId, selectedAccountId, selectedTimeRange],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const hoursBack = selectedTimeRange === '24h' ? 24 : selectedTimeRange === '7d' ? 168 : 720;
      const startTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

      const response = await apiClient.select('endpoint_metrics', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId
        },
        gte: { timestamp: startTime.toISOString() },
        order: { timestamp: 'asc' }
      });

      if (response.error) {
        throw new Error(response.error);
      }

      return response.data || [];
    },
  });

  const handleRefresh = async () => {
    try {
      await refetch();
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

  // Calculate summary metrics
  const healthyCount = endpoints?.filter(e => e.status === 'healthy').length || 0;
  const degradedCount = endpoints?.filter(e => e.status === 'degraded').length || 0;
  const unhealthyCount = endpoints?.filter(e => e.status === 'unhealthy').length || 0;
  const totalCount = endpoints?.length || 0;
  const avgResponseTime = endpoints?.length > 0 
    ? endpoints.reduce((sum, e) => sum + e.response_time, 0) / endpoints.length 
    : 0;
  const avgUptime = endpoints?.length > 0 
    ? endpoints.reduce((sum, e) => sum + e.uptime_percentage, 0) / endpoints.length 
    : 0;

  // Prepare chart data
  const responseTimeData = metrics?.map(m => ({
    time: new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    response_time: m.response_time,
    availability: m.availability ? 100 : 0
  })) || [];

  return (
    <Layout 
      title="Monitoramento de Endpoints" 
      description="Monitore a saúde e performance dos seus endpoints e APIs"
      icon={<Activity className="h-7 w-7 text-white" />}
    >
      <div className="space-y-6">
      {/* Header */}
      <Card className="glass border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-6 w-6 text-primary" />
                Monitoramento de Endpoints
              </CardTitle>
              <CardDescription>
                Monitoramento em tempo real de APIs, Load Balancers e endpoints críticos
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                disabled={isLoading}
                className="glass"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? 'Atualizando...' : 'Atualizar'}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Endpoints</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">{totalCount}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saudáveis</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-green-500">{healthyCount}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Com Problemas</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-red-500">{unhealthyCount + degradedCount}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tempo de Resposta Médio</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{avgResponseTime.toFixed(0)}ms</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Uptime Médio</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="space-y-2">
                <div className="text-2xl font-bold">{avgUptime.toFixed(1)}%</div>
                <Progress value={avgUptime} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="glass">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          <TabsTrigger value="metrics">Métricas</TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Response Time Chart */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>Tempo de Resposta</CardTitle>
                <CardDescription>Últimas {selectedTimeRange}</CardDescription>
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
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
                    Nenhum dado de métrica disponível
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Status Distribution */}
            <Card className="glass border-primary/20">
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
                        Saudáveis
                      </span>
                      <span className="font-medium">{healthyCount}</span>
                    </div>
                    <Progress value={totalCount > 0 ? (healthyCount / totalCount) * 100 : 0} className="h-2" />
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
                        Não Saudáveis
                      </span>
                      <span className="font-medium">{unhealthyCount}</span>
                    </div>
                    <Progress value={totalCount > 0 ? (unhealthyCount / totalCount) * 100 : 0} className="h-2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="endpoints" className="space-y-4">
          <Card className="glass border-primary/20">
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
                          {getStatusIcon(endpoint.status)}
                          <div className="space-y-1">
                            <h4 className="font-semibold">{endpoint.endpoint_name}</h4>
                            <p className="text-sm text-muted-foreground">{endpoint.endpoint_url}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{endpoint.service_type.replace('_', ' ').toUpperCase()}</span>
                              <span>•</span>
                              <span>{endpoint.region}</span>
                              <span>•</span>
                              <span>Última verificação: {new Date(endpoint.last_check).toLocaleString('pt-BR')}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right space-y-2">
                          {getStatusBadge(endpoint.status)}
                          {getSSLBadge(endpoint.ssl_status)}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Tempo de Resposta:</span>
                          <div className="font-medium">{endpoint.response_time}ms</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Uptime:</span>
                          <div className="font-medium">{endpoint.uptime_percentage.toFixed(2)}%</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">SSL Expira:</span>
                          <div className="font-medium">
                            {endpoint.ssl_expiry_date 
                              ? new Date(endpoint.ssl_expiry_date).toLocaleDateString('pt-BR')
                              : 'N/A'
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Globe className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">Nenhum endpoint configurado</h3>
                  <p className="text-muted-foreground">
                    Configure endpoints para começar o monitoramento.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Métricas Detalhadas</CardTitle>
              <CardDescription>Análise histórica de performance dos endpoints</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Métricas detalhadas em desenvolvimento</h3>
                  <p>Análises avançadas de performance serão exibidas aqui.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Configuração de Alertas</CardTitle>
              <CardDescription>Configure alertas para endpoints críticos</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Zap className="h-12 w-12 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Configuração de alertas em desenvolvimento</h3>
                  <p>Sistema de alertas personalizados será implementado em breve.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </Layout>
  );
}