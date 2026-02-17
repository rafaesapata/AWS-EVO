import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useDemoMode } from "@/contexts/DemoModeContext";
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
  X,
  Info
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, PieChart, Pie, Cell, ComposedChart, Legend } from "recharts";

function generateDemoEdgeData() {
  const now = new Date();
  const services: EdgeService[] = [
    { id: 'demo-cf-1', service_type: 'cloudfront', service_name: 'Production CDN', service_id: 'E1ABC2DEF3GH4I', status: 'active', region: 'Global', requests_per_minute: 4520, cache_hit_rate: 94.2, error_rate: 0.12, blocked_requests: 342, last_updated: new Date(now.getTime() - 5 * 60000).toISOString() },
    { id: 'demo-cf-2', service_type: 'cloudfront', service_name: 'Static Assets CDN', service_id: 'E5JKL6MNO7PQ8R', status: 'active', region: 'Global', requests_per_minute: 2180, cache_hit_rate: 98.7, error_rate: 0.02, blocked_requests: 18, last_updated: new Date(now.getTime() - 8 * 60000).toISOString() },
    { id: 'demo-waf-1', service_type: 'waf', service_name: 'Production WAF', service_id: 'waf-prod-acl-01', status: 'active', region: 'us-east-1', requests_per_minute: 3200, cache_hit_rate: 0, error_rate: 0, blocked_requests: 1847, last_updated: new Date(now.getTime() - 3 * 60000).toISOString() },
    { id: 'demo-alb-1', service_type: 'load_balancer', service_name: 'API Load Balancer', service_id: 'arn:aws:elasticloadbalancing:us-east-1:demo:loadbalancer/app/api-lb/abc123', status: 'active', region: 'us-east-1', requests_per_minute: 1850, cache_hit_rate: 0, error_rate: 0.34, blocked_requests: 0, last_updated: new Date(now.getTime() - 10 * 60000).toISOString() },
    { id: 'demo-alb-2', service_type: 'load_balancer', service_name: 'Web Load Balancer', service_id: 'arn:aws:elasticloadbalancing:us-east-1:demo:loadbalancer/app/web-lb/def456', status: 'active', region: 'us-east-1', requests_per_minute: 920, cache_hit_rate: 0, error_rate: 0.08, blocked_requests: 0, last_updated: new Date(now.getTime() - 15 * 60000).toISOString() },
  ];

  const metrics: EdgeMetrics[] = [];
  for (let h = 23; h >= 0; h--) {
    const time = new Date(now.getTime() - h * 3600000);
    services.forEach(s => {
      const base = s.requests_per_minute * 60;
      const requests = base + Math.floor(Math.random() * base * 0.3);
      const cacheHits = Math.floor(requests * (s.cache_hit_rate / 100));
      metrics.push({
        service_id: s.service_id,
        timestamp: time.toISOString(),
        requests,
        cache_hits: cacheHits,
        cache_misses: requests - cacheHits,
        blocked_requests: Math.floor(s.blocked_requests * (0.8 + Math.random() * 0.4)),
        response_time: 15 + Math.floor(Math.random() * 45),
        bandwidth_gb: requests * 0.00002,
      });
    });
  }

  return { services, metrics, total: services.length };
}

