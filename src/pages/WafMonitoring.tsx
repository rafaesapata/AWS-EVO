import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layout } from "@/components/Layout";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useCloudAccount } from "@/contexts/CloudAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useDemoMode } from "@/contexts/DemoModeContext";
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

// Demo data generators for WAF monitoring
function generateDemoWafData() {
  const now = new Date();
  const metrics = {
    totalRequests: 284750,
    blockedRequests: 12847,
    allowedRequests: 271903,
    countedRequests: 3210,
    uniqueIps: 156,
    uniqueCountries: 28,
    criticalThreats: 23,
    highThreats: 87,
    mediumThreats: 342,
    lowThreats: 1205,
    activeCampaigns: 3,
    previousPeriod: {
      totalRequests: 261200,
      blockedRequests: 10230,
      uniqueIps: 134,
      criticalThreats: 18,
      highThreats: 72,
      activeCampaigns: 2,
    },
    _isDemo: true,
  };

  const attackTypes = [
    { type: 'SQL Injection', count: 3842, percentage: 29.9, severity: 'critical', trend: 'up' },
    { type: 'XSS', count: 2915, percentage: 22.7, severity: 'high', trend: 'stable' },
    { type: 'Path Traversal', count: 1847, percentage: 14.4, severity: 'high', trend: 'down' },
    { type: 'Bot Traffic', count: 1523, percentage: 11.9, severity: 'medium', trend: 'up' },
    { type: 'Rate Limit', count: 1290, percentage: 10.0, severity: 'medium', trend: 'stable' },
    { type: 'Scanner Detection', count: 842, percentage: 6.6, severity: 'low', trend: 'down' },
    { type: 'Other', count: 588, percentage: 4.5, severity: 'low', trend: 'stable' },
  ];

  const topAttackers = [
    { sourceIp: '185.220.101.34', country: 'RU', blockedRequests: 2847 },
    { sourceIp: '45.148.10.92', country: 'CN', blockedRequests: 1923 },
    { sourceIp: '194.26.192.77', country: 'NL', blockedRequests: 1340 },
    { sourceIp: '103.152.220.15', country: 'ID', blockedRequests: 987 },
    { sourceIp: '91.242.217.124', country: 'UA', blockedRequests: 698 },
  ];

  const geoDistribution = [
    { country: 'US', blockedRequests: 1250 },
    { country: 'BR', blockedRequests: 890 },
    { country: 'RU', blockedRequests: 4520 },
    { country: 'CN', blockedRequests: 3210 },
    { country: 'DE', blockedRequests: 340 },
    { country: 'IN', blockedRequests: 780 },
    { country: 'NL', blockedRequests: 1560 },
    { country: 'JP', blockedRequests: 120 },
  ];

  const severities = ['critical', 'high', 'medium', 'low'];
  const actions = ['BLOCK', 'ALLOW', 'COUNT', 'CHALLENGE'];
  const uris = ['/api/login', '/api/users', '/api/admin', '/api/data/export', '/wp-admin', '/api/search', '/.env', '/api/credentials'];
  const countries = ['US', 'RU', 'CN', 'BR', 'NL', 'DE', 'ID', 'UA', 'IN', 'JP'];
  const methods = ['POST', 'GET', 'PUT', 'DELETE'];
  const rules = ['SQLi-Detection', 'XSS-Prevention', 'Rate-Limit-Rule', 'Bot-Control', 'Geo-Block', 'Path-Traversal-Block', 'Scanner-Detection'];

  const attackTypeNames = ['SQL Injection', 'XSS', 'Path Traversal', 'Bot Traffic', 'Rate Limit', 'Scanner Detection', 'Other'];
  const demoIps = ['185.220.101.34', '45.148.10.92', '194.26.192.77', '103.152.220.15', '91.242.217.124'];

  const events: any[] = [];
  for (let i = 0; i < 50; i++) {
    const isBlocked = Math.random() > 0.4;
    events.push({
      id: `demo-waf-event-${i}`,
      timestamp: new Date(now.getTime() - i * 15 * 60000).toISOString(),
      action: isBlocked ? 'BLOCK' : actions[Math.floor(Math.random() * actions.length)],
      source_ip: demoIps[Math.floor(Math.random() * demoIps.length)],
      country: countries[Math.floor(Math.random() * countries.length)],
      uri: uris[Math.floor(Math.random() * uris.length)],
      http_method: methods[Math.floor(Math.random() * methods.length)],
      severity: severities[Math.floor(Math.random() * severities.length)],
      rule_matched: rules[Math.floor(Math.random() * rules.length)],
      user_agent: 'Mozilla/5.0 (compatible; DemoBot/1.0)',
      threat_type: attackTypeNames[Math.floor(Math.random() * attackTypeNames.length)],
      is_campaign: Math.random() > 0.85,
      _isDemo: true,
    });
  }

  const timeline: any[] = [];
  for (let h = 23; h >= 0; h--) {
    const total = 8000 + Math.floor(Math.random() * 6000);
    const blocked = Math.floor(total * (0.03 + Math.random() * 0.05));
    timeline.push({
      hour: 23 - h,
      total,
      blocked,
      allowed: total - blocked,
    });
  }

  return { metrics, attackTypes, topAttackers, geoDistribution, events, timeline };
}

