import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Server, Database, Layers, Zap, Cloud, Activity, ArrowLeft, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ResourceComparison } from "./resource-monitoring/ResourceComparison";
import { SavedFilters } from "./resource-monitoring/SavedFilters";
import { MetricsPeriodSelector, MetricsPeriod, PERIOD_CONFIG } from "./resource-monitoring/MetricsPeriodSelector";
import { ResourceMetricsChart } from "./resource-monitoring/ResourceMetricsChart";
import { useOrganizationQuery } from "@/hooks/useOrganizationQuery";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { CACHE_CONFIGS } from "@/hooks/useQueryCache";
import { AWSPermissionError } from "./AWSPermissionError";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

const RESOURCE_TYPES = [
  { value: 'ec2', label: 'EC2 Instances', icon: Server },
  { value: 'rds', label: 'RDS Databases', icon: Database },
  { value: 'elasticache', label: 'ElastiCache (Redis)', icon: Layers },
  { value: 'lambda', label: 'Lambda Functions', icon: Zap },
  { value: 'ecs', label: 'ECS Services', icon: Cloud },
  { value: 'elb', label: 'Classic Load Balancers', icon: Activity },
  { value: 'alb', label: 'Application LB (ALB)', icon: Activity },
  { value: 'nlb', label: 'Network LB (NLB)', icon: Activity },
  { value: 'apigateway', label: 'API Gateway', icon: Link2 }
];

// Métricas que devem ser exibidas como inteiros (contadores)
const COUNT_METRICS = new Set([
  'Invocations', 'Errors', 'Throttles', 'ConcurrentExecutions',
  'Count', '4XXError', '5XXError',
  'RequestCount', 'HTTPCode_Target_2XX_Count', 'HTTPCode_Target_3XX_Count',
  'HTTPCode_Target_4XX_Count', 'HTTPCode_Target_5XX_Count',
  'HTTPCode_ELB_2XX_Count', 'HTTPCode_ELB_3XX_Count',
  'HTTPCode_ELB_4XX_Count', 'HTTPCode_ELB_5XX_Count',
  'Requests', 'BytesDownloaded', 'BytesUploaded',
  'AllowedRequests', 'BlockedRequests', 'CountedRequests', 'PassedRequests',
  'NewFlowCount', 'ProcessedBytes', 'ProcessedPackets',
  'DatabaseConnections', 'ActiveFlowCount'
]);

// Formatar valor da métrica baseado no tipo
const formatMetricValue = (metricName: string, value: number): string => {
  if (COUNT_METRICS.has(metricName)) {
    return Math.round(value).toLocaleString();
  }
  return value.toFixed(2);
};

