import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layout } from "@/components/Layout";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useDemoAwareQuery } from "@/hooks/useDemoAwareQuery";
import { formatDateBR, parseDateString } from "@/lib/utils";
import { CloudTrailAnalysisHistory } from "@/components/dashboard/CloudTrailAnalysisHistory";
import { AzureActivityLogs } from "@/components/dashboard/AzureActivityLogs";
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from "recharts";
import { 
  FileText, Search, AlertTriangle, Eye, Clock, User, MapPin,
  RefreshCw, Download, Shield, Activity, Play, TrendingUp, History,
  AlertCircle, CheckCircle2, Cloud
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CloudTrailEvent {
  id: string;
  event_time: string;
  event_name: string;
  event_source: string;
  user_name: string;
  user_type: string;
  user_arn: string;
  user_identity: any;
  source_ip_address: string;
  user_agent: string;
  aws_region: string;
  error_code: string | null;
  error_message: string | null;
  resources: any[];
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_reasons: string[];
  security_explanation: string | null;
  remediation_suggestion: string | null;
  event_category: string | null;
  is_security_event: boolean;
}

interface CloudTrailAnalysisStatus {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  events_processed?: number;
  events_saved?: number;
  critical_count?: number;
  high_count?: number;
  medium_count?: number;
  low_count?: number;
  error_message?: string;
}

interface StartAnalysisResponse {
  success: boolean;
  analysisId?: string;
  status?: string;
  message: string;
  periodAlreadyProcessed?: boolean;
  alreadyRunning?: boolean;
  coveragePercent?: number;
  overlappingAnalyses?: Array<{
    id: string;
    periodStart: string;
    periodEnd: string;
    eventsProcessed: number;
  }>;
}

const RISK_COLORS = {
  critical: '#ef4444',
  high: '#f97316', 
  medium: '#eab308',
  low: '#22c55e',
};

export default function CloudTrailAudit() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedAccountId, selectedProvider } = useCloudAccount();
  const { getAccountFilter } = useAccountFilter();
  const { data: organizationId } = useOrganization();
  const { shouldEnableAccountQuery } = useDemoAwareQuery();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');
  const [selectedRiskLevel, setSelectedRiskLevel] = useState('all');
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showReprocessDialog, setShowReprocessDialog] = useState(false);
  const [periodOverlapInfo, setPeriodOverlapInfo] = useState<StartAnalysisResponse | null>(null);

  // Check if Azure is selected - show Azure Activity Logs instead
  const isAzure = selectedProvider === 'AZURE';
  
  // If Azure is selected, render Azure Activity Logs component
  if (isAzure) {
    return (
      <Layout 
        title={t('sidebar.cloudTrailAudit', 'Logs de Atividade')} 
        description={t('cloudTrailAudit.azureDescription', 'Analise eventos de atividade e identifique problemas de segurança')}
        icon={<FileText className="h-7 w-7" />}
      >
        <AzureActivityLogs />
      </Layout>
    );
  }

  // Get CloudTrail events from database - enabled in demo mode
  const { data: events, isLoading, refetch } = useQuery({
    queryKey: ['cloudtrail-events', organizationId, selectedAccountId, selectedTimeRange, selectedRiskLevel],
    enabled: shouldEnableAccountQuery(),
    staleTime: 1 * 60 * 1000,
    queryFn: async () => {
      const getHoursBack = (range: string) => {
        switch (range) {
          case '24h': return 24;
          case '7d': return 168;
          case '30d': return 720;
          case '60d': return 1440;
          case '90d': return 2160;
          case '120d': return 2880;
          default: return 24;
        }
      };
      
      const hoursBack = getHoursBack(selectedTimeRange);
      const startTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

      const filters: any = { 
        organization_id: organizationId,
        ...getAccountFilter(), // Multi-cloud compatible
      };

      if (selectedRiskLevel !== 'all') {
        filters.risk_level = selectedRiskLevel;
      }

      const response = await apiClient.select('cloudtrail_events', {
        select: '*',
        eq: filters,
        gte: { event_time: startTime.toISOString() },
        order: { column: 'event_time', ascending: false },
        limit: 500
      });

      if (response.error) throw new Error(getErrorMessage(response.error));
      
      let filteredEvents = (response.data || []) as CloudTrailEvent[];
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filteredEvents = filteredEvents.filter((event: CloudTrailEvent) => 
          event.event_name?.toLowerCase().includes(term) ||
          event.user_name?.toLowerCase().includes(term) ||
          event.source_ip_address?.includes(term)
        );
      }
      return filteredEvents;
    },
  });

  // Check for running analysis on page load - enabled in demo mode
  const { data: runningAnalysis } = useQuery<CloudTrailAnalysisStatus | undefined>({
    queryKey: ['cloudtrail-running-analysis', organizationId, selectedAccountId],
    enabled: shouldEnableAccountQuery() && !analysisId,
    staleTime: 5000,
    queryFn: async () => {
      const response = await apiClient.select('cloudtrail_analyses', {
        select: '*',
        eq: { 
          organization_id: organizationId,
          ...getAccountFilter(), // Multi-cloud compatible filter
          status: 'running'
        },
        order: { column: 'created_at', ascending: false },
        limit: 1
      });
      if (response.error) return undefined;
      return response.data?.[0] as CloudTrailAnalysisStatus | undefined;
    },
  });

  // Auto-detect running analysis on page load
  useEffect(() => {
    if (runningAnalysis && !analysisId && !isAnalyzing) {
      setAnalysisId(runningAnalysis.id);
      setIsAnalyzing(true);
      toast({
        title: t('cloudtrail.analysisInProgress', 'Analysis in progress'),
        description: t('cloudtrail.detectedRunningAnalysis', 'Detected running analysis. Tracking progress...'),
      });
    }
  }, [runningAnalysis, analysisId, isAnalyzing, toast, t]);

  // Poll for analysis status when running
  const { data: analysisStatus } = useQuery<CloudTrailAnalysisStatus | undefined>({
    queryKey: ['cloudtrail-analysis-status', analysisId],
    enabled: !!analysisId && isAnalyzing,
    refetchInterval: 3000, // Poll every 3 seconds
    queryFn: async () => {
      const response = await apiClient.select('cloudtrail_analyses', {
        select: '*',
        eq: { id: analysisId },
        limit: 1
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data?.[0] as CloudTrailAnalysisStatus | undefined;
    },
  });

  // Handle analysis completion
  useEffect(() => {
    if (analysisStatus && analysisStatus.status !== 'running') {
      setIsAnalyzing(false);
      if (analysisStatus.status === 'completed') {
        toast({
          title: t('cloudtrail.analysisCompleted', 'Analysis completed'),
          description: t('cloudtrail.eventsAnalyzed', '{{events}} events analyzed. {{critical}} critical, {{high}} high.', { events: analysisStatus.events_processed || 0, critical: analysisStatus.critical_count || 0, high: analysisStatus.high_count || 0 }),
        });
        refetch(); // Refresh the events list
        queryClient.invalidateQueries({ queryKey: ['cloudtrail-analysis-history'] });
      } else if (analysisStatus.status === 'failed') {
        toast({
          title: t('cloudtrail.analysisError', 'Analysis error'),
          description: analysisStatus.error_message || t('cloudtrail.unknownError', 'Unknown error'),
          variant: "destructive"
        });
      }
      setAnalysisId(null);
    }
  }, [analysisStatus, refetch, toast, queryClient]);

  // Start CloudTrail analysis (async)
  const startAnalysisMutation = useMutation({
    mutationFn: async (forceReprocess: boolean = false) => {
      const getHoursBack = (range: string) => {
        switch (range) {
          case '24h': return 24;
          case '7d': return 168;
          case '30d': return 720;
          case '60d': return 1440;
          case '90d': return 2160;
          case '120d': return 2880;
          default: return 24;
        }
      };
      
      const hoursBack = getHoursBack(selectedTimeRange);
      const response = await apiClient.invoke<StartAnalysisResponse>('start-cloudtrail-analysis', {
        body: {
          accountId: selectedAccountId,
          hoursBack,
          maxResults: 5000,
          forceReprocess,
        }
      });
      if (response.error) throw new Error(getErrorMessage(response.error));
      return response.data;
    },
    onSuccess: (data) => {
      if (!data) return;
      
      // Check if period was already processed
      if (data.periodAlreadyProcessed) {
        setPeriodOverlapInfo(data);
        setShowReprocessDialog(true);
        return;
      }
      
      // Check if analysis is already running
      if (data.alreadyRunning) {
        toast({
          title: t('cloudtrail.alreadyRunning', 'Analysis already running'),
          description: data.message,
          variant: "default"
        });
        if (data.analysisId) {
          setAnalysisId(data.analysisId);
          setIsAnalyzing(true);
        }
        return;
      }
      
      // Analysis started successfully
      if (data.success && data.analysisId) {
        setAnalysisId(data.analysisId);
        setIsAnalyzing(true);
        toast({
          title: t('cloudtrail.analysisStarted', 'Analysis started'),
          description: data.message || t('cloudtrail.eventsBeingFetched', 'Events are being fetched in background.'),
        });
      }
    },
    onError: (error) => {
      toast({
        title: t('cloudtrail.errorStartingAnalysis', 'Error starting analysis'),
        description: error instanceof Error ? error.message : t('cloudtrail.unknownError', 'Unknown error'),
        variant: "destructive"
      });
    }
  });

  // Handle force reprocess
  const handleForceReprocess = () => {
    setShowReprocessDialog(false);
    setPeriodOverlapInfo(null);
    startAnalysisMutation.mutate(true);
  };

  // Helper function to get period description
  const getPeriodDescription = (range: string) => {
    const descriptions = {
      '24h': 'últimas 24 horas',
      '7d': 'últimos 7 dias',
      '30d': 'últimos 30 dias',
      '60d': 'últimos 60 dias',
      '90d': 'últimos 90 dias',
      '120d': 'últimos 120 dias'
    };
    return descriptions[range as keyof typeof descriptions] || 'período selecionado';
  };

  // Calculate chart data - events by date and risk level
  const chartData = useMemo(() => {
    if (!events || events.length === 0) return { byDate: [], byUser: [], byRisk: [], byEvent: [] };

    // Group by date
    const dateMap = new Map<string, { date: string; critical: number; high: number; medium: number; low: number; total: number }>();
    const userMap = new Map<string, { user: string; critical: number; high: number; medium: number; low: number; total: number }>();
    const riskCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    const eventCounts = new Map<string, number>();

    events.forEach(event => {
      // By date
      const dateStr = formatDateBR(event.event_time, { day: '2-digit', month: '2-digit' });
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, { date: dateStr, critical: 0, high: 0, medium: 0, low: 0, total: 0 });
      }
      const dateEntry = dateMap.get(dateStr)!;
      dateEntry[event.risk_level]++;
      dateEntry.total++;

      // By user (only security events)
      if (event.is_security_event && event.user_name) {
        if (!userMap.has(event.user_name)) {
          userMap.set(event.user_name, { user: event.user_name, critical: 0, high: 0, medium: 0, low: 0, total: 0 });
        }
        const userEntry = userMap.get(event.user_name)!;
        userEntry[event.risk_level]++;
        userEntry.total++;
      }

      // Risk distribution
      riskCounts[event.risk_level]++;

      // Event types
      eventCounts.set(event.event_name, (eventCounts.get(event.event_name) || 0) + 1);
    });

    const byDate = Array.from(dateMap.values()).sort((a, b) => {
      const [dayA, monthA] = a.date.split('/').map(Number);
      const [dayB, monthB] = b.date.split('/').map(Number);
      return monthA !== monthB ? monthA - monthB : dayA - dayB;
    });

    const byUser = Array.from(userMap.values())
      .sort((a, b) => (b.critical * 100 + b.high * 10 + b.medium) - (a.critical * 100 + a.high * 10 + a.medium))
      .slice(0, 10);

    const byRisk = [
      { name: t('cloudtrail.critical', 'Critical'), value: riskCounts.critical, color: RISK_COLORS.critical },
      { name: t('cloudtrail.high', 'High'), value: riskCounts.high, color: RISK_COLORS.high },
      { name: t('cloudtrail.medium', 'Medium'), value: riskCounts.medium, color: RISK_COLORS.medium },
      { name: t('cloudtrail.low', 'Low'), value: riskCounts.low, color: RISK_COLORS.low },
    ].filter(r => r.value > 0);

    const byEvent = Array.from(eventCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([event, count]) => ({ event, count }));

    return { byDate, byUser, byRisk, byEvent };
  }, [events]);

  // Summary metrics
  const summary = useMemo(() => {
    if (!events) return { total: 0, critical: 0, high: 0, medium: 0, low: 0, errors: 0, users: 0, securityEvents: 0 };
    return {
      total: events.length,
      critical: events.filter(e => e.risk_level === 'critical').length,
      high: events.filter(e => e.risk_level === 'high').length,
      medium: events.filter(e => e.risk_level === 'medium').length,
      low: events.filter(e => e.risk_level === 'low').length,
      errors: events.filter(e => e.error_code).length,
      users: new Set(events.map(e => e.user_name)).size,
      securityEvents: events.filter(e => e.is_security_event).length,
    };
  }, [events]);

  const getRiskBadge = (level: string) => {
    const variants: Record<string, any> = {
      critical: { variant: 'destructive', label: t('cloudtrail.critical', 'Critical') },
      high: { variant: 'destructive', label: t('cloudtrail.high', 'High') },
      medium: { variant: 'secondary', label: t('cloudtrail.medium', 'Medium') },
      low: { variant: 'outline', label: t('cloudtrail.low', 'Low') },
    };
    const config = variants[level] || { variant: 'outline', label: level };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const exportEvents = () => {
    if (!events) return;
    const csvContent = [
      'Data/Hora,Evento,Usuário,Tipo Usuário,IP,Região,Nível Risco,Motivos,Erro',
      ...events.map(event => [
        event.event_time,
        event.event_name,
        event.user_name,
        event.user_type,
        event.source_ip_address,
        event.aws_region,
        event.risk_level,
        `"${(event.risk_reasons || []).join('; ')}"`,
        event.error_code || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cloudtrail_audit_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast({ title: t('cloudtrail.exported', 'Exported'), description: t('cloudtrail.csvReportGenerated', 'CSV report generated successfully.') });
  };

  return (
    <Layout 
      title={t('sidebar.cloudTrailAudit', 'Auditoria CloudTrail')} 
      description={t('cloudTrailAudit.description', 'Análise de eventos AWS com identificação de usuários responsáveis por problemas de segurança')}
      icon={<FileText className="h-4 w-4" />}
    >
      {/* Reprocess Confirmation Dialog */}
      <AlertDialog open={showReprocessDialog} onOpenChange={setShowReprocessDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              {t('cloudtrail.periodAlreadyProcessed', 'Period Already Processed')}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                {t('cloudtrail.periodAlreadyProcessedDesc', 'This period has already been analyzed ({{percent}}% covered).', { percent: periodOverlapInfo?.coveragePercent })}
              </p>
              {periodOverlapInfo?.overlappingAnalyses && periodOverlapInfo.overlappingAnalyses.length > 0 && (
                <div className="bg-muted rounded-lg p-3 text-sm">
                  <p className="font-medium mb-2">{t('cloudtrail.previousAnalyses', 'Previous analyses')}:</p>
                  <ul className="space-y-1">
                    {periodOverlapInfo.overlappingAnalyses.slice(0, 3).map((a, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        {formatDateBR(a.periodStart)} - {formatDateBR(a.periodEnd)}
                        <Badge variant="outline" className="text-xs">{a.eventsProcessed} {t('cloudtrail.events', 'events')}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-muted-foreground">
                {t('cloudtrail.reprocessQuestion', 'Do you want to reprocess this period? Events will be updated with the latest analyses.')}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cloudtrail.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleForceReprocess}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('cloudtrail.reprocess', 'Reprocess')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-6">
        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <Button 
            onClick={() => startAnalysisMutation.mutate(false)}
            disabled={startAnalysisMutation.isPending || isAnalyzing || !selectedAccountId}
            className="gap-2"
          >
            {startAnalysisMutation.isPending || isAnalyzing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {startAnalysisMutation.isPending ? t('cloudtrail.starting', 'Starting...') : isAnalyzing ? t('cloudtrail.analyzing', 'Analyzing...') : t('cloudtrail.fetchEvents', 'Fetch Events')}
          </Button>
          {(['60d', '90d', '120d'].includes(selectedTimeRange)) && (
            <div className="flex items-center gap-1 text-sm text-amber-600 bg-amber-50 px-2 py-1 rounded">
              <Clock className="h-3 w-3" />
              {t('cloudtrail.extendedPeriodWarning', 'Extended period - may take several minutes')}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {t('cloudtrail.refresh', 'Refresh')}
          </Button>
          <Button variant="outline" size="sm" onClick={exportEvents} disabled={!events?.length}>
            <Download className="h-4 w-4 mr-2" />
            {t('cloudtrail.export', 'Export')}
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t('cloudtrail.totalEvents', 'Total Events')}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <>
                  <Skeleton className="h-8 w-24 mb-1" />
                  <Skeleton className="h-4 w-32" />
                </>
              ) : (
                <>
                  <div className="text-2xl font-semibold">{summary.total.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">{t('cloudtrail.securityEventsCount', '{{count}} security events', { count: summary.securityEvents })}</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t('cloudtrail.criticalEvents', 'Critical Events')}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <>
                  <Skeleton className="h-8 w-16 mb-1" />
                  <Skeleton className="h-4 w-24" />
                </>
              ) : (
                <>
                  <div className="text-2xl font-semibold text-red-500">{summary.critical}</div>
                  <p className="text-xs text-muted-foreground">{summary.high} {t('cloudtrail.highRisk', 'high risk')}</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t('cloudtrail.errorsFailed', 'Errors/Failures')}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <>
                  <Skeleton className="h-8 w-16 mb-1" />
                  <Skeleton className="h-4 w-28" />
                </>
              ) : (
                <>
                  <div className="text-2xl font-semibold text-orange-500">{summary.errors}</div>
                  <p className="text-xs text-muted-foreground">{t('cloudtrail.deniedAttempts', 'Denied attempts')}</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t('cloudtrail.uniqueUsers', 'Unique Users')}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <>
                  <Skeleton className="h-8 w-16 mb-1" />
                  <Skeleton className="h-4 w-24" />
                </>
              ) : (
                <>
                  <div className="text-2xl font-semibold">{summary.users}</div>
                  <p className="text-xs text-muted-foreground">{t('cloudtrail.activeIdentities', 'Active identities')}</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card >
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('cloudtrail.searchPlaceholder', 'Search events, users, IPs...')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">{t('cloudtrail.last24h', 'Last 24 hours')}</SelectItem>
                  <SelectItem value="7d">{t('cloudtrail.last7d', 'Last 7 days')}</SelectItem>
                  <SelectItem value="30d">{t('cloudtrail.last30d', 'Last 30 days')}</SelectItem>
                  <SelectItem value="60d">{t('cloudtrail.last60d', 'Last 60 days')}</SelectItem>
                  <SelectItem value="90d">{t('cloudtrail.last90d', 'Last 90 days')}</SelectItem>
                  <SelectItem value="120d">{t('cloudtrail.last120d', 'Last 120 days')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedRiskLevel} onValueChange={setSelectedRiskLevel}>
                <SelectTrigger><SelectValue placeholder={t('cloudtrail.riskLevel', 'Risk Level')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('cloudtrail.allLevels', 'All Levels')}</SelectItem>
                  <SelectItem value="critical">{t('cloudtrail.critical', 'Critical')}</SelectItem>
                  <SelectItem value="high">{t('cloudtrail.high', 'High')}</SelectItem>
                  <SelectItem value="medium">{t('cloudtrail.medium', 'Medium')}</SelectItem>
                  <SelectItem value="low">{t('cloudtrail.low', 'Low')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Charts Section */}
        {isLoading ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card >
              <CardHeader>
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[300px] w-full" />
              </CardContent>
            </Card>
            <Card >
              <CardHeader>
                <Skeleton className="h-6 w-40 mb-2" />
                <Skeleton className="h-4 w-56" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[300px] w-full" />
              </CardContent>
            </Card>
          </div>
        ) : events && events.length > 0 ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Timeline Chart - Security Events by Date */}
            <Card >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  {t('cloudtrail.securityIssuesEvolution', 'Security Issues Evolution')}
                </CardTitle>
                <CardDescription>{t('cloudtrail.eventsByRiskOverTime', 'Events by risk level over time')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData.byDate}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="critical" stackId="1" stroke={RISK_COLORS.critical} fill={RISK_COLORS.critical} name={t('cloudtrail.critical', 'Critical')} />
                    <Area type="monotone" dataKey="high" stackId="1" stroke={RISK_COLORS.high} fill={RISK_COLORS.high} name={t('cloudtrail.high', 'High')} />
                    <Area type="monotone" dataKey="medium" stackId="1" stroke={RISK_COLORS.medium} fill={RISK_COLORS.medium} name={t('cloudtrail.medium', 'Medium')} />
                    <Area type="monotone" dataKey="low" stackId="1" stroke={RISK_COLORS.low} fill={RISK_COLORS.low} name={t('cloudtrail.low', 'Low')} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Risk Distribution Pie Chart */}
            <Card >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  {t('cloudtrail.riskDistribution', 'Risk Distribution')}
                </CardTitle>
                <CardDescription>{t('cloudtrail.eventsBySeverity', 'Proportion of events by severity level')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={chartData.byRisk}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      outerRadius={100}
                      dataKey="value"
                    >
                      {chartData.byRisk.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Users with Security Issues */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {t('cloudtrail.usersWithSecurityIssues', 'Users with Security Issues')}
                </CardTitle>
                <CardDescription>{t('cloudtrail.top10UsersRisk', 'Top 10 users who performed risky actions')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData.byUser} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="user" type="category" width={150} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="critical" stackId="a" fill={RISK_COLORS.critical} name={t('cloudtrail.critical', 'Critical')} />
                    <Bar dataKey="high" stackId="a" fill={RISK_COLORS.high} name={t('cloudtrail.high', 'High')} />
                    <Bar dataKey="medium" stackId="a" fill={RISK_COLORS.medium} name={t('cloudtrail.medium', 'Medium')} />
                    <Bar dataKey="low" stackId="a" fill={RISK_COLORS.low} name={t('cloudtrail.low', 'Low')} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Main Content Tabs */}
        <Tabs defaultValue="events" className="w-full">
          <TabsList>
            <TabsTrigger value="events">{t('cloudtrail.events', 'Events')}</TabsTrigger>
            <TabsTrigger value="security">{t('cloudtrail.securityEvents', 'Security Events')}</TabsTrigger>
            <TabsTrigger value="users">{t('cloudtrail.byUser', 'By User')}</TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-1" />
              {t('cloudtrail.history', 'History')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="space-y-4">
            <Card >
              <CardHeader>
                <CardTitle>{t('cloudtrail.allEventsList', 'All Events')}</CardTitle>
                <CardDescription>{t('cloudtrail.completeEventsList', 'Complete list of CloudTrail events')}</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
                  </div>
                ) : events && events.length > 0 ? (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto">
                    {events.slice(0, 100).map((event) => (
                      <div key={event.id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-sm">{event.event_name}</h4>
                              {getRiskBadge(event.risk_level)}
                              {event.event_category && <Badge variant="outline" className="text-xs">{event.event_category}</Badge>}
                              {event.is_security_event && <Badge variant="outline" className="border-orange-500/50 text-orange-600">{t('cloudtrail.security', 'Security')}</Badge>}
                              {event.error_code && <Badge variant="destructive">{t('cloudtrail.error', 'Error')}</Badge>}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1"><User className="h-3 w-3" />{event.user_name}</span>
                              <span className="text-xs">({event.user_type})</span>
                              {event.source_ip_address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{event.source_ip_address}</span>}
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDateBR(event.event_time)} {new Date(event.event_time).toLocaleTimeString('pt-BR')}</span>
                              <span>{event.aws_region}</span>
                            </div>
                          </div>
                        </div>
                        {event.risk_reasons && event.risk_reasons.length > 0 && (
                          <div className="flex gap-2 flex-wrap">
                            {event.risk_reasons.map((reason, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">{reason}</Badge>
                            ))}
                          </div>
                        )}
                        {/* Show explanation for security events */}
                        {event.is_security_event && event.security_explanation && (
                          <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2 text-sm">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                              <p className="text-muted-foreground">{event.security_explanation}</p>
                            </div>
                          </div>
                        )}
                        {event.is_security_event && event.remediation_suggestion && (
                          <div className="bg-green-500/10 border border-green-500/20 rounded p-2 text-sm">
                            <div className="flex items-start gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                              <p className="text-muted-foreground">{event.remediation_suggestion}</p>
                            </div>
                          </div>
                        )}
                        {event.error_code && (
                          <div className="bg-destructive/10 border border-destructive/20 rounded p-2 text-sm">
                            <span className="font-medium text-destructive">{t('cloudtrail.error', 'Error')}: {event.error_code}</span>
                            {event.error_message && <p className="text-muted-foreground">{event.error_message}</p>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-xl font-semibold mb-2">{t('cloudtrail.noEventsFound', 'No events found')}</h3>
                    <p className="text-muted-foreground mb-4">{t('cloudtrail.clickToAnalyze', 'Click "Fetch Events" to analyze CloudTrail.')}</p>
                    <Button onClick={() => startAnalysisMutation.mutate(false)} disabled={startAnalysisMutation.isPending || isAnalyzing || !selectedAccountId}>
                      <Play className="h-4 w-4 mr-2" />
                      {t('cloudtrail.fetchEvents', 'Fetch Events')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <Card >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  {t('cloudtrail.securityEvents', 'Security Events')}
                </CardTitle>
                <CardDescription>{t('cloudtrail.onlySecurityRisks', 'Only events that represent security risks')}</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
                  </div>
                ) : events?.filter(e => e.is_security_event || e.risk_level !== 'low').length ? (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto">
                    {events.filter(e => e.is_security_event || e.risk_level !== 'low').map((event) => (
                      <div key={event.id} className={`border rounded-lg p-4 space-y-3 ${
                        event.risk_level === 'critical' ? 'border-red-500/50 bg-red-500/5' :
                        event.risk_level === 'high' ? 'border-orange-500/50 bg-orange-500/5' : ''
                      }`}>
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-sm">{event.event_name}</h4>
                              {getRiskBadge(event.risk_level)}
                              {event.event_category && (
                                <Badge variant="outline" className="text-xs">{event.event_category}</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1 font-medium"><User className="h-3 w-3" />{event.user_name}</span>
                              <span className="text-xs bg-muted px-2 py-0.5 rounded">{event.user_type}</span>
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDateBR(event.event_time)} {new Date(event.event_time).toLocaleTimeString('pt-BR')}</span>
                            </div>
                            {event.user_arn && <p className="text-xs text-muted-foreground font-mono">{event.user_arn}</p>}
                          </div>
                        </div>
                        
                        {/* Security Explanation */}
                        {event.security_explanation && (
                          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">{t('cloudtrail.whyProblem', 'Why is this a problem?')}</p>
                                <p className="text-sm text-muted-foreground">{event.security_explanation}</p>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Remediation Suggestion */}
                        {event.remediation_suggestion && (
                          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                            <div className="flex items-start gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-1">{t('cloudtrail.recommendation', 'Recommendation')}</p>
                                <p className="text-sm text-muted-foreground">{event.remediation_suggestion}</p>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {event.risk_reasons && event.risk_reasons.length > 0 && (
                          <div className="bg-muted/50 rounded p-2">
                            <p className="text-sm font-medium mb-1">{t('cloudtrail.riskReasons', 'Risk Reasons')}:</p>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {event.risk_reasons.map((reason, idx) => (
                                <li key={idx} className="flex items-center gap-2">
                                  <AlertTriangle className="h-3 w-3 text-orange-500" />
                                  {reason}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Shield className="h-16 w-16 mx-auto mb-4 text-green-500" />
                    <h3 className="text-xl font-semibold mb-2">{t('cloudtrail.noSecurityEvents', 'No security events')}</h3>
                    <p className="text-muted-foreground">{t('cloudtrail.noRiskEventsFound', 'No risk events found in the selected period.')}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <Card >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {t('cloudtrail.userActivity', 'User Activity')}
                </CardTitle>
                <CardDescription>{t('cloudtrail.usersPerformedSecurityActions', 'Users who performed security actions')}</CardDescription>
              </CardHeader>
              <CardContent>
                {chartData.byUser.length > 0 ? (
                  <div className="space-y-4">
                    {chartData.byUser.map((userData, idx) => (
                      <div key={idx} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <User className="h-5 w-5" />
                            <span className="font-semibold">{userData.user}</span>
                          </div>
                          <span className="text-sm text-muted-foreground">{userData.total} {t('cloudtrail.events', 'events')}</span>
                        </div>
                        <div className="flex gap-2">
                          {userData.critical > 0 && <Badge variant="destructive">{userData.critical} {t('cloudtrail.criticals', 'Critical')}</Badge>}
                          {userData.high > 0 && <Badge variant="destructive">{userData.high} {t('cloudtrail.highs', 'High')}</Badge>}
                          {userData.medium > 0 && <Badge variant="secondary">{userData.medium} {t('cloudtrail.mediums', 'Medium')}</Badge>}
                          {userData.low > 0 && <Badge variant="outline">{userData.low} {t('cloudtrail.lows', 'Low')}</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <User className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-xl font-semibold mb-2">{t('cloudtrail.noUserData', 'No user data')}</h3>
                    <p className="text-muted-foreground">{t('cloudtrail.fetchEventsToSeeActivity', 'Fetch CloudTrail events to see activity by user.')}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            {organizationId && (
              <CloudTrailAnalysisHistory 
                organizationId={organizationId} 
                accountId={selectedAccountId || undefined}
              />
            )}
          </TabsContent>
        </Tabs>

        {/* Running Analysis Status */}
        {isAnalyzing && analysisId && (
          <Card className=" border-blue-500/50 bg-blue-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
                {t('cloudtrail.analysisRunning', 'Analysis Running')}
              </CardTitle>
              <CardDescription>
                {t('cloudtrail.eventsBeingAnalyzed', 'CloudTrail events are being fetched and analyzed in background')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '100%' }} />
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground">{t('cloudtrail.processing', 'Processing...')}</span>
                </div>
                {analysisStatus && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">{t('cloudtrail.status', 'Status')}:</span>
                      <span className="ml-2 font-medium capitalize">{analysisStatus.status}</span>
                    </div>
                    {analysisStatus.events_processed !== undefined && (
                      <div>
                        <span className="text-muted-foreground">{t('cloudtrail.eventsCount', 'Events')}:</span>
                        <span className="ml-2 font-medium">{analysisStatus.events_processed}</span>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {t('cloudtrail.pageAutoRefresh', 'The page will be automatically refreshed when the analysis is completed.')}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