export default function WafMonitoring() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedAccountId } = useCloudAccount();
  const { data: organizationId } = useOrganization();
  const { isDemoMode } = useDemoMode();
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

  // Demo mode data - memoized so it doesn't regenerate on every render
  const demoData = useMemo(() => isDemoMode ? generateDemoWafData() : null, [isDemoMode]);

  // Handle metric card click to filter events
  const handleMetricCardClick = (filter: { severity?: string; type?: string }) => {
    // Switch to events tab
    setActiveTab('events');
    
    // Apply filter based on card clicked - ONLY ONE FILTER AT A TIME
    if (filter.severity) {
      setExternalEventFilters({ severity: filter.severity });
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
        body: { action: 'get-monitoring-configs', accountId: selectedAccountId }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
  });

  // Fetch WAF metrics
  const { data: metricsData, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery({
    queryKey: ['waf-metrics', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId && monitoringConfigsData?.hasActiveConfig,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.invoke<{ metrics: any; previousPeriod?: any; period: string }>('waf-dashboard-api', {
        body: { action: 'metrics', accountId: selectedAccountId }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      
      // Merge previousPeriod into metrics so WafMetricsCards can access it
      const data = response.data;
      if (data?.metrics && data?.previousPeriod) {
        data.metrics.previousPeriod = data.previousPeriod;
      }
      
      return data;
    },
  });


  // Fetch WAF events (last 24h to match metrics)
  // NOTE: When filtering by action (e.g., BLOCK), we fetch from backend with filter applied
  const { data: eventsData, isLoading: eventsLoading, refetch: refetchEvents } = useQuery({
    queryKey: ['waf-events-v3', organizationId, selectedAccountId, externalEventFilters],
    enabled: !!organizationId && !!selectedAccountId && monitoringConfigsData?.hasActiveConfig,
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
    queryFn: async () => {
      // Get events from last 24 hours to match metrics period
      const since = new Date();
      since.setHours(since.getHours() - 24);
      
      const response = await apiClient.invoke<{ events: any[]; pagination: any }>('waf-dashboard-api', {
        body: { 
          action: 'events', 
          accountId: selectedAccountId,
          limit: 5000,
          startDate: since.toISOString(),
          ...(externalEventFilters?.action && { filterAction: externalEventFilters.action }),
          ...(externalEventFilters?.severity && { severity: externalEventFilters.severity }),
        }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      
      return response.data;
    },
  });

  // Fetch blocked events specifically for the blocked requests list
  const { data: blockedEventsData, isLoading: blockedEventsLoading } = useQuery({
    queryKey: ['waf-blocked-events', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId && monitoringConfigsData?.hasActiveConfig,
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
    queryFn: async () => {
      // Note: 'action' in body is the API action, we need to pass filter separately
      const response = await apiClient.invoke<{ events: any[]; pagination: any }>('waf-dashboard-api', {
        body: { action: 'events', accountId: selectedAccountId, filterAction: 'BLOCK', limit: 50 }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
  });

  // Fetch top attackers
  const { data: attackersData, isLoading: attackersLoading } = useQuery({
    queryKey: ['waf-top-attackers', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId && monitoringConfigsData?.hasActiveConfig,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000, // Auto-refresh every 60 seconds
    queryFn: async () => {
      const response = await apiClient.invoke<{ topAttackers: any[]; period: string }>('waf-dashboard-api', {
        body: { action: 'top-attackers', accountId: selectedAccountId, limit: 10 }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
  });

  // Fetch attack types distribution
  const { data: attackTypesData, isLoading: attackTypesLoading } = useQuery({
    queryKey: ['waf-attack-types', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId && monitoringConfigsData?.hasActiveConfig,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000, // Auto-refresh every 60 seconds
    queryFn: async () => {
      const response = await apiClient.invoke<{ attackTypes: any[]; period: string }>('waf-dashboard-api', {
        body: { action: 'attack-types', accountId: selectedAccountId }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
  });

  // Fetch geo distribution
  const { data: geoData, isLoading: geoLoading } = useQuery({
    queryKey: ['waf-geo-distribution', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId && monitoringConfigsData?.hasActiveConfig,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000, // Auto-refresh every 60 seconds
    queryFn: async () => {
      const response = await apiClient.invoke<{ geoDistribution: any[]; period: string }>('waf-dashboard-api', {
        body: { action: 'geo-distribution', accountId: selectedAccountId }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
  });

  // Fetch timeline data for the new timeline chart
  const { data: timelineData, isLoading: timelineLoading } = useQuery({
    queryKey: ['waf-timeline', organizationId, selectedAccountId],
    enabled: !!organizationId && !!selectedAccountId && monitoringConfigsData?.hasActiveConfig,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.invoke<{ timeline: any[] }>('waf-dashboard-api', {
        body: { action: 'timeline', accountId: selectedAccountId, period: 'last24h' }
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

  const handleRefresh = async () => {
    await Promise.all([
      refetchMetrics(),
      refetchEvents(),
    ]);
    toast({ title: t('common.refreshed'), description: t('waf.dataRefreshed') });
  };

  const hasActiveConfig = isDemoMode ? true : monitoringConfigsData?.hasActiveConfig;
  const metrics = isDemoMode ? demoData?.metrics : metricsData?.metrics;
  const events = isDemoMode ? (demoData?.events || []) : (eventsData?.events || []);
  const topAttackers = isDemoMode ? (demoData?.topAttackers || []) : (attackersData?.topAttackers || []);
  const attackTypes = isDemoMode ? (demoData?.attackTypes || []) : (attackTypesData?.attackTypes || []);
  const geoDistribution = isDemoMode ? (demoData?.geoDistribution || []) : (geoData?.geoDistribution || []);
  const timeline = isDemoMode ? (demoData?.timeline || []) : (timelineData?.timeline || []);
  
  // Use dedicated blocked events query for the blocked requests list
  const blockedRequests = isDemoMode 
    ? (demoData?.events?.filter((e: any) => e.action === 'BLOCK') || [])
    : (blockedEventsData?.events || []);



  return (
    <Layout
      title={t('sidebar.attackDetection', 'Detecção de Ataques')}
      description={t('waf.monitoringDescription', 'Detecte e bloqueie ameaças automaticamente')}
      icon={<ShieldAlert className="h-4 w-4" />}
    >
      <div className="space-y-6">
        {/* Action Buttons */}
        {hasActiveConfig && !isDemoMode && (
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

        {/* Show Setup Panel if no active config (skip in demo mode) */}
        {!isDemoMode && !configsLoading && !hasActiveConfig ? (
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
              isLoading={isDemoMode ? false : metricsLoading}
              onCardClick={handleMetricCardClick}
            />

            {/* Main Content Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="glass-card-float">
                <TabsTrigger value="overview">{t('waf.overview', 'Visão Geral')}</TabsTrigger>
                <TabsTrigger value="events">{t('waf.events', 'Eventos')}</TabsTrigger>
                {!isDemoMode && (
                  <TabsTrigger value="config">
                    <Settings className="h-4 w-4 mr-1" />
                    {t('waf.configuration', 'Configuração')}
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                {/* Status Indicator */}
                <WafStatusIndicator metrics={metrics} />

                {/* Timeline Chart */}
                <WafTimelineChart 
                  data={timeline} 
                  isLoading={isDemoMode ? false : timelineLoading} 
                />

                {/* AI Analysis Section */}
                {!isDemoMode && <WafAiAnalysis accountId={selectedAccountId || undefined} />}

                {/* Geographic Distribution */}
                <div className="grid gap-6 md:grid-cols-2">
                  <WafGeoDistribution 
                    geoDistribution={geoDistribution} 
                    isLoading={isDemoMode ? false : geoLoading} 
                  />
                  <WafWorldMap 
                    geoDistribution={geoDistribution} 
                    isLoading={isDemoMode ? false : geoLoading} 
                  />
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <WafAttackTypesChart 
                    attackTypes={attackTypes} 
                    isLoading={isDemoMode ? false : attackTypesLoading} 
                  />
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <WafTopAttackers 
                    topAttackers={topAttackers} 
                    isLoading={isDemoMode ? false : attackersLoading}
                    accountId={isDemoMode ? 'demo-account' : (selectedAccountId || undefined)}
                    onBlockIp={isDemoMode ? undefined : ((ip: string) => blockIpMutation.mutate({ ipAddress: ip, reason: 'Manual block from dashboard' }))}
                  />
                  <WafEventsFeed 
                    events={events.slice(0, 10)} 
                    isLoading={isDemoMode ? false : eventsLoading} 
                  />
                </div>

                {/* Blocked Requests List */}
                <WafBlockedRequestsList 
                  blockedRequests={blockedRequests.slice(0, 20)} 
                  isLoading={isDemoMode ? false : blockedEventsLoading} 
                />
              </TabsContent>

              <TabsContent value="events" className="space-y-4">
                {/* Advanced Filters */}
                <WafFilters 
                  filters={filters}
                  onFiltersChange={setFilters}
                />
                
                <WafEventsFeed 
                  events={events} 
                  isLoading={isDemoMode ? false : eventsLoading}
                  showPagination
                  externalSeverityFilter={externalEventFilters.severity}
                  externalActionFilter={externalEventFilters.action}
                  externalCampaignFilter={externalEventFilters.campaign}
                />
              </TabsContent>

              {!isDemoMode && (
                <TabsContent value="config" className="space-y-4">
                  <WafSetupPanel />
                  <WafRulesEvaluator accountId={selectedAccountId || undefined} />
                  <WafConfigPanel accountId={selectedAccountId || undefined} />
                  <WafAlertConfig accountId={selectedAccountId || undefined} />
                </TabsContent>
              )}
            </Tabs>
          </>
        )}
      </div>
    </Layout>
  );
}