export const ResourceMonitoringDashboard = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const resourcesRef = useRef<HTMLDivElement>(null);
  
  // CRITICAL: Use global account selector instead of local state
  const { selectedAccountId, accounts, isLoading: accountsLoading } = useAwsAccount();
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedResourceType, setSelectedResourceType] = useState<string>("all");
  const [selectedResource, setSelectedResource] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedRegion, setSelectedRegion] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<string>("off");
  const [metricsPeriod, setMetricsPeriod] = useState<MetricsPeriod>("3h");
  const [permissionErrors, setPermissionErrors] = useState<Array<{
    resourceType: string;
    region: string;
    error: string;
    missingPermissions: string[];
  }>>([]);
  const itemsPerPage = 10;

  // Função para filtrar por tipo de recurso e fazer scroll
  const handleResourceTypeFilter = (type: string) => {
    setSelectedResourceType(type);
    setCurrentPage(1);
    
    // Scroll suave para a seção de recursos
    setTimeout(() => {
      resourcesRef.current?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }, 100);

    toast({
      title: "Filtro aplicado",
      description: `Exibindo apenas recursos do tipo ${RESOURCE_TYPES.find(r => r.value === type)?.label || type}`,
    });
  };

  // Auto-refresh effect - USE GLOBAL selectedAccountId
  useEffect(() => {
    if (autoRefreshInterval === "off" || !selectedAccountId) return;

    const intervalMs = autoRefreshInterval === "15s" ? 15000 : 
                       autoRefreshInterval === "30s" ? 30000 : 60000;

    const interval = setInterval(() => {
      handleRefresh();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [autoRefreshInterval, selectedAccountId]);

  // Buscar recursos monitorados - FILTERED BY GLOBAL ACCOUNT
  const { data: resources, isLoading: loadingResources } = useOrganizationQuery(
    ['monitored-resources', selectedAccountId],
    async (organizationId) => {
      if (!selectedAccountId) return [];
      
      // Verificar se a conta pertence à organização
      const accountResponse = await apiClient.select('aws_accounts', { 
        eq: { id: selectedAccountId, organization_id: organizationId } 
      });
      if (accountResponse.error || !accountResponse.data) return [];
      
      const resourceResponse = await apiClient.select('monitored_resources', { 
        eq: { organization_id: organizationId, aws_account_id: selectedAccountId } 
      });
      return resourceResponse.data || [];
    },
    {
      ...CACHE_CONFIGS.FREQUENT,
      enabled: !!selectedAccountId,
    }
  );

  // Buscar métricas recentes - FILTERED BY GLOBAL ACCOUNT
  // CRITICAL: Include metricsPeriod in query key to force refetch when period changes
  const { data: metrics, isLoading: loadingMetrics, refetch: refetchMetrics } = useOrganizationQuery(
    ['resource-metrics', selectedAccountId, metricsPeriod],
    async (organizationId) => {
      if (!selectedAccountId) return [];
      
      // Verificar se a conta pertence à organização
      const accountResponse = await apiClient.select('aws_accounts', { 
        eq: { id: selectedAccountId, organization_id: organizationId } 
      });
      if (accountResponse.error || !accountResponse.data) return [];
      
      // CRITICAL: Buscar métricas mais recentes primeiro (DESC) e limitar para evitar sobrecarga
      // Ordenando DESC para garantir dados mais recentes primeiro
      const cutoffTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      
      const metricsResponse = await apiClient.select('resource_metrics', {
        eq: { 
          organization_id: organizationId,
          aws_account_id: selectedAccountId 
        },
        order: { column: 'timestamp', ascending: false },
        limit: 1000 // Limit for performance, most recent data first
      });
      const data = metricsResponse.data;
      
      // Reverter para ordem cronológica para exibição nos gráficos
      return (data || []).reverse();
    },
    {
      ...CACHE_CONFIGS.FREQUENT,
      enabled: !!selectedAccountId,
      staleTime: 0, // Always refetch - metrics data should always be fresh
      gcTime: 60 * 1000, // Keep in cache for 1 minute only
    }
  );

  const handleRefresh = async () => {
    if (!selectedAccountId) {
      toast({
        title: "Selecione uma conta",
        description: "Por favor, selecione uma conta AWS para atualizar as métricas.",
        variant: "destructive"
      });
      return;
    }

    setIsRefreshing(true);
    
    // 🚀 Toast otimista mostrando progresso
    toast({
      title: "🔄 Coletando métricas...",
      description: "Buscando dados dos recursos AWS em paralelo",
    });

    try {
      // Invocar Lambda function via API Gateway - USE GLOBAL selectedAccountId
      const response = await apiClient.invoke<any>('fetch-cloudwatch-metrics', {
        body: { accountId: selectedAccountId }
      });

      // Handle API response format
      const data = 'error' in response && response.error ? null : response.data || response;

      if (!data || (data.success === false)) {
        const errorMsg = typeof data?.error === 'string' 
          ? data.error 
          : data?.error?.message || JSON.stringify(data?.error) || 'Failed to collect metrics';
        throw new Error(errorMsg);
      }

      // Armazenar erros de permissão se houver
      if (data.permissionErrors && data.permissionErrors.length > 0) {
        setPermissionErrors(data.permissionErrors);
      } else {
        setPermissionErrors([]);
      }

      // Invalidar cache completamente e forçar refetch
      queryClient.removeQueries({ queryKey: ['monitored-resources'] });
      queryClient.removeQueries({ queryKey: ['resource-metrics'] });

      toast({
        title: "✅ Métricas atualizadas",
        description: data.message || `${data.metricsCollected || 0} métricas coletadas de ${data.resourcesFound || 0} recursos`,
      });

      // Refetch em paralelo
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['monitored-resources'] }),
        queryClient.refetchQueries({ queryKey: ['resource-metrics'] })
      ]);
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar métricas",
        description: error.message || 'Erro desconhecido ao atualizar métricas',
        variant: "destructive"
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Get unique regions from resources
  const availableRegions = Array.from(new Set(resources?.map(r => r.region) || [])).sort();

  // Filtrar e ordenar recursos por tipo, região e busca (ativos primeiro)
  const allFilteredResources = (selectedResourceType === 'all' 
    ? resources 
    : resources?.filter(r => r.resource_type === selectedResourceType))
    ?.filter(r => selectedRegion === 'all' || r.region === selectedRegion)
    ?.filter(r => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return r.resource_name?.toLowerCase().includes(term) || 
             r.resource_id?.toLowerCase().includes(term) ||
             r.resource_type?.toLowerCase().includes(term) ||
             r.region?.toLowerCase().includes(term);
    })
    ?.sort((a, b) => {
      // Colocar recursos ativos primeiro
      const statusOrder: Record<string, number> = {
        'running': 0,
        'active': 0,
        'available': 0,
        'stopped': 1,
        'terminated': 2,
        'unknown': 3
      };
      const aOrder = statusOrder[a.status?.toLowerCase()] ?? 3;
      const bOrder = statusOrder[b.status?.toLowerCase()] ?? 3;
      return aOrder - bOrder;
    }) || [];

  // Calcular paginação
  const totalPages = Math.ceil(allFilteredResources.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const filteredResources = allFilteredResources.slice(startIndex, endIndex);

  // Reset para primeira página quando filtros mudarem
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedResourceType, selectedRegion, searchTerm]);

  // Agrupar métricas por recurso
  const resourceMetrics = metrics?.reduce((acc: any, metric: any) => {
    const key = `${metric.resource_type}-${metric.resource_id}`;
    if (!acc[key]) {
      acc[key] = {
        resource: metric,
        metrics: []
      };
    }
    acc[key].metrics.push(metric);
    return acc;
  }, {}) || {};

  // Estatísticas por tipo de recurso
  const resourceStats = RESOURCE_TYPES.map(type => {
    const count = resources?.filter(r => r.resource_type === type.value).length || 0;
    
    // Filtrar apenas recursos com status ativo para cálculo de CPU média
    const activeResourceIds = new Set(
      resources
        ?.filter(r => 
          r.resource_type === type.value && 
          ['running', 'active', 'available'].includes(r.status?.toLowerCase())
        )
        .map(r => r.resource_id) || []
    );
    
    // Contar quantos estão ativos/ligados (especialmente importante para EC2)
    const runningCount = activeResourceIds.size;
    
    const cpuMetrics = metrics
      ?.filter(m => 
        m.resource_type === type.value && 
        m.metric_name === 'CPUUtilization' &&
        activeResourceIds.has(m.resource_id)
      ) || [];
    
    const avgCpu = cpuMetrics.length > 0
      ? cpuMetrics.reduce((sum, m) => sum + Number(m.metric_value), 0) / cpuMetrics.length
      : null;

    return {
      type: type.value,
      label: type.label,
      icon: type.icon,
      count,
      runningCount,
      avgCpu: avgCpu !== null && !isNaN(avgCpu) ? avgCpu : null
    };
  });

  if (!accounts || accounts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monitoramento de Recursos AWS</CardTitle>
          <CardDescription>Configure uma conta AWS para começar o monitoramento</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Nenhuma conta AWS configurada.</p>
        </CardContent>
      </Card>
    );
  }

  // Métricas esperadas por tipo de recurso para mostrar gráficos mesmo sem dados
  const EXPECTED_METRICS_BY_TYPE: Record<string, string[]> = {
    'ec2': ['CPUUtilization', 'NetworkIn', 'NetworkOut', 'DiskReadOps', 'DiskWriteOps'],
    'rds': ['CPUUtilization', 'DatabaseConnections', 'FreeStorageSpace', 'ReadIOPS', 'WriteIOPS'],
    'lambda': ['Invocations', 'Errors', 'Duration', 'Throttles', 'ConcurrentExecutions'],
    'apigateway': ['Count', 'Latency', 'IntegrationLatency', '4XXError', '5XXError'],
    'alb': ['RequestCount', 'TargetResponseTime', 'HTTPCode_Target_2XX_Count', 'HTTPCode_Target_4XX_Count', 'HTTPCode_Target_5XX_Count'],
    'nlb': ['ProcessedBytes', 'ActiveFlowCount', 'NewFlowCount', 'ProcessedPackets'],
    'cloudfront': ['Requests', 'BytesDownloaded', '4xxErrorRate', '5xxErrorRate'],
    'ecs': ['CPUUtilization', 'MemoryUtilization'],
    'elasticache': ['CPUUtilization', 'NetworkBytesIn', 'NetworkBytesOut', 'CurrConnections'],
    'waf': ['AllowedRequests', 'BlockedRequests', 'CountedRequests']
  };

  // Se um recurso está selecionado, mostrar detalhamento
  if (selectedResource) {
    // CRITICAL: Filtrar métricas com múltiplas estratégias de matching
    const resourceSpecificMetrics = metrics?.filter(m => {
      if (m.resource_type !== selectedResource.resource_type) return false;
      
      // Prioridade 1: Match exato de resource_id
      if (m.resource_id === selectedResource.resource_id) return true;
      
      // Prioridade 2: Para API Gateway, verificar se resource_id começa com o apiName do metadata
      const metadata = selectedResource.metadata as Record<string, any> | null;
      if (selectedResource.resource_type === 'apigateway' && metadata?.apiName) {
        if (m.resource_id.startsWith(`${metadata.apiName}::`)) return true;
      }
      
      // Prioridade 3: Match por resource_name para recursos não-genéricos
      const isGenericName = ['Cluster Node', 'Worker', 'Node'].includes(selectedResource.resource_name);
      if (!isGenericName && m.resource_name === selectedResource.resource_name) return true;
      
      return false;
    }) || [];

    // Obter nomes únicos de métricas existentes
    const existingMetricNames = new Set(resourceSpecificMetrics.map(m => m.metric_name));
    
    // Combinar métricas existentes com métricas esperadas para o tipo de recurso
    const expectedMetrics = EXPECTED_METRICS_BY_TYPE[selectedResource.resource_type] || [];
    const allMetricNames = [...new Set([...existingMetricNames, ...expectedMetrics])];

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => setSelectedResource(null)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
            <div>
              <h2 className="text-3xl font-bold">{selectedResource.resource_name}</h2>
              <p className="text-muted-foreground">
                {selectedResource.resource_type.toUpperCase()} • {selectedResource.region} • {selectedResource.status}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <MetricsPeriodSelector value={metricsPeriod} onChange={setMetricsPeriod} />
            <Select value={autoRefreshInterval} onValueChange={setAutoRefreshInterval}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Auto-refresh" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Desligado</SelectItem>
                <SelectItem value="15s">A cada 15s</SelectItem>
                <SelectItem value="30s">A cada 30s</SelectItem>
                <SelectItem value="1m">A cada 1 min</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              onClick={handleRefresh} 
              disabled={isRefreshing || !selectedAccountId}
              className="gap-2"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {allMetricNames.map((metricName) => (
            <ResourceMetricsChart
              key={metricName}
              metrics={resourceSpecificMetrics}
              metricName={metricName}
              period={metricsPeriod}
              resourceName={selectedResource.resource_name}
              height={250}
            />
          ))}
        </div>

        {resourceSpecificMetrics.length === 0 && allMetricNames.length === 0 && (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">
                Nenhuma métrica disponível para este recurso. Clique em "Atualizar" para coletar dados.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-3xl font-bold">Monitoramento de Recursos</h2>
            <InfoTooltip title="O que é monitorado?">
              <>
                <p className="text-muted-foreground">
                  Monitora recursos AWS em tempo real com métricas de CloudWatch.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 mt-2">
                  <li>• EC2: CPU, memória, rede, disco</li>
                  <li>• RDS: CPU, conexões, IOPS</li>
                  <li>• Lambda: invocações, erros, duração</li>
                  <li>• ECS: CPU, memória dos serviços</li>
                  <li>• Load Balancers: requisições, latência</li>
                </ul>
              </>
            </InfoTooltip>
          </div>
          <p className="text-muted-foreground">Métricas em tempo real dos seus recursos AWS</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={autoRefreshInterval} onValueChange={setAutoRefreshInterval}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Auto-atualização" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Desligado</SelectItem>
              <SelectItem value="15s">A cada 15s</SelectItem>
              <SelectItem value="30s">A cada 30s</SelectItem>
              <SelectItem value="1m">A cada 1 minuto</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            onClick={handleRefresh} 
            disabled={isRefreshing || !selectedAccountId}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {selectedAccountId && (
        <>
          {/* Alerta de Permissões Faltantes */}
          <AWSPermissionError errors={permissionErrors} />

          {/* Resumo por tipo de recurso */}
          {loadingResources || loadingMetrics || isRefreshing ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[...Array(7)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-4 rounded" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-16 mb-2" />
                    <Skeleton className="h-2 w-full mb-1" />
                    <Skeleton className="h-3 w-12" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {resourceStats.map((stat) => {
                const Icon = stat.icon;
                const isSelected = selectedResourceType === stat.type;
                return (
                  <Card 
                    key={stat.type}
                    className={`cursor-pointer transition-all hover:shadow-lg hover:scale-105 ${
                      isSelected ? 'ring-2 ring-primary shadow-lg' : ''
                    }`}
                    onClick={() => handleResourceTypeFilter(stat.type)}
                  >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {stat.type === 'ec2' && stat.count > 0 ? (
                          <>
                            <span className="text-primary">{stat.runningCount}</span>
                            <span className="text-muted-foreground"> / {stat.count}</span>
                          </>
                        ) : (
                          stat.count
                        )}
                      </div>
                      {stat.avgCpu !== null && (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground mb-1">CPU Média</p>
                          <Progress value={stat.avgCpu} className="h-2" />
                          <p className="text-xs text-muted-foreground mt-1">{stat.avgCpu.toFixed(1)}%</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Filtro e lista de recursos */}
          <Card ref={resourcesRef}>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <CardTitle>Recursos Monitorados</CardTitle>
                  <CardDescription>
                    {filteredResources?.length || 0} recursos encontrados (ativos primeiro)
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    placeholder="Buscar recurso..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-[200px]"
                  />
                  <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as regiões</SelectItem>
                      {availableRegions.map(region => (
                        <SelectItem key={region} value={region}>
                          {region}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedResourceType} onValueChange={setSelectedResourceType}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      {RESOURCE_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingResources || isRefreshing ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="border rounded-lg p-4 animate-pulse">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-5 w-16" />
                            <Skeleton className="h-5 w-40" />
                            <Skeleton className="h-5 w-20" />
                          </div>
                          <Skeleton className="h-4 w-3/4" />
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Skeleton className="h-3 w-32" />
                              <Skeleton className="h-3 w-12" />
                            </div>
                            <Skeleton className="h-2 w-full" />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredResources && filteredResources.length > 0 ? (
                <div className="space-y-4">
                {filteredResources.map((resource: any) => {
                    const resourceKey = `${resource.resource_type}-${resource.resource_id}`;
                    
                    // Buscar métricas deste recurso diretamente
                    const resourceSpecificMetrics = metrics?.filter(m => 
                      m.resource_id === resource.resource_id && 
                      m.resource_type === resource.resource_type
                    ) || [];
                    
                    // Definir métrica primária por tipo de recurso - com fallback para qualquer métrica
                    const getPrimaryMetric = () => {
                      if (resourceSpecificMetrics.length === 0) return null;
                      
                      const type = resource.resource_type;
                      let metric = null;
                      
                      if (type === 'ec2' || type === 'rds' || type === 'elasticache') {
                        metric = resourceSpecificMetrics.find((m: any) => m.metric_name === 'CPUUtilization');
                      } else if (type === 'lambda') {
                        metric = resourceSpecificMetrics.find((m: any) => m.metric_name === 'Duration');
                      } else if (type === 'apigateway') {
                        metric = resourceSpecificMetrics.find((m: any) => m.metric_name === 'Latency');
                      } else if (type === 'alb' || type === 'nlb') {
                        metric = resourceSpecificMetrics.find((m: any) => m.metric_name === 'RequestCount');
                      }
                      
                      // Fallback: qualquer métrica disponível se não encontrar a primária esperada
                      return metric || resourceSpecificMetrics[0];
                    };
                    
                    const primaryMetric = getPrimaryMetric();
                    const hasMetrics = resourceSpecificMetrics.length > 0;
                    
                    // Formatar valor baseado no tipo de métrica
                    const formatPrimaryValue = () => {
                      if (!primaryMetric) return '';
                      const value = Number(primaryMetric.metric_value);
                      const name = primaryMetric.metric_name;
                      
                      if (COUNT_METRICS.has(name)) {
                        return Math.round(value).toLocaleString();
                      }
                      if (name === 'CPUUtilization') {
                        return `${value.toFixed(1)}%`;
                      }
                      if (name === 'Duration' || name === 'Latency' || name === 'IntegrationLatency') {
                        return `${value.toFixed(2)} ms`;
                      }
                      return value.toFixed(2);
                    };

                    return (
                      <div 
                        key={resourceKey} 
                        className="border rounded-lg p-4 hover:border-primary/50 transition-colors cursor-pointer"
                        onClick={() => setSelectedResource(resource)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline">{resource.resource_type.toUpperCase()}</Badge>
                              <h4 className="font-semibold">{resource.resource_name}</h4>
                              <Badge variant={
                                resource.status === 'running' || resource.status === 'active' 
                                  ? 'default' 
                                  : 'secondary'
                              }>
                                {resource.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              ID: {resource.resource_id} | Região: {resource.region}
                            </p>

                            {primaryMetric ? (
                              <div className="mt-3">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm">{primaryMetric.metric_name}</span>
                                  <span className="text-sm font-medium">{formatPrimaryValue()}</span>
                                </div>
                                {primaryMetric.metric_name === 'CPUUtilization' && (
                                  <Progress value={Number(primaryMetric.metric_value)} className="h-2" />
                                )}
                              </div>
                            ) : !hasMetrics ? (
                              <p className="text-sm text-muted-foreground mt-2">
                                Clique para ver detalhes ou Atualizar para coletar métricas
                              </p>
                            ) : null}

                            {resourceSpecificMetrics.length > 0 && (
                              <div className="mt-4 grid grid-cols-2 gap-2">
                                {resourceSpecificMetrics
                                  .filter((m: any) => m.metric_name !== 'CPUUtilization')
                                  .slice(0, 4)
                                  .map((metric: any) => (
                                    <div key={metric.id} className="text-sm">
                                      <span className="text-muted-foreground">{metric.metric_name}:</span>{' '}
                                      <span className="font-medium">
                                        {formatMetricValue(metric.metric_name, Number(metric.metric_value))} {metric.metric_unit}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-2">
                    {selectedResourceType === 'all' 
                      ? '⚠️ Nenhum recurso encontrado nesta conta'
                      : `⚠️ Nenhum recurso do tipo ${RESOURCE_TYPES.find(t => t.value === selectedResourceType)?.label} encontrado`
                    }
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Clique em "Atualizar" para buscar recursos na AWS
                  </p>
                </div>
              )}

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-2 py-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Mostrando {startIndex + 1}-{Math.min(endIndex, allFilteredResources.length)} de {allFilteredResources.length} recursos
                  </div>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                        // Mostrar primeira página, última página, página atual e páginas adjacentes
                        if (
                          page === 1 ||
                          page === totalPages ||
                          (page >= currentPage - 1 && page <= currentPage + 1)
                        ) {
                          return (
                            <PaginationItem key={page}>
                              <PaginationLink
                                onClick={() => setCurrentPage(page)}
                                isActive={currentPage === page}
                                className="cursor-pointer"
                              >
                                {page}
                              </PaginationLink>
                            </PaginationItem>
                          );
                        } else if (page === currentPage - 2 || page === currentPage + 2) {
                          return (
                            <PaginationItem key={page}>
                              <PaginationEllipsis />
                            </PaginationItem>
                          );
                        }
                        return null;
                      })}

                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};
