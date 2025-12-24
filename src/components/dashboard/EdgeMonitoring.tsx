import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/integrations/aws/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Globe, Shield, Network, TrendingUp, AlertTriangle, ArrowLeft, ChevronRight, X, HelpCircle, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Area, AreaChart } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrganization } from "@/hooks/useOrganization";
import { useAwsAccount } from "@/contexts/AwsAccountContext";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { PageHeader } from "@/components/ui/page-header";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

// Edge resource types for filtering
type EdgeResourceType = 'all' | 'lb' | 'apigateway' | 'cloudfront' | 'waf';

// Help dialog for API Gateway metrics setup
const ApiGatewayMetricsHelpDialog = () => {
  const steps = [
    {
      title: "Acesse o API Gateway no AWS Console",
      description: "Vá para Services > API Gateway e selecione sua API REST ou HTTP."
    },
    {
      title: "Acesse as Configurações do Stage",
      description: "No menu lateral, clique em \"Stages\" e selecione o stage desejado (prod, dev, etc.)."
    },
    {
      title: "Habilite CloudWatch Metrics",
      description: "Na aba \"Logs/Tracing\", marque \"Enable CloudWatch Metrics\". Para métricas por método, ative também \"Enable Detailed CloudWatch Metrics\"."
    },
    {
      title: "Salve e Aguarde",
      description: "Clique em \"Save Changes\". As métricas começarão a aparecer em 5-10 minutos após o próximo tráfego na API."
    }
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <HelpCircle className="h-4 w-4 mr-2" />
          Como habilitar?
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Habilitar Métricas do API Gateway</DialogTitle>
          <DialogDescription>
            Por padrão, o AWS API Gateway não envia métricas de Count, 4XXError e 5XXError para o CloudWatch. 
            Siga os passos abaixo para habilitá-las.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 my-4">
          {steps.map((step, idx) => (
            <div key={idx} className="flex gap-4 p-4 border rounded-lg bg-muted/30">
              <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm">
                {idx + 1}
              </div>
              <div>
                <h4 className="font-medium">{step.title}</h4>
                <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <Button 
            className="w-full" 
            onClick={() => window.open('https://console.aws.amazon.com/apigateway', '_blank')}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Abrir AWS Console - API Gateway
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Após habilitar, aguarde alguns minutos e clique em "Atualizar Métricas"
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const EdgeMonitoring = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const resourcesRef = useRef<HTMLDivElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [metricsPeriod, setMetricsPeriod] = useState<'3h' | '24h' | '7d'>('24h');
  const [selectedResourceType, setSelectedResourceType] = useState<EdgeResourceType>('all');
  const [selectedResource, setSelectedResource] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>('alb');
  
  // CRITICAL: Get organization ID and global account selector
  const { data: organizationId } = useOrganization();
  const { selectedAccountId, accounts } = useAwsAccount();
  
  // Calculate time window based on period - with 20% buffer for complete coverage
  const getTimeWindow = () => {
    const now = Date.now();
    const bufferMultiplier = 1.2;
    switch (metricsPeriod) {
      case '3h': return new Date(now - 3 * 60 * 60 * 1000 * bufferMultiplier).toISOString();
      case '24h': return new Date(now - 24 * 60 * 60 * 1000 * bufferMultiplier).toISOString();
      case '7d': return new Date(now - 7 * 24 * 60 * 60 * 1000 * bufferMultiplier).toISOString();
      default: return new Date(now - 24 * 60 * 60 * 1000 * bufferMultiplier).toISOString();
    }
  };

  // Buscar recursos de borda - FILTERED BY GLOBAL ACCOUNT
  const { data: edgeResources, isLoading: loadingResources, refetch: refetchResources } = useQuery({
    queryKey: ['edge-resources', selectedAccountId, organizationId],
    enabled: !!selectedAccountId && !!organizationId,
    queryFn: async () => {
      if (!organizationId || !selectedAccountId) throw new Error('Organization/Account not available');
      
      // CRITICAL: Verify account belongs to organization
      const accountResponse = await apiClient.select('aws_accounts', { 
        eq: { id: selectedAccountId, organization_id: organizationId } 
      });
      if (accountResponse.error || !accountResponse.data) {
        throw new Error('AWS account not found or does not belong to your organization');
      }
      
      const resourceResponse = await apiClient.select('monitored_resources', { 
        eq: { 
          organization_id: organizationId, 
          aws_account_id: selectedAccountId 
        } 
      });
      console.log('Edge resources found:', resourceResponse.data?.length, resourceResponse.data);
      return resourceResponse.data || [];
    },
    staleTime: 0,
    gcTime: 0
  });

  // Buscar métricas recentes - FILTERED BY GLOBAL ACCOUNT AND PERIOD
  const { data: metrics, isLoading: loadingMetrics, refetch: refetchMetrics } = useQuery({
    queryKey: ['edge-metrics', selectedAccountId, organizationId, metricsPeriod],
    enabled: !!selectedAccountId && !!organizationId,
    queryFn: async () => {
      if (!organizationId || !selectedAccountId) throw new Error('Organization/Account not available');
      
      // CRITICAL: Verify account belongs to organization
      const accountResponse = await apiClient.select('aws_accounts', { 
        eq: { id: selectedAccountId, organization_id: organizationId } 
      });
      if (accountResponse.error || !accountResponse.data) {
        throw new Error('AWS account not found or does not belong to your organization');
      }
      
      const timeWindow = getTimeWindow();
      const metricsResponse = await apiClient.select('resource_metrics', { 
        eq: { 
          organization_id: organizationId, 
          aws_account_id: selectedAccountId 
        },
        order: { column: 'timestamp', ascending: false },
        limit: 500
      });
      return metricsResponse.data || [];
    },
    staleTime: 0,
    gcTime: 0
  });

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
    try {
      // Call Lambda - auth headers are handled automatically by apiClient
      const response = await apiClient.lambda('fetch-cloudwatch-metrics', {
        accountId: selectedAccountId
      });
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      const data = response.data;

      

      // Aguardar pequeno delay para garantir que os dados foram persistidos
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Forçar refetch direto usando as funções refetch
      await refetchResources();
      await refetchMetrics();

      // Verificar se encontrou recursos de borda especificamente
      const edgeCheckResponse = await apiClient.select('monitored_resources', { 
        eq: { 
          organization_id: organizationId, 
          aws_account_id: selectedAccountId 
        } 
      });
      const edgeCount = edgeCheckResponse.data?.filter(r => 
        ['alb', 'nlb', 'elb', 'cloudfront', 'waf', 'apigateway'].includes(r.resource_type)
      ).length || 0;

      toast({
        title: edgeCount > 0 ? "✅ Métricas de borda atualizadas" : "⚠️ Nenhum recurso de borda encontrado",
        description: edgeCount > 0 
          ? `${data.metricsCollected || 0} métricas coletadas de ${edgeCount} recursos de borda`
          : `Foram coletadas métricas de ${data.resourcesFound || 0} recursos, mas nenhum ALB, NLB, ELB, CloudFront ou WAF foi encontrado. Verifique se você possui esses recursos configurados.`,
        variant: edgeCount > 0 ? "default" : "default"
      });
    } catch (error: any) {
      console.error('Error refreshing edge metrics:', error);
      toast({
        title: "Erro ao atualizar métricas",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle resource type filter from card click
  const handleResourceTypeFilter = (type: EdgeResourceType, tab?: string) => {
    setSelectedResourceType(type);
    setSelectedResource(null);
    if (tab) {
      setActiveTab(tab);
    }
    
    // Smooth scroll to resources section
    setTimeout(() => {
      resourcesRef.current?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }, 100);
    
    toast({
      title: `Filtro aplicado`,
      description: type === 'all' 
        ? 'Mostrando todos os recursos de borda'
        : `Filtrando por ${type === 'lb' ? 'Load Balancers' : type === 'apigateway' ? 'API Gateway' : type === 'cloudfront' ? 'CloudFront' : 'WAF'}`,
    });
  };

  // Handle resource detail view
  const handleViewDetails = (resource: any, resourceType: string) => {
    setSelectedResource({ ...resource, resourceType });
  };

  // Get historical metrics for selected resource
  const { data: historicalMetrics } = useQuery({
    queryKey: ['edge-historical-metrics', selectedResource?.id, selectedAccountId, metricsPeriod],
    enabled: !!selectedResource && !!selectedAccountId,
    queryFn: async () => {
      if (!selectedResource || !selectedAccountId) return [];
      
      const timeWindow = getTimeWindow();
      const response = await apiClient.select('resource_metrics', { 
        eq: { 
          resource_id: selectedResource.resource_id,
          aws_account_id: selectedAccountId 
        },
        order: { column: 'timestamp', ascending: false },
        limit: 100
      });
      return response.data || [];
    },
    staleTime: 0,
  });

  // Agrupar recursos por tipo
  const albResources = edgeResources?.filter(r => r.resource_type === 'alb') || [];
  const nlbResources = edgeResources?.filter(r => r.resource_type === 'nlb') || [];
  const elbResources = edgeResources?.filter(r => r.resource_type === 'elb') || [];
  const cloudfrontResources = edgeResources?.filter(r => r.resource_type === 'cloudfront') || [];
  const wafResources = edgeResources?.filter(r => r.resource_type === 'waf') || [];
  const apigatewayResources = edgeResources?.filter(r => r.resource_type === 'apigateway') || [];

  // Calcular métricas agregadas para ALB/ELB
  const calculateLBMetrics = (resources: any[], type: 'alb' | 'elb') => {
    const lbMetrics = resources.map(lb => {
      const lbData = metrics?.filter(m => m.resource_id === lb.resource_id) || [];
      
      const requests = lbData.find(m => m.metric_name === 'RequestCount')?.metric_value || 0;
      const latencySeconds = lbData.find(m => m.metric_name === (type === 'alb' ? 'TargetResponseTime' : 'Latency'))?.metric_value || 0;
      const errors2xx = lbData.find(m => m.metric_name.includes('2XX'))?.metric_value || 0;
      const errors4xx = lbData.find(m => m.metric_name.includes('4XX'))?.metric_value || 0;
      const errors5xx = lbData.find(m => m.metric_name.includes('5XX'))?.metric_value || 0;

      return {
        name: lb.resource_name,
        id: lb.resource_id,
        requests: Number(requests),
        latency: Number(latencySeconds) * 1000, // Convert seconds to milliseconds
        errors2xx: Number(errors2xx),
        errors4xx: Number(errors4xx),
        errors5xx: Number(errors5xx),
        errorRate: requests > 0 ? ((errors4xx + errors5xx) / requests * 100) : 0
      };
    });

    return lbMetrics;
  };

  // Calcular métricas NLB (Network Load Balancer)
  const calculateNLBMetrics = (resources: any[]) => {
    return resources.map(lb => {
      const lbData = metrics?.filter(m => m.resource_id === lb.resource_id) || [];
      
      const activeFlows = lbData.find(m => m.metric_name === 'ActiveFlowCount')?.metric_value || 0;
      const newFlows = lbData.find(m => m.metric_name === 'NewFlowCount')?.metric_value || 0;
      const processedBytes = lbData.find(m => m.metric_name === 'ProcessedBytes')?.metric_value || 0;
      const processedPackets = lbData.find(m => m.metric_name === 'ProcessedPackets')?.metric_value || 0;
      const healthyHosts = lbData.find(m => m.metric_name === 'HealthyHostCount')?.metric_value || 0;
      const unhealthyHosts = lbData.find(m => m.metric_name === 'UnHealthyHostCount')?.metric_value || 0;

      return {
        name: lb.resource_name,
        id: lb.resource_id,
        activeFlows: Number(activeFlows),
        newFlows: Number(newFlows),
        processedBytes: Number(processedBytes),
        processedPackets: Number(processedPackets),
        healthyHosts: Number(healthyHosts),
        unhealthyHosts: Number(unhealthyHosts)
      };
    });
  };

  // Calcular métricas do CloudFront
  const cloudfrontMetrics = cloudfrontResources.map(cf => {
    const cfData = metrics?.filter(m => m.resource_id === cf.resource_id) || [];
    
    return {
      name: cf.resource_name,
      id: cf.resource_id,
      requests: Number(cfData.find(m => m.metric_name === 'Requests')?.metric_value || 0),
      bytesDownloaded: Number(cfData.find(m => m.metric_name === 'BytesDownloaded')?.metric_value || 0),
      bytesUploaded: Number(cfData.find(m => m.metric_name === 'BytesUploaded')?.metric_value || 0),
      error4xx: Number(cfData.find(m => m.metric_name === '4xxErrorRate')?.metric_value || 0),
      error5xx: Number(cfData.find(m => m.metric_name === '5xxErrorRate')?.metric_value || 0),
      totalErrorRate: Number(cfData.find(m => m.metric_name === 'TotalErrorRate')?.metric_value || 0)
    };
  });

  // Calcular métricas do WAF
  const wafMetrics = wafResources.map(waf => {
    const wafData = metrics?.filter(m => m.resource_id === waf.resource_id) || [];
    
    const allowed = Number(wafData.find(m => m.metric_name === 'AllowedRequests')?.metric_value || 0);
    const blocked = Number(wafData.find(m => m.metric_name === 'BlockedRequests')?.metric_value || 0);
    const counted = Number(wafData.find(m => m.metric_name === 'CountedRequests')?.metric_value || 0);
    const passed = Number(wafData.find(m => m.metric_name === 'PassedRequests')?.metric_value || 0);
    const total = allowed + blocked + counted + passed;
    
    // Safely access metadata
    const metadata = waf.metadata as any;

    return {
      name: waf.resource_name,
      id: waf.resource_id,
      scope: metadata?.scope || 'CLOUDFRONT',
      allowed,
      blocked,
      counted,
      passed,
      total,
      blockRate: total > 0 ? (blocked / total * 100) : 0
    };
  });

  // Calcular métricas do API Gateway - SOMAR TODOS os datapoints do período
  const apigatewayMetricsRaw = apigatewayResources.map(api => {
    const apiData = metrics?.filter(m => m.resource_id === api.resource_id) || [];
    
    // CRITICAL: Somar TODOS os datapoints de Count (não apenas o primeiro)
    const countMetrics = apiData.filter(m => m.metric_name === 'Count');
    const totalRequests = countMetrics.reduce((sum, m) => sum + Number(m.metric_value || 0), 0);
    
    // Somar erros também
    const error4xxMetrics = apiData.filter(m => m.metric_name === '4XXError');
    const totalError4xx = error4xxMetrics.reduce((sum, m) => sum + Number(m.metric_value || 0), 0);
    
    const error5xxMetrics = apiData.filter(m => m.metric_name === '5XXError');
    const totalError5xx = error5xxMetrics.reduce((sum, m) => sum + Number(m.metric_value || 0), 0);
    
    // Para latência, calcular média de todos os datapoints
    const latencyMetrics = apiData.filter(m => m.metric_name === 'Latency');
    const avgLatency = latencyMetrics.length > 0 
      ? latencyMetrics.reduce((sum, m) => sum + Number(m.metric_value || 0), 0) / latencyMetrics.length 
      : 0;
    
    const integrationLatencyMetrics = apiData.filter(m => m.metric_name === 'IntegrationLatency');
    const avgIntegrationLatency = integrationLatencyMetrics.length > 0
      ? integrationLatencyMetrics.reduce((sum, m) => sum + Number(m.metric_value || 0), 0) / integrationLatencyMetrics.length
      : 0;
    
    return {
      name: api.resource_name,
      id: api.resource_id,
      region: api.region || 'global',
      requests: Math.round(totalRequests),
      latency: avgLatency,
      integrationLatency: avgIntegrationLatency,
      error4xx: Math.round(totalError4xx),
      error5xx: Math.round(totalError5xx),
      datapointCount: countMetrics.length // Para debug
    };
  });
  
  // Agrupar APIs por nome e somar métricas (pode haver mesmo nome em regiões diferentes)
  const apigatewayMetrics = Object.values(
    apigatewayMetricsRaw.reduce((acc, api) => {
      const key = api.name;
      if (!acc[key]) {
        acc[key] = { ...api, regions: [api.region] };
      } else {
        acc[key].requests += api.requests;
        acc[key].error4xx += api.error4xx;
        acc[key].error5xx += api.error5xx;
        // Média ponderada de latências
        const totalDatapoints = acc[key].datapointCount + api.datapointCount;
        if (totalDatapoints > 0) {
          acc[key].latency = (acc[key].latency * acc[key].datapointCount + api.latency * api.datapointCount) / totalDatapoints;
          acc[key].integrationLatency = (acc[key].integrationLatency * acc[key].datapointCount + api.integrationLatency * api.datapointCount) / totalDatapoints;
        }
        acc[key].datapointCount = totalDatapoints;
        if (!acc[key].regions.includes(api.region)) {
          acc[key].regions.push(api.region);
        }
      }
      return acc;
    }, {} as Record<string, any>)
  );

  const albMetrics = calculateLBMetrics(albResources, 'alb');
  const elbMetrics = calculateLBMetrics(elbResources, 'elb');
  const nlbMetrics = calculateNLBMetrics(nlbResources);

  if (!accounts || accounts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monitoramento de Borda</CardTitle>
          <CardDescription>Configure uma conta AWS para começar</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Nenhuma conta AWS configurada.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitoramento de Borda"
        description="ALB, NLB, ELB, CloudFront e WAF em tempo real"
        icon={Globe}
        actions={
          <div className="flex items-center gap-3">
            {/* Period Selector */}
            <Select value={metricsPeriod} onValueChange={(v) => setMetricsPeriod(v as '3h' | '24h' | '7d')}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3h">3 horas</SelectItem>
                <SelectItem value="24h">24 horas</SelectItem>
                <SelectItem value="7d">7 dias</SelectItem>
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
        }
      />

      {selectedAccountId ? (
        <>
          {/* Mensagem de aviso se não houver recursos de borda */}
          {edgeResources && edgeResources.length === 0 && !loadingResources && (
            <Card className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-900 dark:text-yellow-100">
                      Nenhum recurso de borda encontrado
                    </p>
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
                      Não foram encontrados recursos de ALB, NLB, ELB, CloudFront ou WAF nesta conta. 
                      Clique em <strong>"Atualizar"</strong> para buscar recursos na AWS ou verifique se você possui 
                      esses recursos configurados na região us-east-1.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {edgeResources && edgeResources.length > 0 && !selectedResource && (
            <>
              {/* Resumo Geral - Clickable Cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <Card 
                  className={`cursor-pointer transition-all hover:ring-2 hover:ring-primary/50 ${selectedResourceType === 'lb' ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => handleResourceTypeFilter('lb', 'alb')}
                >
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Load Balancers</CardTitle>
                    <Network className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{albResources.length + nlbResources.length + elbResources.length}</div>
                    <p className="text-xs text-muted-foreground">
                      {albResources.length} ALB, {nlbResources.length} NLB, {elbResources.length} ELB
                    </p>
                  </CardContent>
                </Card>

                <Card 
                  className={`cursor-pointer transition-all hover:ring-2 hover:ring-primary/50 ${selectedResourceType === 'apigateway' ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => handleResourceTypeFilter('apigateway', 'apigateway')}
                >
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">API Gateway</CardTitle>
                    <Network className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{apigatewayResources.length}</div>
                    <p className="text-xs text-muted-foreground">REST APIs</p>
                  </CardContent>
                </Card>

                <Card 
                  className={`cursor-pointer transition-all hover:ring-2 hover:ring-primary/50 ${selectedResourceType === 'cloudfront' ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => handleResourceTypeFilter('cloudfront', 'cloudfront')}
                >
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">CloudFront</CardTitle>
                    <Globe className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{cloudfrontResources.length}</div>
                    <p className="text-xs text-muted-foreground">Distribuições</p>
                  </CardContent>
                </Card>

                <Card 
                  className={`cursor-pointer transition-all hover:ring-2 hover:ring-primary/50 ${selectedResourceType === 'waf' ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => handleResourceTypeFilter('waf', 'waf')}
                >
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">WAF</CardTitle>
                    <Shield className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{wafResources.length}</div>
                    <p className="text-xs text-muted-foreground">Web ACLs</p>
                  </CardContent>
                </Card>

                <Card 
                  className={`cursor-pointer transition-all hover:ring-2 hover:ring-primary/50 ${selectedResourceType === 'all' ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => handleResourceTypeFilter('all', 'alb')}
                >
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Requisições Totais</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {(
                        [...albMetrics, ...elbMetrics].reduce((sum, lb) => sum + lb.requests, 0) +
                        cloudfrontMetrics.reduce((sum, cf) => sum + cf.requests, 0) +
                        apigatewayMetrics.reduce((sum, api) => sum + api.requests, 0)
                      ).toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">Período: {metricsPeriod}</p>
                  </CardContent>
                </Card>
              </div>
              
              {/* Filter indicator */}
              {selectedResourceType !== 'all' && (
                <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg">
                  <span className="text-sm">Filtrando por: <strong>
                    {selectedResourceType === 'lb' ? 'Load Balancers' : 
                     selectedResourceType === 'apigateway' ? 'API Gateway' :
                     selectedResourceType === 'cloudfront' ? 'CloudFront' : 'WAF'}
                  </strong></span>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedResourceType('all')}
                  >
                    <X className="h-4 w-4 mr-1" /> Limpar filtro
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Selecione uma conta AWS para visualizar os recursos de borda
            </p>
          </CardContent>
        </Card>
      )}

      {/* Detail View for Selected Resource */}
      {selectedResource && (
        <Card className="border-primary/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => setSelectedResource(null)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {selectedResource.name}
                    <Badge variant="outline">{selectedResource.resourceType}</Badge>
                  </CardTitle>
                  <CardDescription>Métricas detalhadas - {metricsPeriod}</CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {historicalMetrics && historicalMetrics.length > 0 ? (
              <div className="space-y-6">
                {/* Aggregate metrics by type */}
                {(() => {
                  const metricsByName = historicalMetrics.reduce((acc: Record<string, any[]>, m) => {
                    if (!acc[m.metric_name]) acc[m.metric_name] = [];
                    acc[m.metric_name].push({
                      timestamp: new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                      value: Number(m.metric_value),
                      fullTimestamp: m.timestamp
                    });
                    return acc;
                  }, {});
                  
                  return Object.entries(metricsByName).map(([metricName, data]) => (
                    <Card key={metricName}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{metricName}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={200}>
                          <AreaChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="timestamp" className="text-xs" />
                            <YAxis className="text-xs" />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                              formatter={(value: number) => [
                                ['Count', '4XXError', '5XXError', 'Requests', 'Invocations'].includes(metricName)
                                  ? Math.round(value).toLocaleString()
                                  : value.toFixed(2),
                                metricName
                              ]}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="value" 
                              stroke="hsl(var(--primary))" 
                              fill="hsl(var(--primary)/0.2)" 
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  ));
                })()}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhuma métrica histórica encontrada para este recurso no período selecionado.</p>
                <p className="text-sm mt-2">Clique em "Atualizar" para coletar novas métricas.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedAccountId && edgeResources && edgeResources.length > 0 && !selectedResource && (
        <div ref={resourcesRef}>
          {/* Tabs por serviço */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="alb" disabled={selectedResourceType !== 'all' && selectedResourceType !== 'lb'}>
                Application Load Balancer
              </TabsTrigger>
              <TabsTrigger value="nlb" disabled={selectedResourceType !== 'all' && selectedResourceType !== 'lb'}>
                Network Load Balancer
              </TabsTrigger>
              <TabsTrigger value="elb" disabled={selectedResourceType !== 'all' && selectedResourceType !== 'lb'}>
                Classic Load Balancer
              </TabsTrigger>
              <TabsTrigger value="apigateway" disabled={selectedResourceType !== 'all' && selectedResourceType !== 'apigateway'}>
                API Gateway
              </TabsTrigger>
              <TabsTrigger value="cloudfront" disabled={selectedResourceType !== 'all' && selectedResourceType !== 'cloudfront'}>
                CloudFront
              </TabsTrigger>
              <TabsTrigger value="waf" disabled={selectedResourceType !== 'all' && selectedResourceType !== 'waf'}>
                WAF
              </TabsTrigger>
            </TabsList>

            {/* ALB Tab */}
            <TabsContent value="alb" className="space-y-4">
              {albMetrics.length > 0 ? (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Requisições por ALB</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={albMetrics}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="requests" fill="hsl(var(--chart-1))" name="Requisições" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle>Latência Média</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={250}>
                          <BarChart data={albMetrics}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="latency" fill="hsl(var(--primary))" name="Latência (ms)" />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Taxa de Erros por ALB</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {albMetrics.map((alb, idx) => (
                            <div key={idx} className="space-y-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{alb.name}</span>
                                <div className="flex items-center gap-2">
                                  <Badge variant={alb.errorRate > 5 ? "destructive" : "secondary"}>
                                    {alb.errorRate.toFixed(2)}%
                                  </Badge>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => handleViewDetails({ id: alb.id, name: alb.name }, 'alb')}
                                  >
                                    <ChevronRight className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <span className="text-muted-foreground">2xx: </span>
                                  <span className="text-green-600">{alb.errors2xx}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">4xx: </span>
                                  <span className="text-yellow-600">{alb.errors4xx}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">5xx: </span>
                                  <span className="text-red-600">{alb.errors5xx}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">
                      ⚠️ Nenhum Application Load Balancer encontrado. Clique em Atualizar para buscar recursos.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ELB Tab */}
            <TabsContent value="elb" className="space-y-4">
              {elbMetrics.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Classic Load Balancers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {elbMetrics.map((elb, idx) => (
                        <div key={idx} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold">{elb.name}</h4>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleViewDetails({ id: elb.id, name: elb.name }, 'elb')}
                            >
                              Ver Detalhes
                              <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Requisições</p>
                              <p className="text-lg font-bold">{elb.requests.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Latência</p>
                              <p className="text-lg font-bold">{elb.latency.toFixed(2)}ms</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Taxa de Erro</p>
                              <p className="text-lg font-bold">{elb.errorRate.toFixed(2)}%</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Erros 5xx</p>
                              <p className="text-lg font-bold text-red-600">{elb.errors5xx}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">
                      ⚠️ Nenhum Classic Load Balancer encontrado. Clique em Atualizar para buscar recursos.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* NLB Tab */}
            <TabsContent value="nlb" className="space-y-4">
              {nlbMetrics.length > 0 ? (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Network Load Balancers</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {nlbMetrics.map((nlb, idx) => (
                          <div key={idx} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-semibold">{nlb.name}</h4>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleViewDetails({ id: nlb.id, name: nlb.name }, 'nlb')}
                              >
                                Ver Detalhes
                                <ChevronRight className="h-4 w-4 ml-1" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground">Fluxos Ativos</p>
                                <p className="text-lg font-bold">{nlb.activeFlows.toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Novos Fluxos</p>
                                <p className="text-lg font-bold">{nlb.newFlows.toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Bytes Processados</p>
                                <p className="text-lg font-bold">{(nlb.processedBytes / 1024 / 1024).toFixed(2)} MB</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Pacotes Processados</p>
                                <p className="text-lg font-bold">{nlb.processedPackets.toLocaleString()}</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm mt-2">
                              <div>
                                <p className="text-muted-foreground">Hosts Saudáveis</p>
                                <p className="text-lg font-bold text-green-600">{nlb.healthyHosts}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Hosts Não Saudáveis</p>
                                <p className="text-lg font-bold text-red-600">{nlb.unhealthyHosts}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">
                      ⚠️ Nenhum Network Load Balancer encontrado. Clique em Atualizar para buscar recursos.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* API Gateway Tab */}
            <TabsContent value="apigateway" className="space-y-4">
              {apigatewayMetrics.length > 0 ? (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>Requisições API Gateway</span>
                        <Badge variant="outline" className="text-xs font-normal bg-muted/50">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          Amostragem: 10 min | Período: {metricsPeriod}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="flex items-center gap-1 text-xs">
                        <AlertTriangle className="h-3 w-3 text-warning" />
                        Valores representam a soma total de requisições no período selecionado. 
                        Métricas coletadas a cada 10 minutos do CloudWatch.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {apigatewayMetrics.some(api => api.requests > 0) ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={apigatewayMetrics}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis 
                              dataKey="name" 
                              tick={{ fill: 'hsl(var(--muted-foreground))' }}
                              tickLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                            />
                            <YAxis 
                              tick={{ fill: 'hsl(var(--muted-foreground))' }}
                              tickLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                              tickFormatter={(value) => value.toLocaleString()}
                            />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: 'hsl(var(--background))', 
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px'
                              }}
                              formatter={(value: number) => [value.toLocaleString(), 'Requisições']}
                            />
                            <Bar dataKey="requests" fill="hsl(var(--primary))" name="Requisições" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : apigatewayMetrics.some(api => api.latency > 0) ? (
                        /* Fallback: Mostrar latência se não houver dados de Count */
                        <div className="space-y-4">
                          <div className="flex items-center justify-between gap-2 text-sm text-warning bg-warning/10 p-3 rounded-lg">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                              <span>
                                Métricas de contagem (Count) não disponíveis. Exibindo latência como indicador de atividade.
                              </span>
                            </div>
                            <ApiGatewayMetricsHelpDialog />
                          </div>
                          <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={apigatewayMetrics}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                              <XAxis 
                                dataKey="name" 
                                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                                tickLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                              />
                              <YAxis 
                                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                                tickLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                                tickFormatter={(value) => `${value}ms`}
                              />
                              <Tooltip 
                                contentStyle={{ 
                                  backgroundColor: 'hsl(var(--background))', 
                                  border: '1px solid hsl(var(--border))',
                                  borderRadius: '8px'
                                }}
                                formatter={(value: number) => [`${value.toFixed(0)}ms`, 'Latência Média']}
                              />
                              <Bar dataKey="latency" fill="hsl(var(--primary))" name="Latência (ms)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-[300px] text-center">
                          <AlertTriangle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                          <p className="text-muted-foreground font-medium">Sem dados de API Gateway</p>
                          <p className="text-sm text-muted-foreground/70 mt-1 max-w-md">
                            Não há métricas disponíveis para as APIs neste período. 
                            As APIs podem não ter recebido tráfego ou as métricas de contagem podem não estar habilitadas.
                          </p>
                          <div className="flex gap-2 mt-4">
                            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                              Atualizar Métricas
                            </Button>
                            <ApiGatewayMetricsHelpDialog />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                   <Card>
                    <CardHeader>
                      <CardTitle>Detalhes por API</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {apigatewayMetrics.map((api, idx) => (
                          <div key={idx} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{api.name}</h4>
                                {api.regions && api.regions.length > 0 && (
                                  <Badge variant="outline" className="text-xs">
                                    {api.regions.join(', ')}
                                  </Badge>
                                )}
                              </div>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleViewDetails({ 
                                  id: api.id, 
                                  name: api.name, 
                                  region: api.region 
                                }, 'apigateway')}
                              >
                                Ver Detalhes
                                <ChevronRight className="h-4 w-4 ml-1" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground">Requisições</p>
                                <p className="text-lg font-bold">
                                  {api.requests > 0 ? api.requests.toLocaleString() : (
                                    <span className="text-muted-foreground/70 text-sm">Sem dados</span>
                                  )}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Latência Média</p>
                                <p className={`text-lg font-bold ${api.latency > 0 ? 'text-green-600' : ''}`}>
                                  {api.latency > 0 ? `${api.latency.toFixed(0)}ms` : (
                                    <span className="text-muted-foreground/70 text-sm">Sem dados</span>
                                  )}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Erros 4xx</p>
                                <p className={`text-lg font-bold ${api.error4xx > 0 ? 'text-yellow-600' : ''}`}>
                                  {api.error4xx > 0 ? api.error4xx.toLocaleString() : '0'}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Erros 5xx</p>
                                <p className={`text-lg font-bold ${api.error5xx > 0 ? 'text-red-600' : ''}`}>
                                  {api.error5xx > 0 ? api.error5xx.toLocaleString() : '0'}
                                </p>
                              </div>
                            </div>
                            {api.latency > 0 && api.requests === 0 && (
                              <p className="text-xs text-muted-foreground/70 mt-2 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                API ativa (latência detectada). Métricas de contagem (Count) não disponíveis no CloudWatch.
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">
                      ⚠️ Nenhum API Gateway encontrado. Clique em Atualizar para buscar recursos.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* CloudFront Tab */}
            <TabsContent value="cloudfront" className="space-y-4">
              {cloudfrontMetrics.length > 0 ? (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Requisições CloudFront</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={cloudfrontMetrics}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="requests" fill="hsl(var(--chart-3))" name="Requisições" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle>Taxa de Erros CloudFront</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {cloudfrontMetrics.map((cf, idx) => (
                            <div key={idx} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium truncate">{cf.name}</span>
                                <Badge variant={cf.totalErrorRate > 5 ? "destructive" : "secondary"}>
                                  {cf.totalErrorRate.toFixed(2)}%
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-muted-foreground">4xx: </span>
                                  <span className="text-yellow-600">{cf.error4xx.toFixed(2)}%</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">5xx: </span>
                                  <span className="text-red-600">{cf.error5xx.toFixed(2)}%</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Tráfego de Dados</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {cloudfrontMetrics.map((cf, idx) => (
                            <div key={idx} className="space-y-2">
                              <p className="text-sm font-medium truncate">{cf.name}</p>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Download: </span>
                                  <span>{(cf.bytesDownloaded / 1024 / 1024).toFixed(2)} MB</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Upload: </span>
                                  <span>{(cf.bytesUploaded / 1024 / 1024).toFixed(2)} MB</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">
                      ⚠️ Nenhuma distribuição CloudFront encontrada. Clique em Atualizar para buscar recursos.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* WAF Tab */}
            <TabsContent value="waf" className="space-y-4">
              {wafMetrics.length > 0 ? (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Web ACLs</CardTitle>
                        <Shield className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{wafMetrics.length}</div>
                        <p className="text-xs text-muted-foreground">
                          {wafMetrics.filter(w => w.scope === 'CLOUDFRONT').length} Global, {wafMetrics.filter(w => w.scope === 'REGIONAL').length} Regional
                        </p>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Requisições Bloqueadas</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-destructive">
                          {wafMetrics.reduce((sum, w) => sum + w.blocked, 0).toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground">Última hora</p>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Taxa de Bloqueio Média</CardTitle>
                        <Shield className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {wafMetrics.length > 0 
                            ? (wafMetrics.reduce((sum, w) => sum + w.blockRate, 0) / wafMetrics.length).toFixed(2)
                            : '0.00'}%
                        </div>
                        <p className="text-xs text-muted-foreground">Média entre ACLs</p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle>Distribuição de Requisições</CardTitle>
                        <CardDescription>Visão geral do tráfego WAF</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Permitidas', value: wafMetrics.reduce((sum, w) => sum + w.allowed, 0), fill: 'hsl(var(--chart-2))' },
                                { name: 'Bloqueadas', value: wafMetrics.reduce((sum, w) => sum + w.blocked, 0), fill: 'hsl(var(--destructive))' },
                                { name: 'Contadas', value: wafMetrics.reduce((sum, w) => sum + w.counted, 0), fill: 'hsl(var(--chart-4))' },
                                { name: 'Passadas', value: wafMetrics.reduce((sum, w) => sum + w.passed, 0), fill: 'hsl(var(--chart-3))' }
                              ].filter(item => item.value > 0)}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={(entry) => `${entry.name}: ${((entry.value / wafMetrics.reduce((sum, w) => sum + w.total, 0)) * 100).toFixed(1)}%`}
                              outerRadius={100}
                              dataKey="value"
                            >
                              {COLORS.map((color, index) => (
                                <Cell key={`cell-${index}`} fill={color} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => value.toLocaleString()} />
                          </PieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Taxa de Bloqueio por Web ACL</CardTitle>
                        <CardDescription>Efetividade de cada WAF</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={wafMetrics}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="name" className="text-xs" />
                            <YAxis className="text-xs" />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                              formatter={(value: number) => `${value.toFixed(2)}%`}
                            />
                            <Bar dataKey="blockRate" fill="hsl(var(--destructive))" name="Taxa de Bloqueio (%)" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>Detalhes dos Web ACLs</CardTitle>
                      <CardDescription>Informações detalhadas por Web ACL</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {wafMetrics.map((waf) => (
                          <div key={waf.id} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="flex items-start justify-between mb-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold">{waf.name}</p>
                                  <Badge variant="outline" className="text-xs">
                                    {waf.scope}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">{waf.id}</p>
                              </div>
                              <Badge variant={waf.blockRate > 10 ? "destructive" : waf.blockRate > 5 ? "default" : "secondary"}>
                                {waf.blockRate.toFixed(2)}% bloqueadas
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground mb-1">Permitidas</p>
                                <p className="font-semibold text-green-600">{waf.allowed.toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-1">Bloqueadas</p>
                                <p className="font-semibold text-red-600">{waf.blocked.toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-1">Contadas</p>
                                <p className="font-semibold text-yellow-600">{waf.counted.toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-1">Passadas</p>
                                <p className="font-semibold text-blue-600">{waf.passed.toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-1">Total</p>
                                <p className="font-semibold">{waf.total.toLocaleString()}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-yellow-900 dark:text-yellow-100">
                          Nenhum WAF Web ACL encontrado
                        </p>
                        <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
                          Não foram encontrados Web ACLs (nem CLOUDFRONT nem REGIONAL). Possíveis causas:
                        </p>
                        <ul className="text-sm text-yellow-800 dark:text-yellow-200 mt-2 ml-4 list-disc space-y-1">
                          <li>Nenhum WAF configurado nesta conta AWS</li>
                          <li>Permissão ausente: <code className="px-1 py-0.5 bg-yellow-200 dark:bg-yellow-900 rounded">wafv2:ListWebACLs</code></li>
                          <li>Clique em <strong>"Atualizar"</strong> para tentar buscar novamente</li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
};
