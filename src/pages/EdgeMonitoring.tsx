import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { Layout } from "@/components/Layout";
import { 
  Shield, 
  Globe, 
  Zap, 
  BarChart3,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Cloud,
  Lock,
  Activity,
  Search
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, PieChart, Pie, Cell } from "recharts";

interface EdgeService {
  id: string;
  service_type: 'cloudfront' | 'waf' | 'load_balancer';
  service_name: string;
  service_id: string;
  status: 'active' | 'inactive' | 'error';
  region: string;
  requests_per_minute: number;
  cache_hit_rate: number;
  error_rate: number;
  blocked_requests: number;
  last_updated: string;
}

interface EdgeMetrics {
  service_id: string;
  timestamp: string;
  requests: number;
  cache_hits: number;
  cache_misses: number;
  blocked_requests: number;
  response_time: number;
  bandwidth_gb: number;
}

export default function EdgeMonitoring() {
  const { toast } = useToast();
  const { selectedAccountId } = useAwsAccount();
  const { data: organizationId } = useOrganization();
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');
  const queryClient = useQueryClient();

  // Mutation to discover edge services
  const discoverMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/api/functions/fetch-edge-services', {
        accountId: selectedAccountId,
        regions: ['us-east-1', 'us-west-2', 'eu-west-1', 'sa-east-1']
      });
      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }
      return response.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['edge-services'] });
      queryClient.invalidateQueries({ queryKey: ['edge-metrics'] });
      toast({
        title: "Descoberta concluída",
        description: `Encontrados ${data?.servicesFound || 0} serviços de borda.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro na descoberta",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Get edge services data
  const { data: edgeServices, isLoading, refetch } = useQuery({
    queryKey: ['edge-services', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.select('edge_services', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId
        },
        order: { column: 'last_updated', ascending: false }
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data || [];
    },
  });

  // Get edge metrics for charts
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['edge-metrics', organizationId, selectedAccountId, selectedTimeRange],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const hoursBack = selectedTimeRange === '24h' ? 24 : selectedTimeRange === '7d' ? 168 : 720;
      const startTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

      const response = await apiClient.select('edge_metrics', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId
        },
        gte: { timestamp: startTime.toISOString() },
        order: { column: 'timestamp', ascending: true }
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data || [];
    },
  });

  const handleRefresh = async () => {
    try {
      await refetch();
      toast({
        title: "Dados atualizados",
        description: "O monitoramento de borda foi atualizado.",
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar os dados.",
        variant: "destructive"
      });
    }
  };

  const getServiceIcon = (serviceType: string) => {
    switch (serviceType) {
      case 'cloudfront': return <Cloud className="h-5 w-5 text-blue-500" />;
      case 'waf': return <Shield className="h-5 w-5 text-red-500" />;
      case 'load_balancer': return <Zap className="h-5 w-5 text-green-500" />;
      default: return <Globe className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge className="bg-green-500">Ativo</Badge>;
      case 'inactive': return <Badge variant="secondary">Inativo</Badge>;
      case 'error': return <Badge variant="destructive">Erro</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Calculate summary metrics
  const totalRequests = edgeServices?.reduce((sum, service) => sum + service.requests_per_minute, 0) || 0;
  const avgCacheHitRate = edgeServices?.length > 0 
    ? edgeServices.reduce((sum, service) => sum + service.cache_hit_rate, 0) / edgeServices.length 
    : 0;
  const totalBlockedRequests = edgeServices?.reduce((sum, service) => sum + service.blocked_requests, 0) || 0;
  const avgErrorRate = edgeServices?.length > 0 
    ? edgeServices.reduce((sum, service) => sum + service.error_rate, 0) / edgeServices.length 
    : 0;

  // Prepare chart data
  const requestsData = metrics?.map(m => ({
    time: new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    requests: m.requests,
    blocked: m.blocked_requests,
    cache_hit_rate: m.cache_hits / (m.cache_hits + m.cache_misses) * 100
  })) || [];

  const serviceDistribution = edgeServices?.reduce((acc, service) => {
    const type = service.service_type;
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const pieData = Object.entries(serviceDistribution).map(([type, count]) => ({
    name: type.replace('_', ' ').toUpperCase(),
    value: count,
    color: type === 'cloudfront' ? '#3b82f6' : type === 'waf' ? '#ef4444' : '#10b981'
  }));

  const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b'];

  return (
    <Layout 
      title="Monitoramento de Borda" 
      description="CloudFront, WAF e Load Balancers - Serviços de borda AWS"
      icon={<Globe className="h-5 w-5 text-white" />}
    >
      <div className="space-y-6">
        {/* Action Buttons */}
        <div className="flex justify-end gap-2">
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button 
            onClick={() => discoverMutation.mutate()}
            disabled={discoverMutation.isPending || !selectedAccountId}
          >
            <Search className={`h-4 w-4 mr-2 ${discoverMutation.isPending ? 'animate-spin' : ''}`} />
            {discoverMutation.isPending ? 'Descobrindo...' : 'Descobrir Serviços'}
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Requests/min</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{totalRequests.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cache Hit Rate</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="space-y-2">
                <div className="text-2xl font-bold">{avgCacheHitRate.toFixed(1)}%</div>
                <Progress value={avgCacheHitRate} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Requests Bloqueados</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-red-500">{totalBlockedRequests.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Taxa de Erro</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{avgErrorRate.toFixed(2)}%</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="glass">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="cloudfront">CloudFront</TabsTrigger>
          <TabsTrigger value="waf">WAF</TabsTrigger>
          <TabsTrigger value="loadbalancer">Load Balancers</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Requests Chart */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>Requests e Bloqueios</CardTitle>
                <CardDescription>Últimas {selectedTimeRange}</CardDescription>
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : requestsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={requestsData}>
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
                        dataKey="requests" 
                        stroke="#3b82f6" 
                        strokeWidth={2}
                        name="Requests"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="blocked" 
                        stroke="#ef4444" 
                        strokeWidth={2}
                        name="Bloqueados"
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

            {/* Service Distribution */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>Distribuição de Serviços</CardTitle>
                <CardDescription>Tipos de serviços de borda configurados</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Nenhum serviço configurado
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Services List */}
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle>Serviços de Borda</CardTitle>
              <CardDescription>Status e métricas dos serviços configurados</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : edgeServices && edgeServices.length > 0 ? (
                <div className="space-y-4">
                  {edgeServices.map((service) => (
                    <div key={service.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          {getServiceIcon(service.service_type)}
                          <div className="space-y-1">
                            <h4 className="font-semibold">{service.service_name}</h4>
                            <p className="text-sm text-muted-foreground">{service.service_id}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{service.service_type.replace('_', ' ').toUpperCase()}</span>
                              <span>•</span>
                              <span>{service.region}</span>
                              <span>•</span>
                              <span>Atualizado: {new Date(service.last_updated).toLocaleString('pt-BR')}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          {getStatusBadge(service.status)}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Requests/min:</span>
                          <div className="font-medium">{service.requests_per_minute.toLocaleString()}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Cache Hit Rate:</span>
                          <div className="font-medium">{service.cache_hit_rate.toFixed(1)}%</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Taxa de Erro:</span>
                          <div className="font-medium">{service.error_rate.toFixed(2)}%</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Bloqueados:</span>
                          <div className="font-medium">{service.blocked_requests.toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Globe className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">Nenhum serviço de borda configurado</h3>
                  <p className="text-muted-foreground">
                    Configure CloudFront, WAF ou Load Balancers para começar o monitoramento.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cloudfront" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5 text-blue-500" />
                CloudFront Distributions
              </CardTitle>
              <CardDescription>Monitoramento de distribuições CloudFront</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Cloud className="h-12 w-12 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">CloudFront em desenvolvimento</h3>
                  <p>Métricas detalhadas do CloudFront serão exibidas aqui.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="waf" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-red-500" />
                AWS WAF
              </CardTitle>
              <CardDescription>Monitoramento de Web Application Firewall</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Shield className="h-12 w-12 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">WAF em desenvolvimento</h3>
                  <p>Análises de segurança e bloqueios do WAF serão exibidas aqui.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="loadbalancer" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-green-500" />
                Load Balancers
              </CardTitle>
              <CardDescription>Monitoramento de Application e Network Load Balancers</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Zap className="h-12 w-12 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Load Balancers em desenvolvimento</h3>
                  <p>Métricas de balanceamento de carga serão exibidas aqui.</p>
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