interface EdgeService {
  id: string;
  service_type: 'cloudfront' | 'waf' | 'load_balancer' | 'front_door' | 'azure_waf' | 'application_gateway' | 'nat_gateway' | 'api_management';
  service_name: string;
  service_id: string;
  status: 'active' | 'inactive' | 'error';
  region: string;
  cloud_provider?: 'AWS' | 'AZURE';
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

function formatMetricNumber(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export default function EdgeMonitoring() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { selectedAccountId, selectedProvider, selectedAccount } = useCloudAccount();
  const { getAccountFilter } = useAccountFilter();
  const { data: organizationId } = useOrganization();
  const { isDemoMode } = useDemoMode();
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>('all');
  const queryClient = useQueryClient();

  // Demo mode data
  const demoData = useMemo(() => isDemoMode ? generateDemoEdgeData() : null, [isDemoMode]);

  // Check if selected account is Azure
  const isAzureAccount = selectedProvider === 'AZURE';

  // Mutation to discover edge services (AWS or Azure)
  const discoverMutation = useMutation({
    mutationFn: async () => {
      const endpoint = isAzureAccount 
        ? '/api/functions/azure-fetch-edge-services'
        : '/api/functions/fetch-edge-services';
      
      const payload = isAzureAccount
        ? { accountId: selectedAccountId }
        : { accountId: selectedAccountId, regions: ['us-east-1', 'us-west-2', 'eu-west-1', 'sa-east-1'] };
      
      const response = await apiClient.post(endpoint, payload);
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

  // Get edge services data (AWS or Azure)
  const { data: edgeServicesData, isLoading: _isLoadingQuery, refetch } = useQuery({
    queryKey: ['edge-services', organizationId, selectedAccountId, selectedProvider, currentPage, itemsPerPage, searchTerm, serviceTypeFilter],
    enabled: !isDemoMode && !!organizationId && !!selectedAccountId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      // Calculate offset for pagination
      const offset = (currentPage - 1) * itemsPerPage;

      // Build base filters based on provider
      const baseFilters: Record<string, any> = {
        organization_id: organizationId,
      };
      
      if (isAzureAccount) {
        baseFilters.azure_credential_id = selectedAccountId;
        baseFilters.cloud_provider = 'AZURE';
      } else {
        baseFilters.aws_account_id = selectedAccountId;
        baseFilters.cloud_provider = 'AWS';
      }

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

  const edgeServices = isDemoMode ? (demoData?.services || []) : (edgeServicesData?.services || []);
  const totalServices = isDemoMode ? (demoData?.total || 0) : (edgeServicesData?.total || 0);
  const totalPages = Math.ceil(totalServices / itemsPerPage);
  const isLoading = isDemoMode ? false : _isLoadingQuery;

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

  // Get edge metrics for charts (AWS or Azure)
  const { data: metricsRaw, isLoading: _metricsLoadingQuery } = useQuery({
    queryKey: ['edge-metrics', organizationId, selectedAccountId, selectedProvider, selectedTimeRange],
    enabled: !isDemoMode && !!organizationId && !!selectedAccountId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const hoursBack = selectedTimeRange === '24h' ? 24 : selectedTimeRange === '7d' ? 168 : 720;
      const startTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

      const filters: Record<string, any> = { 
        organization_id: organizationId,
      };
      
      if (isAzureAccount) {
        filters.azure_credential_id = selectedAccountId;
        filters.cloud_provider = 'AZURE';
      } else {
        filters.aws_account_id = selectedAccountId;
        filters.cloud_provider = 'AWS';
      }

      const response = await apiClient.select('edge_metrics', {
        select: '*',
        eq: filters,
        gte: { timestamp: startTime.toISOString() },
        order: { column: 'timestamp', ascending: true }
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data || [];
    },
  });

  const metrics = isDemoMode ? (demoData?.metrics || []) : (metricsRaw || []);
  const metricsLoading = isDemoMode ? false : _metricsLoadingQuery;

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
      // AWS services
      case 'cloudfront': return <Cloud className="h-5 w-5 text-blue-500" />;
      case 'waf': return <Shield className="h-5 w-5 text-red-500" />;
      case 'load_balancer': return <Zap className="h-5 w-5 text-green-500" />;
      // Azure services
      case 'front_door': return <Cloud className="h-5 w-5 text-blue-400" />;
      case 'azure_waf': return <Shield className="h-5 w-5 text-orange-500" />;
      case 'application_gateway': return <Zap className="h-5 w-5 text-purple-500" />;
      case 'nat_gateway': return <Activity className="h-5 w-5 text-cyan-500" />;
      case 'api_management': return <Globe className="h-5 w-5 text-indigo-500" />;
      default: return <Globe className="h-5 w-5 text-gray-500" />;
    }
  };

  const getServiceTypeName = (serviceType: string) => {
    const names: Record<string, string> = {
      cloudfront: 'CloudFront',
      waf: 'AWS WAF',
      load_balancer: 'Load Balancer',
      front_door: 'Front Door',
      azure_waf: 'Azure WAF',
      application_gateway: 'App Gateway',
      nat_gateway: 'NAT Gateway',
      api_management: 'API Management',
    };
    return names[serviceType] || serviceType.replace('_', ' ').toUpperCase();
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
  
  // Cache hit rate: weighted average only from services that have cache (cloudfront, front_door)
  const cacheableServices = edgeServices?.filter(s => 
    ['cloudfront', 'front_door'].includes(s.service_type)
  ) || [];
  const avgCacheHitRate = cacheableServices.length > 0
    ? (() => {
        const totalReqs = cacheableServices.reduce((sum, s) => sum + s.requests_per_minute, 0);
        if (totalReqs === 0) return 0;
        return cacheableServices.reduce((sum, s) => sum + (s.cache_hit_rate * s.requests_per_minute), 0) / totalReqs;
      })()
    : 0;
  
  const totalBlockedRequests = edgeServices?.reduce((sum, service) => sum + service.blocked_requests, 0) || 0;
  
  // Error rate: weighted average excluding WAF services (they don't have error rates)
  const errorTrackingServices = edgeServices?.filter(s => 
    !['waf', 'azure_waf'].includes(s.service_type)
  ) || [];
  const avgErrorRate = errorTrackingServices.length > 0
    ? (() => {
        const totalReqs = errorTrackingServices.reduce((sum, s) => sum + s.requests_per_minute, 0);
        if (totalReqs === 0) return 0;
        return errorTrackingServices.reduce((sum, s) => sum + (s.error_rate * s.requests_per_minute), 0) / totalReqs;
      })()
    : 0;

  // Prepare chart data - aggregate by timestamp
  const requestsData = (() => {
    if (!metrics || metrics.length === 0) return [];
    
    // Group metrics by timestamp
    const groupedByTime = metrics.reduce((acc, m) => {
      const timeKey = new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (!acc[timeKey]) {
        acc[timeKey] = {
          time: timeKey,
          timestamp: new Date(m.timestamp).getTime(),
          requests: 0,
          blocked: 0,
          cache_hits: 0,
          cache_misses: 0,
        };
      }
      acc[timeKey].requests += m.requests || 0;
      acc[timeKey].blocked += m.blocked_requests || 0;
      acc[timeKey].cache_hits += m.cache_hits || 0;
      acc[timeKey].cache_misses += m.cache_misses || 0;
      return acc;
    }, {} as Record<string, { time: string; timestamp: number; requests: number; blocked: number; cache_hits: number; cache_misses: number }>);
    
    // Convert to array and sort by timestamp
    return Object.values(groupedByTime)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(item => ({
        time: item.time,
        requests: item.requests,
        blocked: item.blocked,
        cache_hit_rate: (item.cache_hits + item.cache_misses) > 0 
          ? (item.cache_hits / (item.cache_hits + item.cache_misses)) * 100 
          : 0
      }));
  })();

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
      title={t('sidebar.edgeMonitoring', 'Edge Monitoring')} 
      description={t('edgeMonitoring.description', 'CloudFront, WAF and Load Balancers - AWS edge services')}
      icon={<Globe className="h-5 w-5" />}
    >
      <div className="space-y-6">
        {/* Action Buttons */}
        {!isDemoMode && (
        <div className="flex justify-end gap-2">
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {t('common.refresh', 'Atualizar')}
          </Button>
          <Button 
            onClick={() => discoverMutation.mutate()}
            disabled={discoverMutation.isPending || !selectedAccountId}
          >
            <Search className={`h-4 w-4 mr-2 ${discoverMutation.isPending ? 'animate-spin' : ''}`} />
            {discoverMutation.isPending ? t('edgeMonitoring.discovering', 'Descobrindo...') : t('edgeMonitoring.discoverServices', 'Descobrir Serviços')}
          </Button>
        </div>
        )}

        {/* Provider Info */}
        {!isDemoMode && selectedAccount && (
          <Alert className={isAzureAccount ? "border-blue-500/50 bg-blue-500/10" : "border-orange-500/50 bg-orange-500/10"}>
            <Info className={`h-4 w-4 ${isAzureAccount ? 'text-blue-500' : 'text-orange-500'}`} />
            <AlertTitle className={isAzureAccount ? 'text-blue-500' : 'text-orange-500'}>
              {isAzureAccount ? 'Azure Edge Services' : 'AWS Edge Services'}
            </AlertTitle>
            <AlertDescription>
              {isAzureAccount ? (
                <>
                  Monitorando serviços de borda Azure: Front Door, Application Gateway, Load Balancer, NAT Gateway, API Management e Azure WAF.
                  <br />
                  <span className="text-muted-foreground">Conta: <strong>{selectedAccount.accountName}</strong></span>
                </>
              ) : (
                <>
                  Monitorando serviços de borda AWS: CloudFront, WAF e Load Balancers (ALB/NLB).
                  <br />
                  <span className="text-muted-foreground">Conta: <strong>{selectedAccount.accountName}</strong></span>
                </>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Requests/min</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-semibold">{formatMetricNumber(totalRequests)}</div>
            )}
          </CardContent>
        </Card>

        <Card >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cache Hit Rate</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="space-y-2">
                <div className="text-2xl font-semibold">{avgCacheHitRate.toFixed(1)}%</div>
                <Progress value={avgCacheHitRate} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Requests Bloqueados</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-semibold text-red-500">{totalBlockedRequests.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>

        <Card >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Taxa de Erro</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-semibold">{avgErrorRate.toFixed(2)}%</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="glass-card-float flex-wrap">
          <TabsTrigger value="overview">{t('edgeMonitoring.tabs.overview', 'Visão Geral')}</TabsTrigger>
          {!isAzureAccount ? (
            <>
              <TabsTrigger value="cloudfront">CloudFront</TabsTrigger>
              <TabsTrigger value="waf">WAF</TabsTrigger>
              <TabsTrigger value="loadbalancer">Load Balancers</TabsTrigger>
            </>
          ) : (
            <>
              <TabsTrigger value="frontdoor">Front Door</TabsTrigger>
              <TabsTrigger value="appgateway">App Gateway</TabsTrigger>
              <TabsTrigger value="azurelb">Load Balancer</TabsTrigger>
              <TabsTrigger value="natgateway">NAT Gateway</TabsTrigger>
              <TabsTrigger value="apim">API Management</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Requests Chart */}
            <Card >
              <CardHeader>
                <CardTitle>Requests e Bloqueios</CardTitle>
                <CardDescription>Últimas {selectedTimeRange}</CardDescription>
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : requestsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={requestsData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="time" 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number, name: string) => [
                          value.toLocaleString(),
                          name === 'requests' ? 'Requests' : 'Bloqueados'
                        ]}
                      />
                      <Legend />
                      <Bar 
                        dataKey="requests" 
                        fill="#3b82f6" 
                        name="Requests"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar 
                        dataKey="blocked" 
                        fill="#ef4444" 
                        name="Bloqueados"
                        radius={[4, 4, 0, 0]}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    {t('edgeMonitoring.noMetricData', 'Nenhum dado de métrica disponível')}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Service Distribution */}
            <Card >
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
                    {t('edgeMonitoring.noServiceConfigured', 'Nenhum serviço configurado')}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Services List */}
          <Card >
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
                      <SelectValue placeholder={t('edgeMonitoring.serviceType', 'Tipo de serviço')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('edgeMonitoring.allTypes', 'Todos os tipos')}</SelectItem>
                      {!isAzureAccount ? (
                        <>
                          <SelectItem value="cloudfront">CloudFront</SelectItem>
                          <SelectItem value="waf">WAF</SelectItem>
                          <SelectItem value="load_balancer">Load Balancer</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="front_door">Front Door</SelectItem>
                          <SelectItem value="application_gateway">App Gateway</SelectItem>
                          <SelectItem value="load_balancer">Load Balancer</SelectItem>
                          <SelectItem value="nat_gateway">NAT Gateway</SelectItem>
                          <SelectItem value="api_management">API Management</SelectItem>
                          <SelectItem value="azure_waf">Azure WAF</SelectItem>
                        </>
                      )}
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
                      {t('edgeMonitoring.type', 'Tipo')}: {getServiceTypeName(serviceTypeFilter)}
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
                              <span>{getServiceTypeName(service.service_type)}</span>
                              <span>•</span>
                              <span>{service.region}</span>
                              <span>•</span>
                              <span>{t('edgeMonitoring.updated', 'Atualizado')}: {new Date(service.last_updated).toLocaleString('pt-BR')}</span>
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
                          <div className="font-medium">{formatMetricNumber(service.requests_per_minute)}</div>
                        </div>
                        {service.service_type !== 'waf' && (
                          <div>
                            <span className="text-muted-foreground">Cache Hit Rate:</span>
                            <div className="font-medium">{service.cache_hit_rate.toFixed(1)}%</div>
                          </div>
                        )}
                        {service.service_type !== 'waf' && (
                          <div>
                            <span className="text-muted-foreground">Taxa de Erro:</span>
                            <div className="font-medium">{service.error_rate.toFixed(2)}%</div>
                          </div>
                        )}
                        {service.service_type === 'waf' && (
                          <div>
                            <span className="text-muted-foreground">Regras:</span>
                            <div className="font-medium">{service.metadata?.rulesCount || 0}</div>
                          </div>
                        )}
                        <div>
                          <span className="text-muted-foreground">Bloqueados:</span>
                          <div className="font-medium text-red-500">{service.blocked_requests.toLocaleString()}</div>
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
                      <h3 className="text-xl font-semibold mb-2">{t('edgeMonitoring.noServiceFound', 'Nenhum serviço encontrado')}</h3>
                      <p className="text-muted-foreground mb-4">
                        {t('edgeMonitoring.noServiceMatchFilters', 'Nenhum serviço corresponde aos filtros aplicados.')}
                      </p>
                      <Button variant="outline" onClick={clearFilters}>
                        <X className="h-4 w-4 mr-2" />
                        {t('edgeMonitoring.clearFilters', 'Limpar filtros')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <h3 className="text-xl font-semibold mb-2">{t('edgeMonitoring.noEdgeServiceConfigured', 'Nenhum serviço de borda configurado')}</h3>
                      <p className="text-muted-foreground">
                        {t('edgeMonitoring.configureEdgeServices', 'Configure CloudFront, WAF ou Load Balancers para começar o monitoramento.')}
                      </p>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cloudfront" className="space-y-4">
          <Card >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5 text-blue-500" />
                CloudFront Distributions
              </CardTitle>
              <CardDescription>Monitoramento de distribuições CloudFront</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : (() => {
                const cloudfrontServices = edgeServices?.filter(s => s.service_type === 'cloudfront') || [];
                return cloudfrontServices.length > 0 ? (
                  <div className="space-y-4">
                    {cloudfrontServices.map((service) => (
                      <div key={service.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <Cloud className="h-5 w-5 text-blue-500" />
                            <div className="space-y-1">
                              <h4 className="font-semibold text-sm">{service.service_name}</h4>
                              <p className="text-sm text-muted-foreground">{service.service_id}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                            <div className="font-medium">{formatMetricNumber(service.requests_per_minute)}</div>
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
                            <span className="text-muted-foreground">Bandwidth:</span>
                            <div className="font-medium">{(service.metadata?.bandwidth_gb || 0).toFixed(2)} GB</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Cloud className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">{t('edgeMonitoring.noCloudFront', 'Nenhuma distribuição CloudFront')}</h3>
                    <p className="text-muted-foreground">{t('edgeMonitoring.clickDiscoverCloudFront', 'Clique em "Descobrir Serviços" para buscar distribuições CloudFront.')}</p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="waf" className="space-y-4">
          <Card >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-red-500" />
                AWS WAF
              </CardTitle>
              <CardDescription>Monitoramento de Web Application Firewall</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : (() => {
                const wafServices = edgeServices?.filter(s => s.service_type === 'waf') || [];
                return wafServices.length > 0 ? (
                  <div className="space-y-4">
                    {wafServices.map((service) => (
                      <div key={service.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <Shield className="h-5 w-5 text-red-500" />
                            <div className="space-y-1">
                              <h4 className="font-semibold text-sm">{service.service_name}</h4>
                              <p className="text-sm text-muted-foreground">{service.service_id}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{service.metadata?.scope || 'REGIONAL'}</span>
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
                        
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Total Requests:</span>
                            <div className="font-medium">{formatMetricNumber(Math.round(service.requests_per_minute * 60))}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Bloqueados:</span>
                            <div className="font-medium text-red-500">{service.blocked_requests.toLocaleString()}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Regras:</span>
                            <div className="font-medium">{service.metadata?.rulesCount || 0}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">{t('edgeMonitoring.noWebACL', 'Nenhum Web ACL configurado')}</h3>
                    <p className="text-muted-foreground">{t('edgeMonitoring.clickDiscoverWAF', 'Clique em "Descobrir Serviços" para buscar Web ACLs do WAF.')}</p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="loadbalancer" className="space-y-4">
          <Card >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-green-500" />
                Load Balancers
              </CardTitle>
              <CardDescription>Monitoramento de Application e Network Load Balancers</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : (() => {
                const lbServices = edgeServices?.filter(s => s.service_type === 'load_balancer') || [];
                return lbServices.length > 0 ? (
                  <div className="space-y-4">
                    {lbServices.map((service) => (
                      <div key={service.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <Zap className="h-5 w-5 text-green-500" />
                            <div className="space-y-1">
                              <h4 className="font-semibold text-sm">{service.service_name}</h4>
                              <p className="text-sm text-muted-foreground truncate max-w-md">{service.domain_name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline" className="text-xs">
                                  {service.metadata?.type === 'application' ? 'ALB' : 'NLB'}
                                </Badge>
                                <span>•</span>
                                <span>{service.metadata?.scheme || 'internet-facing'}</span>
                                <span>•</span>
                                <span>{service.region}</span>
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
                            <div className="font-medium">{formatMetricNumber(service.requests_per_minute)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Response Time:</span>
                            <div className="font-medium">{(service.metadata?.response_time || 0).toFixed(0)} ms</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Taxa de Erro:</span>
                            <div className="font-medium">{service.error_rate.toFixed(2)}%</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">AZs:</span>
                            <div className="font-medium">{service.metadata?.availabilityZones?.length || 0}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Zap className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">{t('edgeMonitoring.noLoadBalancer', 'Nenhum Load Balancer encontrado')}</h3>
                    <p className="text-muted-foreground">{t('edgeMonitoring.clickDiscoverLB', 'Clique em "Descobrir Serviços" para buscar ALBs e NLBs.')}</p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Azure Front Door Tab */}
        <TabsContent value="frontdoor" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5 text-blue-400" />
                Azure Front Door
              </CardTitle>
              <CardDescription>{t('edgeMonitoring.azure.frontDoorDesc', 'CDN global e balanceamento de carga')}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : (() => {
                const fdServices = edgeServices?.filter(s => s.service_type === 'front_door') || [];
                return fdServices.length > 0 ? (
                  <div className="space-y-4">
                    {fdServices.map((service) => (
                      <div key={service.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <Cloud className="h-5 w-5 text-blue-400" />
                            <div className="space-y-1">
                              <h4 className="font-semibold text-sm">{service.service_name}</h4>
                              <p className="text-sm text-muted-foreground">{service.domain_name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{service.region}</span>
                                <span>•</span>
                                <span>{t('edgeMonitoring.updated', 'Atualizado')}: {new Date(service.last_updated).toLocaleString('pt-BR')}</span>
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
                            <div className="font-medium">{formatMetricNumber(service.requests_per_minute)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('edgeMonitoring.blocked', 'Bloqueados')}:</span>
                            <div className="font-medium text-red-500">{service.blocked_requests.toLocaleString()}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('edgeMonitoring.responseTime', 'Response Time')}:</span>
                            <div className="font-medium">{(service.metadata?.responseTime || 0).toFixed(0)} ms</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('edgeMonitoring.hasWaf', 'WAF')}:</span>
                            <div className="font-medium">{service.metadata?.hasWaf ? '✓' : '✗'}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Cloud className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">{t('edgeMonitoring.azure.noFrontDoor', 'Nenhum Front Door encontrado')}</h3>
                    <p className="text-muted-foreground">{t('edgeMonitoring.clickDiscover', 'Clique em "Descobrir Serviços" para buscar.')}</p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Azure Application Gateway Tab */}
        <TabsContent value="appgateway" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-purple-500" />
                Application Gateway
              </CardTitle>
              <CardDescription>{t('edgeMonitoring.azure.appGatewayDesc', 'Load balancer de camada 7 com WAF')}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : (() => {
                const appGwServices = edgeServices?.filter(s => s.service_type === 'application_gateway') || [];
                return appGwServices.length > 0 ? (
                  <div className="space-y-4">
                    {appGwServices.map((service) => (
                      <div key={service.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <Zap className="h-5 w-5 text-purple-500" />
                            <div className="space-y-1">
                              <h4 className="font-semibold text-sm">{service.service_name}</h4>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline" className="text-xs">{service.metadata?.sku || 'Standard'}</Badge>
                                <span>•</span>
                                <span>{service.region}</span>
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
                            <div className="font-medium">{formatMetricNumber(service.requests_per_minute)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('edgeMonitoring.blocked', 'Bloqueados')}:</span>
                            <div className="font-medium text-red-500">{service.blocked_requests.toLocaleString()}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('edgeMonitoring.hasWaf', 'WAF')}:</span>
                            <div className="font-medium">{service.metadata?.hasWaf ? service.metadata?.wafMode : 'N/A'}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('edgeMonitoring.capacity', 'Capacidade')}:</span>
                            <div className="font-medium">{service.metadata?.capacity || 0}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Zap className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">{t('edgeMonitoring.azure.noAppGateway', 'Nenhum Application Gateway encontrado')}</h3>
                    <p className="text-muted-foreground">{t('edgeMonitoring.clickDiscover', 'Clique em "Descobrir Serviços" para buscar.')}</p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Azure Load Balancer Tab */}
        <TabsContent value="azurelb" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-green-500" />
                Azure Load Balancer
              </CardTitle>
              <CardDescription>{t('edgeMonitoring.azure.lbDesc', 'Balanceamento de carga de camada 4')}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : (() => {
                const lbServices = edgeServices?.filter(s => s.service_type === 'load_balancer') || [];
                return lbServices.length > 0 ? (
                  <div className="space-y-4">
                    {lbServices.map((service) => (
                      <div key={service.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <Zap className="h-5 w-5 text-green-500" />
                            <div className="space-y-1">
                              <h4 className="font-semibold text-sm">{service.service_name}</h4>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline" className="text-xs">{service.metadata?.sku || 'Standard'}</Badge>
                                <span>•</span>
                                <Badge variant={service.metadata?.isPublic ? 'default' : 'secondary'} className="text-xs">
                                  {service.metadata?.isPublic ? 'Public' : 'Internal'}
                                </Badge>
                                <span>•</span>
                                <span>{service.region}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            {getStatusBadge(service.status)}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">{t('edgeMonitoring.packets', 'Pacotes')}:</span>
                            <div className="font-medium">{formatMetricNumber(service.requests_per_minute)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('edgeMonitoring.bandwidth', 'Bandwidth')}:</span>
                            <div className="font-medium">{(service.metadata?.bandwidthGb || 0).toFixed(2)} GB</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('edgeMonitoring.backendPools', 'Backend Pools')}:</span>
                            <div className="font-medium">{service.metadata?.backendAddressPools || 0}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('edgeMonitoring.rules', 'Regras')}:</span>
                            <div className="font-medium">{service.metadata?.loadBalancingRules || 0}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Zap className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">{t('edgeMonitoring.azure.noLB', 'Nenhum Load Balancer encontrado')}</h3>
                    <p className="text-muted-foreground">{t('edgeMonitoring.clickDiscover', 'Clique em "Descobrir Serviços" para buscar.')}</p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Azure NAT Gateway Tab */}
        <TabsContent value="natgateway" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-cyan-500" />
                NAT Gateway
              </CardTitle>
              <CardDescription>{t('edgeMonitoring.azure.natGwDesc', 'Conectividade de saída para redes virtuais')}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : (() => {
                const natServices = edgeServices?.filter(s => s.service_type === 'nat_gateway') || [];
                return natServices.length > 0 ? (
                  <div className="space-y-4">
                    {natServices.map((service) => (
                      <div key={service.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <Activity className="h-5 w-5 text-cyan-500" />
                            <div className="space-y-1">
                              <h4 className="font-semibold text-sm">{service.service_name}</h4>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{service.region}</span>
                                <span>•</span>
                                <span>{t('edgeMonitoring.updated', 'Atualizado')}: {new Date(service.last_updated).toLocaleString('pt-BR')}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            {getStatusBadge(service.status)}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">{t('edgeMonitoring.connections', 'Conexões')}:</span>
                            <div className="font-medium">{formatMetricNumber(service.requests_per_minute)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('edgeMonitoring.bandwidth', 'Bandwidth')}:</span>
                            <div className="font-medium">{(service.metadata?.bandwidthGb || 0).toFixed(2)} GB</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('edgeMonitoring.publicIPs', 'IPs Públicos')}:</span>
                            <div className="font-medium">{service.metadata?.publicIpAddresses || 0}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('edgeMonitoring.subnets', 'Subnets')}:</span>
                            <div className="font-medium">{service.metadata?.subnets || 0}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">{t('edgeMonitoring.azure.noNatGw', 'Nenhum NAT Gateway encontrado')}</h3>
                    <p className="text-muted-foreground">{t('edgeMonitoring.clickDiscover', 'Clique em "Descobrir Serviços" para buscar.')}</p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Azure API Management Tab */}
        <TabsContent value="apim" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-indigo-500" />
                API Management
              </CardTitle>
              <CardDescription>{t('edgeMonitoring.azure.apimDesc', 'Gateway de API e portal de desenvolvedores')}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : (() => {
                const apimServices = edgeServices?.filter(s => s.service_type === 'api_management') || [];
                return apimServices.length > 0 ? (
                  <div className="space-y-4">
                    {apimServices.map((service) => (
                      <div key={service.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <Globe className="h-5 w-5 text-indigo-500" />
                            <div className="space-y-1">
                              <h4 className="font-semibold text-sm">{service.service_name}</h4>
                              <p className="text-sm text-muted-foreground">{service.domain_name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline" className="text-xs">{service.metadata?.sku || 'Developer'}</Badge>
                                <span>•</span>
                                <span>{service.region}</span>
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
                            <div className="font-medium">{formatMetricNumber(service.requests_per_minute)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('edgeMonitoring.successRate', 'Taxa de Sucesso')}:</span>
                            <div className="font-medium">{service.cache_hit_rate.toFixed(1)}%</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('edgeMonitoring.errorRate', 'Taxa de Erro')}:</span>
                            <div className="font-medium">{service.error_rate.toFixed(2)}%</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('edgeMonitoring.responseTime', 'Response Time')}:</span>
                            <div className="font-medium">{(service.metadata?.responseTime || 0).toFixed(0)} ms</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Globe className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">{t('edgeMonitoring.azure.noApim', 'Nenhum API Management encontrado')}</h3>
                    <p className="text-muted-foreground">{t('edgeMonitoring.clickDiscover', 'Clique em "Descobrir Serviços" para buscar.')}</p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </Layout>
  );
}