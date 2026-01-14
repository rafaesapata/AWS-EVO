import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
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
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X
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
  const { selectedAccountId } = useCloudAccount();
  const { getAccountFilter } = useAccountFilter();
  const { data: organizationId } = useOrganization();
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>('all');
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
  const { data: edgeServicesData, isLoading, refetch } = useQuery({
    queryKey: ['edge-services', organizationId, selectedAccountId, currentPage, itemsPerPage, searchTerm, serviceTypeFilter],
    enabled: !!organizationId && !!selectedAccountId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      // Calculate offset for pagination
      const offset = (currentPage - 1) * itemsPerPage;

      // Build base filters
      const baseFilters = {
        organization_id: organizationId,
        ...getAccountFilter() // Multi-cloud compatible
      };

      // Add service type filter if not 'all'
      const filters = serviceTypeFilter !== 'all' 
        ? { ...baseFilters, service_type: serviceTypeFilter }
        : baseFilters;

      const response = await apiClient.select('edge_services', {
        select: '*',
        eq: filters,
        order: { column: 'last_updated', ascending: false },
        limit: itemsPerPage,
        offset: offset
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      let services = response.data || [];

      // Apply search filter on client side (since we need to search across multiple fields)
      if (searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase().trim();
        services = services.filter(service => 
          service.service_name?.toLowerCase().includes(searchLower) ||
          service.service_id?.toLowerCase().includes(searchLower) ||
          service.service_type?.toLowerCase().includes(searchLower) ||
          service.region?.toLowerCase().includes(searchLower)
        );
      }

      // Get total count for pagination (separate query with same filters)
      const countResponse = await apiClient.select('edge_services', {
        select: 'id',
        eq: filters
      });

      let totalCount = countResponse.data?.length || 0;

      // Apply search filter to total count as well
      if (searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase().trim();
        const allServices = await apiClient.select('edge_services', {
          select: '*',
          eq: filters
        });
        
        if (allServices.data) {
          const filteredServices = allServices.data.filter(service => 
            service.service_name?.toLowerCase().includes(searchLower) ||
            service.service_id?.toLowerCase().includes(searchLower) ||
            service.service_type?.toLowerCase().includes(searchLower) ||
            service.region?.toLowerCase().includes(searchLower)
          );
          totalCount = filteredServices.length;
        }
      }

      return {
        services,
        total: totalCount
      };
    },
  });

  const edgeServices = edgeServicesData?.services || [];
  const totalServices = edgeServicesData?.total || 0;
  const totalPages = Math.ceil(totalServices / itemsPerPage);

  // Reset to first page when filters change
  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(parseInt(value));
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleServiceTypeFilterChange = (value: string) => {
    setServiceTypeFilter(value);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setServiceTypeFilter('all');
    setCurrentPage(1);
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

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
          ...getAccountFilter() // Multi-cloud compatible
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
              
              {/* Search and Filter Controls */}
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, ID, tipo ou região..."
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-10 pr-10"
                  />
                  {searchTerm && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSearchChange('')}
                      className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <Select value={serviceTypeFilter} onValueChange={handleServiceTypeFilterChange}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Tipo de serviço" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      <SelectItem value="cloudfront">CloudFront</SelectItem>
                      <SelectItem value="waf">WAF</SelectItem>
                      <SelectItem value="load_balancer">Load Balancer</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {(searchTerm || serviceTypeFilter !== 'all') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearFilters}
                      className="px-3"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Limpar
                    </Button>
                  )}
                </div>
              </div>
              
              {/* Active Filters Display */}
              {(searchTerm || serviceTypeFilter !== 'all') && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {searchTerm && (
                    <Badge variant="secondary" className="text-xs">
                      Busca: "{searchTerm}"
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSearchChange('')}
                        className="ml-1 h-4 w-4 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  )}
                  {serviceTypeFilter !== 'all' && (
                    <Badge variant="secondary" className="text-xs">
                      Tipo: {serviceTypeFilter.replace('_', ' ').toUpperCase()}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleServiceTypeFilterChange('all')}
                        className="ml-1 h-4 w-4 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  )}
                </div>
              )}
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
                            <h4 className="font-semibold text-sm">{service.service_name}</h4>
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

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-6 border-t mt-6">
                      <div className="flex items-center gap-4">
                        <div className="text-sm text-muted-foreground">
                          Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, totalServices)} de {totalServices} serviços
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Itens por página:</span>
                          <Select value={itemsPerPage.toString()} onValueChange={handleItemsPerPageChange}>
                            <SelectTrigger className="w-20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="5">5</SelectItem>
                              <SelectItem value="10">10</SelectItem>
                              <SelectItem value="20">20</SelectItem>
                              <SelectItem value="50">50</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToPage(1)}
                          disabled={currentPage === 1}
                        >
                          <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToPage(currentPage - 1)}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        
                        {/* Page numbers */}
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          
                          return (
                            <Button
                              key={pageNum}
                              variant={currentPage === pageNum ? "default" : "outline"}
                              size="sm"
                              onClick={() => goToPage(pageNum)}
                              className="w-8"
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToPage(currentPage + 1)}
                          disabled={currentPage === totalPages}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToPage(totalPages)}
                          disabled={currentPage === totalPages}
                        >
                          <ChevronsRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Globe className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  {searchTerm || serviceTypeFilter !== 'all' ? (
                    <>
                      <h3 className="text-xl font-semibold mb-2">Nenhum serviço encontrado</h3>
                      <p className="text-muted-foreground mb-4">
                        Nenhum serviço corresponde aos filtros aplicados.
                      </p>
                      <Button variant="outline" onClick={clearFilters}>
                        <X className="h-4 w-4 mr-2" />
                        Limpar filtros
                      </Button>
                    </>
                  ) : (
                    <>
                      <h3 className="text-xl font-semibold mb-2">Nenhum serviço de borda configurado</h3>
                      <p className="text-muted-foreground">
                        Configure CloudFront, WAF ou Load Balancers para começar o monitoramento.
                      </p>
                    </>
                  )}
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