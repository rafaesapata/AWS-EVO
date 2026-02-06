import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Server, Database, Layers, Zap, Cloud, Activity, ArrowLeft, Link2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ResourceComparison } from "./resource-monitoring/ResourceComparison";
import { SavedFilters } from "./resource-monitoring/SavedFilters";
import { MetricsPeriodSelector, MetricsPeriod, PERIOD_CONFIG } from "./resource-monitoring/MetricsPeriodSelector";
import { ResourceMetricsChart } from "./resource-monitoring/ResourceMetricsChart";
import { useOrganizationQuery } from "@/hooks/useOrganizationQuery";
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
import { useDemoAwareQuery } from "@/hooks/useDemoAwareQuery";
import { CACHE_CONFIGS } from "@/hooks/useQueryCache";
import { AWSPermissionError } from "./AWSPermissionError";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useMetricsCache } from "@/hooks/useMetricsCache";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

// ============================================
// PERFORMANCE: Memoized Resource Card Component
// ============================================
interface ResourceCardProps {
  resource: any;
  metrics: any[];
  onSelect: (resource: any) => void;
}

const ResourceCard = memo(({ resource, metrics, onSelect }: ResourceCardProps) => {
  const { t } = useTranslation();
  const resourceKey = `${resource.resource_type}-${resource.resource_id}`;
  
  // Memoize metrics filtering for this specific resource
  const resourceSpecificMetrics = useMemo(() => {
    if (!metrics || !Array.isArray(metrics)) return [];
    return metrics.filter(m => 
      m.resource_id === resource.resource_id && 
      m.resource_type === resource.resource_type
    );
  }, [metrics, resource.resource_id, resource.resource_type]);
  
  // Memoize primary metric calculation
  const primaryMetric = useMemo(() => {
    if (resourceSpecificMetrics.length === 0) return null;
    return getPrimaryMetric(resourceSpecificMetrics, resource.resource_type);
  }, [resourceSpecificMetrics, resource.resource_type]);

  const hasMetrics = resourceSpecificMetrics.length > 0;
  
  // Format value based on metric type
  const formatPrimaryValue = useCallback(() => {
    if (!primaryMetric) return '';
    return formatMetricValue(primaryMetric.metric_name, Number(primaryMetric.metric_value));
  }, [primaryMetric]);

  const handleClick = useCallback(() => onSelect(resource), [onSelect, resource]);

  return (
    <div 
      key={resourceKey} 
      className="border rounded-lg p-4 hover:border-primary/50 transition-colors cursor-pointer"
      onClick={handleClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline">{resource.resource_type.toUpperCase()}</Badge>
            <h4 className="font-semibold text-sm">{resource.resource_name}</h4>
            <Badge variant={getStatusBadgeVariant(resource.status)}>
              {resource.status}
            </Badge>
            {resourceSpecificMetrics.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                📊 {resourceSpecificMetrics.length}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-2">
            {t('resourceMonitoring.id', 'ID')}: {resource.resource_id} | {t('resourceMonitoring.region', 'Region')}: {resource.region}
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
              {t('resourceMonitoring.clickForDetails', 'Click for details or Refresh to collect metrics')}
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
                      {formatMetricValue(metric.metric_name, Number(metric.metric_value))}
                      {metric.metric_unit && metric.metric_unit !== 'None' && ` ${metric.metric_unit}`}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

ResourceCard.displayName = 'ResourceCard';

// AWS Resource Types
const AWS_RESOURCE_TYPES = [
  { value: 'ec2', labelKey: 'resourceMonitoring.resourceTypes.ec2', icon: Server },
  { value: 'rds', labelKey: 'resourceMonitoring.resourceTypes.rds', icon: Database },
  { value: 'elasticache', labelKey: 'resourceMonitoring.resourceTypes.elasticache', icon: Layers },
  { value: 'lambda', labelKey: 'resourceMonitoring.resourceTypes.lambda', icon: Zap },
  { value: 'ecs', labelKey: 'resourceMonitoring.resourceTypes.ecs', icon: Cloud },
  { value: 'elb', labelKey: 'resourceMonitoring.resourceTypes.elb', icon: Activity },
  { value: 'alb', labelKey: 'resourceMonitoring.resourceTypes.alb', icon: Activity },
  { value: 'nlb', labelKey: 'resourceMonitoring.resourceTypes.nlb', icon: Activity },
  { value: 'apigateway', labelKey: 'resourceMonitoring.resourceTypes.apigateway', icon: Link2 }
];

// Azure Resource Types
const AZURE_RESOURCE_TYPES = [
  { value: 'vm', labelKey: 'resourceMonitoring.resourceTypes.vm', icon: Server },
  { value: 'webapp', labelKey: 'resourceMonitoring.resourceTypes.webapp', icon: Cloud },
  { value: 'sqldb', labelKey: 'resourceMonitoring.resourceTypes.sqldb', icon: Database },
  { value: 'storage', labelKey: 'resourceMonitoring.resourceTypes.storage', icon: Layers },
];

// Legacy constant for backward compatibility
const RESOURCE_TYPES = AWS_RESOURCE_TYPES;

// ============================================
// Type definitions for resources and metrics
// ============================================
interface MonitoredResource {
  id: string;
  resource_id: string;
  resource_name: string;
  resource_type: string;
  region: string;
  status: string;
  aws_account_id: string;
  organization_id: string;
  metadata?: Record<string, any>;
}

interface ResourceMetric {
  id: string;
  resource_id: string;
  resource_type: string;
  resource_name?: string;
  metric_name: string;
  metric_value: number;
  metric_unit: string;
  timestamp: string;
  aws_account_id: string;
  organization_id: string;
}

interface AwsAccount {
  id: string;
  organization_id: string;
  account_id: string;
  account_name: string;
}

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

// Função para obter variante do badge baseada no status
const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  const statusLower = status?.toLowerCase();
  if (['running', 'active', 'available'].includes(statusLower)) {
    return 'default'; // Verde
  }
  if (['pending', 'stopping'].includes(statusLower)) {
    return 'outline'; // Amarelo/neutro
  }
  if (['stopped', 'terminated', 'failed'].includes(statusLower)) {
    return 'destructive'; // Vermelho
  }
  return 'secondary'; // Cinza para unknown
};

// Obter métrica primária por tipo de recurso com prioridades específicas
const getPrimaryMetric = (resourceSpecificMetrics: any[], resourceType: string) => {
  if (resourceSpecificMetrics.length === 0) return null;
  
  let metric = null;
  
  if (resourceType === 'ec2' || resourceType === 'rds' || resourceType === 'elasticache') {
    metric = resourceSpecificMetrics.find((m: any) => m.metric_name === 'CPUUtilization');
  } else if (resourceType === 'lambda') {
    // Para Lambda, priorizar Invocations primeiro, depois Duration
    metric = resourceSpecificMetrics.find((m: any) => m.metric_name === 'Invocations') ||
             resourceSpecificMetrics.find((m: any) => m.metric_name === 'Duration');
  } else if (resourceType === 'apigateway') {
    metric = resourceSpecificMetrics.find((m: any) => m.metric_name === 'Count') ||
             resourceSpecificMetrics.find((m: any) => m.metric_name === 'Latency');
  } else if (resourceType === 'alb' || resourceType === 'nlb') {
    metric = resourceSpecificMetrics.find((m: any) => m.metric_name === 'RequestCount');
  }
  
  // Fallback: qualquer métrica disponível se não encontrar a primária esperada
  return metric || resourceSpecificMetrics[0];
};

// Formatar valor da métrica baseado no tipo
const formatMetricValue = (metricName: string, value: number): string => {
  if (COUNT_METRICS.has(metricName)) {
    return Math.round(value).toLocaleString();
  }
  if (metricName === 'Duration' || metricName === 'Latency' || metricName === 'IntegrationLatency') {
    return `${value.toFixed(2)} ms`;
  }
  if (metricName === 'CPUUtilization' || metricName === 'MemoryUtilization') {
    return `${value.toFixed(1)}%`;
  }
  return value.toFixed(2);
};

export const ResourceMonitoringDashboard = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const resourcesRef = useRef<HTMLDivElement>(null);
  
  // CRITICAL: Use global account selector instead of local state
  const { selectedAccountId, selectedProvider, accounts, isLoading: accountsLoading } = useCloudAccount();
  const { getAccountFilter } = useAccountFilter();
  const { isInDemoMode } = useDemoAwareQuery();
  
  // Multi-cloud support
  const isAzure = selectedProvider === 'AZURE';
  
  // PERFORMANCE: Use intelligent metrics cache to avoid refetching already loaded periods
  const { 
    fetchMetrics, 
    getMetricsFromCache, 
    isPeriodCached, 
    clearCache: clearMetricsCache,
    getCacheStats,
    isLoading: metricsLoading 
  } = useMetricsCache();
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedResourceType, setSelectedResourceType] = useState<string>("all");
  const [selectedResource, setSelectedResource] = useState<MonitoredResource | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedRegion, setSelectedRegion] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<string>("off");
  const [metricsPeriod, setMetricsPeriod] = useState<MetricsPeriod>("3h");
  const [metrics, setMetrics] = useState<ResourceMetric[]>([]);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [permissionErrors, setPermissionErrors] = useState<Array<{
    resourceType: string;
    region: string;
    error: string;
    missingPermissions: string[];
  }>>([]);
  const itemsPerPage = 10;

  // Função para filtrar por tipo de recurso e fazer scroll
  const handleResourceTypeFilter = useCallback((type: string) => {
    setSelectedResourceType(type);
    setCurrentPage(1);
    
    // Scroll suave para a seção de recursos
    setTimeout(() => {
      resourcesRef.current?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }, 100);

    const resourceType = RESOURCE_TYPES.find(r => r.value === type);
    toast({
      title: t('resourceMonitoring.filterApplied', 'Filter applied'),
      description: t('resourceMonitoring.showingResourceType', 'Showing only {{type}} resources', { type: resourceType ? t(resourceType.labelKey) : type }),
    });
  }, [toast, t]);

  // Auto-refresh effect - USE GLOBAL selectedAccountId
  useEffect(() => {
    if (autoRefreshInterval === "off" || !selectedAccountId) return;

    const intervalMs = autoRefreshInterval === "15s" ? 15000 : 
                       autoRefreshInterval === "30s" ? 30000 : 60000;

    const interval = setInterval(() => {
      handleRefresh(true); // Force refresh on auto-refresh
    }, intervalMs);

    return () => clearInterval(interval);
  }, [autoRefreshInterval, selectedAccountId]);

  // Buscar recursos monitorados - FILTERED BY GLOBAL ACCOUNT (supports Demo Mode)
  const { data: resources, isLoading: loadingResources } = useOrganizationQuery<MonitoredResource[]>(
    ['monitored-resources', selectedAccountId, isInDemoMode, isAzure],
    async (organizationId) => {
      // In demo mode, call the Lambda handler which returns demo data
      if (isInDemoMode) {
        const response = await apiClient.invoke<any>('fetch-cloudwatch-metrics', {
          body: { accountId: 'demo', period: '3h' }
        });
        
        if (response.data?.resources) {
          // Transform resources to match MonitoredResource interface
          return response.data.resources.map((r: any) => ({
            id: `demo-${r.resourceId}`,
            resource_id: r.resourceId,
            resource_name: r.resourceName,
            resource_type: r.resourceType,
            region: r.region,
            status: r.status,
            aws_account_id: 'demo-account',
            organization_id: 'demo-org',
            metadata: r.metadata
          })) as MonitoredResource[];
        }
        return [];
      }
      
      if (!selectedAccountId) return [];
      
      // Verificar se a conta pertence à organização (usando tabela correta por provider)
      if (isAzure) {
        const accountResponse = await apiClient.select('azure_credentials', { 
          eq: { id: selectedAccountId, organization_id: organizationId } 
        });
        if (accountResponse.error || !accountResponse.data || (accountResponse.data as any[]).length === 0) return [];
      } else {
        const accountResponse = await apiClient.select('aws_credentials', { 
          eq: { id: selectedAccountId, organization_id: organizationId } 
        });
        if (accountResponse.error || !accountResponse.data || (accountResponse.data as AwsAccount[]).length === 0) return [];
      }
      
      // Query monitored_resources - Multi-cloud compatible using getAccountFilter()
      const resourceResponse = await apiClient.select('monitored_resources', { 
        eq: { organization_id: organizationId, ...getAccountFilter() } 
      });
      return (resourceResponse.data || []) as MonitoredResource[];
    },
    {
      ...CACHE_CONFIGS.FREQUENT,
      enabled: isInDemoMode || !!selectedAccountId,
    }
  );

  // PERFORMANCE: Load metrics using intelligent cache
  // Only fetches from backend if period not already cached
  const loadMetricsWithCache = useCallback(async (forceRefresh: boolean = false) => {
    if (!selectedAccountId && !isInDemoMode) return;
    
    // Check if we already have this period cached
    const cacheKey = isInDemoMode ? 'demo-account' : selectedAccountId;
    if (!forceRefresh && cacheKey && isPeriodCached(cacheKey, metricsPeriod)) {
      const cachedMetrics = getMetricsFromCache(cacheKey, metricsPeriod);
      if (cachedMetrics) {
        setMetrics(cachedMetrics as ResourceMetric[]);
        // Show cache hit indicator
        const stats = getCacheStats(cacheKey);
        console.log(`[MetricsCache] Cache hit for ${metricsPeriod}:`, stats);
        return;
      }
    }
    
    setLoadingMetrics(true);
    try {
      // In demo mode, call the Lambda handler which returns demo data
      if (isInDemoMode) {
        const response = await apiClient.invoke<any>('fetch-cloudwatch-metrics', {
          body: { accountId: 'demo', period: metricsPeriod }
        });
        
        if (response.data?.metrics) {
          // Transform metrics to match ResourceMetric interface
          const demoMetrics = response.data.metrics.map((m: any) => ({
            id: `demo-${m.resourceId}-${m.metricName}-${Date.now()}`,
            resource_id: m.resourceId,
            resource_type: m.resourceType,
            resource_name: m.resourceName,
            metric_name: m.metricName,
            metric_value: m.value,
            metric_unit: m.unit,
            timestamp: m.timestamp,
            aws_account_id: 'demo-account',
            organization_id: 'demo-org'
          }));
          setMetrics(demoMetrics as ResourceMetric[]);
          console.log(`[MetricsCache] Loaded ${demoMetrics.length} demo metrics from Lambda`);
        }
        return;
      }
      
      // Get organization ID from credentials table based on provider
      let organizationId: string | undefined;
      
      if (isAzure) {
        // For Azure, query azure_credentials table
        const orgResponse = await apiClient.select('azure_credentials', { 
          eq: { id: selectedAccountId } 
        });
        const accountData = orgResponse.data as any[] | null;
        organizationId = accountData?.[0]?.organization_id;
      } else {
        // For AWS, query aws_credentials table
        const orgResponse = await apiClient.select('aws_credentials', { 
          eq: { id: selectedAccountId } 
        });
        const accountData = orgResponse.data as AwsAccount[] | null;
        organizationId = accountData?.[0]?.organization_id;
      }
      
      if (!organizationId) {
        console.error('[MetricsCache] No organization ID found for account:', selectedAccountId, 'provider:', isAzure ? 'Azure' : 'AWS');
        return;
      }
      
      const fetchedMetrics = await fetchMetrics(
        selectedAccountId!, 
        organizationId, 
        metricsPeriod, 
        forceRefresh
      );
      
      setMetrics(fetchedMetrics as ResourceMetric[]);
      
      // Log cache stats for debugging
      const stats = getCacheStats(selectedAccountId!);
      console.log(`[MetricsCache] Loaded ${fetchedMetrics.length} metrics:`, stats);
      
    } catch (err) {
      console.error('[MetricsCache] Error loading metrics:', err);
    } finally {
      setLoadingMetrics(false);
    }
  }, [selectedAccountId, metricsPeriod, isPeriodCached, getMetricsFromCache, fetchMetrics, getCacheStats, isInDemoMode, isAzure]);

  // Load metrics when account or period changes
  useEffect(() => {
    if (selectedAccountId || isInDemoMode) {
      loadMetricsWithCache(false);
    }
  }, [selectedAccountId, metricsPeriod, loadMetricsWithCache, isInDemoMode]);

  const handleRefresh = useCallback(async (forceRefresh: boolean = true) => {
    if (!selectedAccountId && !isInDemoMode) {
      toast({
        title: t('resourceMonitoring.selectAccount', 'Select an account'),
        description: t('resourceMonitoring.selectAccountDescription', 'Please select an {{provider}} account to update metrics.', { provider: isAzure ? 'Azure' : 'AWS' }),
        variant: "destructive"
      });
      return;
    }
    
    // In demo mode, show a toast that this is demo data
    if (isInDemoMode) {
      toast({
        title: t('common.demoMode', 'Demo Mode'),
        description: t('resourceMonitoring.demoModeDesc', 'In demo mode, data is simulated. Connect a cloud account to see real resources.'),
      });
      // Refresh demo data
      queryClient.invalidateQueries({ queryKey: ['monitored-resources'] });
      return;
    }

    setIsRefreshing(true);
    
    const providerName = isAzure ? 'Azure' : 'AWS';
    
    // 🚀 Toast otimista mostrando progresso
    toast({
      title: `🔄 ${t('resourceMonitoring.collectingMetrics', 'Collecting metrics...')}`,
      description: t('resourceMonitoring.fetchingData', 'Fetching {{provider}} resource data in parallel', { provider: providerName }),
    });

    try {
      // Multi-cloud: Call appropriate Lambda based on provider
      const lambdaName = isAzure ? 'azure-fetch-monitor-metrics' : 'fetch-cloudwatch-metrics';
      
      // For Azure, we need to find the credential ID from the subscription ID
      let bodyParam;
      if (isAzure) {
        // Find the Azure credential by subscription ID (accountId)
        const azureAccount = accounts.find(acc => 
          acc.provider === 'AZURE' && acc.accountId === selectedAccountId
        );
        
        if (!azureAccount) {
          throw new Error(t('resourceMonitoring.azureCredentialNotFound', 'Azure credential not found'));
        }
        
        bodyParam = { credentialId: azureAccount.id };
      } else {
        bodyParam = { accountId: selectedAccountId };
      }
      
      const response = await apiClient.invoke<any>(lambdaName, {
        body: bodyParam
      });

      // Handle API error response
      if ('error' in response && response.error) {
        const errorMsg = typeof response.error === 'string' 
          ? response.error 
          : response.error?.message || 'Erro ao coletar métricas';
        throw new Error(errorMsg);
      }

      // Get data from response
      const data = response.data;

      if (!data || data.success === false) {
        const errorMsg = typeof data?.error === 'string' 
          ? data.error 
          : data?.error?.message || data?.message || 'Falha ao coletar métricas';
        throw new Error(errorMsg);
      }

      // Armazenar erros de permissão se houver
      if (data.permissionErrors && data.permissionErrors.length > 0) {
        setPermissionErrors(data.permissionErrors);
      } else {
        setPermissionErrors([]);
      }

      // PERFORMANCE: Clear metrics cache and reload with fresh data
      clearMetricsCache(selectedAccountId);
      
      // Invalidar cache de recursos
      queryClient.removeQueries({ queryKey: ['monitored-resources'] });

      toast({
        title: `✅ ${t('resourceMonitoring.metricsUpdated', 'Metrics updated')}`,
        description: data.message || t('resourceMonitoring.metricsCollected', '{{count}} metrics collected from {{resources}} resources', { count: data.metricsCollected || 0, resources: data.resourcesFound || 0 }),
      });

      // Refetch resources and reload metrics with force refresh
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['monitored-resources'] }),
        loadMetricsWithCache(true) // Force refresh from backend
      ]);
    } catch (error: any) {
      toast({
        title: t('resourceMonitoring.errorUpdatingMetrics', 'Error updating metrics'),
        description: error.message || 'Unknown error',
        variant: "destructive"
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedAccountId, isAzure, toast, clearMetricsCache, queryClient, loadMetricsWithCache, t]);

  // PERFORMANCE: Memoize available regions
  const availableRegions = useMemo(() => {
    if (!resources || !Array.isArray(resources)) {
      return [];
    }
    const resourceList = resources as MonitoredResource[];
    return Array.from(new Set(resourceList.map(r => r.region))).sort();
  }, [resources]);

  // PERFORMANCE: Memoize filtered and sorted resources
  const allFilteredResources = useMemo(() => {
    const statusOrder: Record<string, number> = {
      'running': 0,
      'active': 0,
      'available': 0,
      'pending': 1,
      'stopping': 1,
      'stopped': 2,
      'terminated': 3,
      'failed': 3,
      'unknown': 4
    };
    
    // Ensure resources is always an array
    if (!resources || !Array.isArray(resources)) {
      return [];
    }
    
    let filtered: MonitoredResource[] = resources as MonitoredResource[];
    
    // Filter by type
    if (selectedResourceType !== 'all') {
      filtered = filtered.filter(r => r.resource_type === selectedResourceType);
    }
    
    // Filter by region
    if (selectedRegion !== 'all') {
      filtered = filtered.filter(r => r.region === selectedRegion);
    }
    
    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r => 
        r.resource_name?.toLowerCase().includes(term) || 
        r.resource_id?.toLowerCase().includes(term) ||
        r.resource_type?.toLowerCase().includes(term) ||
        r.region?.toLowerCase().includes(term)
      );
    }
    
    // Sort by status (active first), then by metrics availability, then by resource type, then by name
    const sorted = [...filtered].sort((a, b) => {
      // Primeiro critério: status (ativos primeiro)
      const aOrder = statusOrder[a.status?.toLowerCase()] ?? 4;
      const bOrder = statusOrder[b.status?.toLowerCase()] ?? 4;
      
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      
      // Segundo critério: quantidade de métricas disponíveis (recursos com mais dados primeiro)
      const aMetrics = (metrics && Array.isArray(metrics)) ? metrics.filter(m => 
        m.resource_id === a.resource_id && m.resource_type === a.resource_type
      ) : [];
      const bMetrics = (metrics && Array.isArray(metrics)) ? metrics.filter(m => 
        m.resource_id === b.resource_id && m.resource_type === b.resource_type
      ) : [];
      
      const aMetricsCount = aMetrics.length;
      const bMetricsCount = bMetrics.length;
      
      if (aMetricsCount !== bMetricsCount) {
        return bMetricsCount - aMetricsCount; // Mais métricas primeiro
      }
      
      // Terceiro critério: tipo de recurso (alfabético)
      const typeComparison = a.resource_type.localeCompare(b.resource_type);
      if (typeComparison !== 0) {
        return typeComparison;
      }
      
      // Quarto critério: nome do recurso (alfabético)
      const aName = a.resource_name || a.resource_id || '';
      const bName = b.resource_name || b.resource_id || '';
      return aName.localeCompare(bName);
    });
    
    // Debug: Log ordenação para verificar se está correta
    if (sorted.length > 0) {
      console.log('[ResourceMonitoring] Recursos ordenados:', 
        sorted.slice(0, 10).map(r => {
          const resourceMetrics = (metrics && Array.isArray(metrics)) ? metrics.filter(m => 
            m.resource_id === r.resource_id && m.resource_type === r.resource_type
          ) : [];
          return {
            name: r.resource_name,
            type: r.resource_type,
            status: r.status,
            statusOrder: statusOrder[r.status?.toLowerCase()] ?? 4,
            metricsCount: resourceMetrics.length
          };
        })
      );
    }
    
    return sorted;
  }, [resources, selectedResourceType, selectedRegion, searchTerm, metrics]);

  // PERFORMANCE: Memoize pagination calculations
  const { totalPages, startIndex, endIndex, filteredResources } = useMemo(() => {
    const total = Math.ceil(allFilteredResources.length / itemsPerPage);
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return {
      totalPages: total,
      startIndex: start,
      endIndex: end,
      filteredResources: allFilteredResources.slice(start, end)
    };
  }, [allFilteredResources, currentPage, itemsPerPage]);

  // Reset para primeira página quando filtros mudarem
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedResourceType, selectedRegion, searchTerm]);

  // Reset resource type filter when switching between AWS/Azure providers
  useEffect(() => {
    setSelectedResourceType('all');
  }, [isAzure]);

  // Agrupar métricas por recurso
  const resourceMetrics = metrics?.reduce((acc: Record<string, { resource: ResourceMetric; metrics: ResourceMetric[] }>, metric: ResourceMetric) => {
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

  // Estatísticas por tipo de recurso - usa tipos corretos baseado no provider
  const activeResourceTypes = useMemo(() => {
    return isAzure ? AZURE_RESOURCE_TYPES : AWS_RESOURCE_TYPES;
  }, [isAzure]);

  const resourceStats = useMemo(() => {
    // Ensure resources is always an array
    if (!resources || !Array.isArray(resources)) {
      return activeResourceTypes.map(type => ({
        type: type.value,
        labelKey: type.labelKey,
        icon: type.icon,
        count: 0,
        runningCount: 0,
        avgCpu: null
      }));
    }
    
    const resourceList = resources as MonitoredResource[];
    
    return activeResourceTypes.map(type => {
      const count = resourceList.filter(r => r.resource_type === type.value).length;
      
      // Filtrar apenas recursos com status ativo para cálculo de CPU média
      const activeResourceIds = new Set(
        resourceList
          .filter(r => 
            r.resource_type === type.value && 
            ['running', 'active', 'available'].includes(r.status?.toLowerCase() || '')
          )
          .map(r => r.resource_id)
      );
      
      // Contar quantos estão ativos/ligados
      const runningCount = activeResourceIds.size;
      
      // Azure uses different metric names: "Percentage CPU" instead of "CPUUtilization"
      const cpuMetricName = isAzure ? 'Percentage CPU' : 'CPUUtilization';
      const cpuMetrics = (metrics && Array.isArray(metrics)) ? metrics.filter(m => 
          m.resource_type === type.value && 
          m.metric_name === cpuMetricName &&
          activeResourceIds.has(m.resource_id)
        ) : [];
      
      const avgCpu = cpuMetrics.length > 0
        ? cpuMetrics.reduce((sum, m) => sum + Number(m.metric_value), 0) / cpuMetrics.length
        : null;

      return {
        type: type.value,
        labelKey: type.labelKey,
        icon: type.icon,
        count,
        runningCount,
        avgCpu: avgCpu !== null && !isNaN(avgCpu) ? avgCpu : null
      };
    });
  }, [resources, metrics, activeResourceTypes, isAzure]);

  // Auto-fetch: trigger refresh automatically when page loads with no data
  const hasTriggeredAutoFetch = useRef(false);
  useEffect(() => {
    if (
      !hasTriggeredAutoFetch.current &&
      selectedAccountId &&
      !isInDemoMode &&
      !loadingResources &&
      !isRefreshing &&
      resources !== undefined &&
      Array.isArray(resources) &&
      resources.length === 0 &&
      metrics.length === 0
    ) {
      hasTriggeredAutoFetch.current = true;
      // Small delay to let the UI render first
      const timer = setTimeout(() => {
        handleRefresh(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [selectedAccountId, isInDemoMode, loadingResources, isRefreshing, resources, metrics, handleRefresh]);

  // Reset auto-fetch flag when account changes
  useEffect(() => {
    hasTriggeredAutoFetch.current = false;
  }, [selectedAccountId]);

  if (!accounts || accounts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('resourceMonitoring.title', 'Resource Monitoring')}</CardTitle>
          <CardDescription>{t('resourceMonitoring.configureAccount', 'Configure an account to start monitoring')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t('resourceMonitoring.noAccountConfigured', 'No account configured.')}</p>
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
    const resourceSpecificMetrics = (metrics && Array.isArray(metrics)) ? metrics.filter(m => {
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
    }) : [];

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
              {t('resourceMonitoring.back', 'Back')}
            </Button>
            <div>
              <h2 className="text-3xl font-semibold">{selectedResource.resource_name}</h2>
              <p className="text-muted-foreground">
                {selectedResource.resource_type.toUpperCase()} • {selectedResource.region} • {selectedResource.status}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <MetricsPeriodSelector value={metricsPeriod} onChange={setMetricsPeriod} />
              {selectedAccountId && isPeriodCached(selectedAccountId, metricsPeriod) && (
                <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {t('resourceMonitoring.cache', 'Cache')}
                </Badge>
              )}
            </div>
            <Select value={autoRefreshInterval} onValueChange={setAutoRefreshInterval}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={t('resourceMonitoring.autoRefresh', 'Auto-refresh')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">{t('resourceMonitoring.off', 'Off')}</SelectItem>
                <SelectItem value="15s">{t('resourceMonitoring.every15s', 'Every 15s')}</SelectItem>
                <SelectItem value="30s">{t('resourceMonitoring.every30s', 'Every 30s')}</SelectItem>
                <SelectItem value="1m">{t('resourceMonitoring.every1m', 'Every 1 min')}</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              onClick={() => handleRefresh(true)} 
              disabled={isRefreshing || !selectedAccountId}
              className="gap-2"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {t('resourceMonitoring.refresh', 'Refresh')}
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
                {t('resourceMonitoring.noMetricsAvailable', 'No metrics available for this resource. Click "Refresh" to collect data.')}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-4">
          <Select value={autoRefreshInterval} onValueChange={setAutoRefreshInterval}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('resourceMonitoring.autoRefresh', 'Auto-refresh')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">{t('resourceMonitoring.off', 'Off')}</SelectItem>
              <SelectItem value="15s">{t('resourceMonitoring.every15s', 'Every 15s')}</SelectItem>
              <SelectItem value="30s">{t('resourceMonitoring.every30s', 'Every 30s')}</SelectItem>
              <SelectItem value="1m">{t('resourceMonitoring.every1m', 'Every 1 min')}</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            onClick={() => handleRefresh(true)} 
            disabled={isRefreshing || !selectedAccountId}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {t('resourceMonitoring.refresh', 'Refresh')}
          </Button>
        </div>
      </div>

      {selectedAccountId && (
        <>
          {/* Alerta de Permissões Faltantes */}
          <AWSPermissionError errors={permissionErrors} cloudProvider={selectedProvider} />

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
                      <CardTitle className="text-sm font-medium">{t(stat.labelKey)}</CardTitle>
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-semibold">
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
                          <p className="text-xs text-muted-foreground mb-1">{t('resourceMonitoring.avgCpu', 'Average CPU')}</p>
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
                  <CardTitle>{t('resourceMonitoring.monitoredResources', 'Monitored Resources')}</CardTitle>
                  <CardDescription>
                    {t('resourceMonitoring.resourcesFound', '{{count}} resources found', { count: filteredResources?.length || 0 })}
                    <span className="text-xs text-muted-foreground ml-2">
                      {t('resourceMonitoring.sortingInfo', '(🟢 Active → 📊 More data → 🔤 By type)')}
                    </span>
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    placeholder={t('resourceMonitoring.searchResource', 'Search resource...')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-[200px]"
                  />
                  <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('resourceMonitoring.allRegions', 'All regions')}</SelectItem>
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
                      <SelectItem value="all">{t('resourceMonitoring.allTypes', 'All types')}</SelectItem>
                      {activeResourceTypes.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {t(type.labelKey)}
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
                    const resourceSpecificMetrics = (metrics && Array.isArray(metrics)) ? metrics.filter(m => 
                      m.resource_id === resource.resource_id && 
                      m.resource_type === resource.resource_type
                    ) : [];
                    
                    // Definir métrica primária por tipo de recurso - com fallback para qualquer métrica
                    const primaryMetric = getPrimaryMetric(resourceSpecificMetrics, resource.resource_type);
                    const hasMetrics = resourceSpecificMetrics.length > 0;
                    
                    // Formatar valor baseado no tipo de métrica
                    const formatPrimaryValue = () => {
                      if (!primaryMetric) return '';
                      return formatMetricValue(primaryMetric.metric_name, Number(primaryMetric.metric_value));
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
                              <h4 className="font-semibold text-sm">{resource.resource_name}</h4>
                              <Badge variant={getStatusBadgeVariant(resource.status)}>
                                {resource.status}
                              </Badge>
                              {resourceSpecificMetrics.length > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  📊 {resourceSpecificMetrics.length}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              {t('resourceMonitoring.id', 'ID')}: {resource.resource_id} | {t('resourceMonitoring.region', 'Region')}: {resource.region}
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
                                {t('resourceMonitoring.clickForDetails', 'Click for details or Refresh to collect metrics')}
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
                                        {formatMetricValue(metric.metric_name, Number(metric.metric_value))}
                                        {metric.metric_unit && metric.metric_unit !== 'None' && ` ${metric.metric_unit}`}
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
              <div className="text-center py-12">
                  <Server className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                  <p className="text-lg font-medium text-muted-foreground mb-2">
                    {selectedResourceType === 'all' 
                      ? t('resourceMonitoring.noResourcesFound', 'No resources found in this account')
                      : t('resourceMonitoring.noResourcesOfType', 'No {{type}} resources found', { type: t(activeResourceTypes.find(rt => rt.value === selectedResourceType)?.labelKey || '') })
                    }
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t('resourceMonitoring.clickRefreshToFetch', 'Click "Refresh" to fetch resources')}
                  </p>
                  <Button 
                    onClick={() => handleRefresh(true)} 
                    disabled={isRefreshing || !selectedAccountId}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    {isRefreshing 
                      ? t('resourceMonitoring.collectingMetrics', 'Collecting metrics...')
                      : t('resourceMonitoring.fetchResources', 'Fetch Resources')
                    }
                  </Button>
                </div>
              )}

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-2 py-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    {t('resourceMonitoring.showing', 'Showing {{start}}-{{end}} of {{total}} resources', { start: startIndex + 1, end: Math.min(endIndex, allFilteredResources.length), total: allFilteredResources.length })}
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
