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
import { WafConfigPanel } from "@/components/waf/WafConfigPanel";
import { WafSetupPanel } from "@/components/waf/WafSetupPanel";
import { WafAiAnalysis } from "@/components/waf/WafAiAnalysis";
import { WafTimelineChart } from "@/components/waf/WafTimelineChart";
import { WafStatusIndicator } from "@/components/waf/WafStatusIndicator";
import { WafFilters } from "@/components/waf/WafFilters";
import { WafWorldMap } from "@/components/waf/WafWorldMap";
import { WafGeoDistribution } from "@/components/waf/WafGeoDistribution";
import { WafAlertConfig } from "@/components/waf/WafAlertConfig";
import { WafRulesEvaluator } from "@/components/waf/WafRulesEvaluator";

export default function WafMonitoring() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedAccountId } = useCloudAccount();
  const { data: organizationId } = useOrganization();
  const [activeTab, setActiveTab] = useState("overview");
  
  // Filter state for events tab
  const [filters, setFilters] = useState({
    period: 'last24h',
    severity: 'all',
    threatType: 'all',
    ipAddress: '',
    country: 'all',
    startDate: null as Date | null,
    endDate: null as Date | null,
  });
  
  // External filters for WafEventsFeed (set by card clicks)
  const [externalEventFilters, setExternalEventFilters] = useState<{
    severity?: string;
    action?: string;
    campaign?: boolean;
  }>({});

  // Handle metric card click to filter events
  const handleMetricCardClick = (filter: { severity?: string; type?: string }) => {
    // Switch to events tab
    setActiveTab('events');
    
    // Apply filter based on card clicked
    if (filter.severity) {
      setExternalEventFilters({ severity: filter.severity });
      setFilters(prev => ({ ...prev, severity: filter.severity || 'all' }));
    } else if (filter.type === 'blocked') {
      setExternalEventFilters({ action: 'BLOCK' });
    } else if (filter.type === 'campaign') {
      setExternalEventFilters({ campaign: true });
    }
  };

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
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000, // Auto-refresh every 60 seconds
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
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000, // Auto-refresh every 60 seconds
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
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000, // Auto-refresh every 60 seconds
    queryFn: async () => {
      const response = await apiClient.invoke<{ geoDistribution: any[]; period: string }>('waf-dashboard-api', {
        body: { action: 'geo-distribution' }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
  });

  // Fetch timeline data for the new timeline chart
  const { data: timelineData, isLoading: timelineLoading } = useQuery({
    queryKey: ['waf-timeline', organizationId],
    enabled: !!organizationId && monitoringConfigsData?.hasActiveConfig,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.invoke<{ timeline: any[] }>('waf-dashboard-api', {
        body: { action: 'timeline', period: 'last24h' }
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
  const timeline = timelineData?.timeline || [];
  
  // Use dedicated blocked events query for the blocked requests list
  const blockedRequests = blockedEventsData?.events || [];

  // Filter events based on filter state
  const filteredEvents = events.filter(event => {
    // Apply filters
    if (filters.severity !== 'all' && event.severity?.toLowerCase() !== filters.severity) {
      return false;
    }
    if (filters.threatType !== 'all' && event.threatType !== filters.threatType) {
      return false;
    }
    if (filters.ipAddress && !event.sourceIp?.includes(filters.ipAddress)) {
      return false;
    }
    if (filters.country !== 'all' && event.country !== filters.country) {
      return false;
    }
    return true;
  });


  return (
    <Layout
      title={t('waf.title', 'WAF Monitoring')}
      description={t('waf.monitoringDescription', 'Detecte e bloqueie ameaças automaticamente')}
      icon={<ShieldAlert className="h-4 w-4" />}
    >
      <div className="space-y-6">
        {/* Action Buttons */}
        {hasActiveConfig && (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={metricsLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${metricsLoading ? 'animate-spin' : ''}`} />
              {t('common.refresh', 'Atualizar')}
            </Button>
          </div>
        )}

        {/* Show Setup Panel if no active config */}
        {!configsLoading && !hasActiveConfig ? (
          <WafSetupPanel 
            onSetupComplete={() => {
              queryClient.invalidateQueries({ queryKey: ['waf-monitoring-configs'] });
            }} 
          />
        ) : (
          <>
            {/* Metrics Cards */}
            <WafMetricsCards 
              metrics={metrics} 
              isLoading={metricsLoading}
              onCardClick={handleMetricCardClick}
            />

            {/* Main Content Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="glass-card-float">
                <TabsTrigger value="overview">{t('waf.overview', 'Visão Geral')}</TabsTrigger>
                <TabsTrigger value="events">{t('waf.events', 'Eventos')}</TabsTrigger>
                <TabsTrigger value="config">
                  <Settings className="h-4 w-4 mr-1" />
                  {t('waf.configuration', 'Configuração')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                {/* Status Indicator */}
                <WafStatusIndicator metrics={metrics} />

                {/* Timeline Chart */}
                <WafTimelineChart 
                  data={timeline} 
                  isLoading={timelineLoading} 
                />

                {/* AI Analysis Section */}
                <WafAiAnalysis accountId={selectedAccountId || undefined} />

                {/* Geographic Distribution */}
                <div className="grid gap-6 md:grid-cols-2">
                  <WafGeoDistribution 
                    geoDistribution={geoDistribution} 
                    isLoading={geoLoading} 
                  />
                  <WafWorldMap 
                    geoDistribution={geoDistribution} 
                    isLoading={geoLoading} 
                  />
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <WafAttackTypesChart 
                    attackTypes={attackTypes} 
                    isLoading={attackTypesLoading} 
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
                {/* Advanced Filters */}
                <WafFilters 
                  filters={filters}
                  onFiltersChange={setFilters}
                />
                
                <WafEventsFeed 
                  events={filteredEvents} 
                  isLoading={eventsLoading}
                  showPagination
                  externalSeverityFilter={externalEventFilters.severity}
                  externalActionFilter={externalEventFilters.action}
                  externalCampaignFilter={externalEventFilters.campaign}
                />
              </TabsContent>

              <TabsContent value="config" className="space-y-4">
                <WafSetupPanel />
                <WafRulesEvaluator accountId={selectedAccountId || undefined} />
                <WafConfigPanel accountId={selectedAccountId || undefined} />
                <WafAlertConfig accountId={selectedAccountId || undefined} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </Layout>
  );
}
