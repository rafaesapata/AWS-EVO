import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layout } from "@/components/Layout";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useCloudAccount } from "@/contexts/CloudAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { 
  ShieldAlert,
  RefreshCw,
  Settings
} from "lucide-react";
import { WafMetricsCards } from "@/components/waf/WafMetricsCards";
import { WafEventsFeed } from "@/components/waf/WafEventsFeed";
import { WafAttackTypesChart } from "@/components/waf/WafAttackTypesChart";
import { WafTopAttackers } from "@/components/waf/WafTopAttackers";
import { WafBlockedRequestsList } from "@/components/waf/WafBlockedRequestsList";
import { WafGeoDistribution } from "@/components/waf/WafGeoDistribution";
import { WafConfigPanel } from "@/components/waf/WafConfigPanel";
import { WafSetupPanel } from "@/components/waf/WafSetupPanel";
import { WafAiAnalysis } from "@/components/waf/WafAiAnalysis";

export default function WafMonitoring() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedAccountId } = useCloudAccount();
  const { data: organizationId } = useOrganization();
  const [activeTab, setActiveTab] = useState("overview");

  // Check if WAF monitoring is configured
  const { data: monitoringConfigsData, isLoading: configsLoading } = useQuery({
    queryKey: ['waf-monitoring-configs', selectedAccountId],
    enabled: !!selectedAccountId,
    queryFn: async () => {
      const response = await apiClient.invoke<{ configs: any[]; hasActiveConfig: boolean }>('waf-dashboard-api', {
        body: { action: 'get-monitoring-configs' }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
  });

  // Fetch WAF metrics
  const { data: metricsData, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery({
    queryKey: ['waf-metrics', organizationId],
    enabled: !!organizationId && monitoringConfigsData?.hasActiveConfig,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.invoke<{ metrics: any; period: string }>('waf-dashboard-api', {
        body: { action: 'metrics' }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
  });


  // Fetch WAF events
  const { data: eventsData, isLoading: eventsLoading, refetch: refetchEvents } = useQuery({
    queryKey: ['waf-events', organizationId],
    enabled: !!organizationId && monitoringConfigsData?.hasActiveConfig,
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
    queryFn: async () => {
      const response = await apiClient.invoke<{ events: any[]; pagination: any }>('waf-dashboard-api', {
        body: { action: 'events', limit: 100 }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
  });

  // Fetch blocked events specifically for the blocked requests list
  const { data: blockedEventsData, isLoading: blockedEventsLoading } = useQuery({
    queryKey: ['waf-blocked-events', organizationId],
    enabled: !!organizationId && monitoringConfigsData?.hasActiveConfig,
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
    queryFn: async () => {
      // Note: 'action' in body is the API action, we need to pass filter separately
      const response = await apiClient.invoke<{ events: any[]; pagination: any }>('waf-dashboard-api', {
        body: { action: 'events', filterAction: 'BLOCK', limit: 50 }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
  });

  // Fetch top attackers
  const { data: attackersData, isLoading: attackersLoading } = useQuery({
    queryKey: ['waf-top-attackers', organizationId],
    enabled: !!organizationId && monitoringConfigsData?.hasActiveConfig,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.invoke<{ topAttackers: any[]; period: string }>('waf-dashboard-api', {
        body: { action: 'top-attackers', limit: 10 }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
  });

  // Fetch attack types distribution
  const { data: attackTypesData, isLoading: attackTypesLoading } = useQuery({
    queryKey: ['waf-attack-types', organizationId],
    enabled: !!organizationId && monitoringConfigsData?.hasActiveConfig,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.invoke<{ attackTypes: any[]; period: string }>('waf-dashboard-api', {
        body: { action: 'attack-types' }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
  });

  // Fetch geo distribution
  const { data: geoData, isLoading: geoLoading } = useQuery({
    queryKey: ['waf-geo-distribution', organizationId],
    enabled: !!organizationId && monitoringConfigsData?.hasActiveConfig,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.invoke<{ geoDistribution: any[]; period: string }>('waf-dashboard-api', {
        body: { action: 'geo-distribution' }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
  });

  // Block IP mutation
  const blockIpMutation = useMutation({
    mutationFn: async ({ ipAddress, reason }: { ipAddress: string; reason: string }) => {
      const response = await apiClient.invoke('waf-dashboard-api', {
        body: { action: 'block-ip', ipAddress, reason, accountId: selectedAccountId }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
    onSuccess: () => {
      toast({ title: t('waf.ipBlocked'), description: t('waf.ipBlockedDesc') });
      queryClient.invalidateQueries({ queryKey: ['waf-blocked-ips'] });
    },
    onError: (error) => {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    },
  });

  // Unblock IP mutation
  const unblockIpMutation = useMutation({
    mutationFn: async (ipAddress: string) => {
      const response = await apiClient.invoke('waf-dashboard-api', {
        body: { action: 'unblock-ip', ipAddress, accountId: selectedAccountId }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
    onSuccess: () => {
      toast({ title: t('waf.ipUnblocked'), description: t('waf.ipUnblockedDesc') });
    },
    onError: (error) => {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    },
  });

  const handleRefresh = async () => {
    await Promise.all([
      refetchMetrics(),
      refetchEvents(),
    ]);
    toast({ title: t('common.refreshed'), description: t('waf.dataRefreshed') });
  };

  const hasActiveConfig = monitoringConfigsData?.hasActiveConfig;
  const metrics = metricsData?.metrics;
  const events = eventsData?.events || [];
  const topAttackers = attackersData?.topAttackers || [];
  const attackTypes = attackTypesData?.attackTypes || [];
  const geoDistribution = geoData?.geoDistribution || [];
  
  // Use dedicated blocked events query for the blocked requests list
  const blockedRequests = blockedEventsData?.events || [];


  return (
    <Layout
      title={t('waf.title', 'WAF Monitoring')}
      description={t('waf.description', 'Monitoramento de ameaças em tempo real')}
      icon={<ShieldAlert className="h-7 w-7 text-white" />}
    >
      <div className="space-y-6">
        {/* Header */}
        <Card className="glass border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-6 w-6 text-primary" />
                  {t('waf.realTimeMonitoring', 'Monitoramento em Tempo Real')}
                </CardTitle>
                <CardDescription>
                  {t('waf.monitoringDescription', 'Detecte e bloqueie ameaças automaticamente')}
                </CardDescription>
              </div>
              {hasActiveConfig && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={metricsLoading}
                    className="glass hover-glow"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${metricsLoading ? 'animate-spin' : ''}`} />
                    {t('common.refresh', 'Atualizar')}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
        </Card>

        {/* Show Setup Panel if no active config */}
        {configsLoading ? (
          <Card className="glass">
            <CardContent className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              <span>{t('common.loading', 'Carregando...')}</span>
            </CardContent>
          </Card>
        ) : !hasActiveConfig ? (
          <WafSetupPanel 
            onSetupComplete={() => {
              queryClient.invalidateQueries({ queryKey: ['waf-monitoring-configs'] });
            }} 
          />
        ) : (
          <>
            {/* Metrics Cards */}
            <WafMetricsCards metrics={metrics} isLoading={metricsLoading} />

            {/* Main Content Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="glass">
                <TabsTrigger value="overview">{t('waf.overview', 'Visão Geral')}</TabsTrigger>
                <TabsTrigger value="events">{t('waf.events', 'Eventos')}</TabsTrigger>
                <TabsTrigger value="config">
                  <Settings className="h-4 w-4 mr-1" />
                  {t('waf.configuration', 'Configuração')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                {/* AI Analysis Section */}
                <WafAiAnalysis accountId={selectedAccountId || undefined} />

                <div className="grid gap-6 md:grid-cols-2">
                  <WafAttackTypesChart 
                    attackTypes={attackTypes} 
                    isLoading={attackTypesLoading} 
                  />
                  <WafGeoDistribution 
                    geoDistribution={geoDistribution} 
                    isLoading={geoLoading} 
                  />
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <WafTopAttackers 
                    topAttackers={topAttackers} 
                    isLoading={attackersLoading}
                    onBlockIp={(ip) => blockIpMutation.mutate({ ipAddress: ip, reason: 'Manual block from dashboard' })}
                  />
                  <WafEventsFeed 
                    events={events.slice(0, 10)} 
                    isLoading={eventsLoading} 
                  />
                </div>

                {/* Blocked Requests List */}
                <WafBlockedRequestsList 
                  blockedRequests={blockedRequests.slice(0, 20)} 
                  isLoading={blockedEventsLoading} 
                />
              </TabsContent>

              <TabsContent value="events" className="space-y-4">
                <WafEventsFeed 
                  events={events} 
                  isLoading={eventsLoading}
                  showFilters
                  showPagination
                />
              </TabsContent>

              <TabsContent value="config" className="space-y-4">
                <WafSetupPanel />
                <WafConfigPanel accountId={selectedAccountId || undefined} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </Layout>
  );
}